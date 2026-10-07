/**
 * @file ReconFlightOverlay.tsx
 * @description 巡检航线（inspectionRouteStore.planeLines）后
 * @author 4everyy
 * @date 2026-10-07
 */

import { useEffect, useRef } from 'react'
import { type MapAdapter, type PolylineHandle } from '../../../map-engines/types'
import { aircraft } from '../../../config/index'
import { useInspectionRouteStore } from '../../../stores/inspectionRoute'
import { useFlightAnimStore, usePlaneStatusStore } from '../../../stores/index'
import { useRealtimeStore } from '../../../features/realtime/realtimeStore'
import { resolvePlaneSrc } from '../../../lib/planeIcons'
import { DroneFlightIcon } from './DroneFlightIcon'
import type { RouteLinePoint } from '../../../api/index'

/** 转场速度（任务口径）：当前位置 → 巡检航线起点恒定 60m/s 地速 */
const TRANSIT_SPEED_MS = 60
/** 巡航速度（任务口径）：沿巡检航线恒定 40m/s 地速 */
const CRUISE_SPEED_MS = 40
/** 高度调整速度：恒定 20m/s（与航点/航线/环绕飞行动效同口径） */
const CLIMB_SPEED_MS = 20
/** 任务飞行高度：一键创建指令固定下发 200m（TaskPanels handleSubmit 口径） */
const FLIGHT_ALTITUDE = 200
/** 巡航末点停留时长（ms）：到达航线末点后悬停片刻再回起点重飞 */
const HOLD_AT_END_MS = 600
/** 高度视觉抬升系数：y 偏移 = -altitude × 0.3（与航点/航线/环绕动效同口径） */
const ALT_VISUAL_SCALE = 0.3
/** 已飞轨迹采点间距（m）：走过路径每移动该距离补一个轨迹顶点 */
const TRAIL_STEP_M = 10
/** 已飞轨迹视觉：灰色 #C9C9C9（航线本体按区域配色，见InspectionRouteLayer.LINE_COLORS） */
const TRAIL_COLOR = '#C9C9C9'
const TRAIL_WIDTH = 8
/** 已飞轨迹覆盖物 id 前缀（与航线 inspection-route-line- 命名空间隔离） */
const TRAIL_ID_PREFIX = 'recon-flight-trail-'

/** 等距圆柱近似地面距离（m）：经度按纬度余弦收缩，与 useFlightAnimations 同口径 */
function groundDistance(aLng: number, aLat: number, bLng: number, bLat: number): number {
  return Math.hypot(
    (bLng - aLng) * 111320 * Math.cos(((aLat + bLat) / 2) * (Math.PI / 180)),
    (bLat - aLat) * 110540,
  )
}

/** 地理坐标线性插值（转场段/巡航段求当前地理锚点，供已飞轨迹采点） */
function lerpLngLat(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
  t: number,
): { lng: number; lat: number } {
  return { lng: a.lng + (b.lng - a.lng) * t, lat: a.lat + (b.lat - a.lat) * t }
}

/** 单架巡检飞机的预计算静态参数（启动时一次性算好，rAF 循环内只做插值） */
interface ReconDrone {
  /** 目标设备主键（WS telemetry 键；无真实 id 时以 recon-i 兜底仅作渲染键） */
  planeId: string
  /** 机身切图（状态驱动取色，与地面图标同口径） */
  icon: string
  /** 起飞点经纬度… */
  startLng: number
  startLat: number
  /** 起始高度（m）：遥测实测 → rawPlanes.altitude → 0 */
  startAlt: number
  /** 巡检折线点序列（plane_line 剥离首点起飞点后的部分，经纬度） */
  line: RouteLinePoint[]
  /** 分段长度 segLens[i] = 点 i → i+1 的地面距离（m）；total 为全程总长 */
  segLens: number[]
  total: number
  /** 三阶段时长（ms）：爬升 → 转场 → 巡航单程 */
  climbDuration: number
  transitDuration: number
  cruiseDuration: number
}

/** 每机运行时状态：已飞轨迹点集 / 轨迹覆盖物句柄 / 上一帧巡航进度（回绕检测） */
interface ReconRuntime {
  pts: { lng: number; lat: number }[]
  handle: PolylineHandle | null
  prevCruiseElapsed: number
}

interface ReconFlightOverlayProps {
  /** 地图引擎适配器（地理锚定投影；未就绪时不启动动画） */
  adapter: MapAdapter | null
}

/** 巡检飞行动效覆盖层：订阅 flightAnimStore.reconFlights（rAF 每帧写入） */
export function ReconFlightOverlay({ adapter }: ReconFlightOverlayProps) {
  const rafRef = useRef<number | null>(null)
  const reconFlights = useFlightAnimStore((s) => s.reconFlights)
  // 订阅航线数据：一键创建成功/重新创建/清空时引用变化 → 重启动画循环
  const planeLines = useInspectionRouteStore((s) => s.planeLines)

  // ---- 动画驱动：planeLines 变化（一键创建成功/重新创建/清空）即重启 ----
  useEffect(() => {
    const { stopReconFlights, startReconFlights, setReconFlights } =
      useFlightAnimStore.getState()
    // 终止上一轮循环并清空旧快照（依赖变化/卸载时经 cleanup 亦走此处）
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    stopReconFlights()

    const lines = useInspectionRouteStore.getState().planeLines
    if (!adapter || lines.length === 0) return

    // 执行飞机绑定：按 config.aircraft 顺序取前 N 架（N = 航线条数
    const { telemetry } = useRealtimeStore.getState()
    const { devices, rawPlanes } = usePlaneStatusStore.getState()
    const drones: ReconDrone[] = []
    for (let i = 0; i < lines.length; i++) {
      const cfg = aircraft[i]
      // 首点为该机起飞点（后端按飞机当前位置生成，位于巡检区外）：巡检折线自第二个点起（与 InspectionRouteLayer 画线口径一致）
      const rawLine = lines[i]
      const line = rawLine.length > 1 ? rawLine.slice(1) : rawLine
      if (!cfg || line.length < 1) continue
      const raw = rawPlanes[cfg.deviceIndex]
      const realId = raw?.id
      const planeId = realId ?? `recon-${i}`
      const icon = resolvePlaneSrc(devices, cfg.deviceIndex, cfg.src)
      // 当前位置取数优先级：WS 遥测实测 GPS → queryPlaneStatus 坐标 → plane_line首点…
      const snap = realId !== undefined ? telemetry[realId] : undefined
      const tLng = snap?.longitude
      const tLat = snap?.latitude
      const rLng = raw?.longitude
      const rLat = raw?.latitude
      const startLng =
        typeof tLng === 'number' && Number.isFinite(tLng)
          ? tLng
          : typeof rLng === 'number' && Number.isFinite(rLng)
            ? rLng
            : rawLine[0].longitude
      const startLat =
        typeof tLat === 'number' && Number.isFinite(tLat)
          ? tLat
          : typeof rLat === 'number' && Number.isFinite(rLat)
            ? rLat
            : rawLine[0].latitude
      // 起始高度：遥测实测 → rawPlanes.altitude → 0（与航线飞行动效同口径）
      const snapAlt = snap?.altitude
      const rawAlt = Number(raw?.altitude)
      const startAlt =
        typeof snapAlt === 'number' && Number.isFinite(snapAlt)
          ? snapAlt
          : Number.isFinite(rawAlt)
            ? rawAlt
            : 0
      // 航线分段长度（m）与全程总长
      const segLens: number[] = []
      let total = 0
      for (let k = 0; k < line.length - 1; k++) {
        const len = groundDistance(
          line[k].longitude,
          line[k].latitude,
          line[k + 1].longitude,
          line[k + 1].latitude,
        )
        segLens.push(len)
        total += len
      }
      // 三阶段时长：|Δh|/20m/s（<0.5m 可忽略）；转场 60m/s、巡航 40m/s 地速
      const deltaH = FLIGHT_ALTITUDE - startAlt
      const climbDuration =
        Math.abs(deltaH) < 0.5 ? 0 : (Math.abs(deltaH) / CLIMB_SPEED_MS) * 1000
      const transitLen = groundDistance(startLng, startLat, line[0].longitude, line[0].latitude)
      const transitDuration =
        transitLen < 1 ? 0 : Math.max(400, (transitLen / TRANSIT_SPEED_MS) * 1000)
      const cruiseDuration = Math.max(1200, (total / CRUISE_SPEED_MS) * 1000)
      drones.push({
        planeId,
        icon,
        startLng,
        startLat,
        startAlt,
        line,
        segLens,
        total,
        climbDuration,
        transitDuration,
        cruiseDuration,
      })
    }
    if (drones.length === 0) return
    startReconFlights(drones.map((d) => d.planeId))
    console.info(
      `[recon-flight] 巡检任务动效启动：${drones.length} 架执行飞机（${drones
        .map((d) => d.planeId)
        .join('、')}），转场 ${TRANSIT_SPEED_MS}m/s、巡航 ${CRUISE_SPEED_MS}m/s，任务高度 ${FLIGHT_ALTITUDE}m`,
    )

    // 每机运行时状态（已飞轨迹点集 + 覆盖物句柄 + 回绕检测基准）
    const rt: ReconRuntime[] = drones.map(() => ({
      pts: [],
      handle: null,
      prevCruiseElapsed: -1,
    }))

    // 经纬度 → 视口坐标（每帧重算以跟随地图平移/缩放，与航线飞行动效同口径）
    const rect = () => adapter.getContainer().getBoundingClientRect()
    const projectToViewport = (lng: number, lat: number) => {
      const r = rect()
      const pt = adapter.project({ lng, lat })
      return { x: r.left + pt.x, y: r.top + pt.y }
    }

    // 已飞轨迹采点：距上一顶点 ≥ TRAIL_STEP_M 时追加当前地理锚点并增量更新覆盖物（首点惰性创建）。
    const pushTrail = (di: number, geo: { lng: number; lat: number }) => {
      const r = rt[di]
      const last = r.pts[r.pts.length - 1]
      if (last && groundDistance(last.lng, last.lat, geo.lng, geo.lat) < TRAIL_STEP_M) return
      r.pts.push(geo)
      if (!r.handle) {
        r.handle = adapter.addPolyline(`${TRAIL_ID_PREFIX}${di}`, r.pts, {
          width: TRAIL_WIDTH,
          color: TRAIL_COLOR,
          opacity: 1,
        })
      } else {
        adapter.setPolylinePoints(r.handle, r.pts)
      }
    }

    const startTime = performance.now()
    const step = (now: number) => {
      const next: Record<string, import('../../../hooks/useFlightAnimations').FlightState> = {}
      drones.forEach((d, di) => {
        const r = rt[di]
        const elapsed = now - startTime
        const transitEnd = d.climbDuration + d.transitDuration
        const cycle = d.cruiseDuration + HOLD_AT_END_MS
        if (elapsed < d.climbDuration) {
          // —— 阶段一：恒速高度调整 —— 水平钉在起飞点，高度线性逼近任务高度（原地爬升不产生已飞轨迹）
          const t = Math.min(1, elapsed / d.climbDuration)
          const alt = d.startAlt + (FLIGHT_ALTITUDE - d.startAlt) * t
          const g = projectToViewport(d.startLng, d.startLat)
          const h = projectToViewport(d.line[0].longitude, d.line[0].latitude)
          next[d.planeId] = {
            x: g.x,
            y: g.y - alt * ALT_VISUAL_SCALE,
            angle: (Math.atan2(h.y - g.y, h.x - g.x) * 180) / Math.PI,
            icon: d.icon,
            planeId: d.planeId,
            altitude: alt,
            groundY: g.y,
          }
        } else if (elapsed < transitEnd) {
          // —— 阶段二：转场平飞 —— 当前位置 → 航线起点，两端每帧重投影，60m/s匀速
          const t = Math.min(1, (elapsed - d.climbDuration) / d.transitDuration)
          const a = projectToViewport(d.startLng, d.startLat)
          const b = projectToViewport(d.line[0].longitude, d.line[0].latitude)
          next[d.planeId] = {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t - FLIGHT_ALTITUDE * ALT_VISUAL_SCALE,
            angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
            icon: d.icon,
            planeId: d.planeId,
            altitude: FLIGHT_ALTITUDE,
            groundY: a.y + (b.y - a.y) * t,
          }
        } else {
          // —— 阶段三：航线巡航 —— 沿折线按累计距离定位…
          const cruiseElapsed = (elapsed - transitEnd) % cycle
          // 回绕检测：巡航进度回退即新一圈开始，轨迹清零自航线起点重新累积
          if (cruiseElapsed < r.prevCruiseElapsed) r.pts = []
          r.prevCruiseElapsed = cruiseElapsed
          const dist = Math.min(d.total, (cruiseElapsed / d.cruiseDuration) * d.total)
          // 退化保护：巡检折线仅单点（剥首点后）——到达后原地悬停，无轨迹
          if (d.line.length === 1) {
            const g = projectToViewport(d.line[0].longitude, d.line[0].latitude)
            next[d.planeId] = {
              x: g.x,
              y: g.y - FLIGHT_ALTITUDE * ALT_VISUAL_SCALE,
              angle: 0,
              icon: d.icon,
              planeId: d.planeId,
              altitude: FLIGHT_ALTITUDE,
              groundY: g.y,
            }
            return
          }
          // 先在地理空间定位所在段与段内比例（供轨迹采点），再投影到视口
          let acc = 0
          let segIdx = d.segLens.length - 1
          let tGeo = 0
          for (let i = 0; i < d.segLens.length; i++) {
            if (dist <= acc + d.segLens[i] || i === d.segLens.length - 1) {
              segIdx = i
              tGeo =
                d.segLens[i] > 1e-6
                  ? Math.min(1, Math.max(0, (dist - acc) / d.segLens[i]))
                  : 0
              break
            }
            acc += d.segLens[i]
          }
          const ga = { lng: d.line[segIdx].longitude, lat: d.line[segIdx].latitude }
          const gb = { lng: d.line[segIdx + 1].longitude, lat: d.line[segIdx + 1].latitude }
          const geo = lerpLngLat(ga, gb, tGeo)
          const a = projectToViewport(ga.lng, ga.lat)
          const b = projectToViewport(gb.lng, gb.lat)
          const x = a.x + (b.x - a.x) * tGeo
          const y = a.y + (b.y - a.y) * tGeo
          next[d.planeId] = {
            x,
            y: y - FLIGHT_ALTITUDE * ALT_VISUAL_SCALE,
            angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
            icon: d.icon,
            planeId: d.planeId,
            altitude: FLIGHT_ALTITUDE,
            groundY: y,
          }
          pushTrail(di, geo)
        }
      })
      setReconFlights(next)
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      // 已飞轨迹覆盖物随动效一并清除（任务重建/清空/卸载）
      rt.forEach((_, i) => adapter.removePolyline(`${TRAIL_ID_PREFIX}${i}`))
      useFlightAnimStore.getState().stopReconFlights()
    }
  }, [adapter, planeLines])

  return (
    <>
      {/* 多机飞行组合图标（底座正置 + 机身对准轨迹切线方向） */}
      {Object.entries(reconFlights).map(([id, f]) => (
        <DroneFlightIcon key={id} x={f.x} y={f.y} angle={f.angle} icon={f.icon} />
      ))}
      {/* 多机高度标注：与 AircraftLayer/RallyPointAltitudeOverlay 同款样式，
          虚线自图标中心垂直延伸至地面轨迹点，数值悬于图标上方逐帧刷新 */}
      {Object.entries(reconFlights).map(([id, f]) => {
        const alt = f.altitude
        const groundY = f.groundY
        if (alt === undefined || groundY === undefined) return null
        const bottomY = Math.max(groundY, f.y + 4)
        const lineH = bottomY - f.y
        return (
          <span
            key={`alt-${id}`}
            className="aircraft-altitude"
            aria-hidden="true"
            style={{
              position: 'fixed',
              left: f.x,
              top: f.y,
              height: lineH,
              transition: 'none',
              zIndex: 1502,
            }}
          >
            <span className="aircraft-altitude__stick" />
            <span className="aircraft-altitude__value" style={{ top: -34 }}>
              {Math.floor(alt).toFixed(3)}m
            </span>
          </span>
        )
      })}
    </>
  )
}