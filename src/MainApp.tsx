/**
 * @file MainApp.tsx
 * @description MainApp —— 主应用（登录成功后挂载，承载业务初始化 Hooks）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { HomePage } from './pages/HomePage/HomePage'
import { useRealtimeConnection } from './features/realtime/useRealtimeConnection'
import { usePlaneStatusInit, useTaskAreaInit } from './hooks/index'

export default function MainApp() {
  // 全局唯一挂载点：登录成功拿到 token 后建立 WebSocket 连接
  useRealtimeConnection()
  // 设备状态首帧：首页加载时请求一次 /api/v1/control/queryPlaneSta…
  usePlaneStatusInit()
  // 任务区域首帧：首页加载时请求一次 /api/v1/control/queryTaskArea…
  useTaskAreaInit()

  return <HomePage />
}