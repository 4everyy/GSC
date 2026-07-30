import { useState, useEffect, useRef, useCallback } from 'react'
import './MapScale.css'

/** MapScale 组件属性 */
interface MapScaleProps {
  /** 百度地图实例，用于获取缩放级别与中心点以计算比例尺 */
  map: BMapGL.Map | null
}

/** 赤道周长（米），用于换算经度差对应的实际距离 */
const EARTH_CIRCUMFERENCE = 40075016.686

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
 * 预设的“美观”刻度序列：1 / 2 / 5 循环 × 10ⁿ，
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
 * - 根据当前地图缩放级别与中心纬度，实时计算“每像素米数”；
 * - 选择一个美观的刻度距离（1/2/5 × 10ⁿ），并据此调整比例尺宽度；
 * - 监听 zoomend / moveend 事件，缩放或平移后刷新比例尺。
 */
export function MapScale({ map }: MapScaleProps) {
  const [label, setLabel] = useState('200m')
  const [barWidth, setBarWidth] = useState(60)
  // 缓存事件处理函数，便于卸载时精确移除监听
  const handlerRef = useRef<((e: BMapGL.MapEvent) => void) | null>(null)

  /** 重新计算比例尺距离与宽度 */
  const update = useCallback(() => {
    if (!map) return
    const center = map.getCenter()
    if (!center) return

    // 以中心点为基准，取屏幕水平方向 100px 跨度对应的两个点，
    // 通过经度差 × 单位经度米数换算实际距离，从而得到“每像素米数”。
    const centerPixel = map.pointToPixel(center)
    const p1 = map.pixelToPoint(new BMapGL.Pixel(centerPixel.x, centerPixel.y))
    const p2 = map.pixelToPoint(new BMapGL.Pixel(centerPixel.x + 100, centerPixel.y))
    const metersPerDeg = ((EARTH_CIRCUMFERENCE / 360) * Math.cos((center.lat * Math.PI) / 180))
    const metersPerPixel = (Math.abs(p2.lng - p1.lng) * metersPerDeg) / 100
    if (!metersPerPixel || !Number.isFinite(metersPerPixel)) return

    // 目标宽度约 96px，合法区间 [64px, 160px]：
    // - 以 96px 为基准换算实际距离，再挑选落在区间内的美观刻度；
    // - 区间设计为 [target×2/3, target×5/3]，使每级缩放后宽度变化方向稳定，
    //   避免出现“忽长忽短”的反复跳动。
    const { distance: niceDistance, width } = pickNiceDistance(metersPerPixel, 96, 64, 160)

    setBarWidth(Math.round(width))
    setLabel(formatDistance(niceDistance))
  }, [map])

  useEffect(() => {
    if (!map) return
    update()
    const handler = () => update()
    handlerRef.current = handler
    map.addEventListener('zoomend', handler)
    map.addEventListener('moveend', handler)
    return () => {
      map.removeEventListener('zoomend', handler)
      map.removeEventListener('moveend', handler)
      handlerRef.current = null
    }
  }, [map, update])

  return (
    <div className="scale">
      <span style={{ width: `${barWidth}px` }} />
      {label}
    </div>
  )
}
