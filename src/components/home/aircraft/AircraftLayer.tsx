/**
 * @file AircraftLayer.tsx
 * @description AircraftLayer —— 地图上的无人机图标层（自 HomePage.tsx 拆出）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { memo, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { computePanelPlacement, placementToClasses } from '../../../utils/index'
import batteryMidIcon from '../../../assets/device/battery-mid.png'
import { STATUS_PLANE_ICON } from '../../../lib/planeIcons'
import { useDeviceLinkStore, useFlightAnimStore, usePlaneStatusStore } from '../../../stores/index'
import { useRealtimeStore } from '../../../features/realtime/realtimeStore'
import { useShallow } from 'zustand/react/shallow'

type FlightAnimSnapshot = ReturnType<typeof useFlightAnimStore.getState>

/** 航点/航线/环绕单机动画的 planeId + 集结点/编… */
const collectFlyingPlaneIds = (s: FlightAnimSnapshot): string[] => {
  const ids: string[] = []
  const single = s.waypointFlight ?? s.routeFlightFlight ?? s.orbitFlight
  if (single?.planeId !== undefined) ids.push(single.planeId)
  for (const f of s.rallyPointFlights) if (f.planeId !== undefined) ids.push(f.planeId)
  for (const f of s.formationFlightFlights) if (f.planeId !== undefined) ids.push(f.planeId)
  // recon 巡检机不在此列：其地面图标整体隐藏（见下方 reconPlaneIds）
  return ids
}

/** 这些机已由 Re… */
const collectReconPlaneIds = (s: FlightAnimSnapshot): string[] => Object.keys(s.reconFlights)

/** 取 rallyPointFlights 全部 p… */
const collectRallyActivePlaneIds = (s: FlightAnimSnapshot): string[] => {
  const ids: string[] = []
  for (const f of s.rallyPointFlights)
    if (f.planeId !== undefined) ids.push(f.planeId)
  return ids
}

/* STATUS_PLANE_ICON: moved to lib/planeIcons */

export interface AircraftItem {
  label: string
  className: string
  src: string
  /** 底部光晕图（组合图标下层），与 src 同色成套 */
  bottomSrc: string
  deviceIndex: number
}

export interface AircraftLayerProps {
  aircraft: AircraftItem[]
  aircraftPositions: { x: number; y: number }[]
  selectedDevices: Set<number>
  returnHomeOpen: boolean
  focusedAircraft: number | null
  onHoverDevice: (deviceIndex: number | null) => void
  onDragStart: (index: number, e: ReactMouseEvent) => void
  onAircraftClick: (deviceIndex: number) => void
  onAircraftDoubleClick: (index: number) => void
}

/** hover 状态经 deviceLinkStore 内部订阅：hover 变化只重渲染本组件（不冒泡到HomePage） */
function AircraftLayerInner({
  aircraft,
  aircraftPositions,
  selectedDevices,
  returnHomeOpen,
  focusedAircraft,
  onHoverDevice,
  onDragStart,
  onAircraftClick,
  onAircraftDoubleClick,
}: AircraftLayerProps) {
  const hoveredDevice = useDeviceLinkStore((s) => s.hoveredDevice)
  // HTTP 设备快照：queryPlaneStatus 仅页面加载时拉取一次（无轮询）
  const devices = usePlaneStatusStore((s) => s.devices)
  // WS 实时遥测：pub#device / pub#telemetry 频道 swarmState…
  const wsTelemetry = useRealtimeStore((s) => s.telemetry)
  const rawPlanes = usePlaneStatusStore((s) => s.rawPlanes)
  // 这些机已由飞行动…
  const flyingPlaneIds = useFlightAnimStore(useShallow(collectFlyingPlaneIds))
  // 巡检巡航中的机：已由 ReconFlightOverlay 飞行动效完全接管呈现…
  const reconPlaneIds = useFlightAnimStore(useShallow(collectReconPlaneIds))
  // 集结任务执行中的机（爬升/转场/落坪定格全程）：原起飞点地面图标（图标/标签/hover 面板/垂线）整体隐藏，呈现由飞行动效图标接管
  const rallyActivePlaneIds = useFlightAnimStore(useShallow(collectRallyActivePlaneIds))
  // 航点飞行跟飞中的机：已由航点飞行动效（DroneFlightIcon + WaypointAltitudeOverlay实时高度标注）完全接…
  const waypointFlightPlaneId = useFlightAnimStore((s) => s.waypointFlight?.planeId)
  // 航线飞行巡航中的机：已由航线飞行动效（DroneFlightIcon + WaypointAltitudeOverlay实时高度标注）完全接…
  const routeFlightPlaneId = useFlightAnimStore((s) => s.routeFlightFlight?.planeId)
  // 环绕飞行盘旋中的机：已由环绕飞行动效（DroneFlightIcon + WaypointAltitudeOverlay实时高度标注）完全接…
  const orbitFlightPlaneId = useFlightAnimStore((s) => s.orbitFlight?.planeId)
  return (
    <>
      {aircraft.map((item, index) => {
        // hover 面板边缘自适应方向（飞机）
        const aircraftPlacement = computePanelPlacement(
          aircraftPositions[index].x,
          aircraftPositions[index].y,
        )
        const aircraftPanelClasses = placementToClasses(aircraftPlacement)
        // 实时升空特效：优先取 WS 实时遥测高度（swarmState.data.height → telemetry.altitude
        const device = devices[item.deviceIndex]
        const planeId = rawPlanes[item.deviceIndex]?.id
        // 集结任务执行中：该机已由集结点飞行动效（DroneFlightIcon + 实时高度标注 + 绿色航线）完全接管呈现
        if (planeId !== undefined && rallyActivePlaneIds.includes(planeId)) return null
        // 巡检巡航中：该机已由 ReconFlightOverlay 飞行动效（飞行图标/实时高度标注/已飞轨迹）完全接管
        if (planeId !== undefined && reconPlaneIds.includes(planeId)) return null
        // 航点飞行跟飞中：该机已由航点飞行动效图标（DroneFlightIcon + 实时高度标注）完全接管
        if (planeId !== undefined && waypointFlightPlaneId === planeId) return null
        // 航线飞行巡航中：该机已由航线飞行动效图标（DroneFlightIcon + 实时高度标注）完全接管
        if (planeId !== undefined && routeFlightPlaneId === planeId) return null
        // 环绕飞行盘旋中：该机已由环绕飞行动效图标（DroneFlightIcon + 实时高度标注）完全接管
        if (planeId !== undefined && orbitFlightPlaneId === planeId) return null
        const liveAltitude = planeId !== undefined ? wsTelemetry[planeId]?.altitude : undefined
        const hasLiveAltitude = liveAltitude !== undefined && Number.isFinite(liveAltitude)
        // 标签以设备管理面板的设备名称为准（queryPlaneStatus → mapPlaneToDevice写入 devices[].name）
        const labelText = device?.name || item.label
        // 离线判定：WS 有实时高度即可视（含待命 height≈0）
        const isOffline =
          !hasLiveAltitude &&
          (!device || device.status === 'offline' || device.altitudeValue === '--')
        // 图标切图：接口状态驱动（红=任务中 / 蓝=待命·充电 / 灰=离线）
        const statusIcon = device ? STATUS_PLANE_ICON[device.status] : undefined
        const planeSrc = statusIcon?.src ?? item.src
        const planeBottomSrc = statusIcon?.bottomSrc ?? item.bottomSrc
        // 数值格式与 HTTP fmt(height, 3, 'm') 对齐（如 31.000m）
        const altitudeText = hasLiveAltitude
          ? `${Math.floor(liveAltitude).toFixed(3)}m`
          : (device?.altitudeValue ?? '--')
        const altitudeNum = hasLiveAltitude ? liveAltitude : parseFloat(altitudeText) || 0
        // 高度→升空像素纯线性 0.3px/m（无分段、无封顶）：匀速爬升/降落时图标上移与虚线伸缩幅度全程恒定（每 10m = 3px）
        const liftPx = Math.round(Math.max(0, altitudeNum * 0.3))
        return (
          <span
            className={`${item.className} aircraft--draggable ${aircraftPanelClasses.join(' ')}${selectedDevices.has(item.deviceIndex) ? ' aircraft--selected' : ''}${hoveredDevice === item.deviceIndex ? ' aircraft--hovered' : ''}`}
            key={item.deviceIndex}
            style={{
              left: `${aircraftPositions[index].x}%`,
              top: `${aircraftPositions[index].y}%`,
              // 升空像素：驱动 .aircraft 容器 translateY 上移（见 CSS .aircraft）
              '--aircraft-lift': `${liftPx}px`,
            } as CSSProperties}
            onMouseEnter={() => onHoverDevice(item.deviceIndex)}
            onMouseLeave={() => onHoverDevice(null)}
            onMouseDown={(e) => onDragStart(index, e)}
            onClick={() => onAircraftClick(item.deviceIndex)}
            onDoubleClick={() => onAircraftDoubleClick(index)}
          >
            {/* 组合图标：底部光晕 + 机身（与设备管理面板同素材）。
                光晕 img 置于 DOM 首位且严格居中于 48px 盒——返航/航线连线的
                querySelector('img') 锚点取其中心，与旧单图锚点完全一致；
                航向旋转只作用于机身（见 CSS） */}
            <span className="aircraft-icon">
              <img
                className="aircraft-icon__bottom"
                src={planeBottomSrc}
                alt=""
                draggable={false}
              />
              <img
                className="aircraft-icon__top"
                src={planeSrc}
                alt={labelText}
                draggable={false}
              />
            </span>
            <span className="aircraft-label">{labelText}</span>
            {/* 地面投影垂线：容器整体升空 liftPx（--aircraft-lift 驱动 translateY），
                本垂线自容器内图标中心向下延伸同等距离——顶端=空中飞机中心，
                底端投影绿点钉在原地面位置；右侧沿垂线标注实时高度值。
                离线设备无遥测高度，不渲染垂线与高度标注；
                航点/环绕飞行中的该机（flyingPlaneId）已由飞行动效图标侧实时标注接管，
                原地面 0.000m 冻结标注隐藏去重 */}
            {!isOffline && !flyingPlaneIds.includes(planeId) && (
              <span className="aircraft-altitude" aria-hidden="true">
                <span className="aircraft-altitude__stick" />
                <span className="aircraft-altitude__value">{altitudeText}</span>
              </span>
            )}
            {/* Return-home indicator: ground marker (48x48 white circle with
                vertical H only, floating above the selected aircraft
                while the return panel is open; green solid line (SVG) from icon center to
                marker bottom is drawn on route generate. */}
            {returnHomeOpen && selectedDevices.has(item.deviceIndex) && (
              <span className="aircraft-return-indicator" aria-hidden="true">
                <span className="aircraft-return-indicator__ground">
                  <svg
                    className="aircraft-return-indicator__h"
                    viewBox="0 0 20 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <rect x="2.5" y="2" width="3.5" height="20" fill="#fff" />
                    <rect x="14" y="2" width="3.5" height="20" fill="#fff" />
                    <rect x="6" y="10.25" width="8" height="3.5" fill="#fff" />
                  </svg>
                </span>
              </span>
            )}
            {/* 离线设备 Hover 面板（灰色）—— 聚焦时隐藏，避免与聚焦面板同时出现。
                显隐由接口状态判定（isOffline）驱动，与静态 className 解耦：机位
                颜色随 queryPlaneStatus / WS 实时状态切换，面板随之联动 */}
            {isOffline && focusedAircraft !== index && (
              <div className="aircraft-hover-panel" data-hover-panel>
                <div className="aircraft-hover-panel__top">
                  <div className="aircraft-hover-panel__header">
                    <span className="aircraft-hover-panel__name">{labelText}</span>
                    <span className="aircraft-hover-panel__status">离线</span>
                  </div>
                  <div className="aircraft-hover-panel__divider" />
                </div>
                <div className="aircraft-hover-panel__bottom">
                  <div className="aircraft-hover-panel__info">
                    <span className="aircraft-hover-panel__bar" />
                    <span className="aircraft-hover-panel__label">离线时间：</span>
                    <span className="aircraft-hover-panel__time">2026/08/03 23:45</span>
                  </div>
                </div>
              </div>
            )}
            {/* 在线设备 Hover 面板（蓝色，统一样式）—— 聚焦时隐藏，避免与聚焦面板同时出现 */}
            {!isOffline && focusedAircraft !== index && (
              <div className="aircraft-info-panel" data-hover-panel>
                <div className="aircraft-info-panel__top">
                  <div className="aircraft-info-panel__header">
                    <span className="aircraft-info-panel__name">{labelText}</span>
                    <div className="aircraft-info-panel__indicators">
                      <img
                        className="aircraft-info-panel__battery-icon"
                        src={batteryMidIcon}
                        alt="电量"
                      />
                      <span className="aircraft-info-panel__battery-text">46%</span>
                      <svg
                        className="aircraft-info-panel__signal-icon"
                        width="15"
                        height="14"
                        viewBox="0 0 15 14"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <rect x="0" y="10" width="2.5" height="4" fill="#fff" />
                        <rect x="3.5" y="7" width="2.5" height="7" fill="#fff" />
                        <rect x="7" y="4" width="2.5" height="10" fill="#fff" />
                        <rect x="10.5" y="1" width="2.5" height="13" fill="#fff" />
                      </svg>
                    </div>
                  </div>
                  <div className="aircraft-info-panel__divider" />
                </div>
                <div className="aircraft-info-panel__bottom">
                  <div className="aircraft-info-panel__row">
                    <span className="aircraft-info-panel__bar" />
                    <span className="aircraft-info-panel__label">位置</span>
                    <span className="aircraft-info-panel__value">
                      Lat:0000,&nbsp;Lon:0000,&nbsp;H:{altitudeText}
                    </span>
                  </div>
                  <div className="aircraft-info-panel__row">
                    <span className="aircraft-info-panel__bar" />
                    <span className="aircraft-info-panel__label">速度</span>
                    <span className="aircraft-info-panel__value">
                      X:000,&nbsp;&nbsp;Y:000,&nbsp;&nbsp;Z:000
                    </span>
                  </div>
                  <div className="aircraft-info-panel__row aircraft-info-panel__row--dual">
                    <span className="aircraft-info-panel__bar" />
                    <span className="aircraft-info-panel__label">模式</span>
                    <span className="aircraft-info-panel__value">悬停</span>
                    <span className="aircraft-info-panel__bar aircraft-info-panel__bar--gap" />
                    <span className="aircraft-info-panel__label">状态</span>
                    <span className="aircraft-info-panel__value">待命</span>
                  </div>
                </div>
              </div>
            )}
          </span>
        )
      })}
    </>
  )
}

// props 均为稳定引用（store actions / useCallback / 模块常量）或不可变替换…
const AircraftLayer = memo(AircraftLayerInner)
export default AircraftLayer