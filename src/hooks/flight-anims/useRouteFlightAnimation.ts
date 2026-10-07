/**
 * @file useRouteFlightAnimation.ts
 * @description Route flight animation hook (extracted from useFlightAnimations.ts)
 * @author 4everyy
 * @date 2026-10-07
 */
import { useCallback, useEffect, useRef } from 'react'
import { useFlightAnimStore, usePlaneStatusStore } from '../../stores/index'
import { useRealtimeStore } from '../../features/realtime/realtimeStore'
import type { WaypointFlightMapAdapter } from './types'

export function useRouteFlightAnimation() {
  const routeFlightFlightRaf = useRef<number | null>(null)

  // 三阶段连贯过渡——阶段一「高度调整」（climbing/descending）…
  const startRouteFlightAnimation = useCallback(
    (
      points: { x: number; y: number; lng?: number; lat?: number }[],
      icon: string,
      adapter?: WaypointFlightMapAdapter | null,
      options?: {
        /** 起飞时飞机图标中心视口坐标（未含升空偏移，与 AircraftLayer 布局同源） */
        aircraftX?: number
        aircraftY?: number
        /** 目标设备主键（WS telemetry 键）：起始高度取数与 AircraftLayer 标注去重用 */
        planeId?: string
        /** 面板设定飞行高度（米，相对起飞点） */
        targetHeight?: number
      },
    ) => {
      const { setRouteFlightFlight } = useFlightAnimStore.getState()
      if (routeFlightFlightRaf.current !== null)
        cancelAnimationFrame(routeFlightFlightRaf.current)
      if (points.length === 0) return
      // 缺省兜底：未传起飞参数时自首航点原地起飞（兼容旧调用）
      const {
        aircraftX = points[0].x,
        aircraftY = points[0].y,
        planeId,
        targetHeight = 0,
      } = options ?? {}
      const geo = !!adapter && points.every((p) => p.lng !== undefined && p.lat !== undefined)
      // 起飞点经纬度（地理锚定）：由飞机图标中心视口坐标反投影——地图图标是用户布设/可拖拽的展示位置，与设备真实遥测 GPS 无关
      const snapshot =
        planeId !== undefined ? useRealtimeStore.getState().telemetry[planeId] : undefined
      let startLng: number | undefined
      let startLat: number | undefined
      if (geo && adapter) {
        const rect = adapter.getContainer().getBoundingClientRect()
        const ll = adapter.unproject({ x: aircraftX - rect.left, y: aircraftY - rect.top })
        startLng = ll.lng
        startLat = ll.lat
      }
      const geoAnchor = geo && startLng !== undefined && startLat !== undefined
      // 起始高度口径（与航点/环绕飞行同源）：优先 WS 遥测实测高度
      const rawPlane =
        planeId !== undefined
          ? usePlaneStatusStore.getState().rawPlanes.find((p) => p.id === planeId)
          : undefined
      const mockAlt = Number(rawPlane?.altitude)
      const startAlt =
        snapshot && Number.isFinite(snapshot.altitude)
          ? snapshot.altitude
          : Number.isFinite(mockAlt)
            ? mockAlt
            : 0
      const deltaH = targetHeight - startAlt
      // 阶段一时长：高度差 / 20m/s（恒速增减，与航点/环绕飞行同口径）；可忽略时直接跳过
      const CLIMB_SPEED_MS = 20
      const climbDuration =
        Math.abs(deltaH) < 0.5 ? 0 : (Math.abs(deltaH) / CLIMB_SPEED_MS) * 1000
      // 阶段一方向标记…
      const climbPhase = deltaH >= 0 ? 'climbing' : 'descending'
      // 预计算折线分段长度：segLens[i] 为航点 i → i+1 段长，total 为全程总长（地理模式用米；屏幕模式用像素）
      const segLens: number[] = []
      let total = 0
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i]
        const b = points[i + 1]
        const len = geo
          ? Math.hypot(
              ((b.lng as number) - (a.lng as number)) *
                111320 *
                Math.cos((((a.lat as number) + (b.lat as number)) / 2) * (Math.PI / 180)),
              ((b.lat as number) - (a.lat as number)) * 110540,
            )
          : Math.hypot(b.x - a.x, b.y - a.y)
        segLens.push(len)
        total += len
      }
      // 平飞速度口径（任务要求）：地理模式按恒定 50m/s 地速平飞（转场平飞与航线巡航同速，不随缩放级别变化，与航点/环绕飞行同口径）
      const speed = 0.12 // px/ms
      const speedLen = geo ? 50 / 1000 : speed // 地理模式：米/ms（恒定 50m/s 地速）
      // 转场段（起飞点 → 首航点）长度与时长：地理模式取等距圆柱近似地面距离（米）
      const transitLen = geoAnchor
        ? Math.hypot(
            ((points[0].lng as number) - (startLng as number)) *
              111320 *
              Math.cos(
                (((startLat as number) + (points[0].lat as number)) / 2) * (Math.PI / 180),
              ),
            ((points[0].lat as number) - (startLat as number)) * 110540,
          )
        : Math.hypot(points[0].x - aircraftX, points[0].y - aircraftY)
      const transitDuration = transitLen < 1 ? 0 : Math.max(400, transitLen / speedLen)
      const routeDuration = Math.max(1200, total / speedLen)
      const holdAtEnd = 600
      const cycle = routeDuration + holdAtEnd
      const transitEnd = climbDuration + transitDuration
      // 初始航向：起飞点 → 首航点（阶段一垂直爬升/下降与阶段二转场全程保持）
      const initialHeading =
        (Math.atan2(points[0].y - aircraftY, points[0].x - aircraftX) * 180) / Math.PI
      // 经纬度 → 视口坐标（容器像素 + 容器视口偏移；每帧重算以跟随地图平移/缩放）
      const projectToViewport = (lng: number, lat: number) => {
        if (!adapter) return null
        const rect = adapter.getContainer().getBoundingClientRect()
        const pt = adapter.project({ lng, lat })
        return { x: rect.left + pt.x, y: rect.top + pt.y }
      }
      const startTime = performance.now()
      let climbLogged = false
      let routeLogged = false
      const step = (now: number) => {
        const elapsed = now - startTime
        if (elapsed < climbDuration) {
          // —— 阶段一：恒速高度调整 —— 水平钉在起飞点地面位置，高度以恒定 20m/s 线性增长/下降逼近设定值…
          const t = Math.min(1, elapsed / climbDuration)
          const visualAlt = startAlt + deltaH * t
          let gx = aircraftX
          let gy = aircraftY
          if (geoAnchor) {
            const g = projectToViewport(startLng as number, startLat as number)
            if (g) {
              gx = g.x
              gy = g.y
            }
          }
          setRouteFlightFlight({
            x: gx,
            y: gy - visualAlt * 0.3,
            angle: initialHeading,
            icon,
            planeId,
            altitude: visualAlt,
            groundY: gy,
          })
        } else if (elapsed < transitEnd) {
          // —— 阶段二：转场平飞 —— 已到达设定高度，自飞机位置匀速飞向首航点（地理模式两端每帧重投影，地图平移/缩放时转场轨迹与航点保持贴合）
          const t = Math.min(1, (elapsed - climbDuration) / transitDuration)
          let gx = aircraftX + (points[0].x - aircraftX) * t
          let gy = aircraftY + (points[0].y - aircraftY) * t
          let angle = initialHeading
          if (geoAnchor && adapter) {
            const a = projectToViewport(startLng as number, startLat as number)
            const b = projectToViewport(points[0].lng as number, points[0].lat as number)
            if (a && b) {
              gx = a.x + (b.x - a.x) * t
              gy = a.y + (b.y - a.y) * t
              angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
            }
          }
          setRouteFlightFlight({
            x: gx,
            y: gy - targetHeight * 0.3,
            angle,
            icon,
            planeId,
            altitude: targetHeight,
            groundY: gy,
          })
        } else {
          // —— 阶段三：航线巡航 —— 周期取模实现无限循环：0~routeDuration 飞行 → 停留末航点 600ms → 回到首航点重飞
          const routeElapsed = (now - startTime - transitEnd) % cycle
          const dist = Math.min(total, (routeElapsed / routeDuration) * total)
          let acc = 0
          let x = points[0].x
          let y = points[0].y
          let angle = initialHeading
          for (let i = 0; i < segLens.length; i++) {
            if (dist <= acc + segLens[i] || i === segLens.length - 1) {
              const t = segLens[i] > 1e-6 ? (dist - acc) / segLens[i] : 0
              if (geo && adapter) {
                const rect = adapter.getContainer().getBoundingClientRect()
                const pa = adapter.project({
                  lng: points[i].lng as number,
                  lat: points[i].lat as number,
                })
                const pb = adapter.project({
                  lng: points[i + 1].lng as number,
                  lat: points[i + 1].lat as number,
                })
                const ax = rect.left + pa.x
                const ay = rect.top + pa.y
                const bx = rect.left + pb.x
                const by = rect.top + pb.y
                x = ax + (bx - ax) * t
                y = ay + (by - ay) * t
                angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI
              } else {
                x = points[i].x + (points[i + 1].x - points[i].x) * t
                y = points[i].y + (points[i + 1].y - points[i].y) * t
                angle =
                  (Math.atan2(points[i + 1].y - points[i].y, points[i + 1].x - points[i].x) * 180) /
                  Math.PI
              }
              break
            }
            acc += segLens[i]
          }
          setRouteFlightFlight({
            x,
            y: y - targetHeight * 0.3,
            angle,
            icon,
            planeId,
            altitude: targetHeight,
            groundY: y,
          })
        }
        // 阶段切换日志（一次性）：climbing/descending → 转场平飞 → 航线巡航 衔接留痕
        if (!climbLogged && elapsed >= climbDuration) {
          climbLogged = true
          console.info(
            `[route-flight] ${planeId ?? '无人机'} 高度调整完成（${climbPhase} 20m/s：${startAlt.toFixed(1)}m → ${targetHeight.toFixed(1)}m），切入转场平飞`,
          )
        }
        if (!routeLogged && elapsed >= transitEnd) {
          routeLogged = true
          console.info(
            `[route-flight] ${planeId ?? '无人机'} 已到达首航点，沿 ${points.length} 个航点航线循环巡航`,
          )
        }
        routeFlightFlightRaf.current = requestAnimationFrame(step)
      }
      routeFlightFlightRaf.current = requestAnimationFrame(step)
    },
    [],
  )
  // 停止航线飞行循环：取消动画帧并清除飞行无人机（面板关闭/重新取点/删除航点时调用）
  const stopRouteFlightAnimation = useCallback(() => {
    if (routeFlightFlightRaf.current !== null) {
      cancelAnimationFrame(routeFlightFlightRaf.current)
      routeFlightFlightRaf.current = null
    }
    useFlightAnimStore.getState().setRouteFlightFlight(null)
  }, [])
  // Unmount cleanup: cancel rAF and reset the store slice (migrated from useFlightAnimations)
  useEffect(() => {
    return () => {
      if (routeFlightFlightRaf.current !== null) cancelAnimationFrame(routeFlightFlightRaf.current)
      useFlightAnimStore.getState().setRouteFlightFlight(null)
    }
  }, [])

  return { startRouteFlightAnimation, stopRouteFlightAnimation }
}
