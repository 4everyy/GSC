/**
 * @file planeStatus.ts
 * @description planeStatus（自 api/index.ts 拆出）—— 无人机状态域：PlaneRaw 模型 + 映射 + 拉取。
 * @author 4everyy
 * @date 2026-10-07
 */
import { type BatteryLevel, type Device, type DeviceStatus } from '../config/index'
import { apiPost } from './http'
import { MOCK_PLANE_STATUS } from './mock-data'

/** 无人机状态接口（POST /api/v1/control/queryPlaneStatus）。 */

/** /api/v1/control/queryPlaneStatus 返回的设备原始字段… */
export interface PlaneRaw {
  /** 业务编号 */
  businessId?: string
  /** 最后更新时间（createTime 直显） */
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
  /** 飞机状态：待命 / 执行中 / 离线等 */
  planeStatus?: string
  /** 状态码（2026-09-22 新增：与 planeStatus 文本一一对应） */
  planeStatusCode?: string
  /** 机载硬件平台型号 */
  platform?: string
  /** 备注信息 */
  remark?: string
  /** 设备类型字典编码 */
  typeDict?: string
  /** 设备类型码（typeId：1-无人机，默认 1；设备面板类型筛选按此匹配） */
  typeId?: string
  /** 纬度（标准语义，2026-09-23 实测确认：如 31.27x） */
  latitude?: number
  /** 经度（标准语义，2026-09-23 实测确认：如 120.58x） */
  longitude?: number
  /** 海拔（m） */
  altitude?: number
  /** 相对高度（m） */
  height?: number
  /** 电压（V） */
  voltage?: number
  /** 电量（小数 0-1，×100 转百分比；缺省不估算，显示 '--'） */
  battery?: number
  /** 通信时延（ms，2026-09-22 新增） */
  delay?: number
  /** 速度（Y，北向速度 m/s） */
  velocityNorth?: number
  /** 偏航角（°） */
  angleYaw?: number
  /** 横滚角（°） */
  angleRoll?: number
  /** 俯仰角（°） */
  anglePitch?: number
  /** GPS 卫星数（直接显示数量） */
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
  /** 设备列表（归一化字段：后端 2026-09-22 起为 dataList */
  planeList: PlaneRaw[]
  /** 后端原始字段：dataList（与 planeList 同义，新口径） */
  dataList?: PlaneRaw[]
  /** 列表名称（如 "plane_list"，仅标识用途） */
  statusName?: string
}

/** 电量百分比：接口 battery 直算（小数 0-1 ×100 转百分比；>1 兼容旧口径直传百分比） */
function batteryPercent(raw: PlaneRaw): number | undefined {
  const { battery } = raw
  if (battery === undefined || battery === 0) return undefined
  const pct = battery <= 1 ? battery * 100 : battery
  return Math.max(0, Math.min(100, Math.round(pct)))
}

/** 电量百分比 → 电量等级图标 */
function batteryLevelFromPercent(percent: number): BatteryLevel {
  if (percent >= 75) return 'full'
  if (percent >= 40) return 'mid'
  return 'low'
}

/** 状态码 → 状态文本（后端权威口径：0-待命 / 1-执行中 / 2-离线 / 3-在线） */
const PLANE_STATUS_CODE_TEXT: Record<string, string> = {
  '0': '待命',
  '1': '执行中',
  '2': '离线',
  '3': '在线',
}

/** 接口设备 → 前端状态机枚举：优先按 planeStatusCode（权威），无码时回退按 planeStatus 文本匹配 */
function planeStatusToDeviceStatus(raw: PlaneRaw): DeviceStatus {
  const byCode: Record<string, DeviceStatus> = {
    '0': 'standby',
    '1': 'tasking',
    '2': 'offline',
    '3': 'standby',
  }
  if (raw.planeStatusCode !== undefined && byCode[raw.planeStatusCode]) {
    return byCode[raw.planeStatusCode]
  }
  switch (raw.planeStatus) {
    case '执行中':
    case '飞行中':
      return 'tasking'
    case '待命':
    case '在线':
      return 'standby'
    case '充电中':
      return 'charging'
    case '离线':
      return 'offline'
    default:
      return 'standby'
  }
}

/** 数值格式化：默认保留 3 位小数（undefined → '--'） */
function fmt(value: number | undefined, digits = 3, suffix = ''): string {
  if (value === undefined || Number.isNaN(value)) return '--'
  return `${value.toFixed(digits)}${suffix}`
}

/** createTime 直显：数值毫秒时间戳格式化为 yyyy/MM/dd  HH:mm:ss */
function formatTelemetryTime(createTime: string | undefined): string {
  if (createTime === undefined || createTime === '') return '--'
  const ts = Number(createTime)
  if (!Number.isFinite(ts)) return createTime
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 接口原始设备 → 前端 Device 模型（面板直接消费；全部字段来自接口，无兜底数据） */
export function mapPlaneToDevice(raw: PlaneRaw): Device {
  const status = planeStatusToDeviceStatus(raw)
  const isOffline = status === 'offline'
  const percent = batteryPercent(raw)
  return {
    name: raw.name || raw.planeName || '--',
    /** 设备类型码（typeId，后端默认 1-无人机；设备面板类型筛选按此匹配） */
    typeId: raw.typeId ?? '1',
    status,
    statusText:
      (raw.planeStatusCode !== undefined
        ? PLANE_STATUS_CODE_TEXT[raw.planeStatusCode]
        : undefined) ||
      raw.planeStatus ||
      '--',
    altitudeValue: fmt(raw.height, 3, 'm'),
    /** 电量未上报时图标取 low、数值显示 '--'（不做电压估算兜底） */
    batteryLevel: percent !== undefined ? batteryLevelFromPercent(percent) : 'low',
    batteryValue: percent !== undefined ? `${percent}%` : '--',
    deviceType: isOffline ? 'gray' : 'blue',
    isCharging: status === 'charging',
    telemetry: isOffline
      ? undefined
      : {
          // 标准语义直显（2026-09-23 实测：latitude=纬度、longitude=经度）
          longitude: fmt(raw.longitude, 3),
          latitude: fmt(raw.latitude, 3),
          elevation: fmt(raw.altitude, 3),
          altitude: fmt(raw.height, 3),
          voltage: fmt(raw.voltage, 3, 'V'),
          velocityY: fmt(raw.velocityNorth, 3),
          yaw: fmt(raw.angleYaw, 3),
          roll: fmt(raw.angleRoll, 3),
          pitch: fmt(raw.anglePitch, 3),
          battery: percent !== undefined ? `${percent}%` : '--',
          gps: raw.usedGPS !== undefined ? String(raw.usedGPS) : '--',
          delay: fmt(raw.delay, 3, 'ms'),
          time: formatTelemetryTime(raw.createTime),
        },
  }
}

/** 拉取集群无人机状态（全量列表 + 统计）。 */
export async function fetchPlaneStatus(): Promise<PlaneStatusData> {
  let data: PlaneStatusData
  try {
    data = await apiPost<PlaneStatusData>('/v1/control/queryPlaneStatus', {})
  } catch (err) {
    // 离线兜底（mock-data.ts 2026-09-23 联调快照）：后端不可达（网络不通/HTTP/业务错误）时返回设备 mock
    console.warn('[api] queryPlaneStatus 请求失败，使用离线 mock 兜底：', err)
    return MOCK_PLANE_STATUS
  }
  if (!data.planeList && Array.isArray(data.dataList)) {
    return { ...data, planeList: data.dataList }
  }
  return data
}
