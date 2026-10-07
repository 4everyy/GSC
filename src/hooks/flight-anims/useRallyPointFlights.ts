/**
 * @file useRallyPointFlights.ts
 * @description Rally-point flight animation hook (extracted from useFlightAnimations.ts)
 * @author 4everyy
 * @date 2026-10-07
 */
import { useCallback, useEffect, useRef } from 'react'
import { useFlightAnimStore, usePlaneStatusStore } from '../../stores/index'
import { useRealtimeStore } from '../../features/realtime/realtimeStore'

export function useRallyPointFlights() {
  const rallyPointFlightRaf = useRef<number | null>(null)
  // 集结点模拟飞行进行中标记：队形变更时判断是否需要以新布局重启动画
  const rallyPointFlyingRef = useRef(false)

  // 停止集结点循环飞行：取消动画帧并清除全部飞行无人机（无动画时为无操作）
  const stopRallyPointFlights = useCallback(() => {
    rallyPointFlyingRef.current = false
    if (rallyPointFlightRaf.current !== null) {
      cancelAnimationFrame(rallyPointFlightRaf.current)
      rallyPointFlightRaf.current = null
    }
    const { rallyPointFlights, setRallyPointFlights } = useFlightAnimStore.getState()
    if (rallyPointFlights.length > 0) setRallyPointFlights([])
  }, [])
  // 集结点模拟飞行（真实指令链路动效口径，与航点/环绕飞行「先到高度再平飞」一致，按面板参数驱动三阶段）：阶段一「高度调整」：各机水平钉在起飞点地面位置
  const startRallyPointFlights = useCallback(
    (
      flights: {
        x1: number
        y1: number
        x2: number
        y2: number
        icon: string
        /** 目标设备主键（WS telemetry 键）：爬升段起始高度取数（遥测 → mock → 0m） */
        planeId?: string
      }[],
      params: {
        /** 面板设定起飞高度（米，相对起飞点）：阶段一恒速 20m/s 爬升目标 */
        targetHeight: number
        /** 面板设定集结速度（m/s）：阶段二转场速度（10m/s ≈ 100px/s 观感折算） */
        speed: number
        /** 队形变更续飞：自各机当前快照位置/高度续飞新集结坪（不重放爬升段） */
        resume?: boolean
        /** 终态机头朝向（屏幕角，0°=正右）：默认 -90°=朝上，与集结坪预设无人机图标机头一致 */
        finalHeading?: number
      },
    ) => {
      // 续飞快照须在 stop 清空 store 前捕获（各机当前地面轨迹点与实时高度）
      const prevFlights = params.resume ? useFlightAnimStore.getState().rallyPointFlights : []
      const { setRallyPointFlights } = useFlightAnimStore.getState()
      stopRallyPointFlights()
      if (flights.length === 0) return
      const { targetHeight, speed } = params
      // 终态机头朝向：与集结坪预设无人机图标机头方向一致——图标切图机头朝上，atan2 屏幕角口径（0°=正右、顺时针为正）下「上」= -90°
      const finalHeading = params.finalHeading ?? -90
      // 落坪对齐段时长：下降（视觉升空量 → 0）与机头旋转至图标朝向同时完成
      const LAND_MS = 900
      // 高度调整垂直速度（与航点/航线/环绕飞行同口径 20m/s）
      const CLIMB_SPEED_MS = 20
      // 转场像素速度：集结速度（m/s）× 0.01 → 10m/s ≈ 100px/s（屏幕观感口径）
      const pxPerMs = Math.max(0.01, speed * 0.01)
      const rawPlanes = usePlaneStatusStore.getState().rawPlanes
      // 各机分段参数：起点（续飞快照 / 飞机图标中心）、起始高度（快照 → 遥测 → mock rawPlanes → 0m 兜底）
      const segs = flights.map((f, i) => {
        const prev = prevFlights[i]
        const ground =
          prev && prev.groundY !== undefined
            ? { x: prev.x, y: prev.groundY }
            : { x: f.x1, y: f.y1 }
        const prevAlt = prev?.altitude
        let startAlt: number
        if (prevAlt !== undefined && Number.isFinite(prevAlt)) {
          startAlt = prevAlt
        } else {
          const snapshot =
            f.planeId !== undefined
              ? useRealtimeStore.getState().telemetry[f.planeId]
              : undefined
          const mockAlt =
            f.planeId !== undefined
              ? Number(rawPlanes.find((p) => p.id === f.planeId)?.altitude)
              : NaN
          startAlt =
            snapshot && Number.isFinite(snapshot.altitude)
              ? snapshot.altitude
              : Number.isFinite(mockAlt)
                ? mockAlt
                : 0
        }
        const deltaH = targetHeight - startAlt
        return {
          ground,
          startAlt,
          climbMs: Math.abs(deltaH) < 0.5 ? 0 : (Math.abs(deltaH) / CLIMB_SPEED_MS) * 1000,
          cruiseMs: Math.hypot(f.x2 - ground.x, f.y2 - ground.y) / pxPerMs,
          // 机头全程对准「起点 → 对应集结坪」航线方向（切图机头朝右，atan2 屏幕角）
          heading: (Math.atan2(f.y2 - ground.y, f.x2 - ground.x) * 180) / Math.PI,
          // 落坪段机头旋转量：heading → finalHeading 最短路径（归一化到 ±180°）
          turnDelta:
            ((finalHeading -
              (Math.atan2(f.y2 - ground.y, f.x2 - ground.x) * 180) / Math.PI +
              540) %
              360) -
            180,
        }
      })
      const startTime = performance.now()
      let arrivalLogged = false
      const step = (now: number) => {
        const elapsed = now - startTime
        let allArrived = true
        setRallyPointFlights(
          flights.map((f, i) => {
            const s = segs[i]
            // —— 阶段一：恒速高度调整 —— 水平钉在起点地面位置，高度线性逼近起飞高度…
            if (elapsed < s.climbMs) {
              allArrived = false
              const t = elapsed / s.climbMs
              const alt = s.startAlt + (targetHeight - s.startAlt) * t
              return {
                x: s.ground.x,
                y: s.ground.y - alt * 0.3,
                angle: s.heading,
                icon: f.icon,
                // 全程携带目标设备主键：确认集结起飞即隐藏原起飞点地面图标
                planeId: f.planeId,
                altitude: alt,
                groundY: s.ground.y,
              }
            }
            // —— 阶段二：按集结速度转场 —— 保持起飞高度沿「起点 → 对应集结坪」航线匀速飞行（各机航程不同、先后到达），高度不变
            const cruiseElapsed = elapsed - s.climbMs
            if (cruiseElapsed < s.cruiseMs) {
              allArrived = false
              const t = cruiseElapsed / s.cruiseMs
              const gx = s.ground.x + (f.x2 - s.ground.x) * t
              const gy = s.ground.y + (f.y2 - s.ground.y) * t
              return {
                x: gx,
                y: gy - targetHeight * 0.3,
                angle: s.heading,
                icon: f.icon,
                // 全程携带目标设备主键：转场飞行中原起飞点地面图标保持隐藏
                planeId: f.planeId,
                altitude: targetHeight,
                groundY: gy,
              }
            }
            // —— 阶段三：落坪对齐 —— 到达集结坪上空后边下降边转向：视觉升空量与高度标注同步降为 0
            const landElapsed = elapsed - s.climbMs - s.cruiseMs
            if (landElapsed < LAND_MS) {
              allArrived = false
              const t = landElapsed / LAND_MS
              const ease = t * t * (3 - 2 * t)
              return {
                x: f.x2,
                y: f.y2 - targetHeight * 0.3 * (1 - ease),
                angle: s.heading + s.turnDelta * ease,
                icon: f.icon,
                // 全程携带目标设备主键：落坪下降中原起飞点地面图标保持隐藏
                planeId: f.planeId,
                altitude: targetHeight * (1 - ease),
                groundY: f.y2,
              }
            }
            // —— 阶段四：精准落坪定格 —— 飞机中心与集结坪预设图标中心完全重合，机头朝向与图标一致（-90°=朝上），多机按所选队形就位
            return {
              x: f.x2,
              y: f.y2,
              angle: finalHeading,
              icon: f.icon,
              // 目标设备主键：AircraftLayer 据此关联原地面图标（任务完成后隐藏）
              planeId: f.planeId,
              altitude: 0,
              groundY: f.y2,
              landed: true,
            }
          }),
        )
        if (allArrived) {
          // 全部到达：动画循环自然结束，末帧悬停状态保留在 store
          rallyPointFlightRaf.current = null
          if (!arrivalLogged) {
            arrivalLogged = true
            console.info(
              `[rally-point] ${segs.length} 机已按队形精准落坪：飞机中心与集结坪预设图标重合、机头对齐图标朝向（${finalHeading}°），起飞高度 ${targetHeight}m / 集结速度 ${speed}m/s`,
            )
          }
          return
        }
        rallyPointFlightRaf.current = requestAnimationFrame(step)
      }
      rallyPointFlyingRef.current = true
      rallyPointFlightRaf.current = requestAnimationFrame(step)
    },
    [stopRallyPointFlights],
  )
  // Unmount cleanup: cancel rAF and reset the store slice (migrated from useFlightAnimations)
  useEffect(() => {
    return () => {
      if (rallyPointFlightRaf.current !== null) cancelAnimationFrame(rallyPointFlightRaf.current)
      useFlightAnimStore.getState().setRallyPointFlights([])
    }
  }, [])

  return { startRallyPointFlights, stopRallyPointFlights, rallyPointFlyingRef }
}
