/**
 * @file backendAdapter.ts
 * @description 真实后端协议适配层 —— 自 protocol.ts 拆出。
 * @author 4everyy
 * @date 2026-10-07
 */
import type { AlarmLevel, AlarmPayload, CmdAckPayload, CommandResult, DeviceStatusPayload, ServerMessage, TelemetryPayload } from './protocol-types'

/** 真实后端协议适配层（2026-09-11 按新版订阅协议联调更新）。 */

/** 真实后端下行信封 */
export interface BackendMessage<T = unknown> {
  /** 新版订阅协议：操作类型（sub=订阅上行 / ack=订阅确认 / pub=推送） */
  op?: string
  /** 新版订阅协议：频道（cmd/task/device/telemetry/alert） */
  ch?: string
  /** 旧版信封：消息类型（如 plane.swarmState） */
  action?: string
  /** 新版信封：publish / ack / error */
  type?: string
  /** 新版信封：订阅主题（如 plane.swarmState） */
  topic?: string
  /** 请求关联 ID（推送型消息为空串） */
  req_id?: string
  /** 业务状态码（0 = ok） */
  code?: number
  /** 状态描述 */
  msg?: string
  /** 消息体 */
  data?: T
}

/** 蜂群状态遥测原始字段（后端命名；time 为字符串，布尔字段新旧版本类型不一，解析层兼容处理） */
export interface SwarmStatePayload {
  planeId: string
  /** 业务模式（起飞/航线/航点/侦察等）；99 = 飞机离线，除 planeId/model 外字段无效 */
  model: number
  /** 任务/空闲状态 */
  status: number
  latitude: number
  longitude: number
  /** 海拔（米） */
  altitude: number
  /** 相对起飞点高度（米） */
  height: number
  voltage: number
  velocityEast: number
  velocityNorth: number
  velocityDown: number
  initLongitude: number
  initLatitude: number
  initAltitude: number
  /** 起飞点相对高度 */
  initHeight: number
  disToHome: number
  anglePitch: number
  angleYaw: number
  angleRoll: number
  usedGPS: number
  /** 字符串型 Unix 毫秒时间戳 */
  time: string
  mode: number
  modeStr: string
  cameraAnglePitch: number
  cameraAngleYaw: number
  cameraAngleRoll: number
  /** 布尔（新版为真布尔，兼容旧版字符串） */
  formationStatus: boolean
  /** 布尔（新版为真布尔，兼容旧版字符串） */
  inAir: boolean
}

/** 后端推送 topic：连接后需发送 subscribe 订阅帧才能收到数据 */
export const TOPIC_SWARM_STATE = 'plane.swarmState'

/** 订阅频道：连接后需按频道逐一发送 {"op":"sub","ch":"<频道>"} 订阅帧 */
export const SUBSCRIBE_CHANNELS = ['cmd', 'task', 'device', 'telemetry', 'alert'] as const

/** 连接建立后的订阅帧：{"op":"sub","ch":"<频道>"}。 */
export function buildSubscribeFrame(channel: string): string {
  return JSON.stringify({ op: 'sub', ch: channel })
}

/** 运行时校验：是否为真实后端信封（新版按 op/ch、旧版按 action/topic 识别）。 */
export function isBackendMessage(value: unknown): value is BackendMessage {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.ch === 'string' || typeof v.action === 'string' || typeof v.topic === 'string'
}

/** 宽松取数：字段缺失/非数值时回退默认值，保证坏帧不抛异常 */
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/** 宽松布尔：兼容新版 true 与旧版字符串 'true' */
function bool(v: unknown): boolean {
  return v === true || v === 'true'
}

/** 将真实后端消息映射为内部消息数组（一条后端消息可映射为多条内部消息）。 */
export function mapBackendMessage(msg: BackendMessage): ServerMessage[] {
  // data 可能为单帧或帧数组（新版批量推送），统一按数组展开
  const items: unknown[] = Array.isArray(msg.data) ? msg.data : [msg.data]

  // 新版订阅协议信封（2026-09-18）：{"op":"pub","ch":"<频道>"} 推送。
  if (typeof msg.ch === 'string') {
    if (msg.op !== undefined && msg.op !== 'pub') return []
    switch (msg.ch) {
      case 'telemetry':
      case 'device':
        // 遥测与设备状态共用 swarmState 载荷…
        return items.flatMap((item) => mapSwarmStateItem(item))
      case 'cmd':
        return items.flatMap((item) => mapCmdAckItem(item))
      case 'alert':
        return items.flatMap((item) => mapAlarmItem(item))
      case 'task':
        // 任务状态/进度暂无内部消息类型（任务列表走 REST 拉取），记录后忽略
        console.info('[ws] 收到 task 频道推送（暂未消费）：', msg.data)
        return []
      default:
        return []
    }
  }

  // 旧版双兼容：{ action: 'plane.swarmState' } 与 { type…
  if (msg.action !== TOPIC_SWARM_STATE && msg.topic !== TOPIC_SWARM_STATE) return []
  return items.flatMap((item) => mapSwarmStateItem(item))
}

/** cmd 频道回执帧 → 内部 cmdAck（reqId/result 宽松解析）。 */
function mapCmdAckItem(data: unknown): ServerMessage[] {
  const d = (data ?? {}) as Record<string, unknown>
  const rawId = d.reqId ?? d.req_id
  const reqId = typeof rawId === 'string' && rawId ? rawId : `unknown-${Date.now()}`
  const rawResult = String(d.result ?? d.status ?? 'accepted')
  const result: CommandResult =
    rawResult === 'rejected' || rawResult === 'failed' ? (rawResult as CommandResult) : 'accepted'
  const ack: CmdAckPayload = { reqId, result }
  if (typeof d.reason === 'string' && d.reason) ack.reason = d.reason
  return [{ type: 'cmdAck', payload: ack, ts: Date.now() }]
}

/** alert 频道帧 → 内部 alarm（alarmId 缺失丢弃；级别未知归蓝）。 */
function mapAlarmItem(data: unknown): ServerMessage[] {
  const d = (data ?? {}) as Record<string, unknown>
  const alarmId =
    typeof d.id === 'string' && d.id
      ? d.id
      : typeof d.alarmId === 'string'
        ? d.alarmId
        : String(d.id ?? d.alarmId ?? '')
  if (!alarmId) return []
  // 告警级别归一：数字 1/2/3 → red/orange/blue；字符串色值直通；未知归蓝
  const rawLevel = d.level
  let level: AlarmLevel = 'blue'
  if (rawLevel === 1 || rawLevel === '1') level = 'red'
  else if (rawLevel === 2 || rawLevel === '2') level = 'orange'
  else if (rawLevel === 3 || rawLevel === '3') level = 'blue'
  else if (rawLevel === 'red' || rawLevel === 'orange' || rawLevel === 'blue')
    level = rawLevel as AlarmLevel
  // 已读/已确认归一：isRead "1"/1 视为已确认（兼容旧 acknowledged 布尔字段）
  const acknowledged = d.isRead !== undefined ? String(d.isRead) === '1' : bool(d.acknowledged)
  // 发生时间：优先 ts/occurredAt 数值毫秒
  let occurredAt = num(d.ts ?? d.occurredAt, NaN)
  if (!Number.isFinite(occurredAt) && typeof d.time === 'string') {
    const parsed = Date.parse(d.time.replace(/^(\d{4}):(\d{1,2}):(\d{1,2})/, '$1-$2-$3'))
    if (Number.isFinite(parsed)) occurredAt = parsed
  }
  if (!Number.isFinite(occurredAt)) occurredAt = Date.now()
  const alarm: AlarmPayload = {
    alarmId,
    level,
    title: typeof d.title === 'string' && d.title ? d.title : '未命名告警',
    detail:
      typeof d.msg === 'string' && d.msg ? d.msg : typeof d.detail === 'string' ? d.detail : '',
    occurredAt,
    acknowledged,
  }
  // 关联设备：equipId（真实报文）/ deviceId（旧格式）均可
  const deviceId = typeof d.equipId === 'string' && d.equipId ? d.equipId : d.deviceId
  if (typeof deviceId === 'string' && deviceId) alarm.deviceId = deviceId
  return [{ type: 'alarm', payload: alarm, ts: Date.now() }]
}

/** 单帧 swarmState → 内部消息（telemetry + deviceStatus） */
function mapSwarmStateItem(data: unknown): ServerMessage[] {
  const d = (data ?? {}) as Record<string, unknown>
  const planeId = typeof d.planeId === 'string' ? d.planeId : String(d.planeId ?? '')
  if (!planeId) return []

  // 业务模式 99 = 飞机离线：除 planeId/model 外字段无效，仅下发离线状态，不采信遥测
  if (num(d.model, -1) === 99) {
    const offline: DeviceStatusPayload = {
      deviceId: planeId,
      name: `无人机-${planeId}`,
      status: 'offline',
    }
    return [{ type: 'deviceStatus', payload: offline, ts: Date.now() }]
  }

  const east = num(d.velocityEast)
  const north = num(d.velocityNorth)
  const sampleTs = Number(d.time) || Date.now()

  const telemetry: TelemetryPayload = {
    deviceId: planeId,
    longitude: num(d.longitude),
    latitude: num(d.latitude),
    altitude: num(d.height), // 相对起飞点高度
    elevation: num(d.altitude), // 海拔
    velocityY: Math.hypot(east, north), // 地速 = 水平速度合矢量
    yaw: num(d.angleYaw),
    pitch: num(d.anglePitch),
    roll: num(d.angleRoll),
    battery: 0, // 后端暂无电量百分比（仅电压），UI 以电压展示为准
    voltage: num(d.voltage),
    delay: 0,
    gps: `${num(d.usedGPS)} 颗`,
    sampleTs,
  }
  const deviceStatus: DeviceStatusPayload = {
    deviceId: planeId,
    name: `无人机-${planeId}`,
    status: bool(d.inAir) ? 'tasking' : 'standby',
  }
  return [
    { type: 'telemetry', payload: telemetry, ts: sampleTs },
    { type: 'deviceStatus', payload: deviceStatus, ts: sampleTs },
  ]
}
