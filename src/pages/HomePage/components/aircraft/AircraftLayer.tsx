/**
 * AircraftLayer —— 地图上的无人机图标层（自 HomePage.tsx 拆出）。
 *
 * 渲染所有飞机图标（含选中/悬停态、拖拽、双击聚焦）与各自的 hover 信息面板
 * （在线蓝色 / 离线灰色，聚焦时隐藏），以及返航面板打开时选中飞机的 H 返航
 * 地面标记。图标显隐由图层控制面板「设备标签」开关联动。
 */
import type { MouseEvent as ReactMouseEvent } from 'react'
import { computePanelPlacement, placementToClasses } from '../../../../utils/panelPlacement'
import batteryMidIcon from '../../../../assets/images/device/battery-mid.png'

export interface AircraftItem {
  label: string
  className: string
  src: string
  deviceIndex: number
}

export interface AircraftLayerProps {
  aircraft: AircraftItem[]
  aircraftPositions: { x: number; y: number }[]
  selectedDevices: Set<number>
  hoveredDevice: number | null
  returnHomeOpen: boolean
  focusedAircraft: number | null
  onHoverDevice: (deviceIndex: number | null) => void
  onDragStart: (index: number, e: ReactMouseEvent) => void
  onAircraftClick: (deviceIndex: number) => void
  onAircraftDoubleClick: (index: number) => void
}

export default function AircraftLayer({
  aircraft,
  aircraftPositions,
  selectedDevices,
  hoveredDevice,
  returnHomeOpen,
  focusedAircraft,
  onHoverDevice,
  onDragStart,
  onAircraftClick,
  onAircraftDoubleClick,
}: AircraftLayerProps) {
  return (
    <>
      {aircraft.map((item, index) => {
        // hover 面板边缘自适应方向（飞机）
        const aircraftPlacement = computePanelPlacement(
          aircraftPositions[index].x,
          aircraftPositions[index].y,
        )
        const aircraftPanelClasses = placementToClasses(aircraftPlacement)
        return (
          <span
            className={`${item.className} aircraft--draggable ${aircraftPanelClasses.join(' ')}${selectedDevices.has(item.deviceIndex) ? ' aircraft--selected' : ''}${hoveredDevice === item.deviceIndex ? ' aircraft--hovered' : ''}`}
            key={item.label}
            style={{
              left: `${aircraftPositions[index].x}%`,
              top: `${aircraftPositions[index].y}%`,
            }}
            onMouseEnter={() => onHoverDevice(item.deviceIndex)}
            onMouseLeave={() => onHoverDevice(null)}
            onMouseDown={(e) => onDragStart(index, e)}
            onClick={() => onAircraftClick(item.deviceIndex)}
            onDoubleClick={() => onAircraftDoubleClick(index)}
          >
            <img src={item.src} alt={item.label} draggable={false} />
            <span className="aircraft-label">{item.label}</span>
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
                    <span className="aircraft-hover-panel__name">02设备</span>
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
                    <span className="aircraft-info-panel__name">{item.label}</span>
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
                      Lat:0000,&nbsp;Lon:0000,&nbsp;H:0000
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