/**
 * @file useOrbitFlight.ts
 * @description Orbit flight animation hook (extracted from useFlightAnimations.ts)
 * @author 4everyy
 * @date 2026-10-07
 */
import { useCallback, useEffect, useRef } from 'react'
import { useFlightAnimStore, usePlaneStatusStore } from '../../stores/index'
import { useRealtimeStore } from '../../features/realtime/realtimeStore'
import type { LngLat } from '../../map-engines'
import type { WaypointFlightMapAdapter } from './types'
import { bearingDeg, destinationLL, distanceM, norm180, normDeg } from '../../lib/geo'

export function useOrbitFlight() {
  const orbitFlightRaf = useRef<number | null>(null)

  // 三阶段连贯过渡，与航点飞行「先到高度再平飞」同口径——阶段一「高度调整」…
  const startOrbitFlight = useCallback(
    (params: {
      /** 起飞时飞机图标中心视口坐标（未含升空偏移，与 AircraftLayer 布局同源）；携带 WGS84 经纬度时地理锚定——拖拽/缩放/旋转地图后起飞点随图钉在同一地理位置 */
      plane: { x: number; y: number; lng?: number; lat?: number }
      /** 盘旋圆心：视口坐标 + WGS84 经纬度（地理锚定时携带） */
      center: { x: number; y: number; lng?: number; lat?: number }
      /** 盘旋半径：地理锚定时为米制半径；否则为屏幕像素半径 */
      radius: number
      /** 飞行图标切图 */
      icon: string
      /** 地图适配器（经纬度 ↔ 容器像素投影）；缺省时仅做屏幕演示 */
      adapter?: WaypointFlightMapAdapter | null
      /** 目标设备主键（WS telemetry 键）：起始高度取数与 AircraftLayer 标注去重用 */
      planeId?: string
      /** 面板设定盘旋高度（米，相对起飞点） */
      targetHeight: number
    }) => {
      const { setOrbitFlight } = useFlightAnimStore.getState()
      if (orbitFlightRaf.current !== null) cancelAnimationFrame(orbitFlightRaf.current)
      const { plane, center, radius, icon, adapter, planeId, targetHeight } = params
      const geo = !!adapter && center.lng !== undefined && center.lat !== undefined

      // —— 世界坐标口径（geo 模式）：圆心/半径/起飞点全部以 WGS84 地理量参与计算，每帧仅做一次投影落视口——
      //    盘旋方位角为世界方位角（不随视角变化），手动拖拽、缩放、右键旋转视角均不改变飞机与地图的相对位置；
      //    地速恒定 50m/s 严格成立于世界坐标（不再依赖启动时刻的比例尺换算）
      let centerLL: LngLat = { lng: 0, lat: 0 }
      let planeLL0: LngLat = { lng: 0, lat: 0 }
      let entryLL: LngLat = { lng: 0, lat: 0 }
      let entryHeadingWorld = 0 // 切入航向（世界方位角，度）
      let entryBearingWorld0 = 0 // 起盘旋方位角（世界，度）＝ 圆心 → 起飞点方位
      let omegaWorld = 0 // 世界角速度（rad/ms）
      let entryDuration = 800 // 切入段时长（ms）
      // —— 屏幕演示口径（无适配器时）：沿用启动时刻的固定视口参数 ——
      let c0 = { cx: center.x, cy: center.y, rPx: radius }
      let ux = 1
      let uy = 0
      let omegaScreen = 0 // 屏幕角速度（rad/ms）
      let entryAngleScreen = 0 // 切入点位置角（屏幕）
      let entryHeadingScreen = 0 // 切入航向（屏幕角，度）
      if (geo && adapter && center.lng !== undefined && center.lat !== undefined) {
        centerLL = { lng: center.lng, lat: center.lat }
        planeLL0 =
          plane.lng !== undefined && plane.lat !== undefined
            ? { lng: plane.lng, lat: plane.lat }
            : (() => {
                const rect = adapter.getContainer().getBoundingClientRect()
                return adapter.unproject({ x: plane.x - rect.left, y: plane.y - rect.top })
              })()
        // 切入点：圆心沿「圆心 → 起飞点」方位上的圆周点（世界坐标，即圆周最近点）
        entryBearingWorld0 = bearingDeg(centerLL, planeLL0)
        entryLL = destinationLL(centerLL, entryBearingWorld0, radius)
        entryHeadingWorld = bearingDeg(planeLL0, entryLL)
        // 切入段：世界距离 / 恒定 50m/s 地速（最短 800ms 保证可见）
        entryDuration = Math.max(800, (distanceM(planeLL0, entryLL) / 50) * 1000)
        // 盘旋段：整圈时长按世界周长 / 50m/s 换算，夹在 3~12s（避免小圆过快/大圆过慢）
        const periodMs = Math.min(12000, Math.max(3000, ((2 * Math.PI * radius) / 50) * 1000))
        omegaWorld = (2 * Math.PI) / periodMs
      } else {
        // 屏幕演示：切入段终点 = 圆周最近点（沿飞机→圆心方向自圆心回退半径像素）
        c0 = { cx: center.x, cy: center.y, rPx: radius }
        const dx = c0.cx - plane.x
        const dy = c0.cy - plane.y
        const dist = Math.hypot(dx, dy)
        ux = dist > 1e-6 ? dx / dist : 1
        uy = dist > 1e-6 ? dy / dist : 0
        const speed = 0.12 // px/ms
        entryDuration = Math.max(800, dist / speed)
        omegaScreen = (2 * Math.PI) / Math.min(12000, Math.max(3000, (2 * Math.PI * c0.rPx) / speed))
        entryAngleScreen = Math.atan2(-uy, -ux)
        entryHeadingScreen = (Math.atan2(uy, ux) * 180) / Math.PI
      }

      // 起始高度口径（与航点飞行同源）：优先 WS 遥测实测高度
      const snapshot =
        planeId !== undefined ? useRealtimeStore.getState().telemetry[planeId] : undefined
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
      // 阶段一时长：高度差 / 20m/s（恒速增减，与航点飞行同口径）；高度差可忽略时直接切入
      const CLIMB_SPEED_MS = 20
      const climbDuration =
        Math.abs(deltaH) < 0.5 ? 0 : (Math.abs(deltaH) / CLIMB_SPEED_MS) * 1000
      // 阶段一方向标记…
      const climbPhase = deltaH >= 0 ? 'climbing' : 'descending'
      let phaseSwitchLogged = false

      // 经纬度 → 视口坐标（容器原点偏移换算）
      const projectLL = (ll: LngLat): { x: number; y: number } => {
        const rect = adapter!.getContainer().getBoundingClientRect()
        const pt = adapter!.project(ll)
        return { x: rect.left + pt.x, y: rect.top + pt.y }
      }

      const startTime = performance.now()
      const step = (now: number) => {
        const elapsed = now - startTime
        // 当前视角方位角（右键旋转视角时非 0）：世界航向换算屏幕角需扣除
        const bearingMap = adapter?.getBearing?.() ?? 0
        if (geo) {
          if (elapsed < climbDuration) {
            // —— 阶段一：恒速高度调整 —— 水平钉在起飞点地面位置（世界坐标每帧重投影），高度以恒定 20m/s 线性增长/下降逼近盘旋高度
            const p0 = projectLL(planeLL0)
            const t = Math.min(1, elapsed / climbDuration)
            const visualAlt = startAlt + deltaH * t
            setOrbitFlight({
              x: p0.x,
              y: p0.y - visualAlt * 0.3,
              angle: norm180(entryHeadingWorld - 90 - bearingMap),
              icon,
              planeId,
              altitude: visualAlt,
              groundY: p0.y,
            })
          } else if (elapsed < climbDuration + entryDuration) {
            // —— 阶段二：直线切入 —— 已到达盘旋高度，沿「飞机 → 圆周最近点」以 50m/s 地速匀速飞行
            //      （两端点均为世界坐标每帧重投影，拖拽/缩放/旋转视角后仍钉在同一地理位置）
            const a = projectLL(planeLL0)
            const b = projectLL(entryLL)
            const t = Math.min(1, (elapsed - climbDuration) / entryDuration)
            const gx = a.x + (b.x - a.x) * t
            const gy = a.y + (b.y - a.y) * t
            setOrbitFlight({
              x: gx,
              y: gy - targetHeight * 0.3,
              angle: norm180(entryHeadingWorld - 90 - bearingMap),
              icon,
              planeId,
              altitude: targetHeight,
              groundY: gy,
            })
          } else {
            // —— 阶段三：圆周盘旋 —— 盘旋方位角（世界，正北 0 顺时针）自切入点起匀速递增，
            //      每帧由「圆心 + 半径 + 方位角」算出飞机经纬度再投影——视角变化不影响世界轨迹
            const bearingWorld = normDeg(
              entryBearingWorld0 + (omegaWorld * (elapsed - climbDuration - entryDuration) * 180) / Math.PI,
            )
            const p = projectLL(destinationLL(centerLL, bearingWorld, radius))
            setOrbitFlight({
              x: p.x,
              y: p.y - targetHeight * 0.3,
              // 切向航向（顺时针盘旋 → 切向方位 = 盘旋方位 + 90°），换算屏幕角
              angle: norm180(bearingWorld - bearingMap),
              icon,
              planeId,
              altitude: targetHeight,
              groundY: p.y,
            })
          }
        } else {
          // —— 屏幕演示模式（无适配器）：固定视口参数 ——
          const { cx, cy, rPx } = c0
          if (elapsed < climbDuration) {
            const t = Math.min(1, elapsed / climbDuration)
            const visualAlt = startAlt + deltaH * t
            setOrbitFlight({
              x: plane.x,
              y: plane.y - visualAlt * 0.3,
              angle: entryHeadingScreen,
              icon,
              planeId,
              altitude: visualAlt,
              groundY: plane.y,
            })
          } else if (elapsed < climbDuration + entryDuration) {
            const t = Math.min(1, (elapsed - climbDuration) / entryDuration)
            const entry = { x: cx - ux * rPx, y: cy - uy * rPx }
            const gx = plane.x + (entry.x - plane.x) * t
            const gy = plane.y + (entry.y - plane.y) * t
            setOrbitFlight({
              x: gx,
              y: gy - targetHeight * 0.3,
              angle: entryHeadingScreen,
              icon,
              planeId,
              altitude: targetHeight,
              groundY: gy,
            })
          } else {
            const theta = entryAngleScreen + omegaScreen * (elapsed - climbDuration - entryDuration)
            const gx = cx + rPx * Math.cos(theta)
            const gy = cy + rPx * Math.sin(theta)
            setOrbitFlight({
              x: gx,
              y: gy - targetHeight * 0.3,
              angle: (Math.atan2(Math.cos(theta), -Math.sin(theta)) * 180) / Math.PI,
              icon,
              planeId,
              altitude: targetHeight,
              groundY: gy,
            })
          }
        }
        // 阶段切换日志（一次性）：climbing/descending → 切入盘旋 衔接留痕
        if (!phaseSwitchLogged && elapsed >= climbDuration) {
          phaseSwitchLogged = true
          console.info(
            `[orbit-flight] ${planeId ?? '无人机'} 高度调整完成（${climbPhase} 20m/s：${startAlt.toFixed(1)}m → ${targetHeight.toFixed(1)}m），切入盘旋圆`,
          )
        }
        orbitFlightRaf.current = requestAnimationFrame(step)
      }
      orbitFlightRaf.current = requestAnimationFrame(step)
    },
    [],
  )
  // 停止环绕飞行：取消动画帧并清除飞行无人机（面板关闭/重新取点/取消重绘时调用）
  const stopOrbitFlight = useCallback(() => {
    if (orbitFlightRaf.current !== null) {
      cancelAnimationFrame(orbitFlightRaf.current)
      orbitFlightRaf.current = null
    }
    useFlightAnimStore.getState().setOrbitFlight(null)
  }, [])
  // Unmount cleanup: cancel rAF and reset the store slice (migrated from useFlightAnimations)
  useEffect(() => {
    return () => {
      if (orbitFlightRaf.current !== null) cancelAnimationFrame(orbitFlightRaf.current)
      useFlightAnimStore.getState().setOrbitFlight(null)
    }
  }, [])

  return { startOrbitFlight, stopOrbitFlight }
}
