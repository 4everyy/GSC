import {   type ClientMessage,
  type ServerMessage,
  type AlarmPayload,
  type CmdAckPayload,
  type CommandResult,
  type CommandType,
  type DeviceId,
  type DeviceStatusPayload,
  type TargetPayload,
  type TelemetryPayload,
  type WelcomePayload,
  isServerMessage,
  isBackendMessage,
  mapBackendMessage,
  buildSubscribeFrame,
  SUBSCRIBE_CHANNELS,
  buildCommand,
  buildSubscribe,
  buildUnsubscribe,
  logWsEvent,
  logWsMessage } from './protocol'
import { create } from 'zustand'
import { ensureAuthToken } from '../../api/index'
import { useEffect } from 'react'

/**
 * 实时通道统一模块：WsClient 连接生命周期（连接/重连/心跳/消息分发）
 * + 实时数据 Store（下行消息沉淀为 Zustand 状态）+ useRealtimeConnection Hook。
 *
 * 2026-09-19 结构重组：原 realtimeStore.ts 并入（两文件互引形成循环依赖）；
 * 真实后端信封映射（BackendMessage / mapBackendMessage 等）移至 protocol.ts。
 */

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
 * 订阅回执核对超时（毫秒）：5 个频道的订阅帧发出后，超过该时长仍未集齐全部 ack
 * 即输出缺失频道告警（仅提示不重连）。与指令回执（cmdAck）5s 超时同量纲。
 */
const SUBSCRIBE_ACK_TIMEOUT_MS = 5_000

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

/**
 * 在连接 URL 上追加登录 token 查询参数（后端约定：ws://ip:port/ws?token=xxx）。
 * JWT 含 '.' 等字符需 encodeURIComponent；兼容已含 ? 的自定义地址。
 */
function appendTokenParam(url: string, token?: string | null): string {
  if (!token) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}token=${encodeURIComponent(token)}`
}


/**
 * 打印后端推送的下行帧：时间戳 + 已解析的 JSON 对象。
 * 性能修复（O1）：与 dispatch 共享同一次 JSON.parse 结果——原实现 onmessage
 * （日志打印）与 dispatch（校验分发）各 parse 一次，5Hz×N 台遥测下双倍解析
 * 白耗 CPU；现统一在 dispatch 解析成功后传入本函数直接打印。
 */
function logDownlinkFrame(parsed: unknown): void {
  const ts = new Date().toLocaleTimeString()
  console.log(`[ws ↓ ${ts}]`, parsed)
}

/**
 * 打印前端发出的上行帧：时间戳 + 完整消息对象（DevTools 可展开逐字段检查）。
 * 与 logDownlinkFrame 对称：联调时控制台成对呈现 ↓/↑ 完整收发帧。
 */
function logUplinkFrame(payload: unknown): void {
  const ts = new Date().toLocaleTimeString()
  console.log(`[ws ↑ ${ts}]`, payload)
}
/** 握手超时：new WebSocket 后超过该时长仍未 open/close 即强制断开重连（防代理吞失败响应导致无限 connecting） */
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

  // ---- 订阅回执核对（5 频道 ack：cmd/task/device/telemetry/alert）----

  /**
   * 发出订阅帧后待确认的频道表：ch → null（等待 ack）/ ack 原始帧（已确认）。
   * 每次 onopen 重新订阅时重置，断线时清空（重连成功后重新订阅、重新核验）。
   */
  private pendingSubChannels = new Map<string, unknown>()

  /**
   * 订阅状态留痕（排障证据链，与上方「核对」语义解耦）：本次连接内各频道
   * 订阅帧发送时刻（subSentAt）/ ack 到达时刻（subAckAt）。
   * 核对表在汇总/超时后清空、迟到 ack 不再参与核对，但留痕表持续记录到下次重连，
   * 供 observeDownlink 的 device 频道客户端/服务端责任判定取证（getSubAckSnapshot）。
   */
  private subSentAt = new Map<string, number>()
  private subAckAt = new Map<string, number>()

  /** 订阅 ack 汇总看门狗：超时未集齐全部回执时输出缺失频道告警 */
  private subAckTimer: number | null = null

  /**
   * 建连代际号：connect() 在 await token 的异步间隙可能被并发 connect / 手动 close 抢占，
   * 代际号用于让被抢占的旧协程作废退出。2026-09-24 事故根因：旧代码在此间隙用
   * status === 'connecting' 判断「被抢先」，但那是本协程自己刚设的状态，导致
   * new WebSocket() 永远执行不到——WS 一帧未发、状态永远停在 connecting。
   */
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

  /**
   * 建立连接（幂等）：已连接/连接中时直接返回。
   * 内部监听 onopen/onmessage/onclose/onerror，异常关闭时自动调度重连。
   */
  async connect(): Promise<void> {
    if (this.socket && (this.status === 'open' || this.status === 'connecting')) return
    this.manualClose = false
    this.clearTimers()
    // 建连代际号先自增：await token 间隙内若有更新的 connect()（gen 更大）或手动 close，
    // 本协程作废退出。注意：不能用 status === 'connecting' 作「被抢先」判据——
    // 那正是本协程自己刚设的状态（2026-09-24 起飞观测 0 帧事故的根因，见 connectGen 字段注释）。
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
      // 页面刷新 → 重新连接 → hello → (welcome) → subscribe 的链路在日志中清晰可见；
      // 后端回不回 welcome 均可（宽容模式），详见 protocol.ts 的 HelloPayload 注释。
      // 新版订阅协议（2026-09-18）：连接后按频道逐一发送 {"op":"sub","ch":"<频道>"} 订阅帧
      // cmd=指令下发与回执  task=任务状态与进度  device=设备上下线与状态
      // telemetry=遥测推送（1~2Hz 降采样）  alert=告警事件
      // 订阅回执核对登记：每发出一帧订阅即标记该频道等待 ack，收齐 5 频道
      // 回执或超时后输出核对结论（见 dispatch / reportSubscribeResult）。
      // 重连场景 onopen 会重复执行，先清空上一轮状态再重新登记。
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
      // 日志打印移入 dispatch（复用同一次 JSON.parse，见 logDownlinkFrame 注释）
      this.dispatch(event.data)
    }

    socket.onclose = (event: CloseEvent) => {
      this.disarmHandshakeWatchdog()
      this.stopHeartbeat()
      this.socket = null
      // 断线后未集齐的订阅回执不再等待（避免误报"未收到 ack"）：
      // 重连成功后 onopen 会重新发送订阅帧并重新核验回执
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

  /**
   * 主动关闭连接（不重连）：页面卸载或用户显式断开时调用。
   */
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

  /**
   * 握手看门狗：new WebSocket 后既未 open 也未 close 且超时，强制关闭触发重连。
   * 防护场景：代理/网络层吞掉握手失败响应（如后端 401 拒绝升级未透传回浏览器）时，
   * socket 会无限停留在 CONNECTING 且不触发任何事件——客户端表现为「永远 connecting、
   * 一帧不发」，此处强制暴露并进入重连循环（2026-09-24 联调排障加固）。
   */
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
      // CONNECTING 态 close() 会触发 onclose → scheduleReconnect
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
    logDownlinkFrame(parsed)
    // 原始帧观测钩子（映射前）：observeDownlink 联调用，含映射后被丢弃的帧均可见
    this.rawFrameHandlers.forEach((h) => h(parsed))
    // 订阅状态留痕：任何 ack#ch 帧均记录到达时刻（与核对流程解耦——核对表清空后的迟到 ack 仍留痕）
    this.recordSubAck(parsed)
    // 订阅回执核对：ack 帧不进业务分发（mapBackendMessage 对非 pub 帧返回空），
    // 在此识别命中频道并逐条打印回执，集齐 5 频道后输出订阅成功汇总
    const ackedChannel = this.matchSubscribeAck(parsed)
    if (ackedChannel !== null) this.onSubscribeAck(ackedChannel, parsed)
    if (isBackendMessage(parsed)) {
      // 新版 op#ch 信封；后端实测推送帧可无 op（{ch,seq,ts,data}），按 pub#ch 归类；
      // 旧版取 action/topic
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

  // ==================== 订阅状态留痕（排障证据链） ====================

  /**
   * 订阅留痕：识别任何 {op:'ack',ch:'<频道>'}（兼容旧版 {type:'ack',topic}）帧并记录到达时刻。
   * 与 matchSubscribeAck 的核对语义不同：不校验是否处于待确认态（重复/迟到 ack 覆盖更新），
   * 专供 getSubAckSnapshot 与 observeDownlink 的责任判定取证。
   */
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

  /**
   * 排障快照：各频道订阅帧发送时刻（sentAt）与 ack 到达时刻（ackAt），未发生为 undefined。
   * observeDownlink 据此判定 device 频道无回执时的客户端/服务端责任；控制台可执行 __wsSubState() 手动查看。
   */
  getSubAckSnapshot(): Record<string, { sentAt?: number; ackAt?: number }> {
    const out: Record<string, { sentAt?: number; ackAt?: number }> = {}
    for (const ch of SUBSCRIBE_CHANNELS) {
      out[ch] = { sentAt: this.subSentAt.get(ch), ackAt: this.subAckAt.get(ch) }
    }
    return out
  }

  // ==================== 订阅回执核对（5 频道 ack） ====================

  /**
   * 识别订阅确认帧：新版协议 {op:'ack', ch:'<频道>'}，兼容旧版信封 {type:'ack', topic:'<频道>'}。
   * 仅匹配当前连接已发出订阅帧且尚未确认的频道（等待态 = null）；
   * 命中返回频道名，非 ack 帧 / 重复 ack / 未订阅频道的 ack 均返回 null。
   */
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

  /**
   * 收到某频道订阅 ack：登记回执帧并打印到控制台（联调可展开逐字段检查），
   * 5 个频道全部集齐时立即输出订阅成功汇总并撤销看门狗。
   */
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

  /**
   * 订阅结果汇总（集齐回执或看门狗超时时调用）：
   * 全部频道已确认 → 打印 ✅ 成功结论；存在缺失 → 打印 ⚠ 缺失频道告警。
   * 汇总后清空待确认表与看门狗，避免重复汇总；迟到的 ack 不再参与核对
   * （仍会作为普通下行帧打印，无观测盲区）。
   */
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

  /**
   * 取消订阅回执核对：断线（异常/手动）后未集齐的 ack 永远等不到了，
   * 静默清空（连接级失败已有 close 日志，避免重复误报）；重连成功后重新订阅并重新核验。
   */
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

// ==================== 控制台排障入口：window.__wsSubState ====================

declare global {
  interface Window {
    /** 订阅状态排障：各频道订阅帧发送/ack 到达时刻 + 当前连接状态（DevTools Console 手动检查用） */
    __wsSubState?: () => {
      status: WsStatus
      channels: Record<string, { sentAt?: number; ackAt?: number }>
    }
  }
}

if (typeof window !== 'undefined') {
  window.__wsSubState = () => ({ status: wsClient.getStatus(), channels: wsClient.getSubAckSnapshot() })
}

// ==================== 下行观测窗口（联调对帧用）====================

/** 单次观测结果：窗口内收到的全部下行帧 + 按类型汇总 */
export interface DownlinkObservation {
  /** 观测标签（如 "takeoff"），用于日志对齐 */
  label: string
  /** 窗口时长（毫秒） */
  durationMs: number
  /** 窗口内下行帧总数 */
  total: number
  /** 按原始帧类型计数：op#ch（新版，如 pub#cmd）或 action/topic/type（旧版）→ 条数 */
  byType: Record<string, number>
  /** 窗口内全部原始帧（协议映射前；DevTools 可展开逐帧检查） */
  frames: unknown[]
  /** 观测结束时是否处于可收发状态 */
  status: WsStatus
}

/** 原始帧分类：新版 op#ch（如 pub#cmd），旧版 action/topic/type，未知归 raw。
 *  后端实测推送帧可无 op（{ch,seq,ts,data}）——ch 存在时 op 缺省按 pub 归类 */
function frameKind(frame: unknown): string {
  if (typeof frame !== 'object' || frame === null) return 'raw'
  const f = frame as { op?: unknown; ch?: unknown; action?: unknown; topic?: unknown; type?: unknown }
  if (typeof f.op === 'string' || typeof f.ch === 'string') {
    return `${typeof f.op === 'string' ? f.op : 'pub'}#${typeof f.ch === 'string' ? f.ch : ''}`
  }
  if (typeof f.action === 'string') return f.action
  if (typeof f.topic === 'string') return f.topic
  if (typeof f.type === 'string') return f.type
  return 'raw'
}

/** cmd 频道（指令回执）结论：pub#cmd 计数 >0 打 ✔，=0 打 ⚠（附 REST 场景说明）。 */
function reportCmdChannelReceipt(label: string, count: number): void {
  if (count > 0) {
    console.info(
      `[ws-observe] ✔ 「${label}」收到 cmd 频道回执（pub#cmd × ${count}）——后端已通过 WS cmd 频道推送指令回执`,
    )
  } else {
    console.warn(
      `[ws-observe] ⚠ 「${label}」未收到 cmd 频道回执（pub#cmd=0）。注意：ack#cmd 仅是订阅确认，不是指令回执；` +
        `若后端仅在 WS 上行指令时才回执、REST 起飞结果只体现在 HTTP 响应，则属预期行为`,
    )
  }
}

/**
 * device 频道（设备状态回执）专项结论 —— 客户端/服务端责任判定。
 *
 * 证据链三环节：① 客户端发送 {"op":"sub","ch":"device"}（连接建立时随 5 频道自动发出）
 * → ② 服务端回 ack#device 确认订阅 → ③ 窗口内其他频道有 pub 推送（证明链路与订阅机制正常）。
 * pub#device=0 时按首个异常环节定位问题侧：
 * - 连接非 open → 链路问题（断线/重连中，下行不可达）；
 * - ①缺失 → 客户端问题（订阅帧未发出）；
 * - ②缺失 → 服务端问题（未确认订阅：频道名不符/不支持该频道/ack 信封异常）；
 * - ③其他频道有推送但 device 无 → 服务端问题（未在 device 频道推状态，
 *   很可能仅把 swarmState 走 telemetry 频道，需与后端确认推送策略）。
 */
function reportDeviceChannelVerdict(
  label: string,
  byType: Record<string, number>,
  subState: Record<string, { sentAt?: number; ackAt?: number }>,
  status: WsStatus,
): void {
  const devicePub = byType['pub#device'] ?? 0
  if (devicePub > 0) {
    console.info(
      `[ws-observe] ✔ 「${label}」收到 device 频道回执（pub#device × ${devicePub}）——` +
        `后端已通过 WS device 频道推送设备状态回执（起飞后 inAir/model 状态变更）`,
    )
    return
  }
  const sentAt = subState.device?.sentAt
  const ackAt = subState.device?.ackAt
  if (status !== 'open') {
    console.error(
      `[ws-observe] ✘ 「${label}」未收到 device 频道回执——【链路问题】观测结束时连接状态为 ${status}（断线/重连中），` +
        `下行不可达无法判定服务端行为；重连成功后重新下发指令再观测`,
    )
  } else if (sentAt === undefined) {
    console.error(
      `[ws-observe] ✘ 「${label}」未收到 device 频道回执——【客户端问题】本次连接从未发送 device 订阅帧` +
        `（订阅帧应在连接建立时随 5 频道一并发出，请检查控制台 "[ws] send subscribe" 日志与 wsClient.onopen）`,
    )
  } else if (ackAt === undefined) {
    console.error(
      `[ws-observe] ✘ 「${label}」未收到 device 频道回执——【服务端问题】device 订阅帧已于 ` +
        `${new Date(sentAt).toLocaleTimeString()} 发出，但服务端始终未回 ack#device 订阅确认` +
        `（可能：服务端不支持该频道 / 频道名不一致 / ack 信封格式异常——可执行 __wsLog.list() 检索 ack 帧核对信封）`,
    )
  } else {
    const otherPub = Object.entries(byType).filter(([k]) => k.startsWith('pub#') && k !== 'pub#device')
    const otherPubTotal = otherPub.reduce((sum, [, v]) => sum + v, 0)
    if (otherPubTotal > 0) {
      console.error(
        `[ws-observe] ✘ 「${label}」未收到 device 频道回执——【服务端问题】订阅已确认（ack#device ✓）且链路正常` +
          `（窗口内其他频道推送 ${otherPubTotal} 帧：${otherPub.map(([k, v]) => `${k}×${v}`).join('、')}），` +
          `但 device 频道零推送——后端未把设备状态变更走 device 频道（可能仅经 telemetry 频道推 swarmState），` +
          `请与后端确认 device 频道的推送时机`,
      )
    } else {
      console.error(
        `[ws-observe] ✘ 「${label}」未收到 device 频道回执——【服务端问题】订阅已确认（ack#device ✓）` +
          `但窗口内所有频道均无 pub 推送（连接 open，仅收到 ${Object.keys(byType).join('、') || '无'} 类帧）`,
      )
    }
  }
}

/**
 * 下行观测窗口（联调专用 v2：挂原始帧）：立即开始记录 N 毫秒内的全部 WS 下行
 * 原始帧（JSON 解析后、协议映射前），映射层丢弃的帧也可见，无观测盲区。
 *
 * 用途：REST 指令（如 podControl 起飞）发出后，验证后端是否通过 WS 推送
 * 回执/状态变更。按 op#ch 分类（pub#cmd=指令回执、pub#device=设备状态回执、
 * ack#ch=订阅确认、pub#telemetry=遥测…），非遥测帧逐帧实时打印；
 * 窗口结束输出汇总与分频道结论：完全无下行 / cmd 频道回执 / device 频道回执
 * （device 无回执时按「订阅帧已发 → ack 已回 → 其他频道有推送」证据链自动判定客户端/服务端责任）。
 *
 * 返回 Promise（窗口结束 resolve 观测结果），调用方一般 void 忽略即可。
 */
export function observeDownlink(durationMs: number, label: string): Promise<DownlinkObservation> {
  return new Promise((resolve) => {
    const frames: unknown[] = []
    console.info(`[ws-observe] ▶ 开始观测下行「${label}」，窗口 ${durationMs}ms，连接状态 ${wsClient.getStatus()}`)
    const off = wsClient.onRawFrame((frame) => {
      frames.push(frame)
      const kind = frameKind(frame)
      // 遥测高频帧只计数（汇总时呈现），其余逐帧打印便于实时跟踪回执
      if (kind !== 'pub#telemetry' && kind !== 'plane.swarmState' && kind !== 'telemetry') {
        console.info(`[ws-observe] ↓ [${label}] ${kind}`, frame)
      }
    })
    window.setTimeout(() => {
      off()
      const byType: Record<string, number> = {}
      frames.forEach((f) => {
        const k = frameKind(f)
        byType[k] = (byType[k] ?? 0) + 1
      })
      const status = wsClient.getStatus()
      const result: DownlinkObservation = { label, durationMs, total: frames.length, byType, frames, status }
      console.info(`[ws-observe] ■ 「${label}」观测结束：共 ${frames.length} 帧`, byType)
      if (frames.length === 0) {
        if (status !== 'open') {
          console.error(
            `[ws-observe] ✘ 「${label}」窗口内无任何下行且连接状态为 ${status}——【链路问题】观测期间连接不可用，无法判定服务端行为`,
          )
        } else {
          console.error(
            `[ws-observe] ✘ 「${label}」窗口内未收到任何 WS 下行帧（连接 open）——【服务端问题】连接正常但所有频道均未推送`,
          )
        }
      } else {
        // 分频道结论：cmd=指令回执；device=设备状态回执（含客户端/服务端责任判定）
        reportCmdChannelReceipt(label, byType['pub#cmd'] ?? 0)
        reportDeviceChannelVerdict(label, byType, wsClient.getSubAckSnapshot(), status)
      }
      resolve(result)
    }, durationMs)
  })
}

// ==================== 实时数据 Store（原 realtimeStore.ts 并入）====================

/**
 * 实时数据 Store —— 将 WebSocket 下行消息沉淀为全局响应式状态。
 *
 * 职责：
 * 1. 启动 wsClient 并订阅消息/状态：把遥测/设备状态/目标/告警写入 Zustand；
 * 2. 提供动作：发送控制指令（sendCommand）、订阅/退订设备（subscribe/unsubscribe）；
 * 3. 指令回执跟踪：pendingAcks 记录 reqId → 指令类型，收到 cmdAck 后移除并记录结果；
 *    超时保护：发送后 5s 未收到回执自动转 failed（对接文档第 6 节约定）；
 *    断线保护：连接断开时未回执的指令全部转 failed，避免 UI 永久等待；
 * 4. 遥测节流：遥测为高频消息，直接整对象写入会引发高频重渲染，遥测按 deviceId
 *    覆盖存储（仅保留每设备最新一帧），需要历史曲线时再另行扩展环形缓冲。
 *
 * 消费方式：组件通过 useRealtimeStore(selector) 订阅所需切片；
 * 连接生命周期由 useRealtimeConnection Hook 在应用根部统一驱动。
 */

/** 指令回执记录：reqId 关联，UI 可据此提示“下发成功/失败” */
export interface AckRecord {
  reqId: string
  command: CommandType
  result: CommandResult
  reason?: string
  /** 回执到达时间（Unix 毫秒） */
  ts: number
}

/** Realtime Store 状态与动作 */
export interface RealtimeState {
  /** WebSocket 连接状态（由 wsClient 状态回调同步） */
  status: WsStatus
  /** 各设备最新一帧遥测：deviceId → TelemetryPayload */
  telemetry: Record<DeviceId, TelemetryPayload>
  /** 设备状态表：deviceId → DeviceStatusPayload（含名称/在线状态/充电标记） */
  devices: Record<DeviceId, DeviceStatusPayload>
  /** 目标情报表：targetId → TargetPayload */
  targets: Record<string, TargetPayload>
  /** 告警列表（同一 alarmId 更新时原地替换，按到达顺序追加） */
  alarms: AlarmPayload[]
  /** 待回执指令：reqId → 指令类型（发送后写入，cmdAck 到达/超时/断线后转历史） */
  pendingAcks: Record<string, CommandType>
  /** 最近 N 条回执历史（环形上限，防止无限增长） */
  ackHistory: AckRecord[]
  /** 最近一次统计信息（消息计数等，调试用） */
  lastMessageAt: number
  /** 应用层握手应答（后端 welcome 消息；后端未实现时保持 null，不影响功能） */
  serverInfo: WelcomePayload | null
}

/** 回执历史上限：超出后丢弃最旧记录 */
const ACK_HISTORY_LIMIT = 50

/** 告警列表上限：超出后丢弃最旧告警，避免长时运行内存膨胀 */
const ALARM_LIST_LIMIT = 200

/** 指令回执超时（毫秒）：对接文档约定发送 command 后 5s 未收到 cmdAck 视为失败 */
const ACK_TIMEOUT_MS = 5_000

/** reqId → 超时定时器（模块级管理，不进入 store 形状，避免影响组件订阅） */
const ackTimers = new Map<string, number>()

/** Realtime Store 完整类型（含动作） */
export interface RealtimeStore extends RealtimeState {
  /** 同步连接状态（由 wsClient.onStatus 回调调用） */
  setStatus: (status: WsStatus) => void
  /** 应用下行消息（由 wsClient.onMessage 回调调用） */
  applyMessage: (msg: unknown) => void
  /** 发送控制指令：发送成功后登记 pendingAcks；返回 reqId（发送失败返回 null） */
  sendCommand: (command: CommandType, deviceIds: DeviceId[], params?: Record<string, unknown>) => string | null
  /** 订阅设备数据：空数组 = 订阅全部（仅支持 subscribe 协议的后端有效） */
  subscribe: (deviceIds: DeviceId[]) => void
  /** 退订设备数据 */
  unsubscribe: (deviceIds: DeviceId[]) => void
}

/** reducer 使用的 set/get 简化签名（zustand setState 兼容此窄类型） */
type SetPartial = (partial: Partial<RealtimeState>) => void
type GetState = () => RealtimeState

/**
 * 处理单条下行消息并更新 store。
 * 按 type 分发到对应 reducer；未知类型静默忽略（协议向前兼容）。
 *
 * ⚠️ 写入 Record 型字段（telemetry/devices/targets）时必须基于 get() 读当前值
 *    构造完整新对象后整体写入——reducer 输出即最终值，不再有二次合并，
 *    这样 targetRemoved 的删除语义才能生效（旧版经 mergePartial 合并会把已删
 *    条目从旧 state 回填回来，导致目标永远删不掉）。
 */
function reduceMessage(set: SetPartial, get: GetState, msg: unknown): void {
  if (typeof msg !== 'object' || msg === null) return
  const { type, payload } = msg as { type: string; payload: unknown }
  switch (type) {
    case 'telemetry': {
      const t = payload as TelemetryPayload
      set({ telemetry: { ...get().telemetry, [t.deviceId]: t } })
      break
    }
    case 'deviceStatus': {
      const d = payload as DeviceStatusPayload
      set({ devices: { ...get().devices, [d.deviceId]: d } })
      break
    }
    case 'target': {
      const t = payload as TargetPayload
      set({ targets: { ...get().targets, [t.targetId]: t } })
      break
    }
    case 'targetRemoved': {
      const { targetId } = payload as { targetId: string }
      const next = { ...get().targets }
      delete next[targetId]
      set({ targets: next })
      break
    }
    case 'alarm': {
      const a = payload as AlarmPayload
      const list = get().alarms
      // 同一 alarmId（如“确认”状态更新）原地替换而非追加，避免列表出现重复告警
      const idx = list.findIndex((x) => x.alarmId === a.alarmId)
      const next = idx >= 0 ? list.map((x, i) => (i === idx ? a : x)) : [...list, a]
      set({ alarms: next.slice(-ALARM_LIST_LIMIT) })
      break
    }
    case 'cmdAck': {
      const ack = payload as CmdAckPayload
      const state = get()
      const command = state.pendingAcks[ack.reqId]
      if (!command) break
      clearAckTimer(ack.reqId)
      const pending = { ...state.pendingAcks }
      delete pending[ack.reqId]
      const record: AckRecord = {
        reqId: ack.reqId,
        command,
        result: ack.result,
        reason: ack.reason,
        ts: Date.now(),
      }
      set({
        pendingAcks: pending,
        ackHistory: [record, ...state.ackHistory].slice(0, ACK_HISTORY_LIMIT),
      })
      break
    }
    case 'heartbeat': {
      // 心跳应答：仅刷新存活时间戳，不产生业务状态
      set({ lastMessageAt: Date.now() })
      break
    }
    case 'welcome': {
      // 应用层握手应答：记录服务端信息，握手链路完成（宽容模式，非必须消息）
      const w = payload as WelcomePayload
      set({ serverInfo: w })
      console.info('[realtime] 应用层握手完成，收到服务端 welcome：', w)
      break
    }
    default:
      break
  }
}

/** 登记指令回执超时定时器：到期仍未收到 cmdAck 则转 failed 记录 */
function scheduleAckTimeout(
  reqId: string,
  command: CommandType,
  set: SetPartial,
  get: GetState,
): void {
  const timer = window.setTimeout(() => {
    ackTimers.delete(reqId)
    const state = get()
    if (!state.pendingAcks[reqId]) return // 已按正常流程收到回执
    const pending = { ...state.pendingAcks }
    delete pending[reqId]
    const record: AckRecord = {
      reqId,
      command,
      result: 'timeout',
      reason: `${ACK_TIMEOUT_MS / 1000}s 内未收到 cmdAck`,
      ts: Date.now(),
    }
    set({ pendingAcks: pending, ackHistory: [record, ...state.ackHistory].slice(0, ACK_HISTORY_LIMIT) })
    console.warn(`[realtime] 指令 ${command}(${reqId}) 回执超时，已标记失败`)
  }, ACK_TIMEOUT_MS)
  ackTimers.set(reqId, timer)
}

/** 清除指定 reqId 的回执超时定时器（正常收到 cmdAck 时调用） */
function clearAckTimer(reqId: string): void {
  const t = ackTimers.get(reqId)
  if (t !== undefined) {
    window.clearTimeout(t)
    ackTimers.delete(reqId)
  }
}

/** 将所有待回执指令批量标记失败（连接断开时调用——旧连接的回执永远不会到达） */
function failAllPendingAcks(set: SetPartial, get: GetState, reason: string): void {
  const state = get()
  const ids = Object.keys(state.pendingAcks)
  if (ids.length === 0) return
  const records: AckRecord[] = ids.map((reqId) => ({
    reqId,
    command: state.pendingAcks[reqId],
    result: 'timeout',
    reason,
    ts: Date.now(),
  }))
  ids.forEach(clearAckTimer)
  // 先发出的指令排前面，保持历史顺序与发送顺序一致
  set({
    pendingAcks: {},
    ackHistory: [...records.reverse(), ...state.ackHistory].slice(0, ACK_HISTORY_LIMIT),
  })
  console.warn(`[realtime] 连接断开，${ids.length} 条未回执指令已标记失败`)
}

const useRealtimeStore = create<RealtimeStore>((set, get) => ({
  status: 'idle',
  telemetry: {},
  devices: {},
  targets: {},
  alarms: [],
  pendingAcks: {},
  ackHistory: [],
  lastMessageAt: 0,
  serverInfo: null,

  setStatus: (status) => {
    set({ status })
    // 断线/重连/终态：旧连接上未回执的指令永远等不到了，立即转失败释放 UI 等待态
    if (status === 'reconnecting' || status === 'closed') {
      failAllPendingAcks(set, get, '连接断开，指令回执丢失')
    }
  },

  applyMessage: (msg) => {
    reduceMessage(set, get, msg)
  },

  sendCommand: (command, deviceIds, params) => {
    const message = buildCommand(command, deviceIds, params)
    const ok = wsClient.send(message)
    if (!ok) return null
    const reqId = message.reqId ?? ''
    if (!reqId) return null
    set((state) => ({ pendingAcks: { ...state.pendingAcks, [reqId]: command } }))
    scheduleAckTimeout(reqId, command, set, get)
    return reqId
  },

  subscribe: (deviceIds) => {
    wsClient.send(buildSubscribe(deviceIds))
  },

  unsubscribe: (deviceIds) => {
    wsClient.send(buildUnsubscribe(deviceIds))
  },
}))

/**
 * 启动实时通道（幂等）：订阅 wsClient 消息与状态，注入 store。
 * 在应用根部调用一次（见 useRealtimeConnection）。
 */
export function startRealtime(): () => void {
  const offMessage = wsClient.onMessage((msg) => useRealtimeStore.getState().applyMessage(msg))
  const offStatus = wsClient.onStatus((status) => {
    useRealtimeStore.getState().setStatus(status)
    // 真实后端握手协议：连接建立时 wsClient 已发送纯文本 "client_UI"，
    // 后端确认身份后自动推送全部遥测，无需（也不支持）JSON subscribe 消息。
  })
  wsClient.connect()
  return () => {
    offMessage()
    offStatus()
  }
}

export { useRealtimeStore }

/**
 * 实时连接生命周期 Hook —— 在应用根部挂载一次。
 *
 * 用法：
 *   function App() {
 *     useRealtimeConnection()
 *     return <RealtimeProvider>...</RealtimeProvider>
 *   }
 *
 * 职责：
 * 1. 首次挂载时调用 startRealtime()：订阅 wsClient 消息/状态 → 注入 store，并建立连接；
 * 2. 页面卸载（beforeunload/unmount）时安全断开，避免连接泄漏；
 * 3. StrictMode 双挂载防护：引用计数保证连接只建立一次（开发模式热重载友好）。
 */

/** 模块级引用计数：StrictMode 双挂载/多组件复用时连接只建一次 */
let refCount = 0
/** startRealtime 返回的清理函数 */
let teardown: (() => void) | null = null

/**
 * 启动实时通道 Hook。
 * 返回值为连接状态（便于根组件做加载态判断），组件内一般忽略返回值。
 */
export function useRealtimeConnection(): void {
  useEffect(() => {
    // 局部标志：alive 登录完成前组件卸载时不再建连；connected 标记本次是否已计数建连
    let alive = true
    let connected = false
    // 登录成功（token 已缓存）后再建立 WS 连接：
    // App 登录门控保证本 Hook 挂载时 loginWithCredentials 已完成并缓存 token；
    // 这里读取 token 仅用于 WS 建连 URL（ws://<host>/ws?token=xxx），失败则无 token 连接由后端拒绝
    void ensureAuthToken().then((token) => {
      if (!alive) return
      if (!token) {
        console.warn('[ws] 无登录 token，跳过 WS 建连（请先登录）')
        return
      }
      console.info('[ws] 登录 token 就绪，开始建立 WebSocket 连接')
      connected = true
      refCount += 1
      if (refCount === 1) {
        teardown = startRealtime()
      }
    })
    return () => {
      alive = false
      // 登录未完成即卸载：尚未计数建连，直接跳过（避免 refCount 误减为负）
      if (!connected) return
      refCount -= 1
      if (refCount === 0 && teardown) {
        teardown()
        teardown = null
        wsClient.close()
      }
    }
  }, [])
}
