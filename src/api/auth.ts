/**
 * 登录鉴权模块（2026-09-11 联调接入）。
 *
 * 进入首页时自动以内置联调账号调用 POST /iam/logon 获取 JWT：
 * - 请求体为表单编码 `username={username}&password={password}`（password 为明文的 MD5）；
 * - 响应信封为 { "data": "<JWT>" }——注意与常规业务信封 { code, data, message } 不同；
 * - 之后所有 HTTP 请求头携带 `token: <JWT>`（注入点见 http.ts）。
 *
 * 凭据可用环境变量覆盖（.env.local，见 .env.example）：
 *   VITE_AUTH_USERNAME / VITE_AUTH_PASSWORD_MD5
 */
import { BACKEND_ENABLED } from '../config/backend'

// 存储键带版本号：更换内置账号时升级版本，使旧账号缓存 token 失效自动重登
const TOKEN_KEY = 'gsc_auth_token_v2'

/** 登录账号：默认联调账号（用户名 b / 密码 1 的 MD5），可用环境变量覆盖 */
const AUTH_USERNAME = import.meta.env.VITE_AUTH_USERNAME || 'b'
const AUTH_PASSWORD_MD5 = import.meta.env.VITE_AUTH_PASSWORD_MD5 || 'c4ca4238a0b923820dcc509a6f75849b'

/** 内存缓存 token（localStorage 兜底，页面刷新后免重复登录） */
let cachedToken: string | null = null
/** 并发去重：多个业务请求同时发现无 token 时只触发一次登录 */
let pending: Promise<string | null> | null = null

function readStoredToken(): string | null {
  if (cachedToken) return cachedToken
  try {
    cachedToken = localStorage.getItem(TOKEN_KEY)
  } catch {
    cachedToken = null
  }
  return cachedToken
}

/** 同步获取当前 token（http.ts 注入请求头用；可能为 null = 尚未登录） */
export function getAuthToken(): string | null {
  return readStoredToken()
}

/** 调用 /iam/logon 换取 JWT（响应信封 { data: token }，非业务信封，单独解析） */
async function requestToken(): Promise<string> {
  const body = new URLSearchParams({ username: AUTH_USERNAME, password: AUTH_PASSWORD_MD5 }).toString()
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
 * 确保已持有 token（幂等 + 并发去重）：
 * 已有缓存直接返回；否则自动登录一次。
 * 失败时打日志并返回 null——不向上抛，业务请求照常发出（缺 token 由后端 401 兜底，问题可见）。
 * @param force 强制重新登录（token 过期场景）
 */
export async function ensureAuthToken(force = false): Promise<string | null> {
  if (!BACKEND_ENABLED) return null // mock 模式无后端，无需登录
  if (!force && readStoredToken()) return readStoredToken()
  if (pending) return pending
  pending = requestToken()
    .then((token) => {
      cachedToken = token
      try {
        localStorage.setItem(TOKEN_KEY, token)
      } catch {
        /* 隐私模式等存储不可用场景忽略，仅内存缓存 */
      }
      console.info('[auth] 登录成功，后续 HTTP 请求将携带 token')
      return token
    })
    .catch((err) => {
      console.warn('[auth] 自动登录失败：', err)
      return null
    })
    .finally(() => {
      pending = null
    })
  return pending
}