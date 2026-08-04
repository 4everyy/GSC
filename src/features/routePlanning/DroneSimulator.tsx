/**
 * DroneSimulator —— 无人机模拟飞行（引擎无关版）。
 *
 * 重构说明：
 * - 原实现直接依赖 BMapGL 的 Label/Polyline，位置与内容更新强耦合引擎 API；
 * - 现通过 MapAdapter 统一接口操作覆盖物：
 *   - 无人机：addMarker + setMarkerPosition + setMarkerElement；
 *   - 拖尾：addPolyline（glow）+ setPolylinePoints。
 *
 * 视觉链路（结构见 routeVisuals.css）：
 * 1. `.rp-drone__scan` / `.rp-drone__ring`：雷达扫描圈与光环（CSS 动画）；
 * 2. `.rp-drone__icon`：飞机图标（SVG），机头朝上，通过 transform: rotate 跟随航向；
 * 3. 拖尾轨迹：实时绘制"已飞路径"高亮线，与暗色全航线形成进度对比。
 *
 * 稳定性关键：
 * - 位置每帧用 setMarkerPosition 更新（平滑），内容（朝向）节流用 setMarkerElement 更新
 *   （仅当朝向变化>8°或间隔>150ms 才重建 DOM），兼顾平滑与减少 CSS 动画重置。
 */
import { useEffect, useRef, useState } from 'react'
import type { MapAdapter, MarkerHandle, PolylineHandle } from '../../map-engines'
import { htmlToElement } from '../../utils/htmlToElement'
import { distanceMeters, bearingDeg } from '../../utils/geo'
import { SIM_SPEED_MULTIPLIER } from './config'
import type { Route } from './types'
import './routeVisuals.css'

interface DroneSimulatorProps {
  /** 地图适配器（引擎无关） */
  adapter: MapAdapter | null
  route: Route
  running: boolean
}

interface Segment {
  from: { lng: number; lat: number }
  to: { lng: number; lat: number }
  distance: number
}

/** 飞机图标 SVG（机头朝上=正北 0°）。通过外层 transform: rotate 跟随航向。
 *  配色采用暖色金黄/橙，与青色航线（#00e5ff）形成冷暖对比，保证飞机在航线中最醒目。 */
const DRONE_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">' +
  // 机身（机头朝上）：亮金黄
  '<path d="M14 2 L16 11 L16 18 L14 22 L12 18 L12 11 Z" fill="#ffd000" stroke="#ffffff" stroke-width="0.8"/>' +
  // 左机翼：深橙
  '<path d="M3 14 L12 11 L12 15 L3 16 Z" fill="#ff8c00" stroke="#ffffff" stroke-width="0.5"/>' +
  // 右机翼：深橙
  '<path d="M25 14 L16 11 L16 15 L25 16 Z" fill="#ff8c00" stroke="#ffffff" stroke-width="0.5"/>' +
  // 尾翼：深橙
  '<path d="M11 19 L14 21 L17 19 L17 20.5 L14 22.5 L11 20.5 Z" fill="#ff8c00"/>' +
  // 机头亮点
  '<circle cx="14" cy="6" r="1.6" fill="#ffffff"/>' +
  '</svg>'

const DRONE_ICON_DATA_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(DRONE_ICON_SVG)}`

/** 生成无人机 HTML（飞机图标随航向旋转）。headingDeg 为机头朝向（正北=0，顺时针）。 */
function buildDroneHTML(headingDeg: number): string {
  return (
    '<div class="rp-drone">' +
    '<span class="rp-drone__scan"></span>' +
    '<span class="rp-drone__ring"></span>' +
    `<img class="rp-drone__icon" src="${DRONE_ICON_DATA_URI}" alt="drone" style="transform:rotate(${headingDeg}deg)" />` +
    '</div>'
  )
}

function buildSegments(route: Route): Segment[] {
  const segs: Segment[] = []
  for (let i = 0; i < route.waypoints.length - 1; i++) {
    const from = route.waypoints[i]
    const to = route.waypoints[i + 1]
    segs.push({
      from: { lng: from.lng, lat: from.lat },
      to: { lng: to.lng, lat: to.lat },
      distance: distanceMeters(from, to),
    })
  }
  return segs
}

function interpolate(seg: Segment, progress: number) {
  return {
    lng: seg.from.lng + (seg.to.lng - seg.from.lng) * progress,
    lat: seg.from.lat + (seg.to.lat - seg.from.lat) * progress,
  }
}

const DRONE_MARKER_ID = 'drone-sim-marker'
const DRONE_TRAIL_ID = 'drone-sim-trail'

export function DroneSimulator({ adapter, route, running }: DroneSimulatorProps) {
  const markerHandleRef = useRef<MarkerHandle | null>(null)
  const trailHandleRef = useRef<PolylineHandle | null>(null)
  const trailPointsRef = useRef<{ lng: number; lat: number }[]>([])
  const rafRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number | null>(null)
  // 内容节流缓存：上次写入 Marker 的朝向与时间，避免每帧重建 DOM 打断 CSS 动画
  const lastHeadingRef = useRef<number>(0)
  const lastContentTimeRef = useRef<number>(0)

  const [, setSim] = useState<{ segIndex: number; progress: number; traveled: number }>({
    segIndex: 0,
    progress: 0,
    traveled: 0,
  })

  // 航线变更：重置模拟状态 + 重建 Marker 与轨迹线
  useEffect(() => {
    setSim({ segIndex: 0, progress: 0, traveled: 0 })
    lastTimeRef.current = null
    trailPointsRef.current = []
    lastHeadingRef.current = 0
    lastContentTimeRef.current = 0

    if (!adapter) return

    // 清理上一次的覆盖物
    adapter.removeOverlay(DRONE_MARKER_ID)
    adapter.removeOverlay(DRONE_TRAIL_ID)
    markerHandleRef.current = null
    trailHandleRef.current = null

    if (route.waypoints.length === 0) return

    // 创建无人机 Marker（初始朝向 0）
    const startPos = route.waypoints[0]
    const element = htmlToElement(buildDroneHTML(0))
    const handle = adapter.addMarker(
      DRONE_MARKER_ID,
      { lng: startPos.lng, lat: startPos.lat },
      { element, anchor: { x: 14, y: 14 } },
    )
    markerHandleRef.current = handle

    // 创建拖尾轨迹线（使用 glow 选项实现金色光晕）。
    // 拖尾代表"已飞路径"，用金色与青色全航线（#00e5ff）形成冷暖对比，
    // 让飞行进度一目了然，同时与暖色飞机本体同色系，视觉协调。
    const startPoint = { lng: startPos.lng, lat: startPos.lat }
    trailPointsRef.current = [startPoint]
    const trailHandle = adapter.addPolyline(
      DRONE_TRAIL_ID,
      [startPoint],
      {
        color: '#ffd54f',
        width: 4,
        opacity: 1,
        glow: true,
        glowColor: '#ffab00',
        glowWidth: 2.5,
      },
    )
    trailHandleRef.current = trailHandle

    return () => {
      adapter.removeOverlay(DRONE_MARKER_ID)
      adapter.removeOverlay(DRONE_TRAIL_ID)
      markerHandleRef.current = null
      trailHandleRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, route])

  // 动画主循环
  useEffect(() => {
    if (!adapter || !running || route.waypoints.length < 2) return

    const segments = buildSegments(route)
    if (segments.length === 0) return
    let arrived = false

    const step = (timestamp: number) => {
      if (lastTimeRef.current === null) lastTimeRef.current = timestamp
      const dt = (timestamp - lastTimeRef.current) / 1000
      lastTimeRef.current = timestamp

      setSim((prev) => {
        let { segIndex, progress, traveled } = prev
        if (segIndex >= segments.length || arrived) return prev

        const seg = segments[segIndex]
        const moveDistance = route.defaultSpeed * SIM_SPEED_MULTIPLIER * dt
        progress += seg.distance > 0 ? moveDistance / seg.distance : 1
        traveled += moveDistance

        while (progress >= 1 && segIndex < segments.length - 1) {
          progress -= 1
          segIndex += 1
        }

        if (segIndex === segments.length - 1 && progress >= 1) {
          progress = 1
          arrived = true
        }

        const currentSeg = segments[Math.min(segIndex, segments.length - 1)]
        const pos = interpolate(currentSeg, Math.min(progress, 1))
        const heading = currentSeg.distance > 0 ? bearingDeg(currentSeg.from, currentSeg.to) : 0

        // 位置：每帧 setMarkerPosition（平滑，不重建 DOM）
        if (markerHandleRef.current) {
          adapter.setMarkerPosition(markerHandleRef.current, { lng: pos.lng, lat: pos.lat })
        }

        // 内容（朝向）：节流 setMarkerElement，仅当朝向变化>8°或间隔>150ms 才重建。
        // 配合 CSS .rp-drone__icon 的 transition: transform 0.4s ease，旋转视觉连续。
        const headingDelta = Math.abs(heading - lastHeadingRef.current)
        const shouldUpdateContent =
          headingDelta > 8 || timestamp - lastContentTimeRef.current > 150
        if (shouldUpdateContent && markerHandleRef.current) {
          lastHeadingRef.current = heading
          lastContentTimeRef.current = timestamp
          const element = htmlToElement(buildDroneHTML(heading))
          adapter.setMarkerElement(markerHandleRef.current, element)
        }

        // 追加轨迹点（按距离采样，避免点过密）
        const pts = trailPointsRef.current
        const last = pts[pts.length - 1]
        if (!last || distanceMeters(last, pos) > 2) {
          pts.push({ lng: pos.lng, lat: pos.lat })
          if (pts.length > 500) {
            pts.splice(0, pts.length - 500)
          }
          if (trailHandleRef.current) {
            adapter.setPolylinePoints(trailHandleRef.current, pts)
          }
        }

        return { segIndex, progress, traveled }
      })

      if (!arrived) {
        rafRef.current = requestAnimationFrame(step)
      }
    }

    rafRef.current = requestAnimationFrame(step)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      lastTimeRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, running, route])

  return null
}