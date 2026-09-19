import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { loginWithCredentials, DEFAULT_CREDENTIALS } from '../../api/index'
import './LoginPage.css'
import { IconDrone, IconUser, IconLock, IconEye, IconEyeOff, IconCheck, HexDecor, DroneUnit, RoboDogUnit } from '../../components/login/icons'
import { useLoginCanvas, prefersReducedMotion } from '../../hooks/useLoginCanvas'

/**
 * LoginPage —— 登录页「终极科技版」（仅账号密码登录，无注册 / 忘记密码入口）。
 *
 * - 登录走 loginWithCredentials()：用户名原样上送，密码字段固定传值（见 api/auth.ts）；
 * - 每次刷新页面：用户名/密码固定填充初始值，且「记住用户名」「记住密码」默认勾选
 *   （2026-09-18 约定，见 credentials.ts / api/auth.ts）；
 * - 视觉：深海军蓝 + 青色 HUD 科技风。动效清单：
 *   Canvas：星链粒子（鼠标排斥/连线/拖尾）、闪烁星空（十字光芒）、底部全息波浪地形、
 *           中心 3D 线框星球（经纬网 + 双卫星轨道，登录成功粒子向球心汇聚）；
 *   DOM/CSS：透视网格、流星、扫描线、六边形、能量光柱、流动刻度、HUD 四角角标、
 *           顶部状态灯 + 实时时钟、鼠标准星（延迟跟随）、刻度罗盘环、双侧电路走线流光、
 *           卡片 3D 视差 + 镜面高光 + conic 流光描边 + HUD 角标 + 入场扫描、
 *           打字机标题 + glitch 残影、输入框浮动标签 + 聚焦光线、按钮充能条 + 掠光、
 *           登录成功全屏冲击波 + 卡片扩散徽标、
 *           无人集群装饰层（四旋翼无人机巡航 + 探照扫描 + 机械狗巡逻，见 LoginDrones.css）。
 *   页面无多余文案（无英文装饰文本）：仅标题 / 输入框 / 两个记住选项 / 登录按钮。
 *
 * 性能（2026-09-18 卡顿优化）：
 * - 登录成功（phase=success）立即给根节点加 `login-page--success` 类冻结全部背景装饰动画，
 *   Canvas 同步停帧（见 useLoginCanvas），主线程让给切换动画与主应用挂载；
 * - 卡片 3D 视差：mouseenter 缓存 rect，mousemove 复用，避免逐次强制布局；
 * - 鼠标准星：lerp 收敛后暂停 rAF，pointermove 再唤醒，静止时不占帧。
 */

/* ---------- 「记住用户名和密码」持久化 ---------- */

const TITLE = '智能无人集群控制系统'

/** 登录成功后延迟切换到主应用的等待时长（ms），留出冲击波 + 徽标动画时间 */
const SUCCESS_SWITCH_DELAY = 950

/** 系统是否偏好「减少动态效果」 */
export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  // 首次渲染计算初始凭据（useState 惰性初始化只执行一次，避免重复读 localStorage）
  const [initial] = useState(computeInitialCredentials)

  const [username, setUsername] = useState(initial.username)
  const [password, setPassword] = useState(initial.password)
  const [rememberUser, setRememberUser] = useState(initial.rememberUser)
  const [rememberPwd, setRememberPwd] = useState(initial.rememberPwd)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'success'>('idle')
  const [error, setError] = useState('')
  // 错误序号：key 变化强制重挂载错误条，重放抖动动画
  const [errorSeq, setErrorSeq] = useState(0)
  // 打字机标题：已显示字符数（系统偏好「减少动态效果」时直接完整显示）
  const [typedCount, setTypedCount] = useState(() =>
    prefersReducedMotion() ? TITLE.length : 0,
  )

  const userRef = useRef<HTMLInputElement>(null)
  const pwdRef = useRef<HTMLInputElement>(null)
  const successTimerRef = useRef<number | null>(null)
  const tiltRef = useRef<HTMLDivElement>(null)
  // phase 的 ref 镜像：canvas 动画循环读取（避免 effect 重建中断动画）
  const phaseRef = useRef<'idle' | 'success'>('idle')

  /* 页面根节点：用于挂载点击涟漪特效 */
  const pageRef = useRef<HTMLDivElement>(null)

  /* HUD 实时时钟（直接写 textContent，避免每秒重渲染组件） */
  const clockRef = useRef<HTMLSpanElement>(null)

  /* 鼠标准星：延迟跟随 */
  const crossRef = useRef<HTMLDivElement>(null)

  const typed = TITLE.slice(0, typedCount)
  const typingDone = typedCount >= TITLE.length

  /* ====== 背景主 Canvas：星空 / 星链 / 波浪地形 / 3D 线框星球（实现见 useLoginCanvas） ====== */
  const canvasRef = useLoginCanvas(phaseRef)

  /* ====== 打字机标题：逐字显示 + 光标，完成后光标淡出 ====== */
  useEffect(() => {
    // 减少动效场景：初始值已是全文（惰性初始化处理），无需启动定时器
    if (prefersReducedMotion()) return
    let i = 0
    const timer = window.setInterval(() => {
      i += 1
      setTypedCount(i)
      if (i >= TITLE.length) window.clearInterval(timer)
    }, 130)
    return () => window.clearInterval(timer)
  }, [])

  /* ====== HUD 实时时钟：每秒刷新文本 ====== */
  useEffect(() => {
    const fmt = () => {
      const d = new Date()
      const p = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    }
    if (clockRef.current) clockRef.current.textContent = fmt()
    const timer = window.setInterval(() => {
      if (clockRef.current) clockRef.current.textContent = fmt()
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  /* ====== 鼠标准星：lerp 延迟跟随（性能：收敛后暂停 rAF，移动时再唤醒） ====== */
  useEffect(() => {
    if (prefersReducedMotion()) return
    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const cur = { x: target.x, y: target.y }
    let raf = 0
    let visible = false
    const loop = () => {
      cur.x += (target.x - cur.x) * 0.16
      cur.y += (target.y - cur.y) * 0.16
      if (crossRef.current) {
        crossRef.current.style.transform = `translate3d(${cur.x.toFixed(1)}px, ${cur.y.toFixed(1)}px, 0)`
      }
      // 已贴合目标：暂停循环，待下次 pointermove 再唤醒（性能：静止时不占帧）
      if (Math.abs(target.x - cur.x) + Math.abs(target.y - cur.y) > 0.5) {
        raf = requestAnimationFrame(loop)
      } else {
        raf = 0
      }
    }
    const onMove = (e: PointerEvent) => {
      target.x = e.clientX
      target.y = e.clientY
      if (!visible && crossRef.current) {
        crossRef.current.style.opacity = '1'
        visible = true
      }
      if (!raf) raf = requestAnimationFrame(loop)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  /* 点击涟漪：在点击处生成扩散光环，动画结束自动移除 */
  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    const onPointerDown = (e: PointerEvent) => {
      const rect = page.getBoundingClientRect()
      const el = document.createElement('span')
      el.className = 'login-ripple'
      el.style.left = `${e.clientX - rect.left}px`
      el.style.top = `${e.clientY - rect.top}px`
      page.appendChild(el)
      el.addEventListener('animationend', () => el.remove(), { once: true })
    }
    page.addEventListener('pointerdown', onPointerDown)
    return () => {
      page.removeEventListener('pointerdown', onPointerDown)
      page.querySelectorAll('.login-ripple').forEach((n) => n.remove())
    }
  }, [])

  /* 挂载后自动聚焦：默认聚焦密码框（用户名已预填，输完密码即可回车登录） */
  useEffect(() => {
    pwdRef.current?.focus()
  }, [])

  /* 卸载时清理登录成功延迟切换定时器 */
  useEffect(() => {
    return () => {
      if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current)
    }
  }, [])

  /* 卡片 3D 视差：随鼠标轻微倾斜 + 镜面高光跟随（写 CSS 变量，避免逐帧 setState）。
   * 性能：mouseenter 时缓存 rect，mousemove 直接复用（避免每次移动强制布局计算） */
  const tiltRectRef = useRef<DOMRect | null>(null)
  const cacheTiltRect = () => {
    tiltRectRef.current = tiltRef.current ? tiltRef.current.getBoundingClientRect() : null
  }
  const handleTilt = (e: MouseEvent<HTMLDivElement>) => {
    const el = tiltRef.current
    const r = tiltRectRef.current ?? (el ? el.getBoundingClientRect() : null)
    if (!el || !r) return
    const px = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1)
    const py = Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1)
    el.style.setProperty('--tilt-x', `${((0.5 - py) * 5).toFixed(2)}deg`)
    el.style.setProperty('--tilt-y', `${((px - 0.5) * 7).toFixed(2)}deg`)
    el.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`)
    el.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`)
  }

  const resetTilt = () => {
    tiltRectRef.current = null
    const el = tiltRef.current
    if (!el) return
    el.style.setProperty('--tilt-x', '0deg')
    el.style.setProperty('--tilt-y', '0deg')
    el.style.setProperty('--gx', '50%')
    el.style.setProperty('--gy', '32%')
  }

  const showError = (msg: string) => {
    setError(msg)
    setErrorSeq((s) => s + 1)
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (loading || phase === 'success') return

    const name = username.trim()
    if (!name) {
      showError('请输入用户名')
      userRef.current?.focus()
      return
    }
    if (!password) {
      showError('请输入密码')
      pwdRef.current?.focus()
      return
    }

    setLoading(true)
    setError('')
    try {
      await loginWithCredentials(name, password)
      // 「记住用户名」「记住密码」独立持久化：勾哪项存哪项，都不勾则清除
      try {
        if (rememberUser || rememberPwd) {
          const store: { username?: string; password?: string } = {}
          if (rememberUser) store.username = name
          if (rememberPwd) store.password = encodeText(password)
          localStorage.setItem(REMEMBER_KEY, JSON.stringify(store))
        } else {
          localStorage.removeItem(REMEMBER_KEY)
        }
      } catch {
        /* 存储不可用（隐私模式等）时忽略，不影响登录流程 */
      }
      setLoading(false)
      phaseRef.current = 'success'
      setPhase('success')
      successTimerRef.current = window.setTimeout(onSuccess, SUCCESS_SWITCH_DELAY)
    } catch (err) {
      setLoading(false)
      const reason = err instanceof Error && err.message ? `：${err.message}` : ''
      showError(`登录失败，请检查网络后重试${reason}`)
    }
  }

  const busy = loading || phase === 'success'

  return (
    <div
      className={`login-page${phase === 'success' ? ' login-page--success' : ''}`}
      ref={pageRef}
    >
      {/* ====== 背景动效层 ====== */}
      <canvas ref={canvasRef} className="login-particles" aria-hidden="true" />
      <div className="login-grid" aria-hidden="true" />
      <HexDecor className="login-hex login-hex--1" />
      <HexDecor className="login-hex login-hex--2" />
      <HexDecor className="login-hex login-hex--3" />
      <HexDecor className="login-hex login-hex--4" />
      <div className="login-glow login-glow--a" aria-hidden="true" />
      <div className="login-glow login-glow--b" aria-hidden="true" />
      <div className="login-beam-v login-beam-v--l" aria-hidden="true" />
      <div className="login-beam-v login-beam-v--r" aria-hidden="true" />
      <div className="login-scanline" aria-hidden="true" />
      <i className="login-meteor login-meteor--a" aria-hidden="true" />
      <i className="login-meteor login-meteor--b" aria-hidden="true" />
      <i className="login-meteor login-meteor--c" aria-hidden="true" />
      <div className="login-vignette" aria-hidden="true" />
      <div className="login-ticks login-ticks--l" aria-hidden="true" />
      <div className="login-ticks login-ticks--r" aria-hidden="true" />

      {/* ====== 无人集群装饰动画层：无人机巡航 + 机械狗巡逻（样式见 LoginDrones.css） ====== */}
      <div className="login-drones" aria-hidden="true">
        {/* 巡航轨迹虚线：分别跟随三架无人机尾部 */}
        <i className="login-trail login-trail--1" />
        <i className="login-trail login-trail--2" />
        <i className="login-trail login-trail--3" />

        {/* 四旋翼无人机 ×3：螺旋桨旋转 + 机身悬浮 + 区域巡航；1 号机附探照扫描锥 */}
        <div className="login-drone login-drone--1">
          <i className="login-drone__cone" />
          <span className="login-drone__body">
            <DroneUnit />
          </span>
        </div>
        <div className="login-drone login-drone--2">
          <span className="login-drone__body">
            <DroneUnit />
          </span>
        </div>
        <div className="login-drone login-drone--3">
          <span className="login-drone__body">
            <DroneUnit />
          </span>
        </div>

        {/* 机械狗：腿部摆动 + 躯干起伏 + 往返巡逻掉头 + 尾部信号灯 + 地面投影 */}
        <div className="login-robo">
          <i className="login-robo__shadow" />
          <RoboDogUnit />
          <i className="login-robo__beacon" />
        </div>
      </div>

      {/* HUD 四角边框角标 */}
      <i className="login-corner login-corner--tl" aria-hidden="true" />
      <i className="login-corner login-corner--tr" aria-hidden="true" />
      <i className="login-corner login-corner--bl" aria-hidden="true" />
      <i className="login-corner login-corner--br" aria-hidden="true" />

      {/* ====== 顶部 HUD：状态灯 + 实时时钟 ====== */}
      <header className="login-hud-top" aria-hidden="true">
        <i className="login-dot login-dot--ok" />
        <span className="login-hud-top__clock" ref={clockRef} />
      </header>

      {/* ====== 鼠标准星（延迟跟随） ====== */}
      <div className="login-crosshair" ref={crossRef} aria-hidden="true">
        <span className="login-crosshair__h" />
        <span className="login-crosshair__v" />
        <span className="login-crosshair__ring" />
        <span className="login-crosshair__dot" />
      </div>

      {/* ====== 登录舞台：刻度罗盘 + 电路走线 + 卡片 ====== */}
      <main className="login-stage">
        {/* 刻度罗盘：外圈 conic 刻度 + 双虚线环反向旋转 */}
        <div className="login-dial" aria-hidden="true">
          <span className="login-dial__ticks" />
          <span className="login-dial__ring login-dial__ring--1" />
          <span className="login-dial__ring login-dial__ring--2" />
        </div>

        {/* 双侧电路走线：基础线 + 流光 */}
        <svg
          className="login-circuit login-circuit--l"
          viewBox="0 0 320 220"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path className="login-circuit__base" d="M320 74 H236 L180 30 H6" />
          <path className="login-circuit__base" d="M320 136 H218 L156 188 H30" />
          <path className="login-circuit__flow" d="M320 74 H236 L180 30 H6" />
          <path className="login-circuit__flow login-circuit__flow--slow" d="M320 136 H218 L156 188 H30" />
        </svg>
        <svg
          className="login-circuit login-circuit--r"
          viewBox="0 0 320 220"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path className="login-circuit__base" d="M320 74 H236 L180 30 H6" />
          <path className="login-circuit__base" d="M320 136 H218 L156 188 H30" />
          <path className="login-circuit__flow" d="M320 74 H236 L180 30 H6" />
          <path className="login-circuit__flow login-circuit__flow--slow" d="M320 136 H218 L156 188 H30" />
        </svg>

        <div
          className="login-tilt"
          ref={tiltRef}
          onMouseEnter={cacheTiltRect}
          onMouseMove={handleTilt}
          onMouseLeave={resetTilt}
        >
          <div className={`login-card${phase === 'success' ? ' login-card--success' : ''}`}>
            <div className="login-card__beam" aria-hidden="true" />
            <div className="login-card__inner">
              <span className="login-card__hud login-card__hud--tl" aria-hidden="true" />
              <span className="login-card__hud login-card__hud--tr" aria-hidden="true" />
              <span className="login-card__hud login-card__hud--bl" aria-hidden="true" />
              <span className="login-card__hud login-card__hud--br" aria-hidden="true" />
              <div className="login-head login-stagger login-stagger--1">
                <div className="login-logo" aria-hidden="true">
                  <span className="login-logo__ring login-logo__ring--outer" />
                  <span className="login-logo__ring login-logo__ring--inner" />
                  <IconDrone className="login-logo__drone" />
                </div>
                <h1 className="login-title" data-text={TITLE}>
                  {typed}
                  <span className={`login-title__cursor${typingDone ? ' is-done' : ''}`} />
                </h1>
              </div>

              <form className="login-form" onSubmit={handleSubmit} noValidate>
                <div className="login-field login-stagger login-stagger--2">
                  <IconUser className="login-field__icon" />
                  <input
                    ref={userRef}
                    id="login-username"
                    className="login-field__input"
                    type="text"
                    name="username"
                    placeholder=" "
                    autoComplete="username"
                    spellCheck={false}
                    maxLength={32}
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value)
                      if (error) setError('')
                    }}
                    disabled={busy}
                  />
                  <label htmlFor="login-username" className="login-field__label">
                    用户名
                  </label>
                </div>

                <div className="login-field login-stagger login-stagger--3">
                  <IconLock className="login-field__icon" />
                  <input
                    ref={pwdRef}
                    id="login-password"
                    className="login-field__input"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    placeholder=" "
                    autoComplete="current-password"
                    spellCheck={false}
                    maxLength={64}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (error) setError('')
                    }}
                    disabled={busy}
                  />
                  <label htmlFor="login-password" className="login-field__label">
                    密码
                  </label>
                  <button
                    type="button"
                    className="login-eye"
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={busy}
                  >
                    {showPassword ? <IconEyeOff /> : <IconEye />}
                  </button>
                </div>

                <div className="login-options login-stagger login-stagger--4">
                  <label className="login-remember">
                    <input
                      type="checkbox"
                      checked={rememberUser}
                      onChange={(e) => setRememberUser(e.target.checked)}
                      disabled={busy}
                    />
                    <span className="login-checkbox" aria-hidden="true">
                      <IconCheck />
                    </span>
                    记住用户名
                  </label>
                  <label className="login-remember">
                    <input
                      type="checkbox"
                      checked={rememberPwd}
                      onChange={(e) => setRememberPwd(e.target.checked)}
                      disabled={busy}
                    />
                    <span className="login-checkbox" aria-hidden="true">
                      <IconCheck />
                    </span>
                    记住密码
                  </label>
                </div>

                {error && (
                  <div key={errorSeq} className="login-error" role="alert">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="login-submit login-stagger login-stagger--5"
                  disabled={busy}
                >
                  <span className="login-submit__charge" aria-hidden="true" />
                  {phase === 'success' ? (
                    <IconCheck className="login-submit__ok-icon" />
                  ) : loading ? (
                    <i className="login-spinner" aria-hidden="true" />
                  ) : (
                    '登 录'
                  )}
                </button>
              </form>

              {/* 登录成功过渡遮罩：短暂展示后由 App 切换到主应用 */}
              {phase === 'success' && (
                <div className="login-success-overlay">
                  <div className="login-success-overlay__badge">
                    <span className="login-success-overlay__ring" aria-hidden="true" />
                    <span className="login-success-overlay__ring" aria-hidden="true" />
                    <IconCheck className="login-success-overlay__check" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* 登录成功：全屏冲击波（双环错相扩散） */}
      {phase === 'success' && (
        <div className="login-shockwave" aria-hidden="true">
          <i className="login-shockwave__ring" />
          <i className="login-shockwave__ring login-shockwave__ring--2" />
        </div>
      )}
    </div>
  )
}

/*
 * credentials.ts —— 「记住密码」凭据的本地存取与编解码。
 * 自 LoginPage.tsx 按功能拆分：逻辑未改动，仅移动位置。
 */


export const REMEMBER_KEY = 'gsc_remember_credentials'

/** base64 轻度混淆（UTF-8 安全），仅防肉眼直读，非加密手段 */
export function encodeText(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)))
}

export function decodeText(s: string): string {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)))
  } catch {
    return ''
  }
}

/**
 * 计算登录页初始值（2026-09-18 约定）：
 * 每次刷新页面，用户名/密码均固定填充初始值（DEFAULT_CREDENTIALS），
 * 且「记住用户名」「记住密码」默认勾选；不读取本地保存的记录。
 */
export function computeInitialCredentials(): {
  username: string
  password: string
  rememberUser: boolean
  rememberPwd: boolean
} {
  return { ...DEFAULT_CREDENTIALS, rememberUser: true, rememberPwd: true }
}
