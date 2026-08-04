/**
 * RouteOverlay —— 航线只读渲染层（引擎无关版）。
 *
 * 与 RouteEditor 的区别：
 * - 编辑模式由 RouteEditor 接管（可拖拽/删除），浏览模式由本组件渲染；
 * - 本组件的航点 Marker 不可拖拽、不可右键删除，仅用于展示。
 *
 * 视觉策略：
 * - 航线：通过 PolylineOptions.glow 选项让适配器内部实现霓虹发光（多层叠加）；
 * - 航点：使用 MarkerOptions.element 传入 HTML 节点（脉冲动画），居中对齐坐标点。
 */
import { useEffect, useRef } from 'react'
import type { MapAdapter } from '../../map-engines'
import { htmlToElement } from '../../utils/htmlToElement'
import type { Route } from './types'
import { buildWaypointNodeHTML } from './waypointIcon'
import './routeVisuals.css'

interface RouteOverlayProps {
  /** 地图适配器（引擎无关） */
  adapter: MapAdapter | null
  route: Route
  visible: boolean
}

export function RouteOverlay({ adapter, route, visible }: RouteOverlayProps) {
  // 已创建覆盖物的 id 列表，便于清理
  const overlayIdsRef = useRef<string[]>([])

  // 清理所有覆盖物
  const clearOverlays = (adapter: MapAdapter) => {
    for (const id of overlayIdsRef.current) {
      adapter.removeOverlay(id)
    }
    overlayIdsRef.current = []
  }

  useEffect(() => {
    if (!adapter) return

    // 先清理上一次的覆盖物
    clearOverlays(adapter)

    if (!visible || route.waypoints.length === 0) return

    const { waypoints, color } = route
    const ids: string[] = []

    // 折线：使用 glow 选项实现霓虹发光（适配器内部处理多层叠加）
    if (waypoints.length >= 2) {
      const lineId = `route-overlay-line-${route.id}`
      const points = waypoints.map((wp) => ({ lng: wp.lng, lat: wp.lat }))
      adapter.addPolyline(lineId, points, {
        color,
        width: 4,
        opacity: 1,
        glow: true,
        glowColor: color,
        glowWidth: 3,
      })
      ids.push(lineId)
    }

    // 航点节点：HTML 元素标注（不可拖拽），居中对齐坐标点
    waypoints.forEach((wp, i) => {
      const id = `route-overlay-wp-${route.id}-${wp.id}`
      const html = buildWaypointNodeHTML(i, waypoints.length)
      const element = htmlToElement(html)

      adapter.addMarker(
        id,
        { lng: wp.lng, lat: wp.lat },
        {
          element,
          anchor: { x: 14, y: 14 },
        },
      )
      ids.push(id)
    })

    overlayIdsRef.current = ids

    return () => {
      clearOverlays(adapter)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, route, visible])

  return null
}