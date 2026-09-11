/**
 * 真实后端协议适配层（2026-09-11 按新版订阅协议联调更新）。
 *
 * 实测（2026-09-11）：连接 ws://<host>:8080/ws 后发送 JSON 订阅帧（见 buildSubscribeFrame），
 * 后端回 ack；有飞机在线时以 1Hz 推送遥测，信封为
 * { action, req_id, code, msg, data } 或 { type, topic, data }（与 protocol.ts 约定的 type/payload 信封不同）。
 * 本模块将真实信封映射为内部 ServerMessage，store/组件层无感知。
 */
import type { DeviceStatusPayload, ServerMessage, TelemetryPayload } from './protocol'

/** 真实后端下行信封 */
export interface BackendMessage<T = unknown> {
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

/**
 * 连接建立后的订阅帧：{"type":"subscribe","topic":"plane.swarmState"}。
 * 旧版纯文本 "client_UI" 握手已于 2026-09-11 废弃。
 */
export function buildSubscribeFrame(topic: string = TOPIC_SWARM_STATE): string {
  return JSON.stringify({ type: 'subscribe', topic })
}

/** 运行时校验：是否为真实后端信封（旧版按 action、新版按 topic 识别） */
export function isBackendMessage(value: unknown): value is BackendMessage {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.action === 'string' || typeof v.topic === 'string'
}

/** 宽松取数：字段缺失/非数值时回退默认值，保证坏帧不抛异常 */
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/** 宽松布尔：兼容新版 true 与旧版字符串 'true' */
function bool(v: unknown): boolean {
  return v === true || v === 'true'
}

/**
 * 将真实后端消息映射为内部消息数组（一条后端消息可映射为多条内部消息）。
 * plane.swarmState → telemetry（遥测）+ deviceStatus（在线/任务状态）。
 * 未知 action 返回空数组（静默忽略，协议向前兼容）。
 */
export function mapBackendMessage(msg: BackendMessage): ServerMessage[] {
  // 双兼容：旧版 { action: 'plane.swarmState' } 与新版 { type: 'publish', topic: 'plane.swarmState' }
  if (msg.action !== TOPIC_SWARM_STATE && msg.topic !== TOPIC_SWARM_STATE) return []
  // data 可能为单帧或帧数组（新版批量推送），统一按数组展开
  const items: unknown[] = Array.isArray(msg.data) ? msg.data : [msg.data]
  return items.flatMap((item) => mapSwarmStateItem(item))
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