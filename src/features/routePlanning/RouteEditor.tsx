/**
 * RouteEditor —— 航线编辑交互层（引擎无关版）。
 *
 * 重构说明：
 * - 原实现直接依赖 BMapGL 的 Marker/Label/Polyline；
 * - 现通过 MapAdapter 统一接口操作覆盖物与事件，支持百度/MapLibre 双引擎。
 *
 * 职责：
 * - 把地图交互翻译为数据操作：点击空白 → 加点；拖拽航点 → 改坐标；右键航点 → 删除；
 * - 自管覆盖物生命周期：草稿航线变化时重建标注/折线，卸载时清理。
 */
import { useEffect, useRef } from 'react'
import type { MapAdapter, MarkerHandle, PolylineHandle } from '../../map-engines'
import { htmlToElement } from '../../utils/htmlToElement'
import type { Route, Waypoint } from './types'
import { buildWaypointNodeHTML } from './waypointIcon'
import { EDIT_MODE_CURSOR } from './config'
import './routeVisuals.css'

interface RouteEditorProps {
  /** 地图适配器（引擎无关） */
  adapter: MapAdapter | null
  enabled: boolean
  route: Route
  onMapClick: (lng: number, lat: number) => void
  onWaypointDrag: (id: Waypoint['id'], lng: number, lat: number) => void
  onWaypointRightClick: (id: Waypoint['id']) => void
}

export function RouteEditor({
  adapter,
  enabled,
  route,
  onMapClick,
  onWaypointDrag,
  onWaypointRightClick,
}: RouteEditorProps) {
  // 已创建覆盖物的 id 列表，便于清理
  const overlayIdsRef = useRef<string[]>([])
  // 航点 Marker 句柄（拖拽/右键需要）
  const markerHandlesRef = useRef<Map<string, MarkerHandle>>(new Map())
  // 折线句柄
  const polylineHandleRef = useRef<PolylineHandle | null>(null)

  // 清理所有覆盖物
  const clearOverlays = (adapter: MapAdapter) => {
    for (const id of overlayIdsRef.current) {
      adapter.removeOverlay(id)
    }
    overlayIdsRef.current = []
    markerHandlesRef.current.clear()
    polylineHandleRef.current = null
  }

  // 1. 编辑模式开关：切换地图点击监听与鼠标光标
  useEffect(() => {
    if (!adapter) return

    const offClick = adapter.onClick(({ lng, lat }) => {
      if (!enabled) return
      onMapClick(lng, lat)
    })

    if (enabled) {
      adapter.setDefaultCursor(EDIT_MODE_CURSOR)
      adapter.enableDoubleClickZoom(false)
    } else {
      adapter.setDefaultCursor('pointer')
      adapter.enableDoubleClickZoom(true)
    }

    return () => {
      offClick()
      adapter.enableDoubleClickZoom(true)
    }
  }, [adapter, enabled, onMapClick])

  // 2. 渲染草稿航线覆盖物（航点 + 折线）
  useEffect(() => {
    if (!adapter) return

    // 先清理上一次的覆盖物
    clearOverlays(adapter)

    if (!enabled || route.waypoints.length === 0) return

    const { waypoints, color } = route

    // 折线：使用 glow 选项实现霓虹发光（适配器内部处理多层叠加）
    if (waypoints.length >= 2) {
      const lineId = 'route-editor-line'
      const points = waypoints.map((wp) => ({ lng: wp.lng, lat: wp.lat }))
      const handle = adapter.addPolyline(lineId, points, {
        color,
        width: 4,
        opacity: 1,
        glow: true,
        glowColor: color,
        glowWidth: 3,
      })
      polylineHandleRef.current = handle
      overlayIdsRef.current.push(lineId)
    }

    // 航点：HTML 元素标注 + 可拖拽
    waypoints.forEach((wp, i) => {
      const id = `route-editor-wp-${wp.id}`
      const html = buildWaypointNodeHTML(i, waypoints.length)
      const element = htmlToElement(html)

      const handle = adapter.addMarker(
        id,
        { lng: wp.lng, lat: wp.lat },
        {
          element,
          anchor: { x: 14, y: 14 },
          draggable: true,
          onDragEnd: ({ lng, lat }) => onWaypointDrag(wp.id, lng, lat),
          onContextMenu: () => onWaypointRightClick(wp.id),
        },
      )
      markerHandlesRef.current.set(wp.id, handle)
      overlayIdsRef.current.push(id)
    })

    return () => {
      clearOverlays(adapter)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, enabled, route, onWaypointDrag, onWaypointRightClick])

  return null
}