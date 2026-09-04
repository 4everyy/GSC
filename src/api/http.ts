/**
 * HTTP API 基础层。
 *
 * 所有请求走同源 /api 前缀：
 * - 开发环境由 Vite dev server 代理转发至后端（默认 http://192.168.110.26:1111，
 *   见 vite.config.ts 的 server.proxy，可用 .env.local 覆盖）；
 * - 生产环境由 nginx 反代 /api 到后端。
 *
 * 后端统一响应信封：{ code, data, message }，code === 0 表示成功。
 */

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
    headers: { Accept: 'application/json' },
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
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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