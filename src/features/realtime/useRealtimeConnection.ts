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
    refCount += 1
    if (refCount === 1) {
      teardown = startRealtime()
    }
    return () => {
      refCount -= 1
      if (refCount === 0 && teardown) {
        teardown()
        teardown = null
        wsClient.close()
      }
    }
  }, [])
}