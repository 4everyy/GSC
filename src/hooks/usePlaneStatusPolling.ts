/**
 * usePlaneStatusPolling —— 无人机状态 HTTP 请求 Hook（仅首页加载请求一次）。
 *
 * 挂载于 App 根组件，全站唯一请求实例：
 * - 页面加载（含浏览器刷新）时请求一次 /api/control/queryPlaneStatus，之后不再重复；
 * - StrictMode 双挂载防护：成功过（lastUpdated 非空）或请求进行中（inFlight 复用）均跳过；
 * - 后续设备状态更新由 WebSocket 实时通道推送，不再依赖 HTTP 轮询。
 */
import { useEffect } from 'react'
import { usePlaneStatusStore } from '../stores/planeStatusStore'

export function usePlaneStatusPolling() {
  const refresh = usePlaneStatusStore((s) => s.refresh)
  const lastUpdated = usePlaneStatusStore((s) => s.lastUpdated)

  useEffect(() => {
    // 已成功拉取过（含 StrictMode 重挂载/成功后的 effect 重跑）则不再请求；
    // 请求进行中时 refresh 内部的 inFlight 去重也会直接复用同一 Promise。
    if (lastUpdated !== null) return
    void refresh()
  }, [refresh, lastUpdated])
}
