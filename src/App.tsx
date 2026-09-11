import { HomePage } from './pages/HomePage/HomePage'
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary'
import { useAuthInit } from './hooks/useAuthInit'
import { useRealtimeConnection } from './features/realtime/useRealtimeConnection'
import { usePlaneStatusPolling } from './hooks/usePlaneStatusPolling'
import { useTargetStatusInit } from './hooks/useTargetStatusInit'
import { useTaskAreaInit } from './hooks/useTaskAreaInit'

function App() {
  // 登录初始化（首页加载的第一个网络请求）：固定联调账号 POST /iam/logon 换取 JWT，
  // 后续所有 HTTP 请求头携带 token: <JWT>（见 api/auth.ts / api/http.ts）
  useAuthInit()
  // 全局唯一挂载点：建立 WebSocket 连接（含重连/心跳/消息分发到 realtimeStore），
  // 登录完成后（拿到 token）再建立连接，未开启联调时跳过
  useRealtimeConnection()
  // 设备状态 HTTP：首页加载仅请求一次（/api/control/queryPlaneStatus），后续由 WS 推送
  usePlaneStatusPolling()
  // 目标状态 HTTP：首页加载仅请求一次（queryTargetStatus），装载后替换 mock 目标
  useTargetStatusInit()
  // 任务区域 HTTP：首页加载仅请求一次（queryTaskAreaList），装入 taskAreaStore
  // （图层默认关，预先拉取保证用户打开「任务区域」开关时数据已就绪）
  useTaskAreaInit()

  return (
    <ErrorBoundary>
      <HomePage />
    </ErrorBoundary>
  )
}

export default App