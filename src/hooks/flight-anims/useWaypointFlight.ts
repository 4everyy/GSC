/**
 * @file useWaypointFlight.ts
 * @description Waypoint flight animation hook (extracted from useFlightAnimations.ts)
 * @author 4everyy
 * @date 2026-10-07
 */
import { useCallback, useEffect, useRef } from 'react'
import { useFlightAnimStore, usePlaneStatusStore } from '../../stores/index'
import { useRealtimeStore } from '../../features/realtime/realtimeStore'
import type { WaypointFlightMapAdapter } from './types'

export function useWaypointFlight() {
  const waypointFlightRaf = useRef<number | null>(null)

  // 停止航点飞行循环：取消动画帧并清除飞行无人机（面板关闭/重新取点/急停·返航·降落指令下发时调用
  const stopWaypointFlight = useCallback(() => {
    if (waypointFlightRaf.current !== null) {
      cancelAnimationFrame(waypointFlightRaf.current)
      waypointFlightRaf.current = null
    }
    useFlightAnimStore.getState().setWaypointFlight(null)
  }, [])
  // HTTP 指令下发成功并收到服务端 WS 回执…
  const startWaypointFlight = useCallback(
    (params: {
      /** 目标设备主键（WS telemetry 键）；缺省时仅做屏幕插值演示兜底 */
      planeId?: string
      /** 飞行图标切图 */
      icon: string
      /** 地图适配器（经纬度 ↔ 容器像素投影）；缺省时仅做屏幕插值演示 */
      adapter?: WaypointFlightMapAdapter | null
      /** 航点：图钉视口坐标 + WGS84 经纬度 */
      waypoint: { x: number; y: number; lng: number; lat: number }
      /** 面板设定飞行高度（米，相对起飞点）：阶段一恒速爬升/下降目标 */
      targetHeight: number
      /** 启动时飞机图标中心视口坐标：反投影为经纬度，作为水平轨迹的锚定起点 */
      aircraftX: number
      aircraftY: number
    }) => {
      const { setWaypointFlight } = useFlightAnimStore.getState()
      if (waypointFlightRaf.current !== null) cancelAnimationFrame(waypointFlightRaf.current)
      const { planeId, icon, adapter, waypoint, targetHeight, aircraftX, aircraftY } = params

      // 启动快照：当前最新遥测帧…
      const snapshot =
        planeId !== undefined ? useRealtimeStore.getState().telemetry[planeId] : undefined
      // 起始高度口径（与航线/环绕飞行同源）：优先 WS 遥测实测高度
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
      // 初始显示高度：起始高度（阶段一自该值恒速爬升/下降至设定高度）
      let visualAlt = startAlt
      // 新遥测高度到达时自当前显示高…
      let altFrom = visualAlt
      let altTo = visualAlt
      let altT0 = performance.now()
      const ALT_EASE_MS = 800
      const updateVisualAlt = (frameNow: number, target: number) => {
        if (Math.abs(target - altTo) > 1e-6) {
          altFrom = visualAlt
          altTo = target
          altT0 = frameNow
        }
        const k = Math.min(1, (frameNow - altT0) / ALT_EASE_MS)
        const eased = 1 - Math.pow(1 - k, 3)
        visualAlt = altFrom + (altTo - altFrom) * eased
      }
      // 遥测高度停滞检测：liveAlt 较上次记录变化 >0.1m 时刷新时间戳——用于阶段一切换兜底…
      let lastSeenAlt = snapshot && Number.isFinite(snapshot.altitude) ? snapshot.altitude : null
      let lastAltChangeAt = performance.now()
      // 阶段一「高度调整」时间线：高度差 / 20m/s 恒速爬升/下降（与航线/环绕/集结点飞行同口径）
      const deltaH = targetHeight - startAlt
      const CLIMB_SPEED_MS = 20
      const climbDuration =
        Math.abs(deltaH) < 0.5 ? 0 : (Math.abs(deltaH) / CLIMB_SPEED_MS) * 1000
      const climbStartAt = performance.now()
      // 遥测到位确认标记：阶段一内遥测高度贴近/停滞兜底切入时置 true——阶段二高度显示随遥测联动
      let telemetryConfirmed = false
      // 水平轨迹（经纬度）：启动时以飞机图标当前位置（aircraftX/Y 视口坐标
      let groundLL: { lng: number; lat: number } | null = null
      if (adapter) {
        const rect = adapter.getContainer().getBoundingClientRect()
        const ll = adapter.unproject({ x: aircraftX - rect.left, y: aircraftY - rect.top })
        groundLL = { lng: ll.lng, lat: ll.lat }
      }
      // 平飞速度（m/s 地速）：遥测 velocityY 的平滑值
      const SPEED_FALLBACK_MS = 15
      let speedSmooth = SPEED_FALLBACK_MS
      // 遥测断流看门狗：最后收到新帧时刻（曾收到过遥测后才生效）
      let lastTelemetryAt = performance.now()
      let everHadTelemetry = snapshot !== undefined

      // 经纬度 → 视口坐标（容器像素 + 容器视口偏移；每帧重算以跟随地图平移/缩放）
      const projectToViewport = (lng: number, lat: number) => {
        if (!adapter) return null
        const rect = adapter.getContainer().getBoundingClientRect()
        const pt = adapter.project({ lng, lat })
        return { x: rect.left + pt.x, y: rect.top + pt.y }
      }

      // 渲染状态：地面轨迹点（视口坐标，无适配器锚定时取图标屏幕坐标）+ 航向角
      let ground = { x: aircraftX, y: aircraftY }
      if (groundLL) {
        const g0 = projectToViewport(groundLL.lng, groundLL.lat)
        if (g0) ground = g0
      }
      // 初始航向：起飞点 → 航点图钉方向（切图机头朝右，rotate = atan2 屏幕角）
      let angle = (Math.atan2(waypoint.y - aircraftY, waypoint.x - aircraftX) * 180) / Math.PI
      let targetHeading: number | null = angle
      // 阶段标记与一次性日志
      let phase: 'altitude' | 'follow' = 'altitude'
      let arrivalLogged = false
      // 新帧检测：store 每设备仅存最新一帧（覆盖写），以对象引用判等
      let lastTelemetrySeq: unknown = snapshot
      let lastNow = performance.now()

      const step = (now: number) => {
        const dt = Math.min(100, now - lastNow)
        lastNow = now
        const live =
          planeId !== undefined ? useRealtimeStore.getState().telemetry[planeId] : undefined
        // 新帧检测（对象引用判等）+ 遥测断流看门狗：曾收到遥测后 >5s 无新帧判定链路失联
        if (live !== undefined && live !== lastTelemetrySeq) {
          lastTelemetrySeq = live
          lastTelemetryAt = now
          everHadTelemetry = true
        }
        if (everHadTelemetry && planeId !== undefined && now - lastTelemetryAt > 5000) {
          console.warn(`[waypoint-flight] ${planeId} 遥测断流 >5s，航点飞行动效终止回 idle`)
          stopWaypointFlight()
          return
        }
        // 屏幕兜底插值平滑系数（视觉滤波，τ=250ms；地理平飞不使用，按地速步进）
        const alpha = 1 - Math.exp(-dt / 250)

        // 最新遥测数值…
        const liveAlt = live && Number.isFinite(live.altitude) ? live.altitude : null
        const liveSpeed =
          live && Number.isFinite(live.velocityY) && live.velocityY > 0.1 ? live.velocityY : null

        // 遥测高度停滞时间戳刷新（变化 >0.1m 视为仍在爬升/下降）
        if (liveAlt !== null && (lastSeenAlt === null || Math.abs(liveAlt - lastSeenAlt) > 0.1)) {
          lastSeenAlt = liveAlt
          lastAltChangeAt = now
        }
        // 阶段一 → 阶段二切换（三路择先）：①遥测高度贴近面板设定飞行高度（|Δ|<0.5m，与航线/环绕飞行「高度差 <0.5m 视为到位」同口径）
        const altReached = liveAlt !== null && Math.abs(liveAlt - targetHeight) < 0.5
        const altStalled =
          liveAlt !== null && Math.abs(liveAlt - targetHeight) < 1 && now - lastAltChangeAt > 3000
        const climbDone = now - climbStartAt >= climbDuration
        if (phase === 'altitude' && (altReached || altStalled || climbDone)) {
          phase = 'follow'
          telemetryConfirmed = altReached || altStalled
          if (telemetryConfirmed && liveAlt !== null) {
            visualAlt = liveAlt
            altFrom = liveAlt
            altTo = liveAlt
          }
          const climbReason = altReached
            ? '遥测高度贴近设定值（|Δ|<0.5m）'
            : altStalled
              ? '遥测高度停滞 3s 兜底（|Δ|<1m）'
              : `恒速 20m/s 垂直${deltaH >= 0 ? '爬升' : '下降'}到位（${startAlt.toFixed(1)}m → ${targetHeight.toFixed(1)}m）`
          console.info(
            `[waypoint-flight] ${planeId} 高度调整完成（${climbReason}），切入航点平飞${telemetryConfirmed ? '（高度与地速均由服务端遥测驱动）' : '（高度钉在设定值，地速由服务端遥测驱动）'}`,
          )
        }

        if (phase === 'altitude') {
          // —— 阶段一「高度调整」：水平钉住起飞点（启动时已由飞机图标位置反投影锚定，每帧重投影保持地图平移/缩放贴地；无适配器则钉住图标屏幕坐标）
          if (groundLL) {
            const g = projectToViewport(groundLL.lng, groundLL.lat)
            if (g) ground = g
          }
          const ct = climbDuration > 0 ? Math.min(1, (now - climbStartAt) / climbDuration) : 1
          visualAlt = startAlt + deltaH * ct
        } else if (planeId === undefined) {
          // —— 阶段二演示兜底（无设备主键）：屏幕插值飞向航点（高度保持设定值），仅前端演示用
          ground = {
            x: ground.x + (waypoint.x - ground.x) * alpha,
            y: ground.y + (waypoint.y - ground.y) * alpha,
          }
          const hdx = waypoint.x - ground.x
          const hdy = waypoint.y - ground.y
          if (Math.hypot(hdx, hdy) > 2) {
            targetHeading = (Math.atan2(hdy, hdx) * 180) / Math.PI
          }
        } else {
          // —— 阶段二「航点平飞」：高度保持设定值平飞（遥测确认到位后随遥测联动，800ms easeOut 分段过渡）
          if (!telemetryConfirmed && liveAlt !== null && Math.abs(liveAlt - targetHeight) < 0.5) {
            telemetryConfirmed = true
          }
          if (telemetryConfirmed && liveAlt !== null) updateVisualAlt(now, liveAlt)
          // 平飞速度：遥测地速平滑（τ≈800ms）消除 1~2Hz 遥测的速度阶梯
          if (liveSpeed !== null) {
            speedSmooth += (liveSpeed - speedSmooth) * (1 - Math.exp(-dt / 800))
          }
          if (groundLL && adapter) {
            // 地理空间匀速步进：剩余距离 → 本帧步长比例（到达后 ratio=1 钉住）
            const stepMeters = (speedSmooth * dt) / 1000
            const midLatRad = ((groundLL.lat + waypoint.lat) / 2) * (Math.PI / 180)
            const dLngM = (waypoint.lng - groundLL.lng) * 111320 * Math.cos(midLatRad)
            const dLatM = (waypoint.lat - groundLL.lat) * 110540
            const distM = Math.hypot(dLngM, dLatM)
            const ratio = distM > 1e-6 ? Math.min(1, stepMeters / distM) : 1
            groundLL = {
              lng: groundLL.lng + (waypoint.lng - groundLL.lng) * ratio,
              lat: groundLL.lat + (waypoint.lat - groundLL.lat) * ratio,
            }
            const g = projectToViewport(groundLL.lng, groundLL.lat)
            const w = projectToViewport(waypoint.lng, waypoint.lat)
            if (g) ground = g
            // 机头对准「当前位置 → 航点」方向（>2px 才刷新，到达后航向锁定不抖动）
            if (g && w) {
              const hdx = w.x - g.x
              const hdy = w.y - g.y
              if (Math.hypot(hdx, hdy) > 2) {
                targetHeading = (Math.atan2(hdy, hdx) * 180) / Math.PI
              }
            }
            // 到达航点（当前投影点距航点投影 <10px）记录一次日志，此后钉住悬停
            if (!arrivalLogged && g && w && Math.hypot(w.x - g.x, w.y - g.y) < 10) {
              arrivalLogged = true
              console.info(
                `[waypoint-flight] ${planeId} 已到达航点 (${waypoint.lng.toFixed(6)}, ${waypoint.lat.toFixed(6)}) 高度 ${visualAlt.toFixed(1)}m，钉住航点悬停（高度继续跟随遥测）`,
              )
            }
          } else {
            // 无适配器（无锚定经纬度）：退回屏幕指数插值飞向航点（兼容兜底）
            ground = {
              x: ground.x + (waypoint.x - ground.x) * alpha,
              y: ground.y + (waypoint.y - ground.y) * alpha,
            }
            const hdx = waypoint.x - ground.x
            const hdy = waypoint.y - ground.y
            if (Math.hypot(hdx, hdy) > 2) {
              targetHeading = (Math.atan2(hdy, hdx) * 180) / Math.PI
            }
          }
        }

        // 航向角短弧平滑转向（切图机头朝右为 0°）：向目标航向以 τ≈180ms 指数平滑转向（恒取最短弧），机头全程对准运动方向不跳变
        if (targetHeading !== null) {
          const delta = ((targetHeading - angle + 540) % 360) - 180
          angle += delta * (1 - Math.exp(-dt / 180))
        }

        // 视口坐标 = 地面轨迹点 - 升空像素（与 AircraftLayer 的 --aircraft-lift 同公式
        setWaypointFlight({
          x: ground.x,
          y: ground.y - visualAlt * 0.3,
          angle,
          icon,
          // 目标设备主键：AircraftLayer 据此隐藏该机原地面冻结标注（去重）
          planeId,
          altitude: visualAlt,
          groundY: ground.y,
        })

        waypointFlightRaf.current = requestAnimationFrame(step)
      }
      waypointFlightRaf.current = requestAnimationFrame(step)
    },
    [stopWaypointFlight],
  )
  // Unmount cleanup: cancel rAF and reset the store slice (migrated from useFlightAnimations)
  useEffect(() => {
    return () => {
      if (waypointFlightRaf.current !== null) cancelAnimationFrame(waypointFlightRaf.current)
      useFlightAnimStore.getState().setWaypointFlight(null)
    }
  }, [])

  return { startWaypointFlight, stopWaypointFlight }
}
