/**
 * LoginPage —— 登录页「终极科技版」（仅账号密码登录，无注册 / 忘记密码入口）。
 *
 * - 登录走 loginWithCredentials()：用户名原样上送，密码字段固定传值（见 api/auth.ts）；
 * - 「记住用户名」「记住密码」两个独立选项，分别 localStorage 持久化（密码 base64 轻度混淆），
 *   每次进入登录页自动回填，无保存记录时回落联调默认账号（b / 1）；
 * - 视觉：深海军蓝 + 青色 HUD 科技风。动效清单：
 *   Canvas：星链粒子（鼠标排斥/连线/拖尾）、闪烁星空（十字光芒）、底部全息波浪地形、
 *           中心 3D 线框星球（经纬网 + 双卫星轨道，登录成功粒子向球心汇聚）；
 *   DOM/CSS：透视网格、流星、扫描线、六边形、能量光柱、流动刻度、HUD 四角角标、
 *           顶部状态灯 + 实时时钟、鼠标准星（延迟跟随）、刻度罗盘环、双侧电路走线流光、
 *           卡片 3D 视差 + 镜面高光 + conic 流光描边 + HUD 角标 + 入场扫描、
 *           打字机标题 + glitch 残影、输入框浮动标签 + 聚焦光线、按钮充能条 + 掠光、
 *           登录成功全屏冲击波 + 卡片扩散徽标。
 *   页面无多余文案（无英文装饰文本）：仅标题 / 输入框 / 两个记住选项 / 登录按钮。
 */
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, MouseEvent } from 'react'
import { DEFAULT_CREDENTIALS, loginWithCredentials } from '../../api/auth'
import './LoginPage.css'

/* ---------- 「记住用户名和密码」持久化 ---------- */

const REMEMBER_KEY = 'gsc_remember_credentials'

/** base64 轻度混淆（UTF-8 安全），仅防肉眼直读，非加密手段 */
function encodeText(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)))
}

function decodeText(s: string): string {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)))
  } catch {
    return ''
  }
}

/**
 * 计算登录页初始值：优先取本地保存的凭据（用户名/密码可分别保存，缺项补默认值），
 * 无任何保存记录时回落到联调默认账号（b / 1）——保证每次进入页面都有预填内容。
 */
function computeInitialCredentials(): {
  username: string
  password: string
  rememberUser: boolean
  rememberPwd: boolean
} {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY)
    if (!raw) return { ...DEFAULT_CREDENTIALS, rememberUser: true, rememberPwd: true }
    const parsed = JSON.parse(raw) as { username?: unknown; password?: unknown }
    const username = typeof parsed.username === 'string' ? parsed.username : ''
    const password = typeof parsed.password === 'string' ? decodeText(parsed.password) : ''
    return {
      // 只保存了用户名/密码其中一项时，另一项回落到默认账号对应值，便于直接登录
      username: username || DEFAULT_CREDENTIALS.username,
      password: password || DEFAULT_CREDENTIALS.password,
      rememberUser: true,
      rememberPwd: true,
    }
  } catch {
    // 存储内容损坏等异常：回落默认账号，勾选状态保持默认全勾
    return { ...DEFAULT_CREDENTIALS, rememberUser: true, rememberPwd: true }
  }
}

/* ---------- 内联 SVG 图标（currentColor，随父级颜色 / 发光变化） ---------- */

function IconDrone({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    >
      <circle cx="24" cy="24" r="4.6" />
      <path d="M21 21 14.5 14.5 M27 21 33.5 14.5 M21 27 14.5 33.5 M27 27 33.5 33.5" />
      <circle cx="11" cy="11" r="5.2" strokeWidth="1.8" opacity="0.85" />
      <circle cx="37" cy="11" r="5.2" strokeWidth="1.8" opacity="0.85" />
      <circle cx="11" cy="37" r="5.2" strokeWidth="1.8" opacity="0.85" />
      <circle cx="37" cy="37" r="5.2" strokeWidth="1.8" opacity="0.85" />
    </svg>
  )
}

function IconUser({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20c1.6-3.4 4.2-5 7.5-5s5.9 1.6 7.5 5" />
    </svg>
  )
}

function IconLock({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      <circle cx="12" cy="15.2" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconEye({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconEyeOff({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="M4 4l16 16" />
      <path d="M9.9 5.9A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17.4 17.4 0 0 1-3.2 3.9M6.1 8A17 17 0 0 0 2.5 12S6 18.5 12 18.5a9.6 9.6 0 0 0 3.3-.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  )
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  )
}

/* ---------- 背景六边形装饰（线框，CSS 动画漂浮旋转） ---------- */

function HexDecor({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <polygon points="50,4 90,27 90,73 50,96 10,73 10,27" />
    </svg>
  )
}

/* ---------- 登录页组件 ---------- */

/** 标题全文（打字机逐字显示，glitch 残影取 data-text 全文） */
const TITLE = '智能无人集群控制系统'

/** 登录成功后延迟切换到主应用的等待时长（ms），留出冲击波 + 徽标动画时间 */
const SUCCESS_SWITCH_DELAY = 950

/** 系统是否偏好「减少动态效果」 */
function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

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

  /* ====== 背景主 Canvas：星空 / 星链 / 波浪地形 / 3D 线框星球 ====== */
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctxMaybe = canvas.getContext('2d')
    if (!ctxMaybe) return
    const ctx: CanvasRenderingContext2D = ctxMaybe

    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    let raf = 0
    let w = 0
    let h = 0
    interface Particle {
      x: number
      y: number
      /** 上一帧位置：用于绘制拖尾 */
      px: number
      py: number
      vx: number
      vy: number
      r: number
    }
    /** 背景星星：固定位置，正弦闪烁（大星星带十字光芒） */
    interface Star {
      x: number
      y: number
      r: number
      phase: number
      speed: number
    }
    let pts: Particle[] = []
    let stars: Star[] = []

    // 鼠标位置（canvas 坐标；移出窗口时置远点，等效无交互）
    const pointer = { x: -1e4, y: -1e4 }
    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = e.clientX - rect.left
      pointer.y = e.clientY - rect.top
    }
    const onPointerOut = (e: PointerEvent) => {
      if (!e.relatedTarget) {
        pointer.x = -1e4
        pointer.y = -1e4
      }
    }

    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.max(1, Math.floor(w * DPR))
      canvas.height = Math.max(1, Math.floor(h * DPR))
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
      // 粒子数量随面积自适应（封顶 110，保证低端机流畅）
      const count = Math.min(110, Math.floor((w * h) / 19000))
      pts = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        px: 0,
        py: 0,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.6 + 0.4,
      }))
      for (const p of pts) {
        p.px = p.x
        p.py = p.y
      }
      // 星星：数量随面积自适应（封顶 170）
      const starCount = Math.min(170, Math.floor((w * h) / 11000))
      stars = Array.from({ length: starCount }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.5 + 0.3,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.8,
      }))
    }
    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerout', onPointerOut)

    /* ----- 3D 线框星球：经纬网投影 ----- */
    const TILT = 0.42 // 绕 X 轴倾角（rad），让球微倾更立体
    const FOCAL = 950 // 透视焦距
    const sinT = Math.sin(TILT)
    const cosT = Math.cos(TILT)

    /**
     * 球面点 (latDeg, lonDeg) 旋转投影到屏幕坐标。
     * 返回 null 表示点在球背面之外不可见（由调用方按 z 分量控制透明度）。
     */
    function project(latDeg: number, lonDeg: number, rotY: number, R: number, cx: number, cy: number) {
      const lat = (latDeg * Math.PI) / 180
      const lon = (lonDeg * Math.PI) / 180 + rotY
      const x0 = Math.cos(lat) * Math.sin(lon)
      const y0 = Math.sin(lat)
      const z0 = Math.cos(lat) * Math.cos(lon)
      // 绕 X 轴倾斜
      const y1 = y0 * cosT - z0 * sinT
      const z1 = y0 * sinT + z0 * cosT
      const s = FOCAL / (FOCAL + z1 * R)
      return { px: cx + x0 * R * s, py: cy + y1 * R * s, z: z1 }
    }

    function drawSphere(t: number) {
      const R = Math.min(Math.min(w, h) * 0.36, 350)
      const cx = w / 2
      const cy = h / 2
      const rotY = t * 0.14

      ctx.lineWidth = 1
      // 纬线（赤道最亮）
      const lats = [-60, -30, 0, 30, 60]
      for (const lat of lats) {
        const isEquator = lat === 0
        let started = false
        ctx.beginPath()
        for (let lon = 0; lon <= 360; lon += 8) {
          const p = project(lat, lon, rotY, R, cx, cy)
          if (!p) continue
          const front = p.z < 0
          const alpha = (isEquator ? 0.3 : 0.14) * (front ? 1 : 0.22)
          ctx.strokeStyle = `rgba(135, 235, 255, ${alpha.toFixed(3)})`
          // 分段绘制以便逐段设置透明度
          if (started) {
            ctx.stroke()
            ctx.beginPath()
            ctx.moveTo(p.px, p.py)
          } else {
            ctx.moveTo(p.px, p.py)
            started = true
          }
          // 先画到当前点（下轮循环开新段）——这里直接 lineTo
          const next = project(lat, lon + 8, rotY, R, cx, cy)
          if (next) ctx.lineTo(next.px, next.py)
        }
        ctx.stroke()
      }
      // 经线
      for (let lon = 0; lon < 360; lon += 30) {
        let started = false
        ctx.beginPath()
        for (let lat = -88; lat <= 88; lat += 8) {
          const p = project(lat, lon, rotY, R, cx, cy)
          if (!p) continue
          const front = p.z < 0
          ctx.strokeStyle = `rgba(135, 235, 255, ${(0.12 * (front ? 1 : 0.2)).toFixed(3)})`
          if (started) {
            ctx.stroke()
            ctx.beginPath()
            ctx.moveTo(p.px, p.py)
          } else {
            ctx.moveTo(p.px, p.py)
            started = true
          }
          const next = project(lat + 8, lon, rotY, R, cx, cy)
          if (next) ctx.lineTo(next.px, next.py)
        }
        ctx.stroke()
      }
      // 双卫星轨道点：两条不同倾角的圆轨道 + 发光点 + 拖尾
      const orbits = [
        { rr: R * 1.28, speed: 0.55, tilt: 0.9 },
        { rr: R * 1.12, speed: -0.38, tilt: 1.9 },
      ]
      for (const o of orbits) {
        const a = t * o.speed
        const so = Math.sin(o.tilt)
        const co = Math.cos(o.tilt)
        // 轨道线（椭圆投影近似）
        ctx.strokeStyle = 'rgba(135, 235, 255, 0.1)'
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let k = 0; k <= 64; k++) {
          const th = (k / 64) * Math.PI * 2
          const ox = Math.cos(th) * o.rr
          const oy = Math.sin(th) * o.rr * so
          const oz = Math.sin(th) * o.rr * co
          const s = FOCAL / (FOCAL + oz)
          const px = cx + ox * s
          const py = cy + oy * s
          if (k === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.stroke()
        // 卫星点（前后按 z 调透明度）+ 短拖尾
        for (let trail = 0; trail < 6; trail++) {
          const ta = a - trail * 0.05 * Math.sign(o.speed)
          const ox = Math.cos(ta) * o.rr
          const oy = Math.sin(ta) * o.rr * so
          const oz = Math.sin(ta) * o.rr * co
          const s = FOCAL / (FOCAL + oz)
          const px = cx + ox * s
          const py = cy + oy * s
          const fade = (1 - trail / 6) * (oz < 0 ? 1 : 0.4)
          ctx.fillStyle = `rgba(160, 245, 255, ${(0.9 * fade).toFixed(3)})`
          ctx.beginPath()
          ctx.arc(px, py, trail === 0 ? 2.6 : 1.6 * fade, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    /* ----- 底部全息波浪地形：多层渐隐正弦波 ----- */
    function drawWaves(t: number) {
      ctx.lineWidth = 1.2
      for (let i = 0; i < 4; i++) {
        const baseY = h * (0.72 + i * 0.07)
        const amp = 12 + i * 7
        const speed = 0.5 + i * 0.22
        const alpha = 0.2 - i * 0.035
        const color = i % 2 === 0 ? '135, 235, 255' : '46, 230, 197'
        ctx.strokeStyle = `rgba(${color}, ${Math.max(alpha, 0.05).toFixed(3)})`
        ctx.shadowColor = `rgba(${color}, 0.5)`
        ctx.shadowBlur = 6
        ctx.beginPath()
        for (let x = 0; x <= w; x += 10) {
          const y =
            baseY +
            Math.sin(x * 0.006 + t * speed + i * 2.1) * amp +
            Math.sin(x * 0.017 - t * speed * 0.6) * amp * 0.35
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
        ctx.shadowBlur = 0
      }
    }

    const LINK = 130 // 粒子间连线距离阈值（px）
    const CURSOR = 170 // 鼠标连线/排斥半径（px）
    const tick = () => {
      ctx.clearRect(0, 0, w, h)
      const now = performance.now() / 1000
      const success = phaseRef.current === 'success'
      const cx = w / 2
      const cy = h / 2

      // 鼠标排斥：光标附近的粒子被轻推散开，形成"涟漪空腔"
      for (const p of pts) {
        const dx = p.x - pointer.x
        const dy = p.y - pointer.y
        const d2 = dx * dx + dy * dy
        if (d2 > 0.01 && d2 < 130 * 130) {
          const d = Math.sqrt(d2)
          const f = ((130 - d) / 130) * 0.9
          p.x += (dx / d) * f
          p.y += (dy / d) * f
        }
      }

      for (const p of pts) {
        // 记录移动前位置，供拖尾绘制
        p.px = p.x
        p.py = p.y
        if (success) {
          // 登录成功：星链粒子向球心汇聚（吸入效应）
          const dx = cx - p.x
          const dy = cy - p.y
          const d = Math.hypot(dx, dy) || 1
          if (d > 46) {
            p.x += (dx / d) * 2.4
            p.y += (dy / d) * 2.4
          }
          p.vx *= 0.9
          p.vy *= 0.9
        } else {
          p.x += p.vx
          p.y += p.vy
        }
        if (p.x < -20) p.x = w + 20
        else if (p.x > w + 20) p.x = -20
        if (p.y < -20) p.y = h + 20
        else if (p.y > h + 20) p.y = -20
      }

      // 粒子间连线
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j]!
          const dx = a.x - b.x
          const dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < LINK * LINK) {
            const alpha = (1 - Math.sqrt(d2) / LINK) * 0.28
            ctx.strokeStyle = `rgba(135, 235, 255, ${alpha.toFixed(3)})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
        // 粒子 → 光标连线（星链向光标汇聚）
        const cdx = a.x - pointer.x
        const cdy = a.y - pointer.y
        const cd2 = cdx * cdx + cdy * cdy
        if (cd2 < CURSOR * CURSOR) {
          const alpha = (1 - Math.sqrt(cd2) / CURSOR) * 0.45
          ctx.strokeStyle = `rgba(160, 245, 255, ${alpha.toFixed(3)})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(pointer.x, pointer.y)
          ctx.stroke()
        }
      }

      // 背景星星：正弦闪烁，大星星附十字光芒
      for (const s of stars) {
        const tw = 0.25 + 0.75 * Math.abs(Math.sin(now * s.speed + s.phase))
        ctx.fillStyle = `rgba(214, 248, 255, ${(tw * 0.8).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
        if (s.r > 1.2) {
          const len = s.r * 4 * tw
          ctx.strokeStyle = `rgba(160, 245, 255, ${(tw * 0.4).toFixed(3)})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(s.x - len, s.y)
          ctx.lineTo(s.x + len, s.y)
          ctx.moveTo(s.x, s.y - len)
          ctx.lineTo(s.x, s.y + len)
          ctx.stroke()
        }
      }

      drawWaves(now)
      drawSphere(now)

      for (const p of pts) {
        // 短拖尾：上一帧位置 → 当前位置连线，增强"流动感"
        ctx.strokeStyle = 'rgba(135, 235, 255, 0.3)'
        ctx.lineWidth = p.r
        ctx.beginPath()
        ctx.moveTo(p.px, p.py)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
        ctx.fillStyle = 'rgba(135, 235, 255, 0.75)'
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }

      // 光标节点：小亮点 + 呼吸外圈
      if (pointer.x > -1e3 && !success) {
        ctx.fillStyle = 'rgba(200, 250, 255, 0.9)'
        ctx.beginPath()
        ctx.arc(pointer.x, pointer.y, 2.2, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(135, 235, 255, 0.35)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(pointer.x, pointer.y, 9, 0, Math.PI * 2)
        ctx.stroke()
      }

      raf = requestAnimationFrame(tick)
    }
    // 尊重系统「减少动态效果」设置：仅绘制一帧静态画面
    if (prefersReducedMotion()) {
      tick()
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    } else {
      raf = requestAnimationFrame(tick)
    }

    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerout', onPointerOut)
    }
  }, [])

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

  /* ====== 鼠标准星：lerp 延迟跟随 ====== */
  useEffect(() => {
    if (prefersReducedMotion()) return
    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const cur = { x: target.x, y: target.y }
    let raf = 0
    let visible = false
    const onMove = (e: PointerEvent) => {
      target.x = e.clientX
      target.y = e.clientY
      if (!visible && crossRef.current) {
        crossRef.current.style.opacity = '1'
        visible = true
      }
    }
    const loop = () => {
      cur.x += (target.x - cur.x) * 0.16
      cur.y += (target.y - cur.y) * 0.16
      if (crossRef.current) {
        crossRef.current.style.transform = `translate3d(${cur.x.toFixed(1)}px, ${cur.y.toFixed(1)}px, 0)`
      }
      raf = requestAnimationFrame(loop)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
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

  /* 卡片 3D 视差：随鼠标轻微倾斜 + 镜面高光跟随（写 CSS 变量，避免逐帧 setState） */
  const handleTilt = (e: MouseEvent<HTMLDivElement>) => {
    const el = tiltRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    el.style.setProperty('--tilt-x', `${((0.5 - py) * 5).toFixed(2)}deg`)
    el.style.setProperty('--tilt-y', `${((px - 0.5) * 7).toFixed(2)}deg`)
    el.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`)
    el.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`)
  }

  const resetTilt = () => {
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
      await loginWithCredentials(name)
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
    <div className="login-page" ref={pageRef}>
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