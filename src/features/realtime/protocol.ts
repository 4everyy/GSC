

/**
 * WebSocket 通信协议类型定义 —— 与后端约定的唯一契约（Single Source of Truth）。
 *
 * 协议设计原则：
 * 1. 统一信封格式：每条消息 = { type, payload, ts, seq? }，前端按 type 分发处理；
 * 2. 双向通信：下行（服务端→前端）为推送型消息（遥测/目标/告警），
 *    上行（前端→服务端）为指令型消息（订阅/指令/心跳应答）；
 * 3. 数据字段使用原始数值类型（number），展示层格式化由前端负责，
 *    避免后端格式化逻辑与前端 UI 强耦合；
 * 4. 所有 ID 用 string，时间戳用 Unix 毫秒数（number），时区处理由前端统一负责。
 *
 * ⚠️ 本文件为前后端协作的接口文档载体：任何字段变更须双方同步修改，
 *    并同步更新 docs/WebSocket对接文档.md。
 */

// ==================== 通道与消息类型枚举 ====================

/**
 * 下行消息类型（服务端 → 前端推送）。
 * - telemetry：无人机遥测数据（高频，建议 1~5Hz）
 * - deviceStatus：设备上下线/状态变更（低频，事件驱动）
 * - target：目标情报（新增/更新）
 * - targetRemoved：目标移除
 * - alarm：告警事件（新增/确认/解除）
 * - cmdAck：上行指令的执行结果回执
 * - heartbeat：服务端心跳应答
 * - welcome：应用层握手应答（前端 hello 的响应，推荐但非必须）
 */
export type ServerMessageType =
  | 'telemetry'
  | 'deviceStatus'
  | 'target'
  | 'targetRemoved'
  | 'alarm'
  | 'cmdAck'
  | 'heartbeat'
  | 'welcome'

/**
 * 上行消息类型（前端 → 服务端）。
 * - hello：应用层握手（连接建立后前端主动发送的第一条消息，刷新页面即触发）
 * - subscribe / unsubscribe：订阅/退订数据通道（按设备 ID 过滤）
 * - command：控制指令（返航/迫降/急停/任务下发等）
 * - heartbeat：客户端心跳（与服务端心跳对答维持在线判定）
 */
export type ClientMessageType = 'hello' | 'subscribe' | 'unsubscribe' | 'command' | 'heartbeat'

// ==================== 通用信封与基础类型 ====================

/** 下行消息统一信封 */
export interface ServerMessage<T = unknown> {
  /** 消息类型，前端按此字段分发到对应处理器 */
  type: ServerMessageType
  /** 消息体，结构由 type 决定（见下方各 Payload 类型） */
  payload: T
  /** 服务端时间戳（Unix 毫秒），用于排序与延迟计算 */
  ts: number
  /** 递增序号（可选）：用于丢包检测与消息去重 */
  seq?: number
}

/** 上行消息统一信封 */
export interface ClientMessage<T = unknown> {
  type: ClientMessageType
  payload: T
  /** 客户端时间戳（Unix 毫秒） */
  ts: number
  /** 客户端生成的请求 ID：cmdAck 会原样带回，用于关联指令与回执 */
  reqId?: string
}

/** 设备/无人机唯一标识 */
export type DeviceId = string

/** 目标（情报）唯一标识 */
export type TargetId = string

// ==================== 下行消息 Payload 定义 ====================

/**
 * 无人机遥测数据（高频推送）。
 * 字段与设备管理面板/聚焦面板展示项一一对应。
 */
export interface TelemetryPayload {
  /** 设备 ID（与 deviceStatus 上报的 ID 一致） */
  deviceId: DeviceId
  /** 经度（WGS84，度） */
  longitude: number
  /** 纬度（WGS84，度） */
  latitude: number
  /** 相对起飞点高度（米） */
  altitude: number
  /** 海拔高度（米） */
  elevation: number
  /** 地速（米/秒） */
  velocityY: number
  /** 偏航角（度，0~360，北为 0 顺时针） */
  yaw: number
  /** 俯仰角（度） */
  pitch: number
  /** 横滚角（度） */
  roll: number
  /** 电池电量百分比（0~100） */
  battery: number
  /** 电压（伏特） */
  voltage: number
  /** 通信延迟（毫秒） */
  delay: number
  /** 卫星数/定位状态描述（如 "23 颗"/"RTK 固定"） */
  gps: string
  /** 遥测采样时间（Unix 毫秒） */
  sampleTs: number
}

/** 设备状态枚举（与前端设备管理面板状态对齐） */
export type DeviceOnlineStatus = 'tasking' | 'standby' | 'offline' | 'charging'

/**
 * 设备上下线/状态变更事件（事件驱动推送）。
 * 前端收到后更新设备列表中对应设备的状态与图标。
 */
export interface DeviceStatusPayload {
  /** 设备 ID */
  deviceId: DeviceId
  /** 设备名称（如 "01中科晶锐"，用于列表展示） */
  name: string
  /** 最新状态 */
  status: DeviceOnlineStatus
  /** 是否充电中（影响电量图标显示方式） */
  isCharging?: boolean
}

/**
 * 目标情报（新增或更新）。
 * 目标不存在时由后端创建，存在时按 targetId 覆盖更新。
 */
export interface TargetPayload {
  targetId: TargetId
  /** 目标名称（如 "01目标车辆"） */
  name: string
  /** 目标类型：车辆 / 人员 */
  type: '车辆' | '人员'
  /** 状态文字（如 "默认侦查"） */
  status: string
  /** 目标价值（高/中/低） */
  value: string
  /** 发现源（首次侦测到该目标的平台） */
  source: string
  /** 威胁半径（米） */
  threatRadius: number
  /** 目标高度（米） */
  altitude: number
  /** 打击方式（如 "单向序贯"） */
  strikeMode: string
  /** 经度（WGS84，度） */
  longitude: number
  /** 纬度（WGS84，度） */
  latitude: number
  /** 首次发现时间（Unix 毫秒） */
  firstSeenAt: number
  /** 最后更新时间（Unix 毫秒） */
  lastUpdatedAt: number
}

/** 目标移除事件：前端从列表与地图移除该目标 */
export interface TargetRemovedPayload {
  targetId: TargetId
}

/** 告警级别（对应顶栏红/橙/蓝三色徽标） */
export type AlarmLevel = 'red' | 'orange' | 'blue'

/** 告警事件（新增/更新） */
export interface AlarmPayload {
  /** 告警唯一 ID（用于列表去重与确认操作关联） */
  alarmId: string
  /** 告警级别 */
  level: AlarmLevel
  /** 告警标题（如 "电量低"） */
  title: string
  /** 告警详情描述 */
  detail: string
  /** 关联设备 ID（可选，用于跳转定位） */
  deviceId?: DeviceId
  /** 发生时间（Unix 毫秒） */
  occurredAt: number
  /** 是否已确认（确认后前端置灰并计入已处理） */
  acknowledged: boolean
}

/** 指令执行结果 */
export type CommandResult = 'accepted' | 'rejected' | 'failed' | 'timeout'

/**
 * 上行指令回执：前端发送 command 后，服务端异步执行并通过本消息返回结果。
 * reqId 与上行 command 的 reqId 对应，用于关联请求与响应。
 */
export interface CmdAckPayload {
  /** 对应上行指令的请求 ID */
  reqId: string
  /** 执行结果：accepted=已受理 / rejected=已拒绝 / failed=执行失败 */
  result: CommandResult
  /** 附加说明（拒绝原因/失败信息） */
  reason?: string
}

/** 服务端心跳应答 Payload（可空对象） */
export type HeartbeatPayload = Record<string, never>

/**
 * 应用层握手应答（后端 → 前端）。
 * 前端连接建立后会先发 hello，后端收到后**推荐**回一条 welcome（非必须，
 * 前端宽容等待：未收到不影响后续 subscribe/数据流，仅在日志中记录）。
 * 前端刷新页面 → 重新连接 → 发 hello 的完整握手链路会留存于 wsLog。
 */
export interface WelcomePayload {
  /** 服务端实例标识（如主机名/进程号，便于多实例部署排障） */
  server?: string
  /** 服务端协议版本（可选，前端暂不校验，仅记录日志） */
  protocolVersion?: string
  /** 附加说明 */
  message?: string
}

// ==================== 上行消息 Payload 定义 ====================

/**
 * 应用层握手 Payload（前端 → 后端，连接建立后前端发送的第一条消息）。
 * 用途：显式标记「前端已就绪」，刷新页面/重连后的握手链路在日志中清晰可见；
 * 后端可据此感知客户端身份（如需区分多个地面站实例）。
 */
export interface HelloPayload {
  /** 客户端标识（默认 "gsc-web"，多地面站部署时可用环境变量区分） */
  client?: string
  /** 本次页面会话 ID（每次刷新重新生成，用于日志关联同一会话的帧） */
  sessionId: string
}

/** 订阅请求：按设备 ID 列表订阅遥测/状态推送；空数组 = 订阅全部 */
export interface SubscribePayload {
  deviceIds: DeviceId[]
}

/** 退订请求 */
export interface UnsubscribePayload {
  deviceIds: DeviceId[]
}

/** 支持的控制指令类型（与底部按钮条/各功能面板对应） */
export type CommandType =
  | 'rtl' // 一键返航（Return To Launch）
  | 'forceLand' // 一键迫降
  | 'emergencyStop' // 急停
  | 'takeoff' // 起飞
  | 'land' // 降落
  | 'waypointMission' // 航点任务下发
  | 'routeMission' // 航线任务下发
  | 'orbitMission' // 盘旋任务下发
  | 'formationMission' // 编队任务下发
  | 'areaLanding' // 区域降落
  | 'rallyPoint' // 集结点
  | 'confirm' // 滑窗确认（任务确认）
  | 'cancel' // 取消当前任务

/** 控制指令 Payload：具体参数由指令类型决定 */
export interface CommandPayload {
  /** 指令类型 */
  command: CommandType
  /** 目标设备列表（空数组 = 广播至全部选中设备） */
  deviceIds: DeviceId[]
  /** 指令参数（结构由 command 决定，如航线点数组/盘旋半径等） */
  params?: Record<string, unknown>
}

/** 客户端心跳 Payload */
export type ClientHeartbeatPayload = Record<string, never>

// ==================== 消息构造器（上行消息工厂） ====================

/** 生成递增 reqId：时间戳 + 自增序号，用于指令与回执关联 */
let reqSeq = 0
function nextReqId(): string {
  reqSeq += 1
  return `req-${Date.now()}-${reqSeq}`
}

/** 当前页面会话 ID：每次刷新（模块重新加载）生成一次，握手与日志关联用 */
const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/** 构造应用层握手消息（连接建立后前端发送的第一条消息） */
export function buildHello(): ClientMessage<HelloPayload> {
  return {
    type: 'hello',
    payload: { client: 'gsc-web', sessionId },
    ts: Date.now(),
  }
}

/** 构造订阅消息 */
export function buildSubscribe(deviceIds: DeviceId[]): ClientMessage<SubscribePayload> {
  return { type: 'subscribe', payload: { deviceIds }, ts: Date.now() }
}

/** 构造退订消息 */
export function buildUnsubscribe(deviceIds: DeviceId[]): ClientMessage<UnsubscribePayload> {
  return { type: 'unsubscribe', payload: { deviceIds }, ts: Date.now() }
}

/** 构造控制指令消息（自动生成 reqId 用于回执关联） */
export function buildCommand(
  command: CommandType,
  deviceIds: DeviceId[],
  params?: Record<string, unknown>,
): ClientMessage<CommandPayload> {
  return {
    type: 'command',
    payload: { command, deviceIds, params },
    ts: Date.now(),
    reqId: nextReqId(),
  }
}

/** 构造客户端心跳消息 */
export function buildHeartbeat(): ClientMessage<ClientHeartbeatPayload> {
  return { type: 'heartbeat', payload: {}, ts: Date.now() }
}

// ==================== 运行时校验（防御式解析） ====================

/**
 * 判断未知数据是否为合法的下行消息信封。
 * 开发规范要求为边界数据编写显式类型与运行时校验，此函数即 WebSocket 消息边界校验：
 * 非 JSON/结构不符的消息会被丢弃并打 warn 日志，避免坏消息污染 store。
 */
export function isServerMessage(value: unknown): value is ServerMessage {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.type === 'string' &&
    typeof v.payload === 'object' &&
    v.payload !== null &&
    typeof v.ts === 'number'
  )
}

/**
 * WebSocket 通信日志 —— 应用层持久化留存（刷新不丢失）。
 *
 * 动机：浏览器 DevTools 的 Network 面板刷新后清空、Console 默认不保留，
 * 联调排障时历史帧难以追溯。本模块在应用层记录全部 WS 收发帧与连接事件：
 *
 * 1. 内存环形缓冲（默认 1000 条）+ localStorage 持久化（默认 300 条），
 *    页面刷新后自动从 localStorage 恢复，可跨会话追溯；
 * 2. 控制台镜像（[ws-log] 前缀）：低频消息与连接事件全量打印，
 *    telemetry/heartbeat 高频帧默认静默（避免刷屏，可用 __wsLog.setVerbose(true) 打开）；
 * 3. 一键导出 JSON 文件，便于离线分析或发给后端对日志。
 *
 * 浏览器控制台调试入口：
 *   __wsLog.list()            // 读取已留存日志（WsLogEntry[]）
 *   __wsLog.export()          // 下载 ws-log-<时间戳>.json
 *   __wsLog.clear()           // 清空留存日志（内存 + localStorage）
 *   __wsLog.setVerbose(true)  // 控制台打印全部帧（含遥测/心跳）
 *
 * ⚠️ 仅用于排障：日志不含鉴权信息（协议本身也无鉴权字段），生产环境可保留。
 */

export type WsLogDirection = 'up' | 'down' | 'event'

export interface WsLogEntry {
  /** 进程内单调递增序号（跨会话接续） */
  seq: number
  /** Unix 毫秒时间戳 */
  ts: number
  /** up=上行（前端→后端） down=下行（后端→前端） event=连接生命周期事件 */
  dir: WsLogDirection
  /** 消息 type（telemetry/command/...）或事件名（open/close/reconnect-scheduled/...） */
  kind: string
  /** 摘要：payload 的 JSON 串（截断）+ reqId/seq 标记，或事件描述 */
  detail?: string
}

// ==================== 可调参数 ====================

/** 内存环形缓冲上限（条） */
const MEMORY_LIMIT = 1000

/** localStorage 持久化上限（条）：刷新后恢复的历史长度 */
const STORAGE_LIMIT = 300

/** 落盘防抖间隔（毫秒）：高频帧下避免每帧写 localStorage */
const FLUSH_INTERVAL_MS = 2_000

/** 单条 detail 最大字符数：超出截断，防止遥测帧撑爆存储配额 */
const DETAIL_MAX_CHARS = 800

/** 控制台镜像默认静默的高频消息类型（仍写入留存日志） */
const QUIET_KINDS = new Set(['telemetry', 'heartbeat'])

const STORAGE_KEY = 'gsc:ws-log:v1'
const VERBOSE_KEY = 'gsc:ws-log-verbose'

// ==================== 内部状态与工具 ====================

let buffer: WsLogEntry[] = []
let seq = 0
let flushTimer: number | null = null

function safeStringify(value: unknown): string {
  try {
    const s = JSON.stringify(value)
    return s === undefined ? String(value) : s
  } catch {
    return String(value)
  }
}

function truncate(text: string): string {
  return text.length > DETAIL_MAX_CHARS ? `${text.slice(0, DETAIL_MAX_CHARS)}…(已截断)` : text
}

function isVerbose(): boolean {
  try {
    return localStorage.getItem(VERBOSE_KEY) === '1'
  } catch {
    return false
  }
}

/** 追加一条日志：进内存环形缓冲 + 调度落盘 */
function push(entry: Omit<WsLogEntry, 'seq'>): void {
  seq += 1
  buffer.push({ ...entry, seq })
  if (buffer.length > MEMORY_LIMIT) buffer = buffer.slice(-MEMORY_LIMIT)
  scheduleFlush()
}

/** 落盘防抖：间隔内多条合并为一次写入 */
function scheduleFlush(): void {
  if (flushTimer !== null) return
  flushTimer = window.setTimeout(() => {
    flushTimer = null
    persist()
  }, FLUSH_INTERVAL_MS)
}

/** 将最近 STORAGE_LIMIT 条写入 localStorage（配额不足时降级减半重试） */
function persist(): void {
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer)
    flushTimer = null
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer.slice(-STORAGE_LIMIT)))
  } catch {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer.slice(-Math.floor(STORAGE_LIMIT / 2))))
    } catch {
      console.warn('[ws-log] 日志持久化失败（localStorage 不可用或配额已满），仅保留内存日志')
    }
  }
}

/** 模块加载时从 localStorage 恢复上一会话日志（跨刷新留存的关键） */
function loadFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as WsLogEntry[]
    if (Array.isArray(parsed) && parsed.length > 0) {
      buffer = parsed
      seq = parsed.reduce((max, e) => Math.max(max, e.seq), 0)
    }
  } catch {
    /* 存储损坏则从空日志开始 */
  }
}

/** 控制台镜像：高频帧默认静默，其余以 [ws-log] 前缀打印 */
function mirror(dir: WsLogDirection, kind: string, detail?: string): void {
  if (!isVerbose() && dir === 'up' && QUIET_KINDS.has(kind)) return
  const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '·'
  console.info(`[ws-log] ${arrow} ${kind}${detail ? ` ${detail}` : ''}`)
}

// ==================== 对外 API ====================

/** 记录一条收发消息（信封级：type + reqId/seq 标记 + payload 摘要） */
export function logWsMessage(dir: 'up' | 'down', msg: unknown): void {
  if (typeof msg !== 'object' || msg === null) return
  const m = msg as { type?: unknown; payload?: unknown; reqId?: unknown; seq?: unknown }
  const kind = typeof m.type === 'string' ? m.type : 'unknown'
  const marks: string[] = []
  if (typeof m.reqId === 'string') marks.push(`reqId=${m.reqId}`)
  if (typeof m.seq === 'number') marks.push(`seq=${m.seq}`)
  const body = m.payload === undefined ? '' : truncate(safeStringify(m.payload))
  const detail = [marks.join(' '), body].filter(Boolean).join(' ')
  push({ ts: Date.now(), dir, kind, detail: detail || undefined })
  mirror(dir, kind, detail)
}

/** 记录一条连接生命周期事件（connecting/open/close/reconnect-scheduled/dropped/...） */
export function logWsEvent(kind: string, detail?: unknown): void {
  const text =
    detail === undefined ? undefined : typeof detail === 'string' ? detail : truncate(safeStringify(detail))
  push({ ts: Date.now(), dir: 'event', kind, detail: text })
  mirror('event', kind, text)
}

/** 读取已留存日志（内存缓冲的拷贝，最新在末尾） */
export function getWsLog(): WsLogEntry[] {
  return [...buffer]
}

/** 清空留存日志（内存 + localStorage） */
export function clearWsLog(): void {
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer)
    flushTimer = null
  }
  buffer = []
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  console.info('[ws-log] 已清空留存日志')
}

/** 设置控制台详细模式：true=打印全部帧（含遥测/心跳）；留存日志不受影响 */
export function setWsLogVerbose(on: boolean): void {
  try {
    localStorage.setItem(VERBOSE_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
  console.info(
    `[ws-log] 详细模式已${on ? '开启' : '关闭'}（遥测/心跳帧将${on ? '' : '不再'}打印到控制台，留存日志不受影响）`,
  )
}

/** 导出留存日志为 JSON 文件（含导出时间与条数元信息），便于发给后端对日志 */
export function exportWsLog(): void {
  persist()
  const payload = {
    exportedAt: new Date().toISOString(),
    entryCount: buffer.length,
    entries: [...buffer],
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ws-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  a.click()
  URL.revokeObjectURL(url)
  console.info(`[ws-log] 已导出 ${buffer.length} 条日志`)
}

// ==================== 控制台调试入口：window.__wsLog ====================

declare global {
  interface Window {
    __wsLog?: {
      list: typeof getWsLog
      export: typeof exportWsLog
      clear: typeof clearWsLog
      setVerbose: typeof setWsLogVerbose
    }
  }
}

if (typeof window !== 'undefined') {
  loadFromStorage()
  window.__wsLog = {
    list: getWsLog,
    export: exportWsLog,
    clear: clearWsLog,
    setVerbose: setWsLogVerbose,
  }
  // 卸载/切后台立即落盘，避免防抖间隔内的最后几条丢失
  window.addEventListener('beforeunload', persist)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist()
  })
}

/**
 * 真实后端协议适配层（2026-09-11 按新版订阅协议联调更新）。
 *
 * 实测（2026-09-11）：连接 ws://<host>:8080/ws 后发送 JSON 订阅帧（见 buildSubscribeFrame），
 * 后端回 ack；有飞机在线时以 1Hz 推送遥测，信封为
 * { action, req_id, code, msg, data } 或 { type, topic, data }（与 protocol.ts 约定的 type/payload 信封不同）。
 * 本模块将真实信封映射为内部 ServerMessage，store/组件层无感知。
 */

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

/**
 * 连接建立后的订阅帧：{"op":"sub","ch":"<频道>"}。
 * 旧版 {"type":"subscribe","topic":...} 与纯文本握手均已废弃（2026-09-18）。
 */
export function buildSubscribeFrame(channel: string): string {
  return JSON.stringify({ op: 'sub', ch: channel })
}

/** 运行时校验：是否为真实后端信封（新版按 op/ch、旧版按 action/topic 识别） */
export function isBackendMessage(value: unknown): value is BackendMessage {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    (typeof v.op === 'string' && typeof v.ch === 'string') ||
    typeof v.action === 'string' ||
    typeof v.topic === 'string'
  )
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
