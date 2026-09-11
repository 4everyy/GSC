/**
 * useAuthInit —— 登录初始化 Hook（首页加载的第一个网络请求）。
 *
 * 挂载于 App 根组件的首个 Hook 位置：
 * - 页面加载（含刷新）即用内置联调账号（auth.ts，可用环境变量覆盖）调用
 *   POST /iam/logon 换取 JWT——保证登录先于一切业务请求发出；
 * - 之后的业务 HTTP 请求（设备/目标/任务区域等）经 http.ts 的 authHeaders()
 *   自动携带该 token（登录未完成时业务请求会先等待本次登录完成再发出）；
 * - 每次页面加载强制重新登录（force），避免缓存 token 过期导致业务请求 401；
 * - StrictMode 双挂载防护：模块级 inited 标志，仅首次挂载触发一次；
 * - 登录失败不阻塞页面渲染：业务请求发出时 ensureAuthToken 会再尝试登录
 *   （幂等 + 并发去重），问题经后端 401 兜底可见。
 */
import { useEffect } from 'react'
import { BACKEND_ENABLED } from '../config/backend'
import { ensureAuthToken } from '../api/auth'

/** 模块级单例：本页面生命周期内已触发过初始化登录（StrictMode 重挂载不重复请求） */
let inited = false

export function useAuthInit() {
  useEffect(() => {
    // mock 模式无后端，无需登录
    if (!BACKEND_ENABLED) return
    // 已触发过则跳过（StrictMode 双挂载）
    if (inited) return
    inited = true
    // force：忽略本地缓存 token，页面加载总是重新登录拿最新 token
    void ensureAuthToken(true)
  }, [])
}