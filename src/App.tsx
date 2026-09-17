/**
 * App —— 登录门控 + 主应用。
 *
 * 门控逻辑：未登录（无 token）→ LoginPage；登录成功（loginWithCredentials 缓存
 * token 后回调）→ 挂载 MainApp（所有业务 Hooks 仅在登录后才挂载，保证登录
 * 是首个网络请求，业务请求发出时 token 已就绪，见 api/auth.ts / api/http.ts）。
 * 刷新免登录：初始状态读取已缓存 token，有效会话直接进入主应用（登录页保留
 * 用于首次访问 / token 失效场景）。
 *
 * Hooks 拆分说明：App 自身仅维护登录态（Hooks 顺序恒定）；useRealtimeConnection /
 * usePlaneStatusPolling / useTargetStatusInit / useTaskAreaInit 均移入 MainApp，
 * 避免「登录前后 Hooks 数量不一致」违反 Hooks 规则。
 */
import { useState } from 'react'
import { getAuthToken } from './api/auth'
import { HomePage } from './pages/HomePage/HomePage'
import { LoginPage } from './pages/LoginPage/LoginPage'
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary'
import { useRealtimeConnection } from './features/realtime/useRealtimeConnection'
import { usePlaneStatusPolling } from './hooks/usePlaneStatusPolling'
import { useTargetStatusInit } from './hooks/useTargetStatusInit'
import { useTaskAreaInit } from './hooks/useTaskAreaInit'

/** 主应用：登录成功后挂载，承载全部业务初始化 Hooks */
function MainApp() {
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

  return <HomePage />
}

function App() {
  // 惰性初始化：已缓存有效 token（上次登录会话）则刷新后直接进入主应用
  const [loggedIn, setLoggedIn] = useState(() => getAuthToken() !== null)

  return (
    <ErrorBoundary>
      {loggedIn ? <MainApp /> : <LoginPage onSuccess={() => setLoggedIn(true)} />}
    </ErrorBoundary>
  )
}

export default App