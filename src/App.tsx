import { HomePage } from './pages/HomePage/HomePage'
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary'
import { useRealtimeConnection } from './features/realtime/useRealtimeConnection'
import { usePlaneStatusPolling } from './hooks/usePlaneStatusPolling'

function App() {
  // 全局唯一挂载点：建立 WebSocket 连接（含重连/心跳/消息分发到 realtimeStore）
  useRealtimeConnection()
  // 设备状态 HTTP：首页加载仅请求一次（/api/control/queryPlaneStatus），后续由 WS 推送
  usePlaneStatusPolling()

  return (
    <ErrorBoundary>
      <HomePage />
    </ErrorBoundary>
  )
}

export default App