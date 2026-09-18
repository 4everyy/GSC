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
