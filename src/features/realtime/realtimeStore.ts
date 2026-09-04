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
import { create } from 'zustand'
import {
  buildCommand,
  buildSubscribe,
  buildUnsubscribe,
  type AlarmPayload,
  type CmdAckPayload,
  type CommandResult,
  type CommandType,
  type DeviceId,
  type DeviceStatusPayload,
  type TargetPayload,
  type TelemetryPayload,
  type WelcomePayload,
} from './protocol'
import { wsClient, type WsStatus } from './wsClient'

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