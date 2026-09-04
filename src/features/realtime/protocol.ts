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