/**
 * HomePage —— 地面站主页面。
 *
 * 引擎切换设计：
 * - 使用 useMapEngine hook 管理当前引擎类型与适配器实例；
 * - 根据 engineType 条件渲染 BMapContainer 或 MapLibreContainer；
 * - 所有业务组件（控件、比例尺）统一接收 adapter（引擎无关）；
 * - PlaceSearch 是百度专有功能，仅在百度引擎下渲染，使用 raw BMapGL.Map。
 *
 * 解耦要点：
 * - HomePage 不直接 import 适配器实现类，仅通过 MapEngineInstance.adapter 操作地图；
 * - 切换引擎时 useMapEngine 自动销毁旧实例，业务组件通过 useEffect 依赖 adapter 变化自动重建覆盖物。
 */
import { useState } from 'react'
import { MAPLIBRE_BASEMAPS, MAPLIBRE_DEFAULT_BASEMAP } from '../../config/mapLibre'
import { StatusHeader } from '../../components/StatusHeader/StatusHeader'
import { MapToolbar } from '../../components/MapToolbar/MapToolbar'
import { MissionPanel } from '../../components/MissionPanel/MissionPanel'
import { AlarmInfoPanel } from '../../components/AlarmInfoPanel/AlarmInfoPanel'
import { MapControls } from '../../components/MapControls/MapControls'
import { BMapContainer } from '../../components/BMapContainer/BMapContainer'
import { MapLibreContainer } from '../../components/MapLibreContainer/MapLibreContainer'
import { PlaceSearch } from '../../components/PlaceSearch/PlaceSearch'
import { MapScale } from '../../components/MapScale/MapScale'
import { EngineSwitch } from '../../components/EngineSwitch/EngineSwitch'
import { useMapEngine } from '../../hooks/useMapEngine'
import { ALARM_TYPES } from '../../config/alarms'
import { aircraft } from '../../config/aircraft'
import batteryMidIcon from '../../assets/images/device/battery-mid.png'
import { useDraggable, type DragPosition } from '../../hooks/useDraggable'
import { AircraftFocusPanel } from '../../components/AircraftFocusPanel/AircraftFocusPanel'
import { computePanelPlacement, placementToClasses } from '../../utils/panelPlacement'
import './HomePage.css'
import './HoverPanelPlacement.css'

// 飞机初始位置（百分比），与 HomePage.css 中 .aircraft--xxx 的 left/top 保持一致。
// 拖拽后通过内联 style 覆盖 CSS 定位，实现自由拖动。
const AIRCRAFT_INITIAL_POSITIONS: DragPosition[] = [
  { x: 10.6, y: 6.8 }, // red (01设备)
  { x: 68.8, y: 22 }, // orange (03设备)
  { x: 44.6, y: 35.4 }, // blue (02设备)
  { x: 56, y: 59 }, // gray (离线设备)
  { x: 33.7, y: 71.5 }, // blue2 (02设备)
]

// 巡检区域初始位置（百分比），与 HomePage.css 中 .inspection-zone 的 left/top 保持一致
const INSPECTION_ZONE_INITIAL_POSITION: DragPosition = { x: 38.75, y: 25.5 }

export function HomePage() {
  const [activeAlarm, setActiveAlarm] = useState<number | null>(null)

  // 聚焦视图：双击无人机图标后显示设备详情面板（存储聚焦的飞机索引）
  const [focusedAircraft, setFocusedAircraft] = useState<number | null>(null)
  const handleAircraftDoubleClick = (index: number) => {
    // 双击同一架飞机时切换关闭，双击不同飞机时切换目标
    setFocusedAircraft((prev) => (prev === index ? null : index))
  }
  const handleCloseFocusPanel = () => setFocusedAircraft(null)

  // 地图引擎管理：engineType 决定渲染哪个 Container，adapter 供业务组件使用
  const { engineType, adapter, engineInstance, switchEngine, onEngineReady } =
    useMapEngine('maplibre')

  // PlaceSearch 需要百度原始地图实例（百度专有 POI 搜索 API）
  const bmapRawInstance =
    engineType === 'baidu' && engineInstance?.engine === 'baidu'
      ? (engineInstance.raw as BMapGL.Map)
      : null

  const currentAlarmColor = activeAlarm !== null ? ALARM_TYPES[activeAlarm]?.color : undefined

  // 飞机图标拖拽：鼠标左键按住拖动图标+名称至首页任意位置
  const { positions: aircraftPositions, onDragStart: onAircraftDragStart } =
    useDraggable({
      count: aircraft.length,
      initialPositions: AIRCRAFT_INITIAL_POSITIONS,
      storageKey: 'gcs:aircraft-positions',
    })

  // 巡检区域拖拽：鼠标左键按住拖动整个巡检区域（含轨迹线）至首页任意位置
  const { positions: inspectionZonePositions, onDragStart: onInspectionZoneDragStart } =
    useDraggable({
      count: 1,
      initialPositions: [INSPECTION_ZONE_INITIAL_POSITION],
      storageKey: 'gcs:inspection-zone-position',
    })

  // hover 面板边缘自适应方向（巡检区域）
  const inspectionZonePlacement = computePanelPlacement(
    inspectionZonePositions[0].x,
    inspectionZonePositions[0].y,
  )
  const inspectionZonePanelClasses = placementToClasses(inspectionZonePlacement)

  return (
    <main className="design-viewport" aria-label="无人机集群控制地面站">
      <div className="design-canvas">
        {/* 地图底图：根据 engineType 条件渲染百度或 MapLibre 容器 */}
        {engineType === 'baidu' ? (
          <BMapContainer className="map-base" onReady={onEngineReady} autoLocate />
        ) : (
          <MapLibreContainer
            className="map-base"
            styleUrl={MAPLIBRE_BASEMAPS[MAPLIBRE_DEFAULT_BASEMAP].url}
            onReady={onEngineReady}
            autoLocate
          />
        )}

        <StatusHeader activeAlarm={activeAlarm} onAlarmClick={setActiveAlarm} />

        {/* 引擎切换按钮：浮于地图右上角，可在百度/MapLibre 之间灵活切换 */}
        <EngineSwitch engine={engineType} onSwitch={switchEngine} />

        {/* 地址搜索框：百度专有功能，仅在百度引擎下渲染 */}
        {engineType === 'baidu' && (
          <div className="place-search-wrapper">
            <PlaceSearch map={bmapRawInstance} />
          </div>
        )}

        <section className="map-stage">
          <MapToolbar />
          {/* MissionPanel 与 AlarmInfoPanel 暂时隐藏，待后续功能接入时恢复 */}
          {false && <MissionPanel />}
          {false && <AlarmInfoPanel alarmColor={currentAlarmColor} />}
          {/* 红色禁飞区：左下角倾斜四边形，SVG 绘制边框 + 四角节点 */}
          <div className="restricted-zone restricted-zone--red" aria-label="禁飞区域">
            <svg
              className="restricted-zone__border"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <polygon
                points="22,0 78,8 100,100 0,92"
                fill="rgba(220,38,38,0.35)"
                stroke="rgba(172,14,14,0.85)"
                strokeWidth="0.8"
              />
              <defs>
                <pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="8">
                  <line
                    x1="3"
                    y1="0"
                    x2="3"
                    y2="8"
                    stroke="rgba(220,38,38,0.35)"
                    strokeWidth="0.5"
                  />
                </pattern>
              </defs>
              <polygon points="22,0 78,8 100,100 0,92" fill="url(#hatch)" />
            </svg>
            {/* Hover 信息面板 */}
            <div className="block_7 flex-col">
              <div className="block_7__top">
                <span className="text_8">01禁飞区</span>
                <div className="section_3 flex-col"></div>
              </div>
              <div className="block_7__bottom">
                <div className="section_4 flex-row">
                  <div className="box_13 flex-col"></div>
                  <span className="text_9">来源</span>
                  <span className="text_10">管理员划定</span>
                </div>
                <div className="section_5 flex-row">
                  <div className="group_10 flex-col"></div>
                  <span className="text_11">面积</span>
                  <span className="text_12">156m&nbsp;x&nbsp;314m</span>
                </div>
                <div className="section_6 flex-row">
                  <div className="group_11 flex-col"></div>
                  <span className="text_13">模式</span>
                  <span className="text_14">悬停</span>
                </div>
              </div>
            </div>
            {/* 四角正方形节点标记 */}
            <span className="corner-marker corner-marker--tl" /> {/* 左上 (22%, 0%) */}
            <span className="corner-marker corner-marker--tr" /> {/* 右上 (78%, 8%) */}
            <span className="corner-marker corner-marker--br" /> {/* 右下 (100%, 100%) */}
            <span className="corner-marker corner-marker--bl" /> {/* 左下 (0%, 92%) */}
          </div>
          {false && <div className="restricted-zone restricted-zone--orange" />}

          {/* 巡检区域：包含1条蛇形巡检轨迹线，支持拖拽移动 */}
          <div
            className={`inspection-zone ${inspectionZonePanelClasses.join(' ')}`}
            aria-label="巡检区域"
            style={{
              left: `${inspectionZonePositions[0].x}%`,
              top: `${inspectionZonePositions[0].y}%`,
            }}
            onMouseDown={(e) => onInspectionZoneDragStart(0, e)}
          >
            {/* 半透明蓝色背景 */}
            <div className="inspection-zone__bg" />

            {/* Hover 信息面板（右上角）：01号巡检区 */}
            <div className="inspection-zone__panel">
              {/* 顶部：标题+分隔线（固定高度，完全复刻禁飞区 .block_7__top 结构） */}
              <div className="inspection-zone__panel-top">
                <span className="inspection-zone__panel-title">01号巡检区</span>
                <div className="inspection-zone__panel-divider" />
              </div>
              <div className="inspection-zone__panel-body">
                <div className="inspection-zone__panel-row inspection-zone__panel-row--area">
                  <span className="inspection-zone__panel-bar" />
                  <span className="inspection-zone__panel-label">面积</span>
                  <span className="inspection-zone__panel-value">109m</span>
                  <span className="inspection-zone__panel-sup">2</span>
                </div>
                <div className="inspection-zone__panel-row inspection-zone__panel-row--task">
                  <span className="inspection-zone__panel-bar" />
                  <span className="inspection-zone__panel-label">关联任务</span>
                  <span className="inspection-zone__panel-value">情报侦察</span>
                </div>
              </div>
            </div>

            {/* SVG 轨迹线：viewBox 精确映射巡检区域内部坐标系 */}
            <svg
              className="inspection-zone__trajectories"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* 已飞行轨迹（白色）：从起点到路径中点 (50,50) */}
              <path
                className="inspection-zone__path inspection-zone__path--flown"
                d="M 9,10
                   L 91,10
                   A 4 4 0 0 1 95,14
                   L 95,26
                   A 4 4 0 0 1 91,30
                   L 9,30
                   A 4 4 0 0 0 5,34
                   L 5,46
                   A 4 4 0 0 0 9,50
                   L 50,50"
                fill="none"
                stroke="#ffffff"
                strokeWidth="3.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {/* 即将飞行轨迹（绿色）：从路径中点 (50,50) 到终点 */}
              <path
                className="inspection-zone__path inspection-zone__path--pending"
                d="M 50,50
                   L 91,50
                   A 4 4 0 0 1 95,54
                   L 95,66
                   A 4 4 0 0 1 91,70
                   L 9,70
                   A 4 4 0 0 0 5,74
                   L 5,86
                   A 4 4 0 0 0 9,90
                   L 91,90"
                fill="none"
                stroke="#00E570"
                strokeWidth="3.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>

          {aircraft.map((item, index) => {
            // hover 面板边缘自适应方向（飞机）
            const aircraftPlacement = computePanelPlacement(
              aircraftPositions[index].x,
              aircraftPositions[index].y,
            )
            const aircraftPanelClasses = placementToClasses(aircraftPlacement)
            return (
              <span
                className={`${item.className} aircraft--draggable ${aircraftPanelClasses.join(' ')}`}
                key={item.label}
                style={{
                  left: `${aircraftPositions[index].x}%`,
                  top: `${aircraftPositions[index].y}%`,
                }}
                onMouseDown={(e) => onAircraftDragStart(index, e)}
                onDoubleClick={() => handleAircraftDoubleClick(index)}
              >
                <img src={item.src} alt={item.label} draggable={false} />
                <span className="aircraft-label">{item.label}</span>
                {/* 离线设备 Hover 面板（灰色）—— 聚焦时隐藏，避免与聚焦面板同时出现 */}
                {item.className.includes('gray') && focusedAircraft !== index && (
                  <div className="aircraft-hover-panel">
                    <div className="aircraft-hover-panel__top">
                      <div className="aircraft-hover-panel__header">
                        <span className="aircraft-hover-panel__name">08号无人机</span>
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
                  <div className="aircraft-info-panel">
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

          {/* 聚焦视图面板：双击无人机图标后从图标右侧滑入，
              图标正好卡在面板左边缘的垂直中心 */}
          {focusedAircraft !== null && (
            <AircraftFocusPanel
              name={aircraft[focusedAircraft].label}
              onClose={handleCloseFocusPanel}
              visible
              aircraftPosition={{
                x: aircraftPositions[focusedAircraft].x,
                y: aircraftPositions[focusedAircraft].y,
              }}
            />
          )}

          <MapControls adapter={adapter} />

          <footer className="map-footer">
            <div className="emergency-actions">
              <button type="button">一键RTL</button>
              <button type="button">一键迫降</button>
              <button className="danger" type="button">
                急停
              </button>
            </div>
            <MapScale adapter={adapter} />
          </footer>
        </section>
      </div>
    </main>
  )
}