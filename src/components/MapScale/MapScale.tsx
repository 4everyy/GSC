/**
 * MapScale —— 动态比例尺组件（引擎无关版）。
 *
 * 重构说明：
 * - 原实现直接调用 `map.getCenter()` / `map.pointToPixel()` 等百度 API；
 * - 现通过 `MapAdapter.getMetersPerPixel()` 与 `onZoomEnd/onMoveEnd` 抽象出引擎差异，
 *   业务逻辑保持不变，仅把"每像素米数"的计算下沉到适配器。
 */
import { useState, useEffect, useCallback } from 'react'
import type { MapAdapter } from '../../map-engines'
import './MapScale.css'

/** MapScale 组件属性 */
interface MapScaleProps {
  /** 地图适配器，用于获取缩放级别与中心点以计算比例尺 */
  adapter: MapAdapter | null
}

/**
 * 将距离值格式化为可读文本：< 1000m 用 m，否则用 km（保留 1 位小数）。
 */
function formatDistance(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000
    return `${km % 1 === 0 ? km : km.toFixed(1)}km`
  }
  return `${Math.round(meters)}m`
}

/**
 * 预设的"美观"刻度序列：1 / 2 / 5 循环 × 10ⁿ，
 * 覆盖从 1m 到数千公里的常见比例尺读数。
 */
const NICE_STEPS = [
  1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000,
  100000, 200000, 500000, 1000000, 2000000, 5000000,
]

/**
 * 在给定像素宽度限制下，挑选最合适的刻度距离。
 *
 * 策略：从预设序列中选择使比例尺宽度落在 [minPx, maxPx] 区间内的刻度；
 * 若多个刻度满足条件，取其中宽度最接近 targetPx 的，保证视觉上稳定且
 * 跨缩放级别的变化方向（缩小→变长、放大→变短）具备规律性，避免反复跳动。
 */
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

/**
 * 动态比例尺组件。
 *
 * 职责：
 * - 根据当前地图缩放级别与中心纬度，通过 adapter.getMetersPerPixel() 获取"每像素米数"；
 * - 选择一个美观的刻度距离（1/2/5 × 10ⁿ），并据此调整比例尺宽度；
 * - 监听 zoomend / moveend 事件，缩放或平移后刷新比例尺。
 */
export function MapScale({ adapter }: MapScaleProps) {
  const [label, setLabel] = useState('200m')
  const [barWidth, setBarWidth] = useState(60)

  /** 重新计算比例尺距离与宽度 */
  const update = useCallback(() => {
    if (!adapter) return
    const metersPerPixel = adapter.getMetersPerPixel()
    if (!metersPerPixel || !Number.isFinite(metersPerPixel)) return

    // 目标宽度约 96px，合法区间 [64px, 160px]：
    // - 以 96px 为基准换算实际距离，再挑选落在区间内的美观刻度；
    // - 区间设计为 [target×2/3, target×5/3]，使每级缩放后宽度变化方向稳定，
    //   避免出现"忽长忽短"的反复跳动。
    const { distance: niceDistance, width } = pickNiceDistance(metersPerPixel, 96, 64, 160)

    setBarWidth(Math.round(width))
    setLabel(formatDistance(niceDistance))
  }, [adapter])

  useEffect(() => {
    if (!adapter) return
    update()
    // 适配器返回的是取消订阅函数，在 cleanup 中调用
    const offZoom = adapter.onZoomEnd(() => update())
    const offMove = adapter.onMoveEnd(() => update())
    return () => {
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