/**
 * 设备（无人机）状态 HTTP API。
 *
 * GET /api/control/queryPlaneStatus  —— 设备管理面板数据源。
 * 后端地址：http://192.168.110.26:1111（开发环境经 Vite /api 代理）。
 */
import { apiGet } from './http'
import type { BatteryLevel, Device, DeviceStatus } from '../config/devices'

/** 单架无人机原始数据（后端字段，原样保留） */
export interface PlaneRaw {
  businessId: string
  createTime: string
  id: string
  loadId: string
  name: string
  planeCode: string
  planeIp: string
  planeName: string
  /** 后端状态文字，如「待命」 */
  planeStatus: string
  platform: string
  remark: string
  typeDict: string
  typeId: string
  /** 纬度 */
  latitude: number
  /** 经度 */
  longitude: number
  /** 海拔（米） */
  altitude: number
  /** 相对高度（米） */
  height: number
  /** 电压（V） */
  voltage: number
  /** 速度-Y / 北向速度（m/s） */
  velocityNorth: number
  /** 偏航角（度） */
  angleYaw: number
  /** 横滚角（度） */
  angleRoll: number
  /** 俯仰角（度） */
  anglePitch: number
  /** GPS 星数 */
  usedGPS: number
  /** 后续可能补充：延迟 ms、电量百分比 */
  delay?: number
  batteryPercent?: number
}

/** queryPlaneStatus 响应 data */
export interface PlaneStatusData {
  /** 在线数量 */
  planeOnline: number
  /** 起飞数量 */
  planeInAir: number
  /** 总数 */
  planeTotal: number
  planeList: PlaneRaw[]
}

/** 拉取无人机状态列表（请求参数为空对象） */
export function fetchPlaneStatus(): Promise<PlaneStatusData> {
  return apiGet<PlaneStatusData>('/control/queryPlaneStatus', {})
}

// ---------------------------------------------------------------------------
// 后端模型 -> 前端 Device 模型映射
// ---------------------------------------------------------------------------

/** 后端状态文字 -> 前端状态枚举 */
function mapStatus(planeStatus: string): { status: DeviceStatus; statusText: string } {
  const text = planeStatus?.trim() ?? ''
  switch (text) {
    case '任务中':
    case '飞行中':
    case '起飞':
      return { status: 'tasking', statusText: text || '任务中' }
    case '待命':
    case '待机':
      return { status: 'standby', statusText: text || '待命' }
    case '离线':
      return { status: 'offline', statusText: '离线' }
    case '充电中':
      return { status: 'charging', statusText: text }
    default:
      // 未知状态：按在线但非任务处理，显示原文
      return { status: 'standby', statusText: text || '未知' }
  }
}

/** 电量 -> 电池等级图标（优先电量百分比；退化用 4S 电压估算） */
function mapBatteryLevel(batteryPercent?: number, voltage?: number): BatteryLevel {
  if (batteryPercent !== undefined) {
    if (batteryPercent >= 60) return 'full'
    if (batteryPercent >= 25) return 'mid'
    return 'low'
  }
  if (voltage !== undefined) {
    if (voltage >= 15.6) return 'full'
    if (voltage >= 14.4) return 'mid'
    return 'low'
  }
  return 'mid'
}

function fmt(n: number | undefined, digits = 2, suffix = ''): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '--'
  return n.toFixed(digits) + suffix
}

/** PlaneRaw -> 前端 Device（遥测字符串已格式化，可直接用于面板展示） */
export function mapPlaneToDevice(plane: PlaneRaw): Device & { planeId: string } {
  const { status, statusText } = mapStatus(plane.planeStatus)
  const batteryPercent = plane.batteryPercent
  const time = new Date()
  const pad = (v: number) => String(v).padStart(2, '0')
  const timeStr =
    time.getFullYear() +
    '/' +
    pad(time.getMonth() + 1) +
    '/' +
    pad(time.getDate()) +
    '  ' +
    pad(time.getHours()) +
    ':' +
    pad(time.getMinutes()) +
    ':' +
    pad(time.getSeconds())

  return {
    planeId: plane.id,
    name: plane.planeName || plane.name || '无人机-' + plane.id,
    status,
    statusText,
    altitudeValue: fmt(plane.height, 2, 'm'),
    batteryLevel: mapBatteryLevel(batteryPercent, plane.voltage),
    batteryValue:
      batteryPercent !== undefined
        ? Math.round(batteryPercent) + '%'
        : (plane.voltage !== undefined ? plane.voltage.toFixed(1) : '--') + 'V',
    deviceType: status === 'offline' ? 'gray' : 'blue',
    telemetry:
      status === 'offline'
        ? undefined
        : {
            longitude: fmt(plane.longitude, 5),
            latitude: fmt(plane.latitude, 5),
            elevation: fmt(plane.altitude, 2),
            altitude: fmt(plane.height, 2),
            voltage: plane.voltage !== undefined ? plane.voltage.toFixed(2) + 'V' : '--',
            delay: plane.delay !== undefined ? plane.delay + 'ms' : '--',
            velocityY: fmt(plane.velocityNorth, 2),
            yaw: fmt(plane.angleYaw, 2),
            roll: fmt(plane.angleRoll, 2),
            pitch: fmt(plane.anglePitch, 2),
            battery: batteryPercent !== undefined ? Math.round(batteryPercent) + '%' : '--',
            gps: plane.usedGPS !== undefined ? String(plane.usedGPS) : '--',
            time: timeStr,
          },
  }
}
