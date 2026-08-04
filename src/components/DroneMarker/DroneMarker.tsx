/**
 * DroneMarker —— 常驻无人机位置标记组件。
 *
 * 借鉴参考截图（鹰眼巡检）的中央地图设计：
 * - 无人机图标始终可见（不依赖航线模拟）
 * - 青色半透明圆表示通信/侦察覆盖范围
 * - 飞机图标带微弱脉冲动画，突出位置但不喧宾夺主
 *
 * 使用 BMapGL.Label 承载 HTML + CSS 动画（与 DroneSimulator 一致的技术方案），
 * 通过 props.position 实现受控的位置更新，支持实时回传坐标场景。
 */
import { useEffect, useRef } from 'react'
import './DroneMarker.css'

/** 无人机图标 SVG（小飞机，浅白配色，在深色卫星底图上清晰可辨） */
const DRONE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <!-- 机身 -->
  <path d="M16 3 L18.5 13 L18.5 20 L16 25 L13.5 20 L13.5 13 Z" fill="#e8f4ff" stroke="#ffffff" stroke-width="0.8"/>
  <!-- 左机翼 -->
  <path d="M3 15 L13.5 12 L13.5 17 L3 17 Z" fill="#b8d8ea" stroke="#ffffff" stroke-width="0.5"/>
  <!-- 右机翼 -->
  <path d="M29 15 L18.5 12 L18.5 17 L29 17 Z" fill="#b8d8ea" stroke="#ffffff" stroke-width="0.5"/>
  <!-- 尾翼 -->
  <path d="M13 21 L16 23.5 L19 21 L19 22.5 L16 25 L13 22.5 Z" fill="#9ac4db"/>
  <!-- 机头亮点 -->
  <circle cx="16" cy="7" r="1.8" fill="#00e5ff"/>
  <!-- 信号指示灯 -->
  <circle cx="16" cy="14" r="1.2" fill="#ffcc00">
    <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite"/>
  </circle>
</svg>`

/** 生成无人机标记 HTML */
function buildDroneHTML(): string {
  return (
    '<div class="drone-marker">' +
    '<span class="drone-marker__coverage"></span>' +
    '<span class="drone-marker__pulse"></span>' +
    `<img class="drone-marker__icon" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(DRONE_ICON_SVG)}" alt="无人机" />` +
    '</div>'
  )
}

/** 无人机位置坐标 */
export interface DronePosition {
  lng: number
  lat: number
}

interface DroneMarkerProps {
  /** 百度地图实例 */
  map: BMapGL.Map | null
  /** 无人机当前位置（受控，外部更新即可移动标记） */
  position: DronePosition | null
  /** 覆盖范围半径（米），默认 500m */
  coverageRadius?: number
  /** 是否可见，默认 true */
  visible?: boolean
}

/**
 * 常驻无人机 Marker。
 *
 * 职责：
 * - 在地图上创建一个持久化的无人机位置标记（Label + Circle）
 * - 当 position 变化时平滑移动到新位置
 * - 卸载时自动清理所有覆盖物
 *
 * @example
 * ```tsx
 * <DroneMarker map={map} position={{ lng: 114.05, lat: 22.54 }} coverageRadius={800} />
 * ```
 */
export function DroneMarker({
  map,
  position,
  coverageRadius = 500,
  visible = true,
}: DroneMarkerProps) {
  const labelRef = useRef<BMapGL.Label | null>(null)
  const circleRef = useRef<BMapGL.Circle | null>(null)

  // 初始化：创建 Label + 覆盖范围圆
  useEffect(() => {
    if (!map) return

    // 创建无人机 Label
    const label = new BMapGL.Label(buildDroneHTML(), {
      position: new BMapGL.Point(0, 0), // 占位，后续 setPosition 更新
      offset: new BMapGL.Size(0, 0),
    })
    // 重置 Label 默认样式，避免白色背景遮挡地图
    label.setStyle({
      background: 'transparent',
      border: 'none',
      padding: '0',
      margin: '0',
    })
    map.addOverlay(label)
    labelRef.current = label

    // 创建覆盖范围圆（青色半透明，模拟通信/侦察半径）
    const circle = new BMapGL.Circle(new BMapGL.Point(0, 0), coverageRadius, {
      strokeColor: '#00e5ff',
      strokeWeight: 1.2,
      strokeOpacity: 0.5,
      fillColor: '#00e5ff',
      fillOpacity: 0.08,
    })
    map.addOverlay(circle)
    circleRef.current = circle

    return () => {
      if (labelRef.current) {
        try { map.removeOverlay(labelRef.current) } catch { /* */ }
        labelRef.current = null
      }
      if (circleRef.current) {
        try { map.removeOverlay(circleRef.current) } catch { /* */ }
        circleRef.current = null
      }
    }
  }, [map])

  // 位置更新：同步移动 Label 和 Circle
  useEffect(() => {
    const label = labelRef.current
    const circle = circleRef.current
    if (!label || !circle) return

    if (!position || !visible) {
      ;(label as any).setVisible?.(false)
      ;(circle as any).setVisible?.(false)
      return
    }

    ;(label as any).setVisible?.(true)
    ;(circle as any).setVisible?.(true)
    const point = new BMapGL.Point(position.lng, position.lat)
    label.setPosition(point)
    circle.setCenter(point)
  }, [position, visible])

  // 覆盖范围半径更新
  useEffect(() => {
    const circle = circleRef.current
    if (!circle) return
    circle.setRadius(coverageRadius)
  }, [coverageRadius])

  return null
}