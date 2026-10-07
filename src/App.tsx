/**
 * @file App.tsx
 * @description App —— 登录门控 + 主应用。
 * @author 4everyy
 * @date 2026-10-07
 */
import { Suspense, lazy, useCallback, useEffect, useState, type ComponentType } from 'react'
import { LoginPage } from './pages/LoginPage/LoginPage'
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary'
import { parseAppRoute, type AppRoute } from './utils/appNavigation'

/* 主应用懒加载（独立 chunk）：登录页首屏不加载主应用代码。 */
let mainAppPromise: Promise<{ default: ComponentType }> | null = null
function loadMainApp(): Promise<{ default: ComponentType }> {
  if (!mainAppPromise) {
    mainAppPromise = import('./MainApp').catch((err: unknown) => {
      mainAppPromise = null // 失败不缓存：让下一次调用重新拉取模块
      throw err
    })
  }
  return mainAppPromise
}

/** 新建 MainApp lazy 实例：重试时调用——新实例才会重新执行 loadMainApp */
const createMainApp = () => lazy(loadMainApp)

/* 视频监测屏（第二屏）懒加载：独立 chunk，主屏首屏不加载视频屏代码 */
let videoAppPromise: Promise<{ default: ComponentType }> | null = null
function loadVideoApp(): Promise<{ default: ComponentType }> {
  if (!videoAppPromise) {
    videoAppPromise = import('./pages/VideoMonitorPage/VideoMonitorPage').catch((err: unknown) => {
      videoAppPromise = null
      throw err
    })
  }
  return videoAppPromise
}

/** 新建视频监测屏 lazy 实例（可重试，同 createMainApp 策略） */
const createVideoApp = () => lazy(loadVideoApp)

/** 主应用 chunk 预取（幂等：已加载后复用同一 Promise；失败自动清缓存可重试） */
const prefetchMainApp = () => {
  void loadMainApp()
}

/** 是否跳过登录页：默认跳过直接进首页（演示阶段） */
const SKIP_LOGIN = import.meta.env.VITE_SKIP_LOGIN !== 'false'

/** 模块失效类错误特征：动态 import 网络层失败（dev 编辑中间态 / 部署更新后旧模块图失效） */
const MODULE_LOAD_FAILURE_RE =
  /(failed to fetch dynamically imported module|dynamically imported module|importing a module script failed|error loading dynamically imported module|net::err|failed to load module script)/i

/** 自动整页刷新节流标记（sessionStorage key）与冷却窗口（ms） */
const AUTO_RELOAD_KEY = 'gsc:auto-reload:mainapp'
const AUTO_RELOAD_COOLDOWN_MS = 10_000

/** 模块失效时自动整页刷新（自愈）：10 秒窗口内最多 1 次，防止错误持续时刷新循环。 */
function autoReloadOnModuleFailure(): boolean {
  try {
    const last = Number(sessionStorage.getItem(AUTO_RELOAD_KEY) ?? 0)
    if (Number.isFinite(last) && Date.now() - last < AUTO_RELOAD_COOLDOWN_MS) return false
    sessionStorage.setItem(AUTO_RELOAD_KEY, String(Date.now()))
  } catch {
    // sessionStorage 不可用（隐私模式等）：仍刷新但可能失去节流，属可接受降级
  }
  window.location.reload()
  return true
}

/* 节流窗口内的软重试定时器：延时重建 lazy 实例重新动态 import（不整页刷新）。 */
let moduleSoftRetryTimer: number | null = null
/** 节流窗口内模块失效的软自愈：3 秒后重建 lazy 实例自动重试。
    场景：dev 热更新批量重写文件（如脚本化重构）的中间态导入失败——
    文件稳定后重试即成功；若仍失败会再次进入此逻辑（每 3 秒一轮，配合节流刷新兜底）。 */
function softRetryOnModuleFailure(retry: () => void): void {
  if (moduleSoftRetryTimer !== null) return
  moduleSoftRetryTimer = window.setTimeout(() => {
    moduleSoftRetryTimer = null
    retry()
  }, 3000)
}

function App() {
  // 默认跳过登录直接进入主应用（首页）；VITE_SKIP_LOGIN=false 时恢复登录门控
  const [loggedIn, setLoggedIn] = useState(SKIP_LOGIN)
  // 主应用 lazy 实例：动态 import 失败被 ErrorBoundary 捕获后
  const [MainApp, setMainApp] = useState(createMainApp)
  // 视频监测屏 lazy 实例（重试策略同上）
  const [VideoApp, setVideoApp] = useState(createVideoApp)
  // 双屏 hash 路由：登录门控之后按 hash 分发（#/ 主屏 / #/video 视频监测屏）
  const [route, setRoute] = useState<AppRoute>(parseAppRoute)

  // 监听 hashchange：两屏均为登录后内容，切换仅改 hash，不卸载登录态
  useEffect(() => {
    const onHashChange = () => setRoute(parseAppRoute())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // 当前路由为主屏时预取视频屏 chunk
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    const prefetch = route === 'video' ? prefetchMainApp : () => void loadVideoApp()
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(prefetch, { timeout: 3000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const timer = window.setTimeout(prefetch, 1600)
    return () => window.clearTimeout(timer)
  }, [route])

  /** ErrorBoundary 重试联动：重建 lazy 实例以重新执行动态 import */
  const handleMainAppReset = useCallback(() => {
    setMainApp(createMainApp())
    setVideoApp(createVideoApp())
  }, [])

  /** ErrorBoundary 错误上报：模块失效类错误（动态 import fetch 失败）自愈——
      节流窗口外整页刷新重建模块图（浏览器持失效 URL ?t= 旧时间戳时唯一可靠路径）；
      节流窗口内改为 3 秒后重建 lazy 实例软重试，避免批量文件重写的瞬态失败停留在错误页。 */
  const handleMainAppError = useCallback((message: string) => {
    if (!MODULE_LOAD_FAILURE_RE.test(message)) return
    if (autoReloadOnModuleFailure()) return
    softRetryOnModuleFailure(() => {
      setMainApp(createMainApp())
      setVideoApp(createVideoApp())
    })
  }, [])

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
    <ErrorBoundary onReset={handleMainAppReset} onError={handleMainAppError}>
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
          {route === 'video' ? <VideoApp /> : <MainApp />}
        </Suspense>
      ) : (
        <LoginPage onSuccess={() => setLoggedIn(true)} />
      )}
    </ErrorBoundary>
  )
}

export default App