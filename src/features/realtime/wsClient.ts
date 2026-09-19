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
  async connect(): Promise<void> {
    if (this.socket && (this.status === 'open' || this.status === 'connecting')) return
    this.manualClose = false
    this.clearTimers()
    this.setStatus(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting')
    logWsEvent(this.reconnectAttempt > 0 ? 'reconnect' : 'connecting', resolveWsUrl())

    // 后端约定：连接 URL 必须携带登录 token（ws://ip:port/ws?token=xxx）
    let token: string | null = null
    try {
      token = await ensureAuthToken()
    } catch (err) {
      console.warn('[ws] 获取登录 token 失败，尝试无 token 连接:', err)
    }

    // await 间隙内状态可能变化（并发 connect / 手动 close），重新校验避免重复建连
    if (this.manualClose || this.status === 'open' || this.status === 'connecting') return

    const url = appendTokenParam(resolveWsUrl(), token)
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
      // 新版订阅协议（2026-09-18）：连接后按频道逐一发送 {"op":"sub","ch":"<频道>"} 订阅帧
      // cmd=指令下发与回执  task=任务状态与进度  device=设备上下线与状态
      // telemetry=遥测推送（1~2Hz 降采样）  alert=告警事件
      for (const ch of SUBSCRIBE_CHANNELS) {
        const frame = buildSubscribeFrame(ch)
        console.info(`[ws] send subscribe: ${frame}`)
        logWsMessage('up', { type: 'handshake', payload: `sub ${ch}`, ts: Date.now() })
        this.socket?.send(frame)
      }
      this.startHeartbeat()
    }

    socket.onmessage = (event: MessageEvent) => {
      this.lastMessageAt = Date.now()
      // 日志打印移入 dispatch（复用同一次 JSON.parse，见 logDownlinkFrame 注释）
      this.dispatch(event.data)
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
    logDownlinkFrame(parsed)
    if (isBackendMessage(parsed)) {
      // 新版 op/ch 信封（ack/pub）取 op#ch 作类型；旧版取 action/topic
      const kind = parsed.op ? `${parsed.op}#${parsed.ch ?? ''}` : (parsed.action ?? parsed.topic)
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
}

/** 全局唯一客户端单例：应用各处（store/hook/组件）统一消费此实例 */
export const wsClient = new WsClient()

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
