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
 *
 * 动态导入失败恢复（2026-09-28）：
 * - 「Failed to fetch dynamically imported module」曾被 ErrorBoundary 捕获后
 *   无法通过「重试」恢复：React.lazy 会把失败 Promise 永久缓存在 lazy 实例上，
 *   重置 ErrorBoundary 状态只会让 lazy 重抛同一 rejection（编辑中间态 HMR
 *   失效、部署更新后旧 chunk 404 等场景即永久卡死）；
 * - 现改为可重试加载器：import 失败即清空缓存 Promise，重试时重建 lazy
 *   实例重新发起动态 import，模块恢复（编辑完成 / 部署就绪）后即可正常挂载。
 *
 * 动态导入失败自愈（2026-09-28 深度修复）：
 * - 模块失效类错误（fetch dynamically imported module 失败 / Importing a
 *   module script failed）往往是 dev 编辑中间态或部署更新后浏览器仍持有旧
 *   模块图所致——重建 lazy 实例仍可能拿到同一失效 URL（?t= 时间戳未变），
 *   唯一可靠的恢复手段是整页刷新重建模块图；
 * - 故捕获到此类错误时自动 reload 一次，并以 sessionStorage 标记节流：
 *   短窗口（10s）内最多自动刷新 1 次，避免错误持续存在时无限刷新循环；
 *   刷新后仍失败则停留在错误页，提供「重试 / 刷新页面」手动恢复。
 */
import { Suspense, lazy, useCallback, useEffect, useState, type ComponentType } from 'react'
import { LoginPage } from './pages/LoginPage/LoginPage'
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary'
import { parseAppRoute, type AppRoute } from './utils/appNavigation'

/* 主应用懒加载（独立 chunk）：登录页首屏不加载主应用代码。
 * 可重试加载器：成功后缓存 Promise（幂等，预取与懒加载复用同一结果）；
 * 失败则清空缓存，下次调用重新发起 import——配合 App 内重建 lazy 实例实现重试。 */
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

/** 是否跳过登录页：默认跳过直接进首页（演示阶段）；显式配置 VITE_SKIP_LOGIN=false 时恢复登录门控 */
const SKIP_LOGIN = import.meta.env.VITE_SKIP_LOGIN !== 'false'

/** 模块失效类错误特征：动态 import 网络层失败（dev 编辑中间态 / 部署更新后旧模块图失效） */
const MODULE_LOAD_FAILURE_RE =
  /(failed to fetch dynamically imported module|dynamically imported module|importing a module script failed|error loading dynamically imported module|net::err|failed to load module script)/i

/** 自动整页刷新节流标记（sessionStorage key）与冷却窗口（ms） */
const AUTO_RELOAD_KEY = 'gsc:auto-reload:mainapp'
const AUTO_RELOAD_COOLDOWN_MS = 10_000

/**
 * 模块失效时自动整页刷新（自愈）：10 秒窗口内最多 1 次，防止错误持续时刷新循环。
 * 返回 true 表示已触发刷新。
 */
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

function App() {
  // 默认跳过登录直接进入主应用（首页）；VITE_SKIP_LOGIN=false 时恢复登录门控
  const [loggedIn, setLoggedIn] = useState(SKIP_LOGIN)
  // 主应用 lazy 实例：动态 import 失败被 ErrorBoundary 捕获后，点「重试」
  // 组件 onReset 重建实例（lazy 缓存的 rejection 不会自行清除），重新发起加载
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

  // 当前路由为主屏时预取视频屏 chunk；为视频屏时预取主屏 chunk（登录页空闲预取已有，此处互补）
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

  /**
   * ErrorBoundary 错误上报：模块失效类错误（动态 import fetch 失败）自动整页
   * 刷新重建模块图——此时浏览器持有失效 URL（?t= 旧时间戳），仅重建 lazy
   * 实例大概率仍会命中同一失效地址；节流见 autoReloadOnModuleFailure。
   */
  const handleMainAppError = useCallback((message: string) => {
    if (MODULE_LOAD_FAILURE_RE.test(message)) autoReloadOnModuleFailure()
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