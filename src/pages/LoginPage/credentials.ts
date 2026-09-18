/*
 * credentials.ts —— 「记住密码」凭据的本地存取与编解码。
 * 自 LoginPage.tsx 按功能拆分：逻辑未改动，仅移动位置。
 */

import { DEFAULT_CREDENTIALS } from '../../api/auth'

export const REMEMBER_KEY = 'gsc_remember_credentials'

/** base64 轻度混淆（UTF-8 安全），仅防肉眼直读，非加密手段 */
export function encodeText(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)))
}

export function decodeText(s: string): string {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)))
  } catch {
    return ''
  }
}

/**
 * 计算登录页初始值（2026-09-18 约定）：
 * 每次刷新页面，用户名/密码均固定填充初始值（DEFAULT_CREDENTIALS），
 * 且「记住用户名」「记住密码」默认勾选；不读取本地保存的记录。
 */
export function computeInitialCredentials(): {
  username: string
  password: string
  rememberUser: boolean
  rememberPwd: boolean
} {
  return { ...DEFAULT_CREDENTIALS, rememberUser: true, rememberPwd: true }
}
