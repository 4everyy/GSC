/**
 * AircraftLayer —— 地图上的无人机图标层（自 HomePage.tsx 拆出）。
 *
 * 渲染所有飞机图标（含选中/悬停态、拖拽、双击聚焦）与各自的 hover 信息面板
 * （在线蓝色 / 离线灰色，聚焦时隐藏），以及返航面板打开时选中飞机的 H 返航
 * 地面标记。图标显隐由图层控制面板「设备标签」开关联动。
 */
import { memo, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { computePanelPlacement, placementToClasses } from '../../../utils/index'
import batteryMidIcon from '../../../assets/images/device/battery-mid.png'
import { STATUS_PLANE_ICON } from '../../../lib/planeIcons'
import { useDeviceLinkStore, useFlightAnimStore, usePlaneStatusStore } from '../../../stores/index'
import { useRealtimeStore } from '../../../features/realtime/wsClient'
import { useShallow } from 'zustand/react/shallow'

type FlightAnimSnapshot = ReturnType<typeof useFlightAnimStore.getState>

/** 从 flightAnimStore 派生「飞行动效已接管呈现」的目标设备主键数组：
 *  航点/航线/环绕单机动画的 planeId + 集结点/编队多机动画的 planeId 并集。
 *  配合 useShallow（数组元素逐一浅比较）：rAF 每帧 tick 更新多机坐标但
 *  planeId 数组内容与顺序不变（单机快照 planeId 恒定、多机数组顺序稳定），
 *  AircraftLayer 不因坐标帧重渲染；数组内容变化（动画启停/多机增减）时
 *  才触发重渲染 */
const collectFlyingPlaneIds = (s: FlightAnimSnapshot): string[] => {
  const ids: string[] = []
  const single = s.waypointFlight ?? s.routeFlightFlight ?? s.orbitFlight
  if (single?.planeId !== undefined) ids.push(single.planeId)
  for (const f of s.rallyPointFlights) if (f.planeId !== undefined) ids.push(f.planeId)
  for (const f of s.formationFlightFlights) if (f.planeId !== undefined) ids.push(f.planeId)
  // recon 巡检机不在此列：其地面图标整体隐藏（见下方 reconPlaneIds），比仅隐藏标注更强
  return ids
}

/** 从 flightAnimStore 派生「巡检巡航中」的目标设备主键数组（reconFlights keys
 *  = rawPlanes[].id）：这些机已由 ReconFlightOverlay 的飞行动效（DroneFlightIcon
 *  + 实时高度标注 + 灰色已飞轨迹线）完全接管呈现，原起飞点地面图标整体隐藏。
 *  useShallow：rAF 逐帧写入 reconFlights 坐标但 keys 集合不变，不触发重渲染；
 *  巡检启动（startReconFlights）/停止·卸载（stopReconFlights 清空）时才变化 */
const collectReconPlaneIds = (s: FlightAnimSnapshot): string[] => Object.keys(s.reconFlights)

/** 从 flightAnimStore 派生「集结任务已完成、落地定格」的目标设备主键数组：
 *  仅取 rallyPointFlights 中 landed=true 的 planeId（落坪末帧写入的完成标记）。
 *  同样配合 useShallow 结构共享：坐标帧更新不改变数组内容不触发重渲染，
 *  仅任务完成（逐机置 landed）/续飞（landed 复位）/取消·删除重绘（清空）时重渲染 */
const collectLandedRallyPlaneIds = (s: FlightAnimSnapshot): string[] => {
  const ids: string[] = []
  for (const f of s.rallyPointFlights)
    if (f.landed === true && f.planeId !== undefined) ids.push(f.planeId)
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

/**
 * hover 状态经 deviceLinkStore 内部订阅：hover 变化只重渲染本组件（不冒泡到
 * HomePage），HomePage 因无关状态重渲染时本组件经 React.memo 跳过。
 */
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
  // HTTP 设备快照：queryPlaneStatus 仅页面加载时拉取一次（无轮询），
  // 高度等遥测字段静态——起飞后的实时变化必须由 WS 驱动
  const devices = usePlaneStatusStore((s) => s.devices)
  // WS 实时遥测：pub#device / pub#telemetry 频道 swarmState（data.height = 相对起飞点高度）
  // 经 mapSwarmStateItem 映射为 telemetry[planeId].altitude，起飞后 1~2Hz 推送，
  // 驱动高度垂线伸长与数值刷新（形成爬升动态效果）。planeId 即 rawPlanes[].id
  // （起飞指令 podControlTakeoff 同源主键），与 deviceIndex（planeList 下标）经 rawPlanes 对应。
  const wsTelemetry = useRealtimeStore((s) => s.telemetry)
  const rawPlanes = usePlaneStatusStore((s) => s.rawPlanes)
  // 飞行动效已接管呈现的目标设备主键集合（航点/航线/环绕单机动画的 planeId +
  // 集结点/编队多机动画的 planeId）：这些机已由飞行动效图标（DroneFlightIcon +
  // 高度标注层）接管呈现，原地面图标的高度垂线/数值标注（起飞前冻结的 0.000m）
  // 随之隐藏，避免两套标注并存重复——沿用同一套 .aircraft-altitude 样式
  // 仅渲染一处实时标注。多机集合每帧动画 tick 变化，useShallow 结构共享下
  // 引用稳定（rallyPointFlights 元素引用逐帧更新，集合内容变化才触发重渲染）
  const flyingPlaneIds = useFlightAnimStore(useShallow(collectFlyingPlaneIds))
  // 巡检巡航中的机：已由 ReconFlightOverlay 飞行动效完全接管呈现
  // （DroneFlightIcon + 实时高度标注 + 灰色已飞轨迹），原地面图标整体隐藏
  const reconPlaneIds = useFlightAnimStore(useShallow(collectReconPlaneIds))
  // 集结任务已完成的落地定格机：原起飞点地面图标（图标/标签/hover 面板/垂线）
  // 整体隐藏，地图上仅保留集结坪图标与落坪定格的飞行动效飞机（保留当前位置）
  const landedRallyPlaneIds = useFlightAnimStore(useShallow(collectLandedRallyPlaneIds))
  return (
    <>
      {aircraft.map((item, index) => {
        // hover 面板边缘自适应方向（飞机）
        const aircraftPlacement = computePanelPlacement(
          aircraftPositions[index].x,
          aircraftPositions[index].y,
        )
        const aircraftPanelClasses = placementToClasses(aircraftPlacement)
        // 实时升空特效：优先取 WS 实时遥测高度（swarmState.data.height →
        // telemetry.altitude，起飞后 1~2Hz 推送）；无 WS 帧时回退 HTTP 快照
        // altitudeValue（离线为 '--'）。高度换算为升空像素 --aircraft-lift：
        // 容器整体上移（飞机图标/标签/选中光环跟随升空），地面投影垂线底端
        // 钉在原位置、顶端连到空中飞机中心（分段线性不设总封顶，见下方 liftPx）
        const device = devices[item.deviceIndex]
        const planeId = rawPlanes[item.deviceIndex]?.id
        // 集结任务完成：该机已按队形精准落坪定格（飞行动效图标接管呈现，位置
        // 保留在集结坪上），原起飞点地面图标整体不再渲染；队形变更续飞时随
        // 新快照 landed=false 复位恢复，取消面板/删除重绘时随 store 清空恢复
        if (planeId !== undefined && landedRallyPlaneIds.includes(planeId)) return null
        // 巡检巡航中：该机已由 ReconFlightOverlay 飞行动效（飞行图标/实时高度
        // 标注/已飞轨迹）完全接管，原起飞点地面图标（图标/标签/hover 面板/垂线）
        // 整体不再渲染；巡检停止或组件卸载时 reconFlights 清空自动恢复显示
        if (planeId !== undefined && reconPlaneIds.includes(planeId)) return null
        const liveAltitude = planeId !== undefined ? wsTelemetry[planeId]?.altitude : undefined
        const hasLiveAltitude = liveAltitude !== undefined && Number.isFinite(liveAltitude)
        // 标签以设备管理面板的设备名称为准（queryPlaneStatus → mapPlaneToDevice
        // 写入 devices[].name），无对应设备数据时回退配置静态标签（"01设备"等）
        const labelText = device?.name || item.label
        // 离线判定：WS 有实时高度即可视（含待命 height≈0）；否则按 HTTP 快照
        // （无遥测 / status=offline / altitudeValue='--'）判离线，不渲染投影垂线
        const isOffline =
          !hasLiveAltitude &&
          (!device || device.status === 'offline' || device.altitudeValue === '--')
        // 图标切图：接口状态驱动（红=任务中 / 蓝=待命·充电 / 灰=离线），
        // 设备数据缺失（接口未返回该机）时回退静态配置切图（config.aircraft 预设色）
        const statusIcon = device ? STATUS_PLANE_ICON[device.status] : undefined
        const planeSrc = statusIcon?.src ?? item.src
        const planeBottomSrc = statusIcon?.bottomSrc ?? item.bottomSrc
        // 数值格式与 HTTP fmt(height, 3, 'm') 对齐（如 31.000m）；显示层取整——
        // 小数点后三位恒为 .000（爬升/降落动画逐帧浮点高度仅驱动下方 liftPx 平滑位移，
        // 与 WaypointAltitudeOverlay 飞行标注 Math.floor 同规则）
        const altitudeText = hasLiveAltitude
          ? `${Math.floor(liveAltitude).toFixed(3)}m`
          : (device?.altitudeValue ?? '--')
        const altitudeNum = hasLiveAltitude ? liveAltitude : parseFloat(altitudeText) || 0
        // 高度→升空像素纯线性 0.3px/m（无分段、无封顶）：匀速爬升/降落时
        // 图标上移与虚线伸缩幅度全程恒定（每 10m = 3px），与真实垂直速度
        // 成正比（400m→120px、800m→240px、1000m→300px）
        const liftPx = Math.round(Math.max(0, altitudeNum * 0.3))
        return (
          <span
            className={`${item.className} aircraft--draggable ${aircraftPanelClasses.join(' ')}${selectedDevices.has(item.deviceIndex) ? ' aircraft--selected' : ''}${hoveredDevice === item.deviceIndex ? ' aircraft--hovered' : ''}`}
            key={item.deviceIndex}
            style={{
              left: `${aircraftPositions[index].x}%`,
              top: `${aircraftPositions[index].y}%`,
              // 升空像素：驱动 .aircraft 容器 translateY 上移（见 CSS .aircraft），
              // 与 left/top（拖拽定位）独立叠加互不干扰
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

// props 均为稳定引用（store actions / useCallback / 模块常量）或不可变替换
// （positions 数组 / Set），默认浅比较即可正确跳过无关重渲染
const AircraftLayer = memo(AircraftLayerInner)
export default AircraftLayer