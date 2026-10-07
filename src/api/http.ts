/**
 * @file http.ts
 * @description http（自 api/index.ts 拆出）—— HTTP 基建：apiPost 统一 POST + 信封解析 + ApiError。 仅依赖 ensureAuthToken（auth.ts），与具体业务域解耦（单一职责）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { ensureAuthToken } from './auth'

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

/** POST 请求（JSON body，无查询参数）：后端所有接口仅支持 POST */
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
  // 宽容信封解析：部分接口（如 podControl 单机操控）不走统一 {code,data,message}信封——响应体无 code 字段…
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
