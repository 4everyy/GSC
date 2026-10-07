/**
 * @file MapScale.tsx
 * @description MapScale（自 MapChrome.tsx 拆出）—— 动态比例尺：基于 MapAdapter 引擎抽象接口计算比例尺读数。 仅一个 adapter prop（接口可控），与其它地图控件互不影响（独立变化）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { type MapAdapter } from '../../map-engines/index'
import { useEffect, useState, useCallback } from 'react'
/** MapScale —— 动态比例尺组件（基于 MapAdapter 引擎抽象接口）。 */

/** MapScale 组件属性 */
interface MapScaleProps {
  /** 地图适配器，用于获取缩放级别与中心点以计算比例尺 */
  adapter: MapAdapter | null
}

/** 将距离值格式化为可读文本：< 1000m 用 m，否则用 km（保留 1 位小数）。 */
function formatDistance(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000
    return `${km % 1 === 0 ? km : km.toFixed(1)}km`
  }
  return `${Math.round(meters)}m`
}

/** 预设的"美观"刻度序列：1 / 2 / 5 循环 × 10ⁿ，覆盖从 1m 到数千公里的常见比例尺读数。 */
const NICE_STEPS = [
  1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000,
  100000, 200000, 500000, 1000000, 2000000, 5000000,
]

/** 在给定像素宽度限制下，挑选最合适的刻度距离。 */
function pickNiceDistance(
  metersPerPixel: number,
  targetPx: number,
  minPx: number,
  maxPx: number,
): { distance: number; width: number } {
  let best: { distance: number; width: number } | null = null
  for (const step of NICE_STEPS) {
    const width = step / metersPerPixel
    if (width < minPx) continue
    if (width > maxPx) break // 序列递增，后续只会更宽，提前结束
    if (!best || Math.abs(width - targetPx) < Math.abs(best.width - targetPx)) {
      best = { distance: step, width }
    }
  }
  // 兜底：理论上不会走到，取最接近 targetPx 的刻度
  if (!best) {
    let nearest = NICE_STEPS[0]
    let nearestWidth = nearest / metersPerPixel
    for (const step of NICE_STEPS) {
      const width = step / metersPerPixel
      if (Math.abs(width - targetPx) < Math.abs(nearestWidth - targetPx)) {
        nearest = step
        nearestWidth = width
      }
    }
    best = { distance: nearest, width: nearestWidth }
  }
  return best
}

/** 动态比例尺组件。 */
export function MapScale({ adapter }: MapScaleProps) {
  const [label, setLabel] = useState('200m')
  const [barWidth, setBarWidth] = useState(60)

  /** 重新计算比例尺距离与宽度 */
  const update = useCallback(() => {
    if (!adapter) return
    const metersPerPixel = adapter.getMetersPerPixel()
    if (!metersPerPixel || !Number.isFinite(metersPerPixel)) return

    // 目标宽度约 96px，合法区间 [64px, 160px]：- 以 96px 为基准换算实际距离，再挑选落在区间内的美观刻度
    const { distance: niceDistance, width } = pickNiceDistance(metersPerPixel, 96, 64, 160)

    setBarWidth(Math.round(width))
    setLabel(formatDistance(niceDistance))
  }, [adapter])

  useEffect(() => {
    if (!adapter) return
    // 首次计算放入 rAF 异步执行：规避 effect 内同步 setState，并等待容器布局
    const raf = window.requestAnimationFrame(() => update())
    // 适配器返回的是取消订阅函数，在 cleanup 中调用
    const offZoom = adapter.onZoomEnd(() => update())
    const offMove = adapter.onMoveEnd(() => update())
    return () => {
      window.cancelAnimationFrame(raf)
      offZoom()
      offMove()
    }
  }, [adapter, update])

  return (
    <div className="scale">
      <span style={{ width: `${barWidth}px` }} />
      {label}
    </div>
  )
}

