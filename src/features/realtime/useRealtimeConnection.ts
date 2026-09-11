/**
 * 实时连接生命周期 Hook —— 在应用根部挂载一次。
 *
 * 用法：
 *   function App() {
 *     useRealtimeConnection()
 *     return <RealtimeProvider>...</RealtimeProvider>
 *   }
 *
 * 职责：
 * 1. 首次挂载时调用 startRealtime()：订阅 wsClient 消息/状态 → 注入 store，并建立连接；
 * 2. 页面卸载（beforeunload/unmount）时安全断开，避免连接泄漏；
 * 3. StrictMode 双挂载防护：引用计数保证连接只建立一次（开发模式热重载友好）。
 */
import { useEffect } from 'react'
import { startRealtime } from './realtimeStore'
import { wsClient } from './wsClient'
import { BACKEND_ENABLED } from '../../config/backend'
import { ensureAuthToken } from '../../api/auth'

/** 模块级引用计数：StrictMode 双挂载/多组件复用时连接只建一次 */
let refCount = 0
/** startRealtime 返回的清理函数 */
let teardown: (() => void) | null = null

/**
 * 启动实时通道 Hook。
 * 返回值为连接状态（便于根组件做加载态判断），组件内一般忽略返回值。
 */
export function useRealtimeConnection(): void {
  useEffect(() => {
    // 未开启联调时跳过 WS 连接，避免代理失败重连刷屏
    if (!BACKEND_ENABLED) return
    // 局部标志：alive 登录完成前组件卸载时不再建连；connected 标记本次是否已计数建连
    let alive = true
    let connected = false
    // 先完成登录（拿 token）再建立 WS 连接——登录是首页加载的第一个请求；
    // 登录失败也继续建连（WS 鉴权由后端兜底），不阻塞实时通道
    void ensureAuthToken().then(() => {
      if (!alive) return
      connected = true
      refCount += 1
      if (refCount === 1) {
        teardown = startRealtime()
      }
    })
    return () => {
      alive = false
      // 登录未完成即卸载：尚未计数建连，直接跳过（避免 refCount 误减为负）
      if (!connected) return
      refCount -= 1
      if (refCount === 0 && teardown) {
        teardown()
        teardown = null
        wsClient.close()
      }
    }
  }, [])
}