import { useEffect, useRef } from 'react'

/** 系统偏好「减少动态效果」时返回 true（打字机/动画降级依据） */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* ====== 性能参数 ====== */

/** Canvas 设备像素预算（宽×高）：超过则按比例降低有效 DPR（背景层轻微降采样，视觉几乎无差） */
const MAX_CANVAS_PIXELS = 2560 * 1440

/** 帧率监测：采样窗口帧数与「吃力」判定阈值（平均帧间隔毫秒） */
const FPS_SAMPLE_FRAMES = 90
const FPS_SLOW_MS = 30

/** 质量档位（帧率不足时逐级下降，只降不升，避免在档位间反复横跳） */
type Quality = 'high' | 'medium' | 'low'

interface QualityProfile {
  /** 每 N px² 放置一个粒子 / 星星（越大越稀疏） */
  particleArea: number
  starArea: number
  particleCap: number
  starCap: number
  /** 球体线框采样步长（deg，越大线段越少） */
  latLonStep: number
  meridianStep: number
  /** 波浪地形层数 */
  waveLayers: number
  /** 大星星是否绘制十字光芒 */
  starRays: boolean
}

const QUALITY_PROFILES: Record<Quality, QualityProfile> = {
  high: {
    particleArea: 19000,
    starArea: 11000,
    particleCap: 80,
    starCap: 120,
    latLonStep: 8,
    meridianStep: 8,
    waveLayers: 4,
    starRays: true,
  },
  medium: {
    particleArea: 30000,
    starArea: 16500,
    particleCap: 56,
    starCap: 86,
    latLonStep: 12,
    meridianStep: 12,
    waveLayers: 3,
    starRays: true,
  },
  low: {
    particleArea: 46000,
    starArea: 25000,
    particleCap: 34,
    starCap: 56,
    latLonStep: 16,
    meridianStep: 16,
    waveLayers: 2,
    starRays: false,
  },
}

/*
 * useLoginCanvas —— 登录页背景主 Canvas（星空 / 星链 / 波浪地形 / 3D 线框星球）。
 * phaseRef 由页面持有并镜像当前阶段，动画循环直接读取以避免 effect 重建中断动画。
 * 性能策略（2026-09-18 卡顿优化）：
 * - 设备像素预算：高 DPR / 4K 大屏降低有效 DPR，大幅削减每帧填充开销；
 * - 帧率监测自动降档（high → medium → low，只降不升）；
 * - resize 防抖且尺寸未变不重建；pointermove 缓存 rect，避免逐次布局查询；
 * - 登录成功（phase=success）立即停帧保留最后一帧，主线程让给切换动画与主应用挂载。
 */
export function useLoginCanvas(phaseRef: { current: 'idle' | 'success' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctxMaybe = canvas.getContext('2d')
    if (!ctxMaybe) return
    const ctx: CanvasRenderingContext2D = ctxMaybe

    let quality: Quality = 'high'
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

    // 鼠标位置（canvas 坐标；rect 缓存，resize/scroll 时刷新，避免每次 pointermove 布局查询）
    const pointer = { x: -1e4, y: -1e4 }
    let canvasRect = canvas.getBoundingClientRect()
    const refreshRect = () => {
      canvasRect = canvas.getBoundingClientRect()
    }
    const onPointerMove = (e: PointerEvent) => {
      pointer.x = e.clientX - canvasRect.left
      pointer.y = e.clientY - canvasRect.top
    }
    const onPointerOut = (e: PointerEvent) => {
      if (!e.relatedTarget) {
        pointer.x = -1e4
        pointer.y = -1e4
      }
    }

    const profile = () => QUALITY_PROFILES[quality]

    /** 按当前质量档位重建粒子与星星 */
    const rebuild = () => {
      const p = profile()
      // 粒子数量随面积自适应（封顶 80，保证低端机流畅）
      const count = Math.min(p.particleCap, Math.floor((w * h) / p.particleArea))
      pts = Array.from({ length: count }, () => {
        const x = Math.random() * w
        const y = Math.random() * h
        return {
          x,
          y,
          px: x,
          py: y,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          r: Math.random() * 1.6 + 0.4,
        }
      })
      // 星星：数量随面积自适应
      const starCount = Math.min(p.starCap, Math.floor((w * h) / p.starArea))
      stars = Array.from({ length: starCount }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.5 + 0.3,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.8,
      }))
    }

    const resize = () => {
      const cw = canvas.clientWidth
      const ch = canvas.clientHeight
      if (cw === w && ch === h && pts.length > 0) return // 尺寸未变化不重建
      w = cw
      h = ch
      // 有效 DPR 服从像素预算：高 DPR / 4K 大屏显著降低填充开销（背景层轻微降采样）
      const dpr = Math.max(
        1,
        Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, w * h))),
      )
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      refreshRect()
      rebuild()
    }
    // resize 防抖：窗口拖拽过程不连续重建
    let resizeTimer = 0
    const onResize = () => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(resize, 120)
    }
    resize()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', refreshRect, { passive: true })
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerout', onPointerOut)

    /* ----- 3D 线框星球：经纬网投影 ----- */
    const TILT = 0.42 // 绕 X 轴倾角（rad），让球微倾更立体
    const FOCAL = 950 // 透视焦距
    const sinT = Math.sin(TILT)
    const cosT = Math.cos(TILT)

    /** 球面点 (latDeg, lonDeg) 旋转投影到屏幕坐标（z<0 为正面，透明度由调用方分档控制） */
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
      const p = profile()
      const R = Math.min(Math.min(w, h) * 0.36, 350)
      const cx = w / 2
      const cy = h / 2
      const rotY = t * 0.14

      ctx.lineWidth = 1
      // 纬线：按前/背面分两组批量 stroke（性能：两档透明度替代逐段 stroke 数百次调用）
      const lats = [-60, -30, 0, 30, 60]
      for (const lat of lats) {
        const isEquator = lat === 0
        const frontPath = new Path2D()
        const backPath = new Path2D()
        for (let lon = 0; lon < 360; lon += p.latLonStep) {
          const a = project(lat, lon, rotY, R, cx, cy)
          const b = project(lat, lon + p.latLonStep, rotY, R, cx, cy)
          const path = a.z < 0 && b.z < 0 ? frontPath : backPath
          path.moveTo(a.px, a.py)
          path.lineTo(b.px, b.py)
        }
        ctx.strokeStyle = `rgba(135, 235, 255, ${isEquator ? 0.3 : 0.14})`
        ctx.stroke(frontPath)
        ctx.strokeStyle = `rgba(135, 235, 255, ${isEquator ? 0.066 : 0.031})`
        ctx.stroke(backPath)
      }
      // 经线：同样按前/背面分组批量 stroke
      for (let lon = 0; lon < 360; lon += 30) {
        const frontPath = new Path2D()
        const backPath = new Path2D()
        for (let lat = -88; lat <= 88; lat += p.meridianStep) {
          const a = project(lat, lon, rotY, R, cx, cy)
          const b = project(lat + p.meridianStep, lon, rotY, R, cx, cy)
          const path = a.z < 0 && b.z < 0 ? frontPath : backPath
          path.moveTo(a.px, a.py)
          path.lineTo(b.px, b.py)
        }
        ctx.strokeStyle = 'rgba(135, 235, 255, 0.12)'
        ctx.stroke(frontPath)
        ctx.strokeStyle = 'rgba(135, 235, 255, 0.024)'
        ctx.stroke(backPath)
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
      const layers = profile().waveLayers
      ctx.lineWidth = 1.2
      for (let i = 0; i < layers; i++) {
        const baseY = h * (0.72 + i * 0.07)
        const amp = 12 + i * 7
        const speed = 0.5 + i * 0.22
        const alpha = 0.2 - i * 0.035
        const color = i % 2 === 0 ? '135, 235, 255' : '46, 230, 197'
        // 性能：不使用 shadowBlur 发光（大面积高斯模糊开销大），透明度略调补偿
        ctx.strokeStyle = `rgba(${color}, ${Math.max(alpha + 0.06, 0.09).toFixed(3)})`
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
      }
    }

    const LINK = 130 // 粒子间连线距离阈值（px）
    const CURSOR = 170 // 鼠标连线/排斥半径（px）

    // 帧率监测（性能自适应降档）
    let frameCosts: number[] = []
    let lastFrame = performance.now()

    const tick = () => {
      // 登录成功：立即停帧（保留最后一帧画面），主线程让给切换动画与主应用挂载
      if (phaseRef.current === 'success') {
        raf = 0
        return
      }

      const frameStart = performance.now()
      const delta = frameStart - lastFrame
      lastFrame = frameStart
      // 忽略标签页切走再切回的超长间隔，避免误判降档
      if (delta < 250) frameCosts.push(delta)
      if (frameCosts.length >= FPS_SAMPLE_FRAMES) {
        const avg = frameCosts.reduce((s, v) => s + v, 0) / frameCosts.length
        frameCosts.length = 0
        if (avg > FPS_SLOW_MS) {
          if (quality === 'high') {
            quality = 'medium'
            rebuild()
          } else if (quality === 'medium') {
            quality = 'low'
            rebuild()
          }
        }
      }

      const p = profile()
      ctx.clearRect(0, 0, w, h)
      const now = frameStart / 1000

      // 鼠标排斥：光标附近的粒子被轻推散开，形成“涟漪空腔”
      for (const pt of pts) {
        const dx = pt.x - pointer.x
        const dy = pt.y - pointer.y
        const d2 = dx * dx + dy * dy
        if (d2 > 0.01 && d2 < 130 * 130) {
          const d = Math.sqrt(d2)
          const f = ((130 - d) / 130) * 0.9
          pt.x += (dx / d) * f
          pt.y += (dy / d) * f
        }
      }

      for (const pt of pts) {
        // 记录移动前位置，供拖尾绘制
        pt.px = pt.x
        pt.py = pt.y
        pt.x += pt.vx
        pt.y += pt.vy
        if (pt.x < -20) pt.x = w + 20
        else if (pt.x > w + 20) pt.x = -20
        if (pt.y < -20) pt.y = h + 20
        else if (pt.y > h + 20) pt.y = -20
      }

      // 粒子连线：按距离分 3 档透明度收集到 Path2D，各批量 stroke 一次（性能）
      const linkBuckets: Path2D[] = [new Path2D(), new Path2D(), new Path2D()]
      const cursorLinks = new Path2D()
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j]!
          const dx = a.x - b.x
          const dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < LINK * LINK) {
            const t01 = 1 - Math.sqrt(d2) / LINK
            const bucket = t01 > 0.66 ? 0 : t01 > 0.33 ? 1 : 2
            const path = linkBuckets[bucket]!
            path.moveTo(a.x, a.y)
            path.lineTo(b.x, b.y)
          }
        }
        // 粒子 → 光标连线（星链向光标汇聚，统一中档透明度）
        const cdx = a.x - pointer.x
        const cdy = a.y - pointer.y
        const cd2 = cdx * cdx + cdy * cdy
        if (cd2 < CURSOR * CURSOR) {
          cursorLinks.moveTo(a.x, a.y)
          cursorLinks.lineTo(pointer.x, pointer.y)
        }
      }
      ctx.lineWidth = 1
      const linkAlphas = ['rgba(135, 235, 255, 0.36)', 'rgba(135, 235, 255, 0.24)', 'rgba(135, 235, 255, 0.1)']
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = linkAlphas[k]!
        ctx.stroke(linkBuckets[k]!)
      }
      ctx.strokeStyle = 'rgba(160, 245, 255, 0.3)'
      ctx.stroke(cursorLinks)

      // 背景星星：按闪烁亮度分 3 档批量绘制（性能：减少 fill/stroke 调用与字符串拼接）
      const starDots: Path2D[] = [new Path2D(), new Path2D(), new Path2D()]
      const starRays: Path2D[] = [new Path2D(), new Path2D(), new Path2D()]
      for (const s of stars) {
        const tw = 0.25 + 0.75 * Math.abs(Math.sin(now * s.speed + s.phase))
        const bucket = tw > 0.72 ? 0 : tw > 0.45 ? 1 : 2
        const dots = starDots[bucket]!
        dots.moveTo(s.x + s.r, s.y)
        dots.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        if (p.starRays && s.r > 1.2) {
          const len = s.r * 4 * tw
          const rays = starRays[bucket]!
          rays.moveTo(s.x - len, s.y)
          rays.lineTo(s.x + len, s.y)
          rays.moveTo(s.x, s.y - len)
          rays.lineTo(s.x, s.y + len)
        }
      }
      const starDotAlphas = ['rgba(214, 248, 255, 0.78)', 'rgba(214, 248, 255, 0.5)', 'rgba(214, 248, 255, 0.24)']
      const starRayAlphas = ['rgba(160, 245, 255, 0.38)', 'rgba(160, 245, 255, 0.24)', 'rgba(160, 245, 255, 0.12)']
      ctx.lineWidth = 1
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = starDotAlphas[k]!
        ctx.fill(starDots[k]!)
        ctx.strokeStyle = starRayAlphas[k]!
        ctx.stroke(starRays[k]!)
      }

      drawWaves(now)
      drawSphere(now)

      // 短拖尾 + 粒子点：分别合并为单 path 批量绘制（性能）
      const trailPath = new Path2D()
      const dotPath = new Path2D()
      for (const pt of pts) {
        trailPath.moveTo(pt.px, pt.py)
        trailPath.lineTo(pt.x, pt.y)
        dotPath.moveTo(pt.x + pt.r, pt.y)
        dotPath.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2)
      }
      ctx.strokeStyle = 'rgba(135, 235, 255, 0.3)'
      ctx.lineWidth = 1
      ctx.stroke(trailPath)
      ctx.fillStyle = 'rgba(135, 235, 255, 0.75)'
      ctx.fill(dotPath)

      // 光标节点：小亮点 + 呼吸外圈
      if (pointer.x > -1e3) {
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
      window.clearTimeout(resizeTimer)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', refreshRect)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerout', onPointerOut)
    }
  }, [])
  return canvasRef
}