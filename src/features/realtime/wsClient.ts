/**
 * WebSocket 客户端 —— 连接生命周期管理（单例）。
 *
 * 职责（与 React 解耦的纯 TS 模块，便于单测与非组件环境复用）：
 * 1. 建立与后端的 WebSocket 长连接（地址来自环境变量 VITE_WS_URL）；
 * 2. 指数退避自动重连：网络抖动/服务端重启后无需刷新页面即可恢复；
 * 3. 客户端心跳：周期发送 heartbeat 并监测服务端 pong，超时判定连接假死并强制重连；
 * 4. 消息分发：解析 JSON → 运行时校验 → 按订阅回调分发（观察者模式）；
 * 5. 指令发送：send() 通道封装，断线时返回 false 由调用方提示用户。
 *
 * ⚠️ 应用内请勿直接 new 多个客户端：遥测通道全站唯一，统一走本模块导出的
 *    wsClient 单例；组件层通过 useRealtimeConnection Hook 消费。
 */
import { isServerMessage, type ClientMessage, type ServerMessage } from './protocol'
import { HANDSHAKE_TEXT, isBackendMessage, mapBackendMessage } from './backendAdapter'
import { logWsEvent, logWsMessage } from './wsLog'

/** 连接状态机：初始 idle → connecting → open（正常收发）↔ reconnecting（重连中）→ closed */
export type WsStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'

/** 服务端消息处理器：按完整信封订阅，调用方自行按 type 分支 */
type MessageHandler = (msg: ServerMessage) => void

/** 状态变更回调：用于驱动 UI 连接指示灯 */
type StatusHandler = (status: WsStatus) => void

// ==================== 可调参数（联调期可按后端实际能力调整） ====================

/** 心跳发送间隔（毫秒）：期间无任何下行消息也视作存活 */
const HEARTBEAT_INTERVAL_MS = 10_000

/** 心跳超时判定（毫秒）：超过该时长未收到任何下行消息（含 heartbeat 应答）视为假死 */
const HEARTBEAT_TIMEOUT_MS = Number.POSITIVE_INFINITY

/** 重连基础延迟（毫秒）：实际延迟 = base * 2^attempt，封顶 30s 并加 ±20% 抖动 */
const RECONNECT_BASE_DELAY_MS = 1_000
const RECONNECT_MAX_DELAY_MS = 30_000

/** 重连次数上限：超过后进入 closed 终态，需调用 connect() 手动恢复 */
const MAX_RECONNECT_ATTEMPTS = 20

/**
 * 解析 WebSocket 服务地址。
 * 优先使用环境变量 VITE_WS_URL（完整地址，如 ws://192.168.1.10:9090/ws）；
 * 未配置时按当前页面协议推导默认地址（与页面同 host 的 /ws 路径），
 * 开发环境可配合 Vite 代理转发到后端。
 */
function resolveWsUrl(): string {
  const configured = import.meta.env.VITE_WS_URL
  if (configured) return configured
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}/ws`
}

/** 计算第 attempt 次重连的延迟：指数退避 + 抖动，避免服务端恢复瞬间被齐刷刷重连打挂 */
function backoffDelay(attempt: number): number {
  const exp = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** attempt, RECONNECT_MAX_DELAY_MS)
  const jitter = exp * (0.8 + Math.random() * 0.4)
  return Math.round(jitter)
}

/** WebSocket 客户端类：状态机 + 观察者分发 */
class WsClient {
  private socket: WebSocket | null = null
  private status: WsStatus = 'idle'
  private reconnectAttempt = 0
  private connectTimer: number | null = null
  private heartbeatTimer: number | null = null
  private lastMessageAt = 0
  private messageHandlers = new Set<MessageHandler>()
  private statusHandlers = new Set<StatusHandler>()
  /** 手动关闭标志：区分「用户主动关闭」与「异常掉线自动重连」 */
  private manualClose = false
  /** 重连等待期的 online/visibilitychange 监听清理函数（防止重复注册泄漏） */
  private skipWaitCleanup: (() => void) | null = null

  /** 获取当前连接状态 */
  getStatus(): WsStatus {
    return this.status
  }

  /** 订阅下行消息：返回取消订阅函数 */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  /** 订阅连接状态变更：返回取消订阅函数 */
  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler)
    return () => this.statusHandlers.delete(handler)
  }

  /** 更新状态并广播给所有状态订阅者 */
  private setStatus(next: WsStatus): void {
    if (this.status === next) return
    this.status = next
    this.statusHandlers.forEach((h) => h(next))
  }

  /**
   * 建立连接（幂等）：已连接/连接中时直接返回。
   * 内部监听 onopen/onmessage/onclose/onerror，异常关闭时自动调度重连。
   */
  connect(): void {
    if (this.socket && (this.status === 'open' || this.status === 'connecting')) return
    this.manualClose = false
    this.clearTimers()
    this.setStatus(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting')
    logWsEvent(this.reconnectAttempt > 0 ? 'reconnect' : 'connecting', resolveWsUrl())

    const url = resolveWsUrl()
    const socket = new WebSocket(url)
    this.socket = socket

    socket.onopen = () => {
      this.reconnectAttempt = 0
      this.lastMessageAt = Date.now()
      console.info('[ws] 连接成功: ' + resolveWsUrl())
      logWsEvent('open', resolveWsUrl())
      this.setStatus('open')
      // 应用层握手：连接建立后前端主动发送的第一条消息。
      // 页面刷新 → 重新连接 → hello → (welcome) → subscribe 的链路在日志中清晰可见；
      // 后端回不回 welcome 均可（宽容模式），详见 protocol.ts 的 HelloPayload 注释。
      console.info('[ws] send handshake: client_UI')
      logWsMessage('up', { type: 'handshake', payload: HANDSHAKE_TEXT, ts: Date.now() })
      this.socket?.send(HANDSHAKE_TEXT)
      this.startHeartbeat()
    }

    socket.onmessage = (event: MessageEvent) => {
      this.lastMessageAt = Date.now()
      console.log('[ws recv]', event.data); this.dispatch(event.data)
    }

    socket.onclose = (event: CloseEvent) => {
      this.stopHeartbeat()
      this.socket = null
      logWsEvent('close', { code: event.code, reason: event.reason })
      if (this.manualClose) {
        this.setStatus('closed')
        return
      }
      this.scheduleReconnect()
    }

    // onerror 后浏览器必然触发 onclose，统一在 onclose 里调度重连即可
    socket.onerror = () => {
      /* 交给 onclose 处理 */
    }
  }

  /**
   * 主动关闭连接（不重连）：页面卸载或用户显式断开时调用。
   */
  close(): void {
    this.manualClose = true
    this.clearTimers()
    this.stopHeartbeat()
    this.socket?.close()
    this.socket = null
    this.reconnectAttempt = 0
    this.setStatus('closed')
  }

  /**
   * 发送上行消息（订阅/指令/心跳）。
   * @returns true=已发送；false=当前不可发送（未连接），调用方应提示或缓存重试
   */
  send(message: ClientMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      console.warn(`[ws] 未连接，消息未发送：type=${message.type}`)
      logWsEvent('send-failed', `未连接：type=${message.type}`)
      return false
    }
    this.socket.send(JSON.stringify(message))
    logWsMessage('up', message)
    return true
  }

  /** 当前是否处于可收发的 open 状态 */
  get isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  /** 调度自动重连：指数退避 + 上限保护，超限进入 closed 终态 */
  private scheduleReconnect(): void {
    if (this.manualClose) return
    if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`[ws] 连续重连 ${MAX_RECONNECT_ATTEMPTS} 次失败，停止自动重连`)
      this.setStatus('closed')
      return
    }
    const delay = backoffDelay(this.reconnectAttempt)
    this.reconnectAttempt += 1
    this.setStatus('reconnecting')
    console.info(`[ws] 将在 ${delay}ms 后进行第 ${this.reconnectAttempt} 次重连`)
    // 网络恢复（online）/页面回前台（visibilitychange）时跳过退避等待立即重连：
    // 系统休眠唤醒、Wi-Fi 切换场景若仍按最长 30s 退避等待，恢复体验差。
    const skipWaitAndReconnectNow = () => {
      if (this.manualClose) return
      if (this.status !== 'reconnecting') return // 已连接/已手动关闭则忽略
      this.clearTimers()
      this.connect()
    }
    window.addEventListener('online', skipWaitAndReconnectNow)
    window.addEventListener('visibilitychange', skipWaitAndReconnectNow)
    this.skipWaitCleanup = () => {
      window.removeEventListener('online', skipWaitAndReconnectNow)
      window.removeEventListener('visibilitychange', skipWaitAndReconnectNow)
      this.skipWaitCleanup = null
    }

    this.connectTimer = window.setTimeout(() => this.connect(), delay)
  }

  /** 启动心跳循环：周期发送 heartbeat + 检查下行静默超时 */
  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = window.setInterval(() => {
      // 下行静默超时：连接假死（TCP 半开等场景），强制断开触发重连
      if (Date.now() - this.lastMessageAt > HEARTBEAT_TIMEOUT_MS) {
        console.warn('[ws] 心跳超时，判定连接假死，强制重连')
        this.socket?.close()
        return
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  /** 停止心跳循环 */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /** 清理重连定时器与跳过等待监听（二者同生命周期，避免监听泄漏） */
  private clearTimers(): void {
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer)
      this.connectTimer = null
    }
    this.skipWaitCleanup?.()
  }

  /**
   * 解析并分发下行消息：JSON.parse → isServerMessage 运行时校验 → 广播。
   * 非法消息（非 JSON/结构不符）打 warn 并丢弃，保证坏数据不进入 store。
   */
  private dispatch(raw: unknown): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(typeof raw === 'string' ? raw : '')
    } catch {
      console.warn('[ws] 收到非 JSON 消息，已丢弃', raw)
      logWsEvent('dropped', '非 JSON 消息')
      return
    }
    if (isBackendMessage(parsed)) {
      logWsMessage('down', { type: parsed.action, payload: parsed.data, ts: Date.now() })
      const mapped = mapBackendMessage(parsed)
      mapped.forEach((m) => this.messageHandlers.forEach((h) => h(m)))
      return
    }
    if (!isServerMessage(parsed)) {
      console.warn('[ws] 收到结构不符的消息，已丢弃', parsed)
      logWsEvent('dropped', '结构不符')
      return
    }
    logWsMessage('down', parsed)
    this.messageHandlers.forEach((h) => h(parsed))
  }
}

/** 全局唯一客户端单例：应用各处（store/hook/组件）统一消费此实例 */
export const wsClient = new WsClient()