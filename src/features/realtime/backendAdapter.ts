/**
 * 真实后端协议适配层（2026-09-03 联调实测）。
 *
 * 实测（scripts/ws_probe.mjs）：连接 ws://<host>:8765 后发送纯文本 "client_UI"
 * 即完成握手，后端以 1Hz 推送 plane.swarmState 遥测，信封为
 * { action, req_id, code, msg, data }（与 protocol.ts 约定的 type/payload 信封不同）。
 * 本模块将真实信封映射为内部 ServerMessage，store/组件层无感知。
 */
import type { DeviceStatusPayload, ServerMessage, TelemetryPayload } from './protocol'

/** 真实后端下行信封 */
export interface BackendMessage<T = unknown> {
  /** 消息类型（如 plane.swarmState） */
  action: string
  /** 请求关联 ID（推送型消息为空串） */
  req_id?: string
  /** 业务状态码（0 = ok） */
  code?: number
  /** 状态描述 */
  msg?: string
  /** 消息体 */
  data?: T
}

/** 蜂群状态遥测原始字段（后端命名；注意布尔与时间为字符串） */
export interface SwarmStatePayload {
  planeId: string
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
  /** "true" / "false"（字符串布尔） */
  formationStatus: string
  /** "true" / "false"（字符串布尔） */
  inAir: string
}

/** 连接建立后发送的握手字符串（后端要求纯文本，非 JSON） */
export const HANDSHAKE_TEXT = 'client_UI'

/** 运行时校验：是否为真实后端信封（按 action 字段识别） */
export function isBackendMessage(value: unknown): value is BackendMessage {
  if (typeof value !== 'object' || value === null) return false
  return typeof (value as Record<string, unknown>).action === 'string'
}

/** 宽松取数：字段缺失/非数值时回退默认值，保证坏帧不抛异常 */
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/**
 * 将真实后端消息映射为内部消息数组（一条后端消息可映射为多条内部消息）。
 * plane.swarmState → telemetry（遥测）+ deviceStatus（在线/任务状态）。
 * 未知 action 返回空数组（静默忽略，协议向前兼容）。
 */
export function mapBackendMessage(msg: BackendMessage): ServerMessage[] {
  if (msg.action !== 'plane.swarmState') return []
  const d = (msg.data ?? {}) as Record<string, unknown>
  const planeId = typeof d.planeId === 'string' ? d.planeId : String(d.planeId ?? '')
  if (!planeId) return []

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
    status: d.inAir === 'true' ? 'tasking' : 'standby',
  }
  return [
    { type: 'telemetry', payload: telemetry, ts: sampleTs },
    { type: 'deviceStatus', payload: deviceStatus, ts: sampleTs },
  ]
}