/**
 * App —— 登录门控 + 主应用。
 *
 * 门控逻辑：启动始终先展示 LoginPage；登录成功（loginWithCredentials 缓存
 * token 后回调）→ 挂载 MainApp（所有业务 Hooks 仅在登录后才挂载，保证登录
 * 是首个网络请求，业务请求发出时 token 已就绪，见 api/auth.ts / api/http.ts）。
 * 每次访问（含刷新）均从登录页开始，登录成功后再跳转首页。
 *
 * 性能（2026-09-18 卡顿优化）：
 * - MainApp 拆分为独立模块（./MainApp，承载全部业务初始化 Hooks）并由
 *   React.lazy 懒加载：登录页刷新 / 首屏只解析登录相关代码，主应用（首页、
 *   地图引擎、业务 Hooks）独立分包，消除整包一次性解析执行导致的刷新卡顿；
 * - 登录页挂载且浏览器空闲（requestIdleCallback / setTimeout 兜底）时预取
 *   主应用 chunk：点击登录时通常已下载完成，切换无感；
 * - 预取不阻塞登录页动画与交互。
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

function App() {
  // 始终先展示登录页，登录成功后再进入主应用
  const [loggedIn, setLoggedIn] = useState(false)

  // 登录页挂载后，浏览器空闲时预取主应用 chunk：
  // 点击登录时通常已完成下载，登录成功切换接近无感，且不与登录页首屏加载竞争
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