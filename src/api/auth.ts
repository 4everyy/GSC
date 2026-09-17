/**
 * 登录鉴权模块。
 *
 * - 登录页（LoginPage）账号密码登录走 loginWithCredentials：用户名原样上送，
 *   密码字段固定传 FIXED_PASSWORD（2026-09-17 约定，明文直传、不做 MD5）；
 * - 响应信封为 { "data": "<JWT>" }——注意与常规业务信封 { code, data, message } 不同；
 * - 之后所有 HTTP 请求头携带 `token: <JWT>`（注入点见 http.ts）。
 */
import { BACKEND_ENABLED } from '../config/backend'

// 存储键带版本号：升级版本可使旧缓存 token 失效
const TOKEN_KEY = 'gsc_auth_token_v2'

/**
 * 登录页专用固定密码（2026-09-17 约定）：登录页提交时密码字段固定传该值（明文 '1'），
 * 不对用户输入的密码做任何转换——输入的密码仅用于「记住密码」回填展示。
 */
const FIXED_PASSWORD = '1'

/** 登录页默认预填账号（联调账号 b / 1）：无本地保存凭据时用于自动填充输入框 */
export const DEFAULT_CREDENTIALS = { username: 'b', password: '1' }

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

/** 调用 /iam/logon 换取 JWT（响应信封 { data: token }，非业务信封，单独解析） */
async function requestToken(username: string, password: string): Promise<string> {
  const body = new URLSearchParams({ username, password }).toString()
  const res = await fetch('/api/v1/iam/logon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  })
  if (!res.ok) throw new Error(`logon HTTP ${res.status} ${res.statusText}`)
  const json = (await res.json()) as { data?: unknown }
  if (typeof json.data !== 'string' || !json.data) throw new Error('logon 响应缺少 data(token)')
  return json.data
}

/**
 * 登录页账号密码登录：用户名原样上送，密码字段固定传 FIXED_PASSWORD。
 * 成功：缓存并返回 token；失败：向上抛错（登录页展示提示文案）。
 * mock 模式（BACKEND_ENABLED=false）直接返回占位 token，便于纯前端演示。
 */
export async function loginWithCredentials(username: string): Promise<string> {
  if (!BACKEND_ENABLED) {
    storeToken('mock-token')
    return 'mock-token'
  }
  const token = await requestToken(username, FIXED_PASSWORD)
  storeToken(token)
  console.info('[auth] 登录成功，后续 HTTP请求将携带 token')
  return token
}

/**
 * 获取当前 token（异步形式，http.ts / WS 建连前调用）：
 * 登录门控（App）保证业务 Hook 挂载前已完成登录，这里只读缓存、不再自动登录——
 * 未登录（null）时业务请求照常发出，由后端 401 兜底使问题可见。
 */
export async function ensureAuthToken(): Promise<string | null> {
  if (!BACKEND_ENABLED) return null // mock 模式无后端，无需登录
  return readStoredToken()
}