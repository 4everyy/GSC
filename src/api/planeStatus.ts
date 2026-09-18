/**
 * 无人机状态接口（GET /api/v1/control/queryPlaneStatus）。
 *
 * 返回集群整体统计（在线/起飞/总数）与全量设备列表（含实时遥测字段）。
 * 本文件只做「接口原始字段 → 前端 Device 模型」的映射，不做任何 mock 兜底。
 */
import { apiGet } from './http'
import type { BatteryLevel, Device, DeviceStatus } from '../config/devices'

/** /api/v1/control/queryPlaneStatus 返回的设备原始字段（后端联调文档口径） */
export interface PlaneRaw {
  /** 业务编号 */
  businessId?: string
  /** 创建时间戳（毫秒级 Unix） */
  createTime?: string
  /** 无人机唯一主键 ID */
  id: string
  /** 载荷设备 ID */
  loadId?: string
  /** 无人机显示名称 */
  name?: string
  /** 无人机编码，可空 */
  planeCode?: string
  /** 视频流地址（rtsp） */
  planeIp?: string
  /** 无人机名称（同 name） */
  planeName?: string
  /** 飞机状态：待命 / 飞行中 / 离线等 */
  planeStatus?: string
  /** 机载硬件平台型号 */
  platform?: string
  /** 备注信息 */
  remark?: string
  /** 设备类型字典编码 */
  typeDict?: string
  /** 设备类型 ID */
  typeId?: string
  /** 纬度 */
  latitude?: number
  /** 经度 */
  longitude?: number
  /** 海拔（m） */
  altitude?: number
  /** 相对高度（m） */
  height?: number
  /** 电压（V） */
  voltage?: number
  /** 速度（Y，北向速度 m/s） */
  velocityNorth?: number
  /** 偏航角（°） */
  angleYaw?: number
  /** 横滚角（°） */
  angleRoll?: number
  /** 俯仰角（°） */
  anglePitch?: number
  /** GPS 卫星数（信号高/中/低由此折算） */
  usedGPS?: number
}

/** queryPlaneStatus data 载荷：统计 + 设备列表 */
export interface PlaneStatusData {
  /** 无人机在线数量 */
  planeOnline: number
  /** 无人机起飞数量 */
  planeInAir: number
  /** 无人机总数 */
  planeTotal: number
  planeList: PlaneRaw[]
}

/** 电压 → 电量等级（接口未直接给电量百分比，按锂电池节数折算的过渡口径） */
function voltageToBatteryLevel(voltage: number | undefined): BatteryLevel {
  if (voltage === undefined) return 'low'
  if (voltage >= 15.5) return 'full'
  if (voltage >= 14.5) return 'mid'
  return 'low'
}

/** 电压 → 电量百分比估算（4S 锂电 16.8V~12.8V 线性映射到 100%~0） */
function voltageToBatteryPercent(voltage: number | undefined): number {
  if (voltage === undefined) return 0
  const percent = ((voltage - 12.8) / (16.8 - 12.8)) * 100
  return Math.max(0, Math.min(100, Math.round(percent)))
}

/** 接口状态文本 → 前端状态机枚举 */
function planeStatusToDeviceStatus(status: string | undefined): DeviceStatus {
  switch (status) {
    case '飞行中':
      return 'tasking'
    case '待命':
      return 'standby'
    case '充电中':
      return 'charging'
    case '离线':
      return 'offline'
    default:
      return 'standby'
  }
}

/** 数值格式化：保留 1 位小数（undefined → 空串） */
function fmt(value: number | undefined, digits = 1, suffix = ''): string {
  if (value === undefined || Number.isNaN(value)) return '--'
  return `${value.toFixed(digits)}${suffix}`
}

/** 毫秒时间戳 → 遥测面板时间格式 yyyy/MM/dd  HH:mm:ss */
function formatTelemetryTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** GPS 卫星数 → 信号档位文本 */
function gpsToSignalText(usedGPS: number | undefined): string {
  if (usedGPS === undefined) return '--'
  if (usedGPS >= 15) return '信号高'
  if (usedGPS >= 10) return '信号中'
  return '信号低'
}

/** 接口原始设备 → 前端 Device 模型（面板直接消费） */
export function mapPlaneToDevice(raw: PlaneRaw, index: number): Device {
  const status = planeStatusToDeviceStatus(raw.planeStatus)
  const isOffline = status === 'offline'
  const batteryPercent = voltageToBatteryPercent(raw.voltage)
  return {
    name: raw.name || raw.planeName || `无人机${index + 1}`,
    status,
    statusText: raw.planeStatus || '待命',
    altitudeValue: isOffline ? '--' : fmt(raw.height, 1, 'm'),
    batteryLevel: voltageToBatteryLevel(raw.voltage),
    batteryValue: `${batteryPercent}%`,
    deviceType: isOffline ? 'gray' : 'blue',
    isCharging: status === 'charging',
    telemetry: isOffline
      ? undefined
      : {
          longitude: fmt(raw.longitude, 7),
          latitude: fmt(raw.latitude, 7),
          elevation: fmt(raw.altitude, 2),
          altitude: fmt(raw.height, 2),
          voltage: fmt(raw.voltage, 2, 'V'),
          velocityY: fmt(raw.velocityNorth, 2),
          yaw: fmt(raw.angleYaw, 2),
          roll: fmt(raw.angleRoll, 2),
          pitch: fmt(raw.anglePitch, 2),
          battery: `${batteryPercent}%`,
          gps: gpsToSignalText(raw.usedGPS),
          delay: '--',
          time: raw.createTime ? formatTelemetryTime(Number(raw.createTime)) : '--',
        },
  }
}

/** 拉取集群无人机状态（全量列表 + 统计） */
export function fetchPlaneStatus(): Promise<PlaneStatusData> {
  return apiGet<PlaneStatusData>('/v1/control/queryPlaneStatus')
}