/**
 * 无人机状态一次性加载 Hook —— MainApp 挂载一次，拉取
 * /api/v1/control/queryPlaneStatus 首帧写入 planeStatusStore。
 *
 * 接口不做轮询：仅在首页加载时调用一次；后续实时遥测更新
 * 由 WebSocket 链路（features/realtime）承载。
 *
 * - StrictMode 双挂载时避免重复请求（store.loaded 判断 + 引用计数）；
 * - 已加载过（如路由切换回来）则不重复请求。
 */
import { useEffect } from 'react'
import { usePlaneStatusStore } from '../stores/planeStatusStore'

/** 模块级标记：本次会话内已发起过加载则不再请求 */
let initialized = false

export function usePlaneStatusInit(): void {
  useEffect(() => {
    if (!initialized) {
      initialized = true
      void usePlaneStatusStore.getState().refresh()
    }
  }, [])
}