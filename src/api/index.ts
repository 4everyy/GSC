import { type BatteryLevel, type Device, type DeviceStatus } from '../config/index'

/**
 * HTTP API 基建层（后端路由保留 /api 前缀，如 /api/v1/control/...）。
 *
 * 所有请求走同源 /api 前缀：
 * - 开发环境由 Vite dev server 代理转发到后端（默认 http://192.168.120.43:2222，
 *   见 vite.config.ts 的 server.proxy，可用 .env.local 覆盖）；
 * - 生产环境用 nginx 反代 /api 到后端。
 *
 * 鉴权：App 登录门控保证业务请求发出前 token 已缓存（POST /api/v1/auth/login，
 * 见 auth.ts），之后每个请求头携带 `Authorization: Bearer <JWT>`。
 * 后端统一响应信封：{ code, data, message }，code === 0 表示成功。
 *
 * 2026-09-22 约定：后端所有接口仅支持 POST（GET 返回 404），鉴权头为
 * Authorization: Bearer（原 `token` 自定义头已失效，返回 401 未认证）。
 */

/** 构造带鉴权的公共请求头：token 存在时注入 `Authorization: Bearer` 头 */
async function authHeaders(): Promise<Record<string, string>> {
  const token = await ensureAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
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

/**
 * POST 请求（JSON body，无查询参数）：后端所有接口仅支持 POST，
 * 原查询参数按需并入 JSON body（由调用方显式传字段）。
 * 解析信封，code !== 0 时抛 ApiError，成功时返回 data；
 * 宽容模式（2026-09-23 联调）：响应体无 code 字段（如 podControl）按直接载荷返回。
 */
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
  // 宽容信封解析：部分接口（如 podControl 单机操控）不走统一 {code,data,message}
  // 信封——响应体无 code 字段时按直接载荷返回，并打印原始响应便于联调对帧；
  // 有 code 则严格按信封语义判错（code !== 0 抛 ApiError）。
  const json: unknown = await res.json()
  if (json === null || typeof json !== 'object' || !('code' in json)) {
    console.info(`[api] ${path} 响应无 code 字段，按直接载荷处理：`, json)
    return json as T
  }
  const envelope = json as ApiEnvelope<T>
  if (envelope.code !== 0) {
    throw new ApiError(envelope.code, envelope.message || `业务错误 code=${envelope.code}`)
  }
  return envelope.data
}

/**
 * 登录鉴权模块。
 *
 * - 登录页（LoginPage）账号密码登录走 loginWithCredentials：用户名、密码均按输入框
 *   实际值原样上送（2026-09-18 约定，不做任何转换）；
 * - 响应为 { token: <JWT>, expires_at }（token 顶层字段，非 data 信封）；
 * - 之后所有 HTTP 请求头携带 `Authorization: Bearer <JWT>`（2026-09-22 起，
 *   原 `token` 自定义头已失效）。
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
  console.info('[auth] 登录成功，token 已缓存，后续 HTTP 请求将携带 Authorization: Bearer')
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
 * 任务区域接口与模型（POST /api/v1/control/queryTaskAreaList）。
 *
 * 后端返回区域原始字段（面积/类型/删除标记均为字符串、顶点为 JSON 字符串），
 * 本节负责「接口原始字段 → 前端 TaskArea 模型」的映射与解析，不做 mock 兜底。
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

/** 单个任务区域原始数据（后端字段，原样保留） */
export interface TaskAreaRaw {
  id: string
  name: string
  /** 面积（平方千米，字符串数值） */
  area: string
  /** 优先级 */
  priority: string
  /** 形状字典（目前均为 'square'，即多边形顶点序列） */
  shapeDict: string
  /** 区域类型字典：TeamReconnaissance / NoFlyArea / enclosureArea / assembleArea 等 */
  typeDict: string
  /** 逻辑删除标记：'1' 已删除 / '0' 正常 */
  del: string
  /** 创建时间（epoch ms 字符串） */
  createTime: string
  /** 顶点序列（JSON 字符串：[{latitude, longitude}, ...]） */
  vertex: string
}

/**
 * 解析后端 vertex JSON 字符串为顶点数组（容错：非法 JSON / 非法点返回 []）
 */
export function parseTaskAreaVertex(vertex: string): TaskAreaVertex[] {
  try {
    const arr = JSON.parse(vertex) as TaskAreaVertex[]
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (v) => v && typeof v.latitude === 'number' && typeof v.longitude === 'number',
    )
  } catch {
    return []
  }
}

/**
 * 拉取任务区域列表（请求参数为空对象）。
 * 后端 2026-09-23 实测口径：data 为 { dataList: TaskAreaRaw[], statusName }，
 * 与 queryPlaneStatus 的 dataList 命名一致——这里归一化为数组输出，
 * 兼容旧口径（data 直接为数组）与异常载荷（返回 []）。
 */
export async function fetchTaskAreaList(): Promise<TaskAreaRaw[]> {
  const data = await apiPost<TaskAreaRaw[] | { dataList?: TaskAreaRaw[] }>(
    '/v1/control/queryTaskAreaList',
    {},
  )
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.dataList)) return data.dataList
  return []
}

/**
 * 删除任务区域（POST /api/v1/control/delTaskArea，2026-09-23 接入）。
 * 入参 { id }（区域 ID）；鉴权头 Authorization: Bearer <token> 由 apiPost 统一注入。
 * 后端为逻辑删除，成功返回 code === 0（信封由 apiPost 解析，失败抛 ApiError，
 * 由调用方决定是否保留本地数据）。
 */
export async function deleteTaskArea(id: string): Promise<void> {
  await apiPost<unknown>('/v1/control/delTaskArea', { id })
}

/** TaskAreaRaw -> 前端 TaskArea（已删除 del='1' 或有效顶点 < 3 的记录返回 null） */
export function mapTaskArea(raw: TaskAreaRaw): TaskArea | null {
  const vertices = parseTaskAreaVertex(raw.vertex ?? '')
  if (raw.del === '1' || vertices.length < 3) return null
  return {
    id: raw.id,
    name: raw.name,
    type: raw.typeDict,
    areaKm2: Number(raw.area) || 0,
    priority: raw.priority,
    createTime: Number(raw.createTime) || 0,
    vertices,
  }
}

/** 区域类型 -> 展示配置（主题色 / 中文名） */
export interface TaskAreaTypeMeta {
  label: string
  color: string
}

export const TASK_AREA_TYPE_META: Record<string, TaskAreaTypeMeta> = {
  // 2026-09-23 区域类型枚举（区域列表第三列/地图多边形/色点统一口径）：
  // TeamReconnaissance-任务区 / NoFlyArea-禁飞区 / assembleArea-集结区 /
  // enclosureArea-围栏区 / TeamLand-降落区
  TeamReconnaissance: { label: '任务区', color: '#40a9ff' },
  NoFlyArea: { label: '禁飞区', color: '#f32c30' },
  assembleArea: { label: '集结区', color: '#7160f2' },
  enclosureArea: { label: '围栏区', color: '#ffa940' },
  TeamLand: { label: '降落区', color: '#7bff00' },
  // 旧类型键兼容（本地绘制「选择区域类型」面板仍写入 taskArea/landingArea 值）
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
 * 无人机状态接口（POST /api/v1/control/queryPlaneStatus）。
 *
 * 返回集群整体统计（在线/起飞/总数）与全量设备列表（含实时遥测字段）。
 * 本文件只做「接口原始字段 → 前端 Device 模型」的映射，不做任何 mock 兜底。
 */

/** /api/v1/control/queryPlaneStatus 返回的设备原始字段（后端联调文档口径） */
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
  /** 设备列表（归一化字段：后端 2026-09-22 起为 dataList，fetchPlaneStatus 内已归一） */
  planeList: PlaneRaw[]
  /** 后端原始字段：dataList（与 planeList 同义，新口径） */
  dataList?: PlaneRaw[]
  /** 列表名称（如 "plane_list"，仅标识用途） */
  statusName?: string
}

/** 电量百分比：接口 battery 直算（小数 0-1 ×100 转百分比；>1 兼容旧口径直传百分比），
 * 未上报（undefined/0）时不做电压估算兜底，返回 undefined 由面板显示 '--' */
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

/**
 * 接口设备 → 前端状态机枚举：
 * 优先按 planeStatusCode（权威），无码时回退按 planeStatus 文本匹配；
 * 3-在线（已连接未执行任务）归入 standby，仅状态文字保留「在线」。
 */
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

/** createTime 直显：数值毫秒时间戳格式化为 yyyy/MM/dd  HH:mm:ss，文本原样显示，缺省 '--' */
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
      (raw.planeStatusCode !== undefined ? PLANE_STATUS_CODE_TEXT[raw.planeStatusCode] : undefined) ||
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

/**
 * 拉取集群无人机状态（全量列表 + 统计）。
 * POST + 空 JSON body；后端 2026-09-22 起列表字段更名为 dataList，
 * 这里归一化为 planeList 供既有消费方（stores 等）无感使用。
 */
export async function fetchPlaneStatus(): Promise<PlaneStatusData> {
  const data = await apiPost<PlaneStatusData>('/v1/control/queryPlaneStatus', {})
  if (!data.planeList && Array.isArray(data.dataList)) {
    return { ...data, planeList: data.dataList }
  }
  return data
}

/**
 * 单机操控指令（POST /api/v1/control/podControl，2026-09-23 接入）。
 *
 * 通用载荷：{ data: { actionType, componentcontrol }, planeId }——actionType 区分
 * 指令类型（40-起飞等），componentcontrol 承载指令参数（起飞为 { height }）；
 * 成功返回 code === 0（信封由 apiPost 解析，失败抛 ApiError 由调用方提示）。
 */

/** podControl 指令类型枚举（按后端联调文档逐步补充） */
export const POD_CONTROL_ACTION = {
  /** 起飞（componentcontrol: { height }，高度由起飞面板输入框指定） */
  takeoff: 40,
  /** 降落（无指令参数，载荷仅 { data: { actionType: 41 }, planeId }） */
  land: 41,
  /** 环绕飞行（circlepoint: { height, radius, longitude, latitude }） */
  orbit: 47,
  /** 航点飞行（geopoint: { height, longitude, latitude }） */
  waypoint: 48,
} as const

/**
 * 下发起飞指令：actionType=40，height 为起飞高度（m）。
 * planeId 为无人机唯一主键（queryPlaneStatus → PlaneRaw.id，字符串）。
 */
export async function podControlTakeoff(planeId: string, height: number): Promise<void> {
  await apiPost<unknown>('/v1/control/podControl', {
    data: {
      actionType: POD_CONTROL_ACTION.takeoff,
      componentcontrol: { height },
    },
    planeId,
  })
}

/**
 * 下发降落指令：actionType=41，无指令参数（2026-09-24 后端确认与起飞同接口
 * /v1/control/podControl，仅 actionType 不同：{ data: { actionType: 41 }, planeId }）。
 * planeId 为无人机唯一主键（与起飞同源，queryPlaneStatus → PlaneRaw.id）。
 */
export async function podControlLand(planeId: string): Promise<void> {
  await apiPost<unknown>('/v1/control/podControl', {
    data: {
      actionType: POD_CONTROL_ACTION.land,
    },
    planeId,
  })
}

/** 航点飞行地理参数（WGS84 经纬度 + 相对起飞点飞行高度 m，2026-09-24 后端确认） */
export interface PodGeoPoint {
  /** 飞行高度（m，相对起飞点） */
  height: number
  /** 经度（WGS84） */
  longitude: number
  /** 纬度（WGS84） */
  latitude: number
}

/** 环绕飞行盘旋参数（航点地理参数 + 盘旋半径 m） */
export interface PodCirclePoint extends PodGeoPoint {
  /** 盘旋半径（m） */
  radius: number
}

/**
 * 下发航点飞行指令：actionType=48，geopoint 承载飞行高度与目标点 WGS84 经纬度
 * （地图取点时 adapter.unproject 换算所得）。planeId 与起飞同源。
 */
export async function podControlWaypoint(planeId: string, point: PodGeoPoint): Promise<void> {
  await apiPost<unknown>('/v1/control/podControl', {
    data: {
      actionType: POD_CONTROL_ACTION.waypoint,
      geopoint: point,
    },
    planeId,
  })
}

/**
 * 下发环绕飞行指令：actionType=47，circlepoint 承载盘旋高度/半径与环绕中心
 * WGS84 经纬度（地图取点时 adapter.unproject 换算所得）。planeId 与起飞同源。
 */
export async function podControlOrbit(planeId: string, point: PodCirclePoint): Promise<void> {
  await apiPost<unknown>('/v1/control/podControl', {
    data: {
      actionType: POD_CONTROL_ACTION.orbit,
      circlepoint: point,
    },
    planeId,
  })
}
