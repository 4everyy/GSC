/**
 * MainApp —— 主应用（登录成功后挂载，承载业务初始化 Hooks）。
 *
 * 从 App.tsx 拆出并由 App 懒加载（React.lazy + 动态 import）：登录页刷新 /
 * 首屏只解析登录相关代码，主应用（首页、地图引擎、业务 Hooks）按需分包，
 * 消除整包解析执行导致的登录页刷新卡顿（2026-09-18 卡顿优化）。
 */
import { HomePage } from './pages/HomePage/HomePage'
import { useRealtimeConnection } from './features/realtime/useRealtimeConnection'

export default function MainApp() {
  // 全局唯一挂载点：登录成功拿到 token 后建立 WebSocket 连接，
  // 连接建立即订阅 cmd/task/device/telemetry/alert 五个频道，
  // 每次通信结果（上行/下行/连接事件）打印到控制台（见 wsClient/wsLog）
  useRealtimeConnection()

  return <HomePage />
}