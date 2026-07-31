/**
 * RouteEditor —— 航线编辑交互层（重写版）。
 *
 * 核心改动（解决"覆盖物不显示"）：
 * - 放弃自定义 Icon（Canvas/Symbol 在 BMapGL 中有异步解码/不兼容问题）；
 * - 航点使用 BMapGL 默认 Marker（100% 可靠显示），搭配 Label 显示编号与起/终语义；
 * - 航线用 Polyline 加粗显示。
 *
 * 职责：
 * - 把地图交互翻译为数据操作：点击空白 → 加点；拖拽航点 → 改坐标；右键航点 → 删除；
 * - 自管覆盖物生命周期：草稿航线变化时重建 Marker/Label/Polyline，卸载时清理。
 *
 * 非职责：
 * - 不主动调整地图视野/缩放（航点在用户点击位置，天然可见）。
 */
import { useEffect, useRef } from 'react'
import type { Route, Waypoint } from './types'
import { buildWaypointNodeHTML, LABEL_RESET_STYLE } from './waypointIcon'
import { EDIT_MODE_CURSOR } from './config'
import './routeVisuals.css'

/** 透明图标 data URI：让 Marker 视觉不可见，仅保留拖拽/右键交互热区。
 *  视觉由 HTML Label 节点承担，避免默认红水滴与自定义节点冲突。 */
const TRANSPARENT_ICON_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

/**
 * 从地图鼠标事件中提取经纬度坐标。
 *
 * 兼容 BMapGL 的两个版本：
 * - WebGL 版（GL）：坐标在 `e.latlng`；
 * - 旧版 2D API：坐标在 `e.point`。
 *
 * 优先取 `latlng`，回退 `point`，两者都缺失时返回 null。
 */
function getEventPoint(e: BMapGL.MapEvent): { lng: number; lat: number } | null {
  const me = e as BMapGL.MapMouseEvent
  const p = me.latlng ?? me.point
  if (!p || typeof p.lng !== 'number' || typeof p.lat !== 'number') return null
  return { lng: p.lng, lat: p.lat }
}

interface RouteEditorProps {
  map: BMapGL.Map | null
  enabled: boolean
  route: Route
  onMapClick: (lng: number, lat: number) => void
  onWaypointDrag: (id: Waypoint['id'], lng: number, lat: number) => void
  onWaypointRightClick: (id: Waypoint['id']) => void
}

export function RouteEditor({
  map,
  enabled,
  route,
  onMapClick,
  onWaypointDrag,
  onWaypointRightClick,
}: RouteEditorProps) {
  const overlaysRef = useRef<BMapGL.Overlay[]>([])

  // 1. 编辑模式开关：切换地图点击监听与鼠标光标
  useEffect(() => {
    if (!map) return

    const handleClick = (e: BMapGL.MapEvent) => {
      if (!enabled) return
      const pos = getEventPoint(e)
      if (!pos) return
      onMapClick(pos.lng, pos.lat)
    }

    if (enabled) {
      map.setDefaultCursor(EDIT_MODE_CURSOR)
      map.addEventListener('click', handleClick)
      map.disableDoubleClickZoom()
    } else {
      map.setDefaultCursor('pointer')
      map.enableDoubleClickZoom()
    }

    return () => {
      map.removeEventListener('click', handleClick)
      map.enableDoubleClickZoom()
    }
  }, [map, enabled, onMapClick])

  // 2. 渲染草稿航线覆盖物（航点 Marker + 编号 Label + 折线）
  useEffect(() => {
    const prev = overlaysRef.current
    if (map && prev.length) {
      prev.forEach((o) => map.removeOverlay(o))
    }
    overlaysRef.current = []

    if (!map || !enabled || route.waypoints.length === 0) return

    const added: BMapGL.Overlay[] = []
    const { waypoints, color } = route

    // 折线：三层叠加实现霓虹发光（光晕 + 过渡 + 主线）
    if (waypoints.length >= 2) {
      const points = waypoints.map((wp) => new BMapGL.Point(wp.lng, wp.lat))

      const glow = new BMapGL.Polyline(points, {
        strokeColor: color,
        strokeWeight: 14,
        strokeOpacity: 0.25,
      })
      map.addOverlay(glow)
      added.push(glow)

      const mid = new BMapGL.Polyline(points, {
        strokeColor: color,
        strokeWeight: 8,
        strokeOpacity: 0.45,
      })
      map.addOverlay(mid)
      added.push(mid)

      const main = new BMapGL.Polyline(points, {
        strokeColor: color,
        strokeWeight: 4,
        strokeOpacity: 1,
      })
      map.addOverlay(main)
      added.push(main)
    }

    // 航点：透明可交互 Marker（拖拽/右键）+ HTML 视觉 Label 节点
    waypoints.forEach((wp, i) => {
      const point = new BMapGL.Point(wp.lng, wp.lat)

      // 透明图标 Marker：保留拖拽与右键交互热区，视觉不可见
      const transparentIcon = new BMapGL.Icon(
        TRANSPARENT_ICON_URL,
        new BMapGL.Size(24, 24),
        { anchor: new BMapGL.Size(12, 12) },
      )
      const marker = new BMapGL.Marker(point, {
        enableDragging: true,
        icon: transparentIcon,
      })

      // HTML 节点 Label：CSS 脉冲动画，居中对齐坐标点
      const html = buildWaypointNodeHTML(i, waypoints.length)
      const label = new BMapGL.Label(html, {
        position: point,
        offset: new BMapGL.Size(0, 0),
      })
      // 重置 Label 外层容器默认白底/边框，消除白色方框
      label.setStyle(LABEL_RESET_STYLE)
      map.addOverlay(label)
      added.push(label)

      const handleDragEnd = (e: BMapGL.MapEvent) => {
        const pos = getEventPoint(e)
        if (!pos) return
        onWaypointDrag(wp.id, pos.lng, pos.lat)
      }
      const handleRightClick = () => {
        onWaypointRightClick(wp.id)
      }

      marker.addEventListener('dragend', handleDragEnd)
      marker.addEventListener('rightclick', handleRightClick)
      map.addOverlay(marker)
      added.push(marker)
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
  }, [map, enabled, route, onWaypointDrag, onWaypointRightClick])

  return null
}