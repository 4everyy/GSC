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
import { useState, useEffect, useRef } from 'react'
import { StatusHeader } from '../../components/StatusHeader/StatusHeader'
import { MapToolbar } from '../../components/MapToolbar/MapToolbar'
import { MissionPanel } from '../../components/MissionPanel/MissionPanel'
import { AlarmInfoPanel } from '../../components/AlarmInfoPanel/AlarmInfoPanel'
import { MapControls } from '../../components/MapControls/MapControls'
import { MapLibreContainer } from '../../components/MapLibreContainer/MapLibreContainer'
import { MapScale } from '../../components/MapScale/MapScale'
import { TakeoffPanel } from '../../components/TakeoffPanel/TakeoffPanel'
import { LandingPanel } from '../../components/LandingPanel/LandingPanel'
import { ReturnHomePanel } from '../../components/ReturnHomePanel/ReturnHomePanel'
import { TapReturnPanel } from '../../components/TapReturnPanel/TapReturnPanel'
import { AreaLandingPanel } from '../../components/AreaLandingPanel/AreaLandingPanel'
import { HoverPanel } from '../../components/HoverPanel/HoverPanel'
import { WaypointFlightPanel } from '../../components/WaypointFlightPanel/WaypointFlightPanel'
import { RouteFlightPanel } from '../../components/RouteFlightPanel/RouteFlightPanel'
import { OrbitFlightPanel } from '../../components/OrbitFlightPanel/OrbitFlightPanel'
import { RallyPointPanel } from '../../components/RallyPointPanel/RallyPointPanel'
import { FormationFlightPanel } from '../../components/FormationFlightPanel/FormationFlightPanel'
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
import { useOfflineMapStore } from '../../features/offline-map/offlineMapStore'

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

// 待接入功能的临时显示开关（false = 隐藏）：
// MissionPanel / AlarmInfoPanel / 橙色禁飞区——功能就绪后置 true 或删除相关代码
const SHOW_PENDING_PANELS = false

// 底部水平居中按钮条：13 段背景切图按显示顺序（从左到右）编号拼接（高度统一 60px）。
// width 为各切图原始宽度，经 aspect-ratio 与高度联动保持每段比例，整体随视口等比缩放。
// 各段切缝的水平间距补偿见 HomePage.css 中 .bottom-bar__item:nth-child 逐缝 margin 规则。
// 第 2~12 段为功能按钮：icon 为叠加在背景框体中心的功能图标（64×64 切图），
// tooltip 为悬停时显示于按钮上方的中文名称。
// 底部功能面板类型：起飞（TakeoffPanel）/ 降落（LandingPanel）/ 返航（ReturnHomePanel）/ 指点返航（TapReturnPanel）/ 区域降落（AreaLandingPanel）/ 悬停（HoverPanel）/ 航点飞行（WaypointFlightPanel）/ 航线飞行（RouteFlightPanel）/ 环绕飞行（OrbitFlightPanel）/ 集结点（RallyPointPanel）/ 编队飞行（FormationFlightPanel）
type BottomBarPanel =
  | 'takeoff'
  | 'landing'
  | 'return-home'
  | 'tap-return'
  | 'area-landing'
  | 'hover'
  | 'waypoint-flight'
  | 'route-flight'
  | 'orbit-flight'
  | 'rally-point'
  | 'formation-flight'

const BOTTOM_BAR_ITEMS: {
  background: string
  width: number
  icon?: string
  tooltip?: string
  panel?: BottomBarPanel
}[] = [
  { background: homeImages.bottomBarSeg1, width: 119 },
  {
    background: homeImages.bottomBarSeg2,
    width: 129,
    icon: homeImages.iconTakeoff,
    tooltip: '起飞',
    panel: 'takeoff',
  },
  {
    background: homeImages.bottomBarSeg3,
    width: 110,
    icon: homeImages.iconLand,
    tooltip: '降落',
    panel: 'landing',
  },
  {
    background: homeImages.bottomBarSeg4,
    width: 100,
    icon: homeImages.iconReturnToHome,
    tooltip: '返航',
    panel: 'return-home',
  },
  {
    background: homeImages.bottomBarSeg5,
    width: 101,
    icon: homeImages.iconTapToReturn,
    tooltip: '指点返航',
    panel: 'tap-return',
  },
  {
    background: homeImages.bottomBarSeg6,
    width: 92,
    icon: homeImages.iconAreaLanding,
    tooltip: '区域降落',
    panel: 'area-landing',
  },
  {
    background: homeImages.bottomBarSeg7,
    width: 92,
    icon: homeImages.iconHover,
    tooltip: '悬停',
    panel: 'hover',
  },
  {
    background: homeImages.bottomBarSeg8,
    width: 92,
    icon: homeImages.iconWaypointFlight,
    tooltip: '航点飞行',
    panel: 'waypoint-flight',
  },
  {
    background: homeImages.bottomBarSeg9,
    width: 101,
    icon: homeImages.iconRouteFlight,
    tooltip: '航线飞行',
    panel: 'route-flight',
  },
  {
    background: homeImages.bottomBarSeg10,
    width: 100,
    icon: homeImages.iconOrbit,
    tooltip: '环绕飞行',
    panel: 'orbit-flight',
  },
  {
    background: homeImages.bottomBarSeg11,
    width: 110,
    icon: homeImages.iconRallyPoint,
    tooltip: '集结点',
    panel: 'rally-point',
  },
  {
    background: homeImages.bottomBarSeg12,
    width: 129,
    icon: homeImages.iconFormationFlight,
    tooltip: '编队飞行',
    panel: 'formation-flight',
  },
  { background: homeImages.bottomBarSeg13, width: 119 },
]

export function HomePage() {
  const [activeAlarm, setActiveAlarm] = useState<number | null>(null)

  // 聚焦视图：双击无人机图标后显示设备详情面板（存储聚焦的飞机索引）
  const [focusedAircraft, setFocusedAircraft] = useState<number | null>(null)

  // 功能面板（起飞/降落/返航/指点返航/区域降落/悬停/航点飞行）：点击底部按钮后按钮保持弹出状态，面板展开于右上角；
  // 各面板互斥——打开一个会关闭其他（底部按钮条同一时刻只有一个功能处于激活态）
  const [takeoffOpen, setTakeoffOpen] = useState(false)
  const [landingOpen, setLandingOpen] = useState(false)
  const [returnHomeOpen, setReturnHomeOpen] = useState(false)
  const [tapReturnOpen, setTapReturnOpen] = useState(false)
  const [areaLandingOpen, setAreaLandingOpen] = useState(false)
  const [hoverOpen, setHoverOpen] = useState(false)
  const [waypointFlightOpen, setWaypointFlightOpen] = useState(false)
  const [routeFlightOpen, setRouteFlightOpen] = useState(false)
  const [orbitFlightOpen, setOrbitFlightOpen] = useState(false)
  const [rallyPointOpen, setRallyPointOpen] = useState(false)
  const [formationFlightOpen, setFormationFlightOpen] = useState(false)
  const openTakeoffPanel = () => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setTakeoffOpen((v) => !v)
  }
  const openLandingPanel = () => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setTakeoffOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setLandingOpen((v) => !v)
  }
  const openReturnHomePanel = () => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setReturnHomeOpen((v) => !v)
  }
  const openTapReturnPanel = () => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setAreaLandingOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setTapReturnOpen((v) => !v)
  }
  const openAreaLandingPanel = () => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setAreaLandingOpen((v) => !v)
  }
  const openHoverPanel = () => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setWaypointFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setHoverOpen((v) => !v)
  }
  const openWaypointFlightPanel = () => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setHoverOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setWaypointFlightOpen((v) => !v)
  }
  const openRouteFlightPanel = () => {
    setOrbitFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setRouteFlightOpen((v) => !v)
  }
  const openOrbitFlightPanel = () => {
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setRouteFlightOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setOrbitFlightOpen((v) => !v)
  }
  const openRallyPointPanel = () => {
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setFormationFlightOpen(false)
    setRallyPointOpen((v) => !v)
  }
  const openFormationFlightPanel = () => {
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen((v) => !v)
  }
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

  // 默认城市：首次加载完成且无激活包时，自动启用「苏州」离线包
  // （已导入则直接激活；未导入则从同源 public/maps/suzhou.mbtiles 拉取导入后激活）。
  // ensuredRef 保证仅执行一次，用户后续手动取消激活不会被强制切回。
  const ensureCityPackage = useOfflineMapStore((s) => s.ensureCityPackage)
  const offlineStatus = useOfflineMapStore((s) => s.status)
  const activePackageId = useOfflineMapStore((s) => s.activePackageId)
  const defaultCityEnsuredRef = useRef(false)
  useEffect(() => {
    if (defaultCityEnsuredRef.current || offlineStatus !== 'ready') return
    defaultCityEnsuredRef.current = true
    if (activePackageId) return
    void ensureCityPackage('suzhou')
  }, [offlineStatus, activePackageId, ensureCityPackage])

  // 激活包变化时（导入新包 / 切换城市）平滑飞到包中心。
  useEffect(() => {
    if (!adapter || !activePackage) return
    adapter.flyTo(activePackage.center, { zoom: 14, duration: 1500 })
  }, [adapter, activePackage])

  const currentAlarmColor = activeAlarm !== null ? ALARM_TYPES[activeAlarm]?.color : undefined

  // 飞机图标拖拽：鼠标左键按住拖动图标+名称至首页任意位置
  const { positions: aircraftPositions, onDragStart: onAircraftDragStart } = useDraggable({
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
          {SHOW_PENDING_PANELS && <MissionPanel />}
          {SHOW_PENDING_PANELS && <AlarmInfoPanel alarmColor={currentAlarmColor} />}
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
          {SHOW_PENDING_PANELS && <div className="restricted-zone restricted-zone--orange" />}

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

          {/* 起飞参数面板：点击底部「起飞」按钮后在右上角展开，按钮保持弹出状态；
              确认/取消均收起面板（确认暂记录参数，待接入真实指令链路） */}
          {takeoffOpen && (
            <TakeoffPanel
              onConfirm={(height) => {
                console.info(`[takeoff] 确认起飞，高度 ${height}m`)
                setTakeoffOpen(false)
              }}
              onCancel={() => setTakeoffOpen(false)}
            />
          )}

          {/* 降落面板：点击底部「降落」按钮后在右上角展开（与起飞面板互斥），按钮保持弹出状态；
              确认/取消均收起面板（确认暂记录日志，待接入真实指令链路） */}
          {landingOpen && (
            <LandingPanel
              onConfirm={() => {
                console.info('[landing] 确认降落')
                setLandingOpen(false)
              }}
              onCancel={() => setLandingOpen(false)}
            />
          )}

          {/* 返航面板：点击底部「返航」按钮后在右上角展开（与其他功能面板互斥），按钮保持弹出状态；
              参数设置/飞机列表 tab + 返航高度步进，确认/取消均收起面板（确认暂记录日志，待接入真实指令链路） */}
          {returnHomeOpen && (
            <ReturnHomePanel
              onConfirm={(height) => {
                console.info(`[return-home] 确认返航，高度 ${height}m`)
                setReturnHomeOpen(false)
              }}
              onCancel={() => setReturnHomeOpen(false)}
            />
          )}

          {/* 指点返航面板（与起飞/降落/返航面板互斥），按钮保持弹出状态；
              参数设置区块头 + 返航高度步进 + 航点信息坐标 + 确认/航线生成/取消三按钮，
              确认/取消均收起面板（确认暂记录日志，待接入真实指令链路） */}
          {tapReturnOpen && (
            <TapReturnPanel
              onConfirm={(height) => {
                console.info(`[tap-return] 确认指点返航，高度 ${height}m`)
                setTapReturnOpen(false)
              }}
              onGenerateRoute={() => console.info('[tap-return] 航线生成（待接入）')}
              onCancel={() => setTapReturnOpen(false)}
            />
          )}

          {/* 区域降落面板（与其他功能面板互斥）：参数设置 tab（降落速度步进 m/s + 降落编队选择）/ 飞机列表 tab，确认（置灰）/ 航线生成/ 取消三按钮，确认/ 取消均收起面板（确认暂记录日志，待接入指令链路） */}
          {areaLandingOpen && (
            <AreaLandingPanel
              onConfirm={(speed, formation) => {
                console.info(
                  '[area-landing] 确认区域降落，速度 ' + speed + 'm/s，编队 ' + formation,
                )
                setAreaLandingOpen(false)
              }}
              onGenerateRoute={() => console.info('[area-landing] 航线生成（待接入）')}
              onCancel={() => setAreaLandingOpen(false)}
            />
          )}

          {/* 悬停面板（与其他功能面板互斥）：标题 + 飞机列表 + 确认/取消，
              确认/取消均收起面板（确认暂记录日志，待接入真实指令链路） */}
          {hoverOpen && (
            <HoverPanel
              onConfirm={() => {
                console.info('[hover] 确认悬停')
                setHoverOpen(false)
              }}
              onCancel={() => setHoverOpen(false)}
            />
          )}

          {/* 航点飞行面板（与其他功能面板互斥）：参数设置区块头 + 飞行高度步进 + 航点信息坐标 + 确认（置灰）/航线生成/取消三按钮，
              确认/取消均收起面板（确认暂记录日志，待接入真实指令链路） */}
          {waypointFlightOpen && (
            <WaypointFlightPanel
              onConfirm={(height) => {
                console.info(`[waypoint-flight] 确认航点飞行，高度 ${height}m`)
                setWaypointFlightOpen(false)
              }}
              onGenerateRoute={() => console.info('[waypoint-flight] 航线生成（待接入）')}
              onCancel={() => setWaypointFlightOpen(false)}
            />
          )}

          {/* 航线飞行面板（与其他功能面板互斥）：参数设置区块头 + 飞行高度步进 + 确认（置灰）/航线生成（置灰）/取消三按钮，无航点信息行，
              确认/取消均收起面板（确认暂记录日志，待接入真实指令链路） */}
          {routeFlightOpen && (
            <RouteFlightPanel
              onConfirm={(height) => {
                console.info(`[route-flight] 确认航线飞行，高度 ${height}m`)
                setRouteFlightOpen(false)
              }}
              onGenerateRoute={() => console.info('[route-flight] 航线生成（待接入）')}
              onCancel={() => setRouteFlightOpen(false)}
            />
          )}

          {/* 环绕飞行面板（与其他功能面板互斥）：参数设置区块头 + 盘旋高度步进 + 盘旋半径步进 + 航点信息坐标 + 确认/航线生成/取消三按钮，
              确认/取消均收起面板（确认暂记录日志，待接入真实指令链路） */}
          {orbitFlightOpen && (
            <OrbitFlightPanel
              onConfirm={(height) => {
                console.info(`[orbit-flight] 确认环绕飞行，高度 ${height}m`)
                setOrbitFlightOpen(false)
              }}
              onGenerateRoute={() => console.info('[orbit-flight] 航线生成（待接入）')}
              onCancel={() => setOrbitFlightOpen(false)}
            />
          )}

          {/* 集结点面板（与其他功能面板互斥）：参数设置 tab（起飞高度/集结速度步进 + 集结队形下拉）/ 飞机列表 tab，
              确认（置灰）/航线生成/取消三按钮，确认/取消均收起面板（确认暂记录日志，待接入指令链路） */}
          {rallyPointOpen && (
            <RallyPointPanel
              onConfirm={(height, speed, formation) => {
                console.info(
                  `[rally-point] 确认集结，高度 ${height}m，速度 ${speed}m/s，队形 ${formation}`,
                )
                setRallyPointOpen(false)
              }}
              onGenerateRoute={() => console.info('[rally-point] 航线生成（待接入）')}
              onCancel={() => setRallyPointOpen(false)}
            />
          )}

          {/* 编队飞行面板（与其他功能面板互斥）：参数设置区块头 + 飞行高度步进 + 编队队形下拉 + 航点信息坐标，
              确认（置灰）/航线生成/取消三按钮，确认/取消均收起面板（确认暂记录日志，待接入指令链路） */}
          {formationFlightOpen && (
            <FormationFlightPanel
              onConfirm={(height, formation) => {
                console.info(`[formation-flight] 确认编队飞行，高度 ${height}m，队形 ${formation}`)
                setFormationFlightOpen(false)
              }}
              onGenerateRoute={() => console.info('[formation-flight] 航线生成（待接入）')}
              onCancel={() => setFormationFlightOpen(false)}
            />
          )}

          {/* 底部水平居中按钮条：13 段背景图拼接，第 2~12 段叠加功能图标，具体功能待接入。
              三层结构：.bottom-bar__item（负 margin + tooltip，pointer-events:none）>
              .bottom-bar__btn（72px 命中层：clip-path 并集轮廓，静止不动）>
              .bottom-bar__visual（60px 视觉层：底部对齐，hover 弹性向上顶出）。
              命中层不动 + 视觉层上移，鼠标不会因按钮顶出而脱离 hover（避免抖动循环） */}
          <nav className="bottom-bar" aria-label="底部功能按钮条">
            {BOTTOM_BAR_ITEMS.map((item, index) => (
              <span className="bottom-bar__item" key={item.background}>
                <button
                  type="button"
                  className={`bottom-bar__btn${item.icon ? '' : ' bottom-bar__btn--static'}${(item.panel === 'takeoff' && takeoffOpen) || (item.panel === 'landing' && landingOpen) || (item.panel === 'return-home' && returnHomeOpen) || (item.panel === 'tap-return' && tapReturnOpen) || (item.panel === 'area-landing' && areaLandingOpen) || (item.panel === 'hover' && hoverOpen) || (item.panel === 'waypoint-flight' && waypointFlightOpen) || (item.panel === 'route-flight' && routeFlightOpen) || (item.panel === 'orbit-flight' && orbitFlightOpen) || (item.panel === 'rally-point' && rallyPointOpen) || (item.panel === 'formation-flight' && formationFlightOpen) ? ' bottom-bar__btn--active' : ''}`}
                  aria-label={item.tooltip ?? `功能按钮${index + 1}`}
                  style={{ aspectRatio: `${item.width} / 72` }}
                  onClick={
                    item.panel === 'takeoff'
                      ? openTakeoffPanel
                      : item.panel === 'landing'
                        ? openLandingPanel
                        : item.panel === 'return-home'
                          ? openReturnHomePanel
                          : item.panel === 'tap-return'
                            ? openTapReturnPanel
                            : item.panel === 'area-landing'
                              ? openAreaLandingPanel
                              : item.panel === 'hover'
                                ? openHoverPanel
                                : item.panel === 'waypoint-flight'
                                  ? openWaypointFlightPanel
                                  : item.panel === 'route-flight'
                                    ? openRouteFlightPanel
                                    : item.panel === 'orbit-flight'
                                      ? openOrbitFlightPanel
                                        : item.panel === 'rally-point'
                                          ? openRallyPointPanel
                                          : item.panel === 'formation-flight'
                                            ? openFormationFlightPanel
                                            : undefined
                  }
                >
                  <span
                    className="bottom-bar__visual"
                    style={{
                      // 切图文件名（bottom-bar-seg-01.png 等）含连字符，url() 统一加引号
                      // 以避免 unquoted URL 的解析歧义
                      backgroundImage: `url("${item.background}")`,
                    }}
                  >
                    {item.icon && (
                      <img className="bottom-bar__icon" src={item.icon} alt="" draggable={false} />
                    )}
                  </span>
                </button>
                {item.tooltip && <span className="bottom-bar__tip">{item.tooltip}</span>}
              </span>
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
