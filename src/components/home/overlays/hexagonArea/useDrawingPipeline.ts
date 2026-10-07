/**
 * @file useDrawingPipeline.ts
 * @description HexagonAreaOverlay 绘制管线 Hook —— 按下/拖动/rAF 合帧绘制/光标跟随/定格（自 HexagonAreaOverlay.tsx 拆出）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { useCallback, useLayoutEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { MIN_RADIUS } from './hooks'
import { BR_UNIT, hexVertices, hexPathD, type HexGeometry } from './rendering'

export interface UseDrawingPipelineArgs {
  /** 视口尺寸（resize 跟随）：蒙版外矩形与半径上限均依赖 */
  size: { w: number; h: number }
  /** 六边形几何 ref（拖动期间零 setState，直写后命令式重绘） */
  hexRef: { current: HexGeometry | null }
  /** 定格时低频 setState（触发定格 UI：按钮条/信息卡） */
  setHex: Dispatch<SetStateAction<HexGeometry | null>>
  /** 拖动开始/结束切换（window mouseup 兜底依赖） */
  setDragging: Dispatch<SetStateAction<boolean>>
}

/** 绘制管线：按住左键拉伸 → rAF 合帧命令式绘制 → 松开定格（含光标跟随与样式强制重算）。 */
export function useDrawingPipeline({ size, hexRef, setHex, setDragging }: UseDrawingPipelineArgs) {
  // 按下点（半径基准）：按下点 → 当前光标的距离即半径
  const anchorRef = useRef<{ x: number; y: number } | null>(null)
  // 最新光标位置（mousemove 只写这里，rAF 回调读取最新值合帧绘制）
  const mouseRef = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef(0)
  // rAF 句柄：body cursor 双跳变强制浏览器重算鼠标样式…
  const cursorRafRef = useRef(0)
  // 半径上限（中心随光标移动，取保守视口半边，保证六边形基本保持在视口内）
  const maxRadius = Math.max(MIN_RADIUS, Math.min(size.w, size.h) / 2 - 24)
  const maxRadiusRef = useRef(maxRadius)

  // 视口尺寸 ref：rAF/resize 回调读取最新值，避免闭包过期（渲染后统一同步）
  const viewRef = useRef(size)
  // 命令式 DOM 引用：蒙版/六边形/顶点/悬浮图标（拖动期间绕过 React 直写属性）
  const maskRef = useRef<SVGPathElement | null>(null)
  const polyRef = useRef<SVGPathElement | null>(null)
  const dotsRef = useRef<(SVGCircleElement | null)[]>([])
  const cursorImgRef = useRef<HTMLImageElement | null>(null)

  /** 命令式按顶点绘制一帧（蒙版 + 本体 + 顶点圆点）：直写 d/cx/cy 属性 */
  const drawVertices = useCallback((vs: { x: number; y: number }[]) => {
    const d = hexPathD(vs)
    if (maskRef.current) {
      maskRef.current.setAttribute(
        'd',
        `M 0 0 H ${viewRef.current.w} V ${viewRef.current.h} H 0 Z ${d}`,
      )
    }
    if (polyRef.current) polyRef.current.setAttribute('d', d)
    dotsRef.current.forEach((dot, i) => {
      if (!dot) return
      dot.setAttribute('cx', String(vs[i].x))
      dot.setAttribute('cy', String(vs[i].y))
    })
  }, [])

  const drawFrame = useCallback(
    (h: HexGeometry) => {
      drawVertices(hexVertices(h))
    },
    [drawVertices],
  )
  const drawRef = useRef(drawFrame)

  // 渲染后统一同步视口尺寸/半径上限/绘制实现（rAF/resize 回调读取最新值，避免闭包过期）
  useLayoutEffect(() => {
    maxRadiusRef.current = maxRadius
    viewRef.current = size
    drawRef.current = drawFrame
  })

  /** 悬浮图标跟随（命令式）：保留 CSS 居中 translate(-50%,-50%)，仅追加位移 */
  const moveCursor = useCallback((x: number, y: number) => {
    const el = cursorImgRef.current
    if (el) {
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
      el.style.opacity = '1'
    }
  }, [])

  /** rAF 合帧：一帧内多次 mousemove 只在下一帧绘制一次最新几何（拖动路径） */
  const scheduleDragDraw = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const anchor = anchorRef.current
      const m = mouseRef.current
      if (!anchor || !m) return
      // 半径 = 按下点到光标的距离（远离放大、靠近缩小，钳制上限）
      const r = Math.min(Math.hypot(m.x - anchor.x, m.y - anchor.y), maxRadiusRef.current)
      const h = { cx: m.x - r * BR_UNIT.x, cy: m.y - r * BR_UNIT.y, r }
      hexRef.current = h
      drawRef.current(h)
      // 图标与右下顶点同帧同步（同一光标位置），保证精确重合
      moveCursor(m.x, m.y)
    })
  }, [moveCursor, hexRef])

  /** 强制浏览器立即重算鼠标样式（Chromium 已知问题 workaround）：光标下的元素被移除/替换后 */
  const forceCursorRecompute = useCallback((finalCursor = '') => {
    if (cursorRafRef.current) cancelAnimationFrame(cursorRafRef.current)
    document.body.style.cursor = 'none'
    cursorRafRef.current = requestAnimationFrame(() => {
      cursorRafRef.current = 0
      document.body.style.cursor = finalCursor
    })
  }, [])

  // 拖动结束（松开左键）定格：未拖出最小半径时以右下顶点为锚兜底为最小六边形
  const finishDrag = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    const h = hexRef.current
    if (!h) {
      setDragging(false)
      return
    }
    let final = h
    if (h.r < MIN_RADIUS) {
      const r = MIN_RADIUS
      final = { cx: h.cx + (h.r - r) * BR_UNIT.x, cy: h.cy + (h.r - r) * BR_UNIT.y, r }
      hexRef.current = final
      drawRef.current(final)
    }
    // 低频时刻才 setState：触发定格 UI（按钮条/恢复默认光标）
    setHex(final)
    setDragging(false)
  }, [hexRef, setHex, setDragging])

  return {
    anchorRef,
    mouseRef,
    rafRef,
    cursorRafRef,
    maxRadius,
    viewRef,
    maskRef,
    polyRef,
    dotsRef,
    cursorImgRef,
    drawRef,
    moveCursor,
    scheduleDragDraw,
    forceCursorRecompute,
    finishDrag,
  }
}