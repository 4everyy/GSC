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
import { useDeviceLinkStore, usePlaneStatusStore } from '../../../stores/index'
import { useRealtimeStore } from '../../../features/realtime/wsClient'

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
        // 数值格式与 HTTP fmt(height, 3, 'm') 对齐（如 31.000m）
        const altitudeText = hasLiveAltitude
          ? `${liveAltitude.toFixed(3)}m`
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
                src={item.bottomSrc}
                alt=""
                draggable={false}
              />
              <img
                className="aircraft-icon__top"
                src={item.src}
                alt={labelText}
                draggable={false}
              />
            </span>
            <span className="aircraft-label">{labelText}</span>
            {/* 地面投影垂线：容器整体升空 liftPx（--aircraft-lift 驱动 translateY），
                本垂线自容器内图标中心向下延伸同等距离——顶端=空中飞机中心，
                底端投影绿点钉在原地面位置；右侧沿垂线标注实时高度值。
                离线设备无遥测高度，不渲染垂线与高度标注 */}
            {!isOffline && (
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
            {/* 离线设备 Hover 面板（灰色）—— 聚焦时隐藏，避免与聚焦面板同时出现 */}
            {item.className.includes('gray') && focusedAircraft !== index && (
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
            {!item.className.includes('gray') && focusedAircraft !== index && (
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
