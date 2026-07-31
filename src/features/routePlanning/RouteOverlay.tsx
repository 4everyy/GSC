/**
 * RouteOverlay —— 航线只读渲染层（视觉优化版）。
 *
 * 与 RouteEditor 的区别：
 * - 编辑模式由 RouteEditor 接管（可拖拽/删除），浏览模式由本组件渲染；
 * - 本组件的航点 Marker 不可拖拽、不可右键删除，仅用于展示。
 *
 * 视觉策略：
 * - 航线：双层 Polyline 叠加（底层光晕 + 主层实线），制造霓虹发光感；
 * - 航点：默认 Marker（透明图标作可点击锚点）+ HTML Label 节点（脉冲动画）。
 */
import { useEffect, useRef } from 'react'
import type { Route } from './types'
import { buildWaypointNodeHTML, LABEL_RESET_STYLE } from './waypointIcon'
import './routeVisuals.css'

interface RouteOverlayProps {
  map: BMapGL.Map | null
  route: Route
  visible: boolean
}

export function RouteOverlay({ map, route, visible }: RouteOverlayProps) {
  const overlaysRef = useRef<BMapGL.Overlay[]>([])

  useEffect(() => {
    const prev = overlaysRef.current
    if (map && prev.length) {
      prev.forEach((o) => map.removeOverlay(o))
    }
    overlaysRef.current = []

    if (!map || !visible || route.waypoints.length === 0) return

    const added: BMapGL.Overlay[] = []
    const { waypoints, color } = route

    // 折线：双层叠加实现霓虹发光
    if (waypoints.length >= 2) {
      const points = waypoints.map((wp) => new BMapGL.Point(wp.lng, wp.lat))

      // 底层：粗、半透明光晕
      const glow = new BMapGL.Polyline(points, {
        strokeColor: color,
        strokeWeight: 14,
        strokeOpacity: 0.25,
      })
      map.addOverlay(glow)
      added.push(glow)

      // 中层：中等粗细过渡
      const mid = new BMapGL.Polyline(points, {
        strokeColor: color,
        strokeWeight: 8,
        strokeOpacity: 0.45,
      })
      map.addOverlay(mid)
      added.push(mid)

      // 主层：实线，带白色高光内描边感
      const main = new BMapGL.Polyline(points, {
        strokeColor: color,
        strokeWeight: 4,
        strokeOpacity: 1,
      })
      map.addOverlay(main)
      added.push(main)
    }

    // 航点节点：默认 Marker + HTML Label
    waypoints.forEach((wp, i) => {
      const point = new BMapGL.Point(wp.lng, wp.lat)

      // 航点节点 Label：CSS 脉冲动画，节点居中对齐坐标点
      const html = buildWaypointNodeHTML(i, waypoints.length)
      const label = new BMapGL.Label(html, {
        position: point,
        // Label 左上角对齐坐标，HTML 内部用 translate(-50%, -50%) 自行居中
        offset: new BMapGL.Size(0, 0),
      })
      // 重置 Label 外层容器默认白底/边框，消除白色方框
      label.setStyle(LABEL_RESET_STYLE)
      map.addOverlay(label)
      added.push(label)
    })

    overlaysRef.current = added

    return () => {
      if (map && added.length) {
        added.forEach((o) => {
          try {
            map.removeOverlay(o)
          } catch {
            /* 覆盖物可能已被清理，忽略 */
          }
        })
      }
      if (overlaysRef.current === added) {
        overlaysRef.current = []
      }
    }
  }, [map, route, visible])

  return null
}