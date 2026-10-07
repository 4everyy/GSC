/**
 * @file wsClient.ts
 * @description WebSocket 客户端：连接管理/订阅/状态回调
 * @author 4everyy
 * @date 2026-10-07
 */
import {
  isServerMessage,
  isBackendMessage,
  mapBackendMessage,
  buildSubscribeFrame,
  logWsEvent,
  logWsMessage,
  SUBSCRIBE_CHANNELS,
  type ClientMessage,
  type ServerMessage,
} from './protocol'
import { ensureAuthToken } from '../../api/index'

/** WebSocket 客户端 —— 连接生命周期管理（单例）。 */

/** 连接状态机：初始 idle → connecting → open（正常收发）↔ recon… */
export type WsStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'

/** 服务端消息处理器：按完整信封订阅，调用方自行按 type 分支 */
type MessageHandler = (msg: ServerMessage) => void

/** 状态变更回调：用于驱动 UI 连接指示灯 */
type StatusHandler = (status: WsStatus) => void

// 可调参数（联调期可按后端实际能力调整）

/** 心跳发送间隔（毫秒）：期间无任何下行消息也视作存活 */
const HEARTBEAT_INTERVAL_MS = 10_000

/** 心跳超时判定（毫秒）：超过该时长未收到任何下行消息（含 heartbeat 应答）视为假死 */
const HEARTBEAT_TIMEOUT_MS = Number.POSITIVE_INFINITY

/** 重连基础延迟（毫秒）：实际延迟 = base * 2^attempt */
const RECONNECT_BASE_DELAY_MS = 1_000
const RECONNECT_MAX_DELAY_MS = 30_000

/** 重连次数上限：超过后进入 closed 终态，需调用 connect() 手动恢复 */
const MAX_RECONNECT_ATTEMPTS = 20

/** 订阅回执核对超时（毫秒）：5 个频道的订阅帧发出后，超过该时长仍未集齐全部 ack即输出缺失频道告警（仅提示不重连）。 */
const SUBSCRIBE_ACK_TIMEOUT_MS = 5_000

/** 解析 WebSocket 服务地址。 */
function resolveWsUrl(): string {
  const configured = import.meta.env.VITE_WS_URL
  if (configured) return configured
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}/ws`
}

/**
 * 在连接 URL 上追加登录 token 查询参数（后端约定：ws://ip:port/ws?token=xxx）。
 * JWT 含 '.' 等字符需 encodeURIComponent；兼容已含 ? 的自定义地址。
 */
function appendTokenParam(url: string, token?: string | null): string {
  if (!token) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}token=${encodeURIComponent(token)}`
}

/** 打印后端推送的下行帧：时间戳 + 已解析的 JSON 对象。 */
function logDownlinkFrame(parsed: unknown): void {
  const ts = new Date().toLocaleTimeString()
  console.log(`[ws ↓ ${ts}]`, parsed)
}

/** 打印前端发出的上行帧：时间戳 + 完整消息对象（DevTools 可展开逐字段检查）。 */
function logUplinkFrame(payload: unknown): void {
  const ts = new Date().toLocaleTimeString()
  console.log(`[ws ↑ ${ts}]`, payload)
}
/** 握手超时：new WebSocket 后超过该时长仍未 open/close 即强制断开重连… */
const WS_HANDSHAKE_TIMEOUT_MS = 10_000

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

  /** 原始帧处理器（dispatch 在协议映射前调用）：联调观测用，正常业务勿挂 */
  private rawFrameHandlers = new Set<(frame: unknown) => void>()

  /** 订阅原始下行帧（JSON 解析后、协议映射前，含映射后被丢弃的帧）。返回退订函数。 */
  onRawFrame(handler: (frame: unknown) => void): () => void {
    this.rawFrameHandlers.add(handler)
    return () => this.rawFrameHandlers.delete(handler)
  }

  // 订阅回执核对…

  /** 发出订阅帧后待确认的频道表：ch → null（等待 ack）/ ack 原始帧（已确认）。 */
  private pendingSubChannels = new Map<string, unknown>()

  /** 本次连接内各频道订阅帧发送时刻（subSentAt）/ ack 到达时刻… */
  private subSentAt = new Map<string, number>()
  private subAckAt = new Map<string, number>()

  /** 订阅 ack 汇总看门狗：超时未集齐全部回执时输出缺失频道告警 */
  private subAckTimer: number | null = null

  /** 建连代际号：connect() 在 await token 的异步间隙可能被并发 connect / 手动 close 抢占 */
  private connectGen = 0

  /** 握手超时看门狗：new WebSocket 后若既未 open 也未 close，强制断开触发重连 */
  private handshakeTimer: number | null = null

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

  /** 建立连接（幂等）：已连接/连接中时直接返回。 */
  async connect(): Promise<void> {
    if (this.socket && (this.status === 'open' || this.status === 'connecting')) return
    this.manualClose = false
    this.clearTimers()
    // 建连代际号先自增：await token 间隙内若有更新的 connect()（gen 更大）或手动 close，本协程作废退出。
    const gen = ++this.connectGen
    this.setStatus(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting')
    logWsEvent(this.reconnectAttempt > 0 ? 'reconnect' : 'connecting', resolveWsUrl())

    // 后端约定：连接 URL 必须携带登录 token（ws://ip:port/ws?token=xxx）
    let token: string | null = null
    try {
      token = await ensureAuthToken()
    } catch (err) {
      console.warn('[ws] 获取登录 token 失败，尝试无 token 连接:', err)
    }

    // await 间隙被新一轮 connect / 手动 close 抢占：本协程作废，避免重复建连
    if (this.manualClose || this.connectGen !== gen) return

    const url = appendTokenParam(resolveWsUrl(), token)
    const socket = new WebSocket(url)
    this.socket = socket
    this.armHandshakeWatchdog(socket, url)

    socket.onopen = () => {
      this.disarmHandshakeWatchdog()
      this.reconnectAttempt = 0
      this.lastMessageAt = Date.now()
      console.info('[ws] 连接成功: ' + resolveWsUrl())
      logWsEvent('open', resolveWsUrl())
      this.setStatus('open')
      // 应用层握手：连接建立后前端主动发送的第一条消息。
      this.pendingSubChannels.clear()
      this.subSentAt.clear()
      this.subAckAt.clear()
      for (const ch of SUBSCRIBE_CHANNELS) {
        const frame = buildSubscribeFrame(ch)
        console.info(`[ws] send subscribe: ${frame}`)
        logWsMessage('up', { type: 'handshake', payload: `sub ${ch}`, ts: Date.now() })
        logUplinkFrame(JSON.parse(frame)) // 完整对象打印（联调对帧用）
        this.socket?.send(frame)
        this.pendingSubChannels.set(ch, null)
        this.subSentAt.set(ch, Date.now())
      }
      this.armSubscribeAckWatchdog()
      this.startHeartbeat()
    }

    socket.onmessage = (event: MessageEvent) => {
      this.lastMessageAt = Date.now()
      // 日志打印移入 dispatch（复用同一次 JSON.parse
      this.dispatch(event.data)
    }

    socket.onclose = (event: CloseEvent) => {
      this.disarmHandshakeWatchdog()
      this.stopHeartbeat()
      this.socket = null
      // 断线后未集齐的订阅回执不再等待（避免误报"未收到 ack"）：重连成功后 onopen 会重新发送订阅帧并重新核验回执
      this.cancelSubscribeAckWatchdog()
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

  /** 主动关闭连接（不重连）：页面卸载或用户显式断开时调用。 */
  close(): void {
    this.manualClose = true
    this.clearTimers()
    this.disarmHandshakeWatchdog()
    this.stopHeartbeat()
    this.cancelSubscribeAckWatchdog()
    this.socket?.close()
    this.socket = null
    this.reconnectAttempt = 0
    this.setStatus('closed')
  }

  /** 发送上行消息（订阅/指令/心跳）。 */
  send(message: ClientMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      console.warn(`[ws] 未连接，消息未发送：type=${message.type}`)
      logWsEvent('send-failed', `未连接：type=${message.type}`)
      return false
    }
    this.socket.send(JSON.stringify(message))
    logUplinkFrame(message)
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
    // 系统休眠唤醒、Wi-Fi 切换场景若仍按最长…
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

  /** 握手看门狗：new WebSocket 后既未 open 也未 close 且超时，强制关闭触发重连。 */
  private armHandshakeWatchdog(socket: WebSocket, url: string): void {
    this.disarmHandshakeWatchdog()
    this.handshakeTimer = window.setTimeout(() => {
      if (this.socket !== socket || socket.readyState === WebSocket.OPEN) return
      console.error(
        `[ws] 握手 ${WS_HANDSHAKE_TIMEOUT_MS}ms 未完成（readyState=${socket.readyState}），` +
          `强制断开并重试。若反复出现请查 DevTools→Network→WS：无该请求=未发出；` +
          `有请求无响应=代理/网络层挂起（常见：后端拒绝升级未透传）。url=${url}`,
      )
      logWsEvent('handshake-timeout', `readyState=${socket.readyState}`)
      // CONNECTING 态 close() 会触发 onclose → scheduleRec…
      socket.close()
    }, WS_HANDSHAKE_TIMEOUT_MS)
  }

  /** 停止握手看门狗（open/close 任一事件到达即解除） */
  private disarmHandshakeWatchdog(): void {
    if (this.handshakeTimer !== null) {
      window.clearTimeout(this.handshakeTimer)
      this.handshakeTimer = null
    }
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

  /** 解析并分发下行消息：JSON.parse → isServerMessage 运行时校验 → 广播。 */
  private dispatch(raw: unknown): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(typeof raw === 'string' ? raw : '')
    } catch {
      console.warn('[ws] 收到非 JSON 消息，已丢弃', raw)
      logWsEvent('dropped', '非 JSON 消息')
      return
    }
    logDownlinkFrame(parsed)
    // 原始帧观测钩子（映射前）：observeDownlink 联调用，含映射后被丢弃的帧均可见
    this.rawFrameHandlers.forEach((h) => h(parsed))
    // 订阅状态留痕：任何 ack#ch 帧均记录到达时刻…
    this.recordSubAck(parsed)
    // 订阅回执核对：ack 帧不进业务分发（mapBackendMessage 对非 pub 帧返回空），在此识别命中频道并逐条打印回执
    const ackedChannel = this.matchSubscribeAck(parsed)
    if (ackedChannel !== null) this.onSubscribeAck(ackedChannel, parsed)
    if (isBackendMessage(parsed)) {
      // 新版 op#ch 信封
      const kind =
        typeof parsed.ch === 'string'
          ? `${parsed.op ?? 'pub'}#${parsed.ch}`
          : (parsed.action ?? parsed.topic)
      logWsMessage('down', { type: kind, payload: parsed.data ?? parsed.ch, ts: Date.now() })
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

  // 订阅状态留痕（排障证据链）

  /** 订阅留痕：识别任何 {op:'ack',ch:'<频道>'}（兼容旧版 {type:'ack',topic}）帧并记录到达时刻。 */
  private recordSubAck(parsed: unknown): void {
    if (typeof parsed !== 'object' || parsed === null) return
    const f = parsed as { op?: unknown; ch?: unknown; type?: unknown; topic?: unknown }
    const ch =
      f.op === 'ack' && typeof f.ch === 'string'
        ? f.ch
        : f.type === 'ack' && typeof f.topic === 'string'
          ? f.topic
          : undefined
    if (ch !== undefined) this.subAckAt.set(ch, Date.now())
  }

  /** 排障快照：各频道订阅帧发送时刻（sentAt）与 ack 到达时刻（ackAt），未发生为 undefined。 */
  getSubAckSnapshot(): Record<string, { sentAt?: number; ackAt?: number }> {
    const out: Record<string, { sentAt?: number; ackAt?: number }> = {}
    for (const ch of SUBSCRIBE_CHANNELS) {
      out[ch] = { sentAt: this.subSentAt.get(ch), ackAt: this.subAckAt.get(ch) }
    }
    return out
  }

  // 订阅回执核对（5 频道 ack）

  /** 识别订阅确认帧：新版协议 {op:'ack', ch:'<频道>'}，兼容旧版信封 {type:'ack', topic:'<频道>'}。 */
  private matchSubscribeAck(parsed: unknown): string | null {
    if (typeof parsed !== 'object' || parsed === null) return null
    const f = parsed as { op?: unknown; ch?: unknown; type?: unknown; topic?: unknown }
    if (f.op === 'ack' && typeof f.ch === 'string' && this.pendingSubChannels.get(f.ch) === null) {
      return f.ch
    }
    if (
      f.type === 'ack' &&
      typeof f.topic === 'string' &&
      this.pendingSubChannels.get(f.topic) === null
    ) {
      return f.topic
    }
    return null
  }

  /** 收到某频道订阅 ack：登记回执帧并打印到控制台（联调可展开逐字段检查），5 个频道全部集齐时立即输出订阅成功汇总并撤销看门狗。 */
  private onSubscribeAck(channel: string, frame: unknown): void {
    this.pendingSubChannels.set(channel, frame)
    const waiting = [...this.pendingSubChannels.entries()]
      .filter(([, v]) => v === null)
      .map(([k]) => k)
    const ts = new Date().toLocaleTimeString()
    console.info(
      `[ws ✔ ${ts}] 订阅回执 ack：ch=${channel} 订阅成功` +
        `（${this.pendingSubChannels.size - waiting.length}/${this.pendingSubChannels.size}，剩余等待：${waiting.length > 0 ? waiting.join(' / ') : '无'}）`,
      frame,
    )
    if (waiting.length === 0) this.reportSubscribeResult()
  }

  /** 订阅结果汇总（集齐回执或看门狗超时时调用）：全部频道已确认 → 打印 ✅ 成功结论 */
  private reportSubscribeResult(): void {
    if (this.subAckTimer !== null) {
      window.clearTimeout(this.subAckTimer)
      this.subAckTimer = null
    }
    const entries = [...this.pendingSubChannels.entries()]
    if (entries.length === 0) return
    const acked = entries.filter(([, v]) => v !== null).map(([k]) => k)
    const missing = entries.filter(([, v]) => v === null).map(([k]) => k)
    const ts = new Date().toLocaleTimeString()
    if (missing.length === 0) {
      console.info(
        `[ws ✅ ${ts}] ${acked.length}/${SUBSCRIBE_CHANNELS.length} 个频道订阅全部成功，均已收到 ack 回执：${acked.join(' / ')}`,
      )
    } else {
      console.warn(
        `[ws ⚠ ${ts}] 订阅回执核对超时（${SUBSCRIBE_ACK_TIMEOUT_MS / 1000}s）：` +
          `已收到 ack [${acked.join(', ')}]，未收到 ack [${missing.join(', ')}]（后端未确认，请检查频道名/订阅帧格式）`,
      )
    }
    this.pendingSubChannels.clear()
  }

  /** 订阅 ack 看门狗：订阅帧全部发出后启动，超时未集齐回执则输出缺失告警（仅提示，不触发重连） */
  private armSubscribeAckWatchdog(): void {
    if (this.subAckTimer !== null) window.clearTimeout(this.subAckTimer)
    this.subAckTimer = window.setTimeout(() => {
      this.subAckTimer = null
      this.reportSubscribeResult()
    }, SUBSCRIBE_ACK_TIMEOUT_MS)
  }

  /** 取消订阅回执核对：断线（异常/手动）后未集齐的 ack 永远等不到了，静默清空（连接级失败已有 close 日志，避免重复误报） */
  private cancelSubscribeAckWatchdog(): void {
    if (this.subAckTimer !== null) {
      window.clearTimeout(this.subAckTimer)
      this.subAckTimer = null
    }
    this.pendingSubChannels.clear()
  }
}

/** 全局唯一客户端单例：应用各处（store/hook/组件）统一消费此实例 */
export const wsClient = new WsClient()

// 控制台排障入口：window.__wsSubState

declare global {
  interface Window {
    /** 订阅状态排障：各频道订阅帧发送/ack 到达时刻 + 当前连接状态… */
    __wsSubState?: () => {
      status: WsStatus
      channels: Record<string, { sentAt?: number; ackAt?: number }>
    }
  }
}

if (typeof window !== 'undefined') {
  window.__wsSubState = () => ({
    status: wsClient.getStatus(),
    channels: wsClient.getSubAckSnapshot(),
  })
}
