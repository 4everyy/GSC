/**
 * 城市数据准备 API 客户端。
 *
 * 与 server/index.mjs 的 /api/admin/* 端点对接：
 * - startPrepareCity：触发 prepare-data.ps1 生成 mbtiles
 * - fetchCurrentJob：轮询当前任务进度
 *
 * 鉴权：请求头携带 Authorization: Bearer <VITE_ADMIN_TOKEN>。
 * 该 token 在构建期由 Vite 从 .env 注入（import.meta.env）。
 */

/** 日志条目语义级别 */
export type PrepareJobLevel = 'info' | 'ok' | 'warn' | 'error' | 'progress'

export interface PrepareLogEntry {
  /** 时间戳（ms） */
  t: number
  level: PrepareJobLevel
  msg: string
}

export type PrepareJobStatus = 'running' | 'done' | 'failed'

/** 一次准备任务的完整状态快照 */
export interface PrepareJob {
  jobId: string
  status: PrepareJobStatus
  city: string
  /** 0-100 */
  percent: number
  /** 当前阶段中文名 */
  stage: string
  startedAt: number
  elapsedMs: number
  error: string | null
  log: PrepareLogEntry[]
}

/** startPrepareCity 的返回：running=已启动；busy=已有任务在跑 */
export interface PrepareStartResult {
  status: 'running' | 'busy'
  jobId: string
  message?: string
}

/** fetchCurrentJob 在无任务时返回 */
export interface PrepareIdle {
  status: 'idle'
  message?: string
}

const ADMIN_TOKEN: string =
  (import.meta.env.VITE_ADMIN_TOKEN as string | undefined) ?? ''

if (!ADMIN_TOKEN && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.warn(
    '[prepareCity] VITE_ADMIN_TOKEN 未配置，城市数据准备请求将被后端拒绝。',
  )
}

/** 发起城市数据准备。返回 running 表示已启动，busy 表示已有任务在运行。 */
export async function startPrepareCity(params: {
  city: string
  primary?: string
  maxZoom?: number
}): Promise<PrepareStartResult> {
  const resp = await fetch('/api/admin/prepare', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    },
    body: JSON.stringify(params),
  })

  if (resp.status === 409) {
    const data = (await resp.json().catch(() => ({}))) as Partial<PrepareStartResult>
    return { status: 'busy', jobId: data.jobId ?? '', message: data.message }
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`准备城市数据失败 (${resp.status}): ${text}`)
  }

  return (await resp.json()) as PrepareStartResult
}

/** 轮询当前任务状态。无任务时返回 { status: 'idle' }。 */
export async function fetchCurrentJob(): Promise<PrepareJob | PrepareIdle> {
  const resp = await fetch('/api/admin/jobs/current', {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  })
  if (resp.status === 404) return { status: 'idle' }
  if (!resp.ok) throw new Error(`查询任务状态失败 (${resp.status})`)
  return (await resp.json()) as PrepareJob
}
