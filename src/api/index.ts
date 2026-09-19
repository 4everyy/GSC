import { type BatteryLevel, type Device, type DeviceStatus } from '../config/index'

/**
 * HTTP API 基建层（后端路由保留 /api 前缀，如 /api/v1/control/...）。
 *
 * 所有请求走同源 /api 前缀：
 * - 开发环境由 Vite dev server 代理转发到后端（默认 http://192.168.120.43:8080，
 *   见 vite.config.ts 的 server.proxy，可用 .env.local 覆盖）；
 * - 生产环境用 nginx 反代 /api 到后端。
 *
 * 鉴权：App 登录门控保证业务请求发出前 token 已缓存（POST /api/v1/auth/login，
 * 见 auth.ts），之后每个请求头携带 `token: <JWT>`。
 * 后端统一响应信封：{ code, data, message }，code === 0 表示成功。
 */

/** 构造带鉴权的公共请求头：token 存在时注入 `token` 头（后端约定，非 Bearer） */
async function authHeaders(): Promise<Record<string, string>> {
  const token = await ensureAuthToken()
  return token ? { token } : {}
}

/** 后端统一响应信封 */
export interface ApiEnvelope<T> {
  code: number
  data: T
  message: string
}

/** 业务/HTTP 错误（携带后端 code） */
export class ApiError extends Error {
  readonly code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) return ''
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
  if (entries.length === 0) return ''
  const qs = new URLSearchParams(entries.map(([k, v]) => [k, String(v)] as [string, string]))
  return `?${qs.toString()}`
}

/** GET 请求：解析信封，code !== 0 时抛 ApiError，成功时返回 data */
export async function apiGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api${path}${buildQueryString(params)}`, {
    method: 'GET',
    headers: { Accept: 'application/json', ...(await authHeaders()) },
  })
  if (!res.ok) {
    throw new ApiError(res.status, `HTTP ${res.status} ${res.statusText}`)
  }
  const body = (await res.json()) as ApiEnvelope<T>
  if (body.code !== 0) {
    throw new ApiError(body.code, body.message || `业务错误 code=${body.code}`)
  }
  return body.data
}

/** POST 请求（JSON body），信封处理同 apiGet */
export async function apiPost<T, B = unknown>(path: string, body?: B): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(await authHeaders()),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    throw new ApiError(res.status, `HTTP ${res.status} ${res.statusText}`)
  }
  const json = (await res.json()) as ApiEnvelope<T>
  if (json.code !== 0) {
    throw new ApiError(json.code, json.message || `业务错误 code=${json.code}`)
  }
  return json.data
}

/**
 * 登录鉴权模块。
 *
 * - 登录页（LoginPage）账号密码登录走 loginWithCredentials：用户名、密码均按输入框
 *   实际值原样上送（2026-09-18 约定，不做任何转换）；
 * - 响应为 { token: <JWT>, expires_at }（token 顶层字段，非 data 信封）；
 * - 之后所有 HTTP 请求头携带 `token: <JWT>`（注入点见 http.ts）。
 */
// 存储键带版本号：升级版本可使旧缓存 token 失效
const TOKEN_KEY = 'gsc_auth_token_v2'

/** 登录页默认预填账号（2026-09-18）：刷新页面时用户名/密码初始填充 + 默认勾选两项记住 */
export const DEFAULT_CREDENTIALS = {
  username: 'b',
  password: '6b155ebbcfbb65d3dc6c4c2cf75c0745',
}

/** 内存缓存 token（localStorage 兜底，SPA 会话内免重复读取） */
let cachedToken: string | null = null

function readStoredToken(): string | null {
  if (cachedToken) return cachedToken
  try {
    cachedToken = localStorage.getItem(TOKEN_KEY)
  } catch {
    cachedToken = null
  }
  return cachedToken
}

/** 同步获取当前 token（http.ts 注入请求头、App 登录门控用；null = 尚未登录） */
export function getAuthToken(): string | null {
  return readStoredToken()
}

/** 缓存 token（内存 + localStorage），登录成功后统一走这里 */
function storeToken(token: string): void {
  cachedToken = token
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* 隐私模式等存储不可用场景忽略，仅内存缓存 */
  }
}

/** 清除 token（登出/切换账号用） */
export function clearAuthToken(): void {
  cachedToken = null
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* 存储不可用场景忽略 */
  }
}

/** 调用 /auth/login 换取 JWT：JSON 请求体 + JSON 响应 { token, expires_at } */
async function requestToken(username: string, password: string): Promise<string> {
  // 接口要求 JSON 请求体（2026-09-18 变更：原 iam/logon 为表单编码）
  const body = JSON.stringify({ username, password })
  const res = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body,
  })
  if (res.status === 400 || res.status === 401) {
    throw new Error('用户名或密码错误')
  }
  if (!res.ok) throw new Error(`login HTTP ${res.status} ${res.statusText}`)
  // 响应格式：{ token, expires_at }（token 为 JWT 字符串）
  const json = (await res.json()) as { token?: unknown; expires_at?: string }
  if (typeof json.token !== 'string' || !json.token) throw new Error('login 响应缺少 token')
  return json.token
}

/**
 * 登录页账号密码登录：用户名、密码均按输入框实际值原样上送（不做转换）。
 * 成功：缓存并返回 token；失败：向上抛错（登录页展示提示文案）。
 */
export async function loginWithCredentials(username: string, password: string): Promise<string> {
  const token = await requestToken(username, password)
  storeToken(token)
  console.info('[auth] 登录成功，token 已缓存，后续 HTTP 请求将携带 token')
  return token
}

/**
 * 获取当前 token（异步形式，http.ts / WS 建连前调用）：
 * 登录门控（App）保证业务 Hook 挂载前已完成登录，这里只读缓存、不再自动登录——
 * 未登录（null）时业务请求照常发出，由后端 401 兜底使问题可见。
 */
export async function ensureAuthToken(): Promise<string | null> {
  return readStoredToken()
}

/**
 * 任务区域模型与展示元数据（纯前端）。
 *
 * 后端 HTTP 接口（queryTaskAreaList 等）相关模拟逻辑已移除：任务区域现仅由
 * 本地 mock 数据（config/taskAreas.ts）与用户在态势图上的绘制/编辑产生，
 * 不再发起任何 HTTP 请求；后续需要接回后端时再行恢复。
 */

/** 区域顶点（WGS84） */
export interface TaskAreaVertex {
  latitude: number
  longitude: number
}

/** 前端消费的任务区域模型 */
export interface TaskArea {
  id: string
  name: string
  /** 区域类型（TeamReconnaissance / NoFlyArea / enclosureArea / assembleArea ...） */
  type: string
  /** 面积（km²，数值） */
  areaKm2: number
  priority: string
  createTime: number
  /** 多边形顶点（WGS84，顺序保持绘制顺序） */
  vertices: TaskAreaVertex[]
}

/** 区域类型 -> 展示配置（主题色 / 中文名） */
export interface TaskAreaTypeMeta {
  label: string
  color: string
}

export const TASK_AREA_TYPE_META: Record<string, TaskAreaTypeMeta> = {
  TeamReconnaissance: { label: '集群侦察', color: '#40a9ff' },
  // 禁飞区/集结区色与「选择区域类型」面板设计稿色块（HexagonAreaOverlay
  // AREA_TYPE_OPTIONS）对齐，确认前后颜色一致（地图多边形/列表色点/面板三处统一）
  NoFlyArea: { label: '禁飞区', color: '#f32c30' },
  enclosureArea: { label: '围困区', color: '#ffa940' },
  assembleArea: { label: '集结区', color: '#7160f2' },
  taskArea: { label: '任务区', color: '#2084ba' },
  landingArea: { label: '降落区', color: '#7bff00' },
}

/** 未知类型兜底配置 */
export const TASK_AREA_TYPE_FALLBACK: TaskAreaTypeMeta = { label: '任务区域', color: '#b37feb' }

/** 读取类型展示配置（未知类型返回兜底配置） */
export function taskAreaTypeMeta(type: string): TaskAreaTypeMeta {
  return TASK_AREA_TYPE_META[type] ?? TASK_AREA_TYPE_FALLBACK
}

/**
 * 无人机状态接口（GET /api/v1/control/queryPlaneStatus）。
 *
 * 返回集群整体统计（在线/起飞/总数）与全量设备列表（含实时遥测字段）。
 * 本文件只做「接口原始字段 → 前端 Device 模型」的映射，不做任何 mock 兜底。
 */

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
