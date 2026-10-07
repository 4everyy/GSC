/**
 * @file realtimeStore.ts
 * @description 实时数据 store：后端消息映射与 WebSocket 帧分发
 * @author 4everyy
 * @date 2026-10-07
 */
import { create } from 'zustand'
import {
  mapBackendMessage,
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
import { MOCK_WS_ALERT_FRAMES } from '../../api/mock-data'

// 实时数据 Store（原 realtimeStore.ts 并入）

/** 实时数据 Store —— 将 WebSocket 下行消息沉淀为全局响应式状态。 */

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
  /** 设备状态表：deviceId → DeviceStatusPayload… */
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
  sendCommand: (
    command: CommandType,
    deviceIds: DeviceId[],
    params?: Record<string, unknown>,
  ) => string | null
  /** 订阅设备数据：空数组 = 订阅全部（仅支持 subscribe 协议的后端有效） */
  subscribe: (deviceIds: DeviceId[]) => void
  /** 退订设备数据 */
  unsubscribe: (deviceIds: DeviceId[]) => void
}

/** reducer 使用的 set/get 简化签名（zustand setState 兼容此窄类型） */
type SetPartial = (partial: Partial<RealtimeState>) => void
type GetState = () => RealtimeState

/** 处理单条下行消息并更新 store。 */
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
    set({
      pendingAcks: pending,
      ackHistory: [record, ...state.ackHistory].slice(0, ACK_HISTORY_LIMIT),
    })
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

// 常显：WS 告警 mock 注入（启动即注入，不随链路状态移除）

/** mock 告警是否已注入：模块生命周期内只注一次（StrictMode 双挂载不重复注入） */
let mockAlertsInjected = false

/** 注入 mock 告警：走 mapBackendMessage → applyMessage… */
function injectMockAlerts(): void {
  if (mockAlertsInjected) return
  mockAlertsInjected = true
  console.warn(
    `[ws] 注入常显 mock 告警 ×${MOCK_WS_ALERT_FRAMES.length}` +
      '（mock-data.ts 2026-09-24 联调快照，不随链路状态移除）',
  )
  MOCK_WS_ALERT_FRAMES.forEach((frame) => {
    mapBackendMessage(frame).forEach((m) => useRealtimeStore.getState().applyMessage(m))
  })
}

/** 启动实时通道（幂等）：订阅 wsClient 消息与状态，注入 store。 */
export function startRealtime(): () => void {
  const offMessage = wsClient.onMessage((msg) => useRealtimeStore.getState().applyMessage(msg))
  const offStatus = wsClient.onStatus((status) => {
    useRealtimeStore.getState().setStatus(status)
  })
  // 常显 mock 告警：启动即注入，不随连接状态变化移除（store 内同一 alarmId 原地替换，即使重复注入也不会出现重复条目）
  injectMockAlerts()
  wsClient.connect()
  return () => {
    offMessage()
    offStatus()
  }
}

export { useRealtimeStore }
