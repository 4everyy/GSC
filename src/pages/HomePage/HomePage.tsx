/**
 * HomePage —— 地面站主页面。
 *
 * 地图引擎：MapLibre GL JS（严格离线，瓦片由本地 MBTiles 包经 IndexedDB 渲染）。
 * - 使用 useMapEngine hook 持有 MapLibreContainer 注入的适配器实例；
 * - 所有业务组件（控件、比例尺）统一接收 adapter（引擎无关）。
 *
 * 解耦要点：
 * - HomePage 不直接 import 适配器实现类，仅通过 MapEngineInstance.adapter 操作地图；
 * - 业务组件通过 useEffect 依赖 adapter 变化自动重建覆盖物。
 */
import { useState, useEffect } from 'react'
import { StatusHeader } from '../../components/StatusHeader/StatusHeader'
import { MapToolbar } from '../../components/MapToolbar/MapToolbar'
import { MissionPanel } from '../../components/MissionPanel/MissionPanel'
import { AlarmInfoPanel } from '../../components/AlarmInfoPanel/AlarmInfoPanel'
import { MapControls } from '../../components/MapControls/MapControls'
import { MapLibreContainer } from '../../components/MapLibreContainer/MapLibreContainer'
import { MapScale } from '../../components/MapScale/MapScale'
import { useMapEngine } from '../../hooks/useMapEngine'
import { ALARM_TYPES } from '../../config/alarms'
import { aircraft } from '../../config/aircraft'
import batteryMidIcon from '../../assets/images/device/battery-mid.png'
import { homeImages } from '../../assets/images/home'
import { useDraggable, type DragPosition } from '../../hooks/useDraggable'
import { AircraftFocusPanel } from '../../components/AircraftFocusPanel/AircraftFocusPanel'
import { computePanelPlacement, placementToClasses } from '../../utils/panelPlacement'
import { usePanelClamp } from '../../hooks/usePanelClamp'
import './HomePage.css'
import './HoverPanelPlacement.css'
import { useOfflineMap } from '../../features/offline-map/useOfflineMap'
import { OfflineMapPanel } from '../../features/offline-map/components/OfflineMapPanel'

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

// 底部水平居中按钮条：13 段背景切图按显示顺序（从左到右）编号拼接（高度统一 60px）。
// width 为各切图原始宽度，经 aspect-ratio 与高度联动保持每段比例，整体随视口等比缩放。
// 各段切缝的水平间距补偿见 HomePage.css 中 .bottom-bar__btn:nth-child 逐缝 margin 规则。
const BOTTOM_BAR_ITEMS: { background: string; width: number }[] = [
  { background: homeImages.bottomBarSeg1, width: 119 },
  { background: homeImages.bottomBarSeg2, width: 129 },
  { background: homeImages.bottomBarSeg3, width: 110 },
  { background: homeImages.bottomBarSeg4, width: 100 },
  { background: homeImages.bottomBarSeg5, width: 101 },
  { background: homeImages.bottomBarSeg6, width: 92 },
  { background: homeImages.bottomBarSeg7, width: 92 },
  { background: homeImages.bottomBarSeg8, width: 92 },
  { background: homeImages.bottomBarSeg9, width: 101 },
  { background: homeImages.bottomBarSeg10, width: 100 },
  { background: homeImages.bottomBarSeg11, width: 110 },
  { background: homeImages.bottomBarSeg12, width: 129 },
  { background: homeImages.bottomBarSeg13, width: 119 },
]

export function HomePage() {
  const [activeAlarm, setActiveAlarm] = useState<number | null>(null)

  // 聚焦视图：双击无人机图标后显示设备详情面板（存储聚焦的飞机索引）
  const [focusedAircraft, setFocusedAircraft] = useState<number | null>(null)
  const handleAircraftDoubleClick = (index: number) => {
    // 双击同一架飞机时切换关闭，双击不同飞机时切换目标
    setFocusedAircraft((prev) => (prev === index ? null : index))
  }
  const handleCloseFocusPanel = () => setFocusedAircraft(null)

  // 地图引擎实例：MapLibreContainer 初始化后通过 onEngineReady 注入，
  // adapter 供业务组件（控件、比例尺等）引擎无关地操作地图。
  const { adapter, onEngineReady } = useMapEngine()

  // 离线地图：注册 gcs-pkg:// 协议 + 加载已导入包 + 派生活跃栅格样式。
  // 严格离线机制——地图容器不读取 navigator.onLine、无「在线/离线」分支；
  // 尚未导入离线地图包时 activeStyle 为 null（渲染纯色占位底图），
  // 导入后由 gcs-pkg:// 协议从 IndexedDB 渲染。
  const { activeStyle, activePackage } = useOfflineMap()

  // 激活包变化时（导入新包 / 切换城市）平滑飞到包中心。
  useEffect(() => {
    if (!adapter || !activePackage) return
    adapter.flyTo(activePackage.center, { zoom: 14, duration: 1500 })
  }, [adapter, activePackage])

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

  // hover 面板视口边缘平移修正（兜底）：测量实际矩形并注入 --clamp-x/--clamp-y，
  // 确保任何 hover 面板（飞机/巡检区域/禁飞区）在任意拖拽位置都不溢出视口。
  // 依赖宿主百分比坐标与聚焦索引：拖拽改变坐标时实时重新修正；聚焦切换时面板增删亦重算。
  usePanelClamp({
    deps: [
      ...aircraftPositions.map((p) => `${p.x},${p.y}`),
      `${inspectionZonePositions[0].x},${inspectionZonePositions[0].y}`,
      focusedAircraft,
    ],
  })

  return (
    <main className="design-viewport" aria-label="无人机集群控制地面站">
      <div className="design-canvas">
        {/* 地图底图：MapLibre GL JS 容器（严格离线）。尚未导入地图包时渲染纯色占位底图，
            导入后由父组件通过 styleSpec 注入 MBTiles 派生样式（P1+）。 */}
        <MapLibreContainer
          className="map-base"
          onReady={onEngineReady}
          styleSpec={activeStyle}
          autoLocate
        />

        <StatusHeader activeAlarm={activeAlarm} onAlarmClick={setActiveAlarm} />

        <section className="map-stage">
          <MapToolbar />

          {/* 离线地图管理面板（导入 / 城市切换 / 包列表）—— 严格离线，仅读写本地 IndexedDB */}
          <OfflineMapPanel />

          {/* 严格离线：瓦片缓存命中即渲染；未命中灰显（绝不在线回源）。
              尚未导入地图包时渲染纯色占位底图。导入/切换入口由离线地图管理模块提供（P1+）。 */}
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
            <div className="block_7 flex-col" data-hover-panel>
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
            <div className="inspection-zone__panel" data-hover-panel>
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
                  <div className="aircraft-hover-panel" data-hover-panel>
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

          {/* 底部水平居中按钮条：13 段背景图拼接，具体功能待接入 */}
          <nav className="bottom-bar" aria-label="底部功能按钮条">
            {BOTTOM_BAR_ITEMS.map((item, index) => (
              <button
                key={item.background}
                type="button"
                className="bottom-bar__btn"
                aria-label={`功能按钮${index + 1}`}
                style={{
                  // 切图文件名（bottom-bar-seg-01.png 等）含连字符，url() 统一加引号
                  // 以避免 unquoted URL 的解析歧义
                  backgroundImage: `url("${item.background}")`,
                  aspectRatio: `${item.width} / 60`,
                }}
              />
            ))}
          </nav>

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