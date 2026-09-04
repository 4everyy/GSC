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
  if (!isVerbose() && dir !== 'event' && QUIET_KINDS.has(kind)) return
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