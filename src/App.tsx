/**
 * App —— 登录门控 + 主应用。
 *
 * 门控逻辑：默认跳过登录页直接进入首页（演示阶段）——挂载即渲染 MainApp。
 * 如需恢复登录验证（先展示 LoginPage，登录成功后进入首页），
 * 在 .env 设置 VITE_SKIP_LOGIN=false。
 * 跳过登录时业务请求头不携带 token 字段（见 api/index.ts 的 authHeader 实现，
 * token 缺失自动省略）。
 *
 * 性能（2026-09-18 卡顿优化）：
 * - MainApp 拆分为独立模块（./MainApp，承载全部业务初始化 Hooks）并由
 *   React.lazy 懒加载：登录页刷新 / 首屏只解析登录相关代码，主应用（首页、
 *   地图引擎、业务 Hooks）独立分包，消除整包一次性解析执行导致的刷新卡顿；
 * - 挂载且浏览器空闲（requestIdleCallback / setTimeout 兜底）时预取
 *   主应用 chunk：登录路径下点击登录时通常已下载完成，切换无感；
 *   跳过路径下该预取与首屏加载幂等合并，不重复下载；
 * - 预取不阻塞页面动画与交互。
 */
import { Suspense, lazy, useEffect, useState } from 'react'
import { LoginPage } from './pages/LoginPage/LoginPage'
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary'

/* 主应用懒加载（独立 chunk）：登录页首屏不加载主应用代码 */
const MainApp = lazy(() => import('./MainApp'))

/** 主应用 chunk 预取（幂等：已加载后动态 import 直接走缓存） */
const prefetchMainApp = () => {
  void import('./MainApp')
}

/** 是否跳过登录页：默认跳过直接进首页（演示阶段）；显式配置 VITE_SKIP_LOGIN=false 时恢复登录门控 */
const SKIP_LOGIN = import.meta.env.VITE_SKIP_LOGIN !== 'false'

function App() {
  // 默认跳过登录直接进入主应用（首页）；VITE_SKIP_LOGIN=false 时恢复登录门控
  const [loggedIn, setLoggedIn] = useState(SKIP_LOGIN)

  // 挂载后，浏览器空闲时预取主应用 chunk（幂等，见文件头说明）
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(prefetchMainApp, { timeout: 3000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const timer = window.setTimeout(prefetchMainApp, 1600)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <ErrorBoundary>
      {loggedIn ? (
        <Suspense
          fallback={
            <div
              style={{
                position: 'fixed',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                background: '#050b18',
                color: '#9fd8ff',
                fontSize: 14,
                letterSpacing: '0.3em',
              }}
            >
              加载中…
            </div>
          }
        >
          <MainApp />
        </Suspense>
      ) : (
        <LoginPage onSuccess={() => setLoggedIn(true)} />
      )}
    </ErrorBoundary>
  )
}

export default App