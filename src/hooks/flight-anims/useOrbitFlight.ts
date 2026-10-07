/**
 * @file useOrbitFlight.ts
 * @description Orbit flight animation hook (extracted from useFlightAnimations.ts)
 * @author 4everyy
 * @date 2026-10-07
 */
import { useCallback, useEffect, useRef } from 'react'
import { useFlightAnimStore, usePlaneStatusStore } from '../../stores/index'
import { useRealtimeStore } from '../../features/realtime/realtimeStore'
import type { WaypointFlightMapAdapter } from './types'

export function useOrbitFlight() {
  const orbitFlightRaf = useRef<number | null>(null)

  // 三阶段连贯过渡，与航点飞行「先到高度再平飞」同口径——阶段一「高度调整」…
  const startOrbitFlight = useCallback(
    (params: {
      /** 起飞时飞机图标中心视口坐标（未含升空偏移，与 AircraftLayer 布局同源） */
      plane: { x: number; y: number }
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
      // 当前帧盘旋圆参数（视口圆心 + 像素半径）：地理模式每帧重投影/换算，静态模式取定值
      const resolveCircle = () => {
        if (geo && adapter && center.lng !== undefined && center.lat !== undefined) {
          const rect = adapter.getContainer().getBoundingClientRect()
          const pt = adapter.project({ lng: center.lng, lat: center.lat })
          const mpp = adapter.getMetersPerPixel?.() ?? 1
          return {
            cx: rect.left + pt.x,
            cy: rect.top + pt.y,
            rPx: Math.max(2, radius / mpp),
          }
        }
        return { cx: center.x, cy: center.y, rPx: radius }
      }
      // 切入段终点：圆周最近点（沿飞机→圆心方向自圆心回退半径像素）
      const c0 = resolveCircle()
      const dx = c0.cx - plane.x
      const dy = c0.cy - plane.y
      const dist = Math.hypot(dx, dy)
      const ux = dist > 1e-6 ? dx / dist : 1
      const uy = dist > 1e-6 ? dy / dist : 0
      // 平飞速度口径（任务要求）：地理锚定按恒定 50m/s 地速切入与盘旋（与航点/航线飞行同口径，不随缩放级别变化）
      const speed = geo ? 50 / 1000 / (adapter?.getMetersPerPixel?.() ?? 1) : 0.12 // px/ms
      const entryDuration = Math.max(800, dist / speed)
      // 盘旋段：同线速度换算角速度（地理模式按 50m/s 切向线速度换算整圈时长；整圈时长夹在 3~12s，避免小圆过快/大圆过慢）
      const orbitPeriod = Math.min(12000, Math.max(3000, (2 * Math.PI * c0.rPx) / speed))
      const omega = (2 * Math.PI) / orbitPeriod // rad/ms
      // 切入点位置角（θ₀ = 圆心 → 切入点方向 = -u 方向）：盘旋段自该角起持续绕行
      const entryAngle = Math.atan2(-uy, -ux)
      // 切入方向航向角（阶段一垂直爬升/下降与阶段二切入全程保持）
      const entryHeading = (Math.atan2(uy, ux) * 180) / Math.PI

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

      const startTime = performance.now()
      const step = (now: number) => {
        const elapsed = now - startTime
        // 每帧重算盘旋圆（地理锚定：跟随地图平移/旋转/缩放）
        const { cx, cy, rPx } = resolveCircle()
        if (elapsed < climbDuration) {
          // —— 阶段一：恒速高度调整 —— 水平钉在起飞点地面位置，高度以恒定 20m/s 线性增长/下降逼近盘旋高度…
          const t = Math.min(1, elapsed / climbDuration)
          const visualAlt = startAlt + deltaH * t
          setOrbitFlight({
            x: plane.x,
            y: plane.y - visualAlt * 0.3,
            angle: entryHeading,
            icon,
            planeId,
            altitude: visualAlt,
            groundY: plane.y,
          })
        } else if (elapsed < climbDuration + entryDuration) {
          // —— 阶段二：直线切入 —— 已到达盘旋高度，沿「飞机中心 → 圆周最近点」匀速飞行（航向固定为切入方向；终点每帧按当前圆重算
          const t = Math.min(1, (elapsed - climbDuration) / entryDuration)
          const entry = { x: cx - ux * rPx, y: cy - uy * rPx }
          const gx = plane.x + (entry.x - plane.x) * t
          const gy = plane.y + (entry.y - plane.y) * t
          setOrbitFlight({
            x: gx,
            y: gy - targetHeight * 0.3,
            angle: entryHeading,
            icon,
            planeId,
            altitude: targetHeight,
            groundY: gy,
          })
        } else {
          // —— 阶段三：圆周盘旋 —— 自切入点位置角起持续绕行（屏幕坐标下 θ 递增为顺时针），无限循环
          const theta = entryAngle + omega * (elapsed - climbDuration - entryDuration)
          const gx = cx + rPx * Math.cos(theta)
          const gy = cy + rPx * Math.sin(theta)
          setOrbitFlight({
            x: gx,
            y: gy - targetHeight * 0.3,
            // 运动方向 = 位置角 θ 的切向 (-sinθ, cosθ)
            angle: (Math.atan2(Math.cos(theta), -Math.sin(theta)) * 180) / Math.PI,
            icon,
            planeId,
            altitude: targetHeight,
            groundY: gy,
          })
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
