/**
 * HomePage —— 地面站主页面（编排层）。
 *
 * 地图引擎：MapLibre GL JS（严格离线，瓦片由本地 MBTiles 包经 IndexedDB 渲染）。
 * 页面按模块拆分（均 <500 行）：
 * - useExclusivePanels（内部 useBasicPanelStates/useAdvancedPanelStates）功能面板互斥状态机
 * - useFlightAnimations / useFlightInteractions   模拟飞行动画与地图取点监听
 * - components/*   禁飞区/巡检区/飞机层/飞行覆盖层/功能面板组/底部按钮条等
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { StatusHeader } from '../../components/StatusHeader/StatusHeader'
import { MapToolbar } from '../../components/MapToolbar/MapToolbar'
import { MissionPanel } from '../../components/MissionPanel/MissionPanel'
import { MapControls } from '../../components/MapControls/MapControls'
import { MapLoadProgress } from './components/map/MapLoadProgress'
import { AlarmInfoPanel } from '../../components/AlarmInfoPanel/AlarmInfoPanel'
import { MapLibreContainer } from '../../components/MapLibreContainer/MapLibreContainer'
import { MapScale } from '../../components/MapScale/MapScale'
import { type FormationFlightFormation } from '../../components/FormationFlightPanel/FormationFlightPanel'
import { useMapEngine } from '../../hooks/useMapEngine'
import { aircraft } from '../../config/aircraft'
import { useDraggable } from '../../hooks/useDraggable'
import { AircraftFocusPanel } from '../../components/AircraftFocusPanel/AircraftFocusPanel'
import { computePanelPlacement, placementToClasses } from '../../utils/panelPlacement'
import { useLayerStore } from '../../stores/layerStore'
import { usePanelClamp } from '../../hooks/usePanelClamp'
import { useOfflineMap } from '../../features/offline-map/useOfflineMap'
import { useOfflineMapStore } from '../../features/offline-map/offlineMapStore'
import { useDeviceLinkStore } from '../../stores/deviceLinkStore'
import { deviceList } from '../../config/devices'
import type { AircraftListItem } from '../../components/AircraftListPanel/AircraftListSection'
import './HomePage.css'
import './styles/HoverPanelPlacement.css'
import { NoflyZone } from './components/zones/NoflyZone'
import { InspectionZone } from './components/zones/InspectionZone'
import AircraftLayer from './components/aircraft/AircraftLayer'
import { TargetMarkerLayer } from './components/targets/TargetMarkerLayer'
import { FlightCommandPanels } from './components/panels/FlightCommandPanels'
import { WaypointFlightPanels } from './components/panels/WaypointFlightPanels'
import { FlightMissionPanels } from './components/panels/FlightMissionPanels'
import { useFlightInteractions } from './hooks/useFlightInteractions'
import { useExclusivePanels } from './hooks/useExclusivePanels'
import { useFlightAnimations } from './hooks/useFlightAnimations'
import {
  ALARM_COLORS,
  SHOW_PENDING_PANELS,
  AIRCRAFT_INITIAL_POSITIONS,
  INSPECTION_ZONE_INITIAL_POSITION,
} from './constants'
import {
  getAreaLandingSpots,
  getRallyPointSpots,
  computeFormationFlightGeometry,
} from './formationLayout'
import { FlightOverlays } from './components/overlays/FlightOverlays'
import { AreaSelectOverlay } from './components/overlays/AreaSelectOverlay'
import { BottomBar } from './components/bottom-bar/BottomBar'

export function HomePage() {
  const [activeAlarm, setActiveAlarm] = useState<number | null>(null)

  // 告警信息面板色调：当前激活徽标（红/橙/蓝）映射为面板边框色调
  const currentAlarmColor = activeAlarm !== null ? ALARM_COLORS[activeAlarm] : undefined

  // 聚焦视图：双击无人机图标后显示设备详情面板（存储聚焦的飞机索引）
  const [focusedAircraft, setFocusedAircraft] = useState<number | null>(null)

  // 功能面板状态机（自 useExclusivePanels 拆出）：持有 11 个功能面板的全部状态、
  // 功能面板状态机 + 模拟飞行动画：整组对象传给覆盖层/面板组件与交互 hook
  const panels = useExclusivePanels()
  const {
    returnHomeOpen,
    tapReturnOpen,
    waypointFlightOpen,
    routeFlightOpen,
    orbitFlightOpen,
    formationFlightOpen,
    setAreaLandingOpen,
    setRallyPointOpen,
    tapReturnPoint,
    areaLandingFormation,
    areaLandingRect,
    setAreaLandingRect,
    setAreaLandingCorners,
    setAreaLandingRouteGenerated,
    areaSelectMode,
    setAreaSelectMode,
    areaSelectAnchor,
    setAreaSelectAnchor,
    areaSelectEnd,
    setAreaSelectEnd,
    areaSelectDragging,
    setAreaSelectDragging,
    areaSelectHover,
    setAreaSelectHover,
    areaSelectSource,
    waypointPoint,
    waypointPickingActive,
    routeFlightPicking,
    orbitPoint,
    rallyPointRect,
    setRallyPointRect,
    setRallyPointRouteGenerated,
    rallyPointFormation,
    formationFlightPoint,
    formationFlightFormation,
    panelOpenState,
    panelHandlers,
  } = panels

  const animations = useFlightAnimations()
  const {
    stopRallyPointFlights,
  } = animations


  // 模拟飞行动画（自 useFlightAnimations 拆出）：8 套 rAF 循环动画的飞行状态与启停
  const handleAircraftDoubleClick = (index: number) => {
    // 双击同一架飞机时切换关闭，双击不同飞机时切换目标
    setFocusedAircraft((prev) => (prev === index ? null : index))
  }
  const handleCloseFocusPanel = () => setFocusedAircraft(null)

  // 地图引擎实例：MapLibreContainer 初始化后通过 onEngineReady 注入，
  // adapter 供业务组件（控件、比例尺等）引擎无关地操作地图。
  const { adapter, engineInstance, onEngineReady } = useMapEngine()

  // 地图取点监听 + 面板关闭/航线失效编排（自 useFlightInteractions 拆出）
  const { handleDeleteRoutePoint } = useFlightInteractions(panels, animations, adapter)
  // 离线地图：注册 gcs-pkg:// 协议 + 加载已导入包 + 派生活跃栅格样式。
  // 严格离线机制——地图容器不读取 navigator.onLine、无「在线/离线」分支；
  // 尚未导入离线地图包时 activeStyle 为 null（渲染纯色占位底图），
  // 导入后由 gcs-pkg:// 协议从 IndexedDB 渲染。
  const { activeStyle, activePackage } = useOfflineMap()

  // 默认城市：每次会话首次加载完成后，无条件确保「苏州」离线包可用并激活（最新优先）。
  // ensureCityPackage 内置版本检测（HEAD Last-Modified 对比 importedAt）：
  // public/maps/suzhou.mbtiles 有更新 → 自动删旧导新升级为最新数据；
  // 未导入 → 从同源静态目录拉取导入；已导入且未过期 → 直接激活。
  // 离线地图面板已隐藏，用户无手动切换入口，故每次启动都回到默认苏州。
  const ensureCityPackage = useOfflineMapStore((s) => s.ensureCityPackage)
  const offlineStatus = useOfflineMapStore((s) => s.status)
  const defaultCityEnsuredRef = useRef(false)
  useEffect(() => {
    if (defaultCityEnsuredRef.current || offlineStatus !== 'ready') return
    defaultCityEnsuredRef.current = true
    void ensureCityPackage('suzhou')
  }, [offlineStatus, ensureCityPackage])

  // 激活包变化时（导入新包 / 切换城市）平滑飞到包中心。
  useEffect(() => {
    if (!adapter || !activePackage) return
    adapter.flyTo(activePackage.center, { zoom: 14, duration: 1500 })
  }, [adapter, activePackage])


  // 设备联动：hover/选中状态与设备管理面板双向同步（全局 store 承载，
  // deviceIndex 对应 config/devices.ts deviceList 下标）
  const hoveredDevice = useDeviceLinkStore((s) => s.hoveredDevice)
  const selectedDevices = useDeviceLinkStore((s) => s.selectedDevices)
  const setHoveredDevice = useDeviceLinkStore((s) => s.setHoveredDevice)
  const toggleDevice = useDeviceLinkStore((s) => s.toggleDevice)
  const requestOpenDevicePanel = useDeviceLinkStore((s) => s.requestOpenDevicePanel)

  // 选中飞机列表：取「设备管理」选中集合对应的真实设备（名称对齐 devices.ts，
  // 高度/电量先取配置遥测值作为 mock，后续接入实时遥测后替换数据源即可）
  const selectedAircraft: AircraftListItem[] = useMemo(() => {
    const indices = [...selectedDevices].sort((a, b) => a - b)
    return indices
      .map((index) => {
        const device = deviceList[index]
        if (!device) return null
        return {
          id: String(index),
          name: device.name,
          altitude: Number(device.altitudeValue?.replace(/[^\d.]/g, '')) || 0,
          battery: Number(device.batteryValue?.replace(/[^\d.]/g, '')) || 0,
        }
      })
      .filter((item): item is AircraftListItem => item !== null)
  }, [selectedDevices])
  // Aircraft row delete: deselect the device (id = device index string). Store update
  // syncs device panel checkboxes, home icons, and bottom bar button states.
  const handleRemoveAircraft = (id: string) => {
    toggleDevice(Number(id))
  }

  // 区域降落降落坪排列：算法迁至 formationLayout.getAreaLandingSpots
  // （队形/选区/选中飞机数变化时联动重排）
  const areaLandingSpots = useMemo(
    () => getAreaLandingSpots(areaLandingRect, areaLandingFormation, selectedAircraft.length),
    [areaLandingRect, areaLandingFormation, selectedAircraft.length],
  )

  // 集结点集结坪布局（与区域降落同款交互）：按集结队形在已确认集结区域内布置
  // 「数量=选中飞机数」的集结坪；队形/选区/选中飞机数变化时联动重排
  const rallyPointSpots = useMemo<{ x: number; y: number }[]>(
    () => getRallyPointSpots(rallyPointRect, rallyPointFormation, selectedAircraft.length),
    [rallyPointRect, rallyPointFormation, selectedAircraft.length],
  )


  // 飞机图标拖拽：鼠标左键按住拖动图标+名称至首页任意位置
  const { positions: aircraftPositions, onDragStart: onAircraftDragStart } = useDraggable({
    count: aircraft.length,
    initialPositions: AIRCRAFT_INITIAL_POSITIONS,
    storageKey: 'gcs:aircraft-positions',
  })

  // 编队飞行航线几何（视口坐标）：以最左选中飞机图标正上方（水平对齐其中心、上移
  // 360px 且不越过视口上缘）为锚点，按当前队形布置降落点——目的地尽量贴近左侧
  // 原始无人机图标，并给出各机图标中心起点；航线渲染（绿色实线 + 降落点图标）与
  // 模拟飞行（滑窗确认后启动）共用同一算法；可传入队形覆盖当前状态（队形变更重启动画时使用新队形）
  const getFormationFlightGeometry = (formation?: FormationFlightFormation) =>
    computeFormationFlightGeometry(
      aircraft,
      selectedDevices,
      aircraftPositions,
      formation ?? formationFlightFormation,
    )

  // 巡检区域拖拽：鼠标左键按住拖动整个巡检区域（含轨迹线）至首页任意位置
  const { positions: inspectionZonePositions, onDragStart: onInspectionZoneDragStart } =
    useDraggable({
      count: 1,
      initialPositions: [INSPECTION_ZONE_INITIAL_POSITION],
      storageKey: 'gcs:inspection-zone-position',
    })

  // 图层显隐（图层控制面板开关联动）：禁飞区/巡检区默认关，设备标签默认开
  const noflyZoneVisible = useLayerStore((s) => s.noflyZoneVisible)
  const inspectionZoneVisible = useLayerStore((s) => s.inspectionZoneVisible)
  const deviceLabelsVisible = useLayerStore((s) => s.deviceLabelsVisible)

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
      noflyZoneVisible,
      inspectionZoneVisible,
      deviceLabelsVisible,
    ],
  })

  return (
    <main
      className={`design-viewport${tapReturnOpen && !tapReturnPoint ? ' tap-return-mode' : ''}${waypointFlightOpen ? ' waypoint-flight-mode' : ''}${waypointFlightOpen && waypointPickingActive && !waypointPoint ? ' waypoint-picking' : ''}${routeFlightOpen && routeFlightPicking ? ' route-flight-picking' : ''}${orbitFlightOpen && !orbitPoint ? ' orbit-flight-mode' : ''}${formationFlightOpen && !formationFlightPoint ? ' formation-flight-mode' : ''}`}
      aria-label="无人机集群控制地面站"
    >
      <div className="design-canvas">
        {/* 地图底图：MapLibre GL JS 容器（严格离线）。尚未导入地图包时渲染纯色占位底图，
            导入后由父组件通过 styleSpec 注入 MBTiles 派生样式（P1+）。 */}
        <MapLibreContainer
          className="map-base"
          onReady={onEngineReady}
          styleSpec={activeStyle}
          autoLocate
        />

        <StatusHeader
          activeAlarm={activeAlarm}
          onAlarmClick={(index) => setActiveAlarm((prev) => (prev === index ? null : index))}
        />

        <section className="map-stage">
          <MapToolbar />

          {/* 告警信息面板：右上角常显，色调随顶栏激活的告警徽标切换。
              详情面板（AlarmDetailPanel）暂时隐藏：点击徽标不再展开详情，
              仅保留徽标高亮与常驻框色调联动；需要时恢复条件渲染即可 */}
          <div className="alarm-panels">
            <AlarmInfoPanel alarmColor={currentAlarmColor} />
          </div>
          {/* 离线地图管理面板（导入 / 城市切换 / 包列表）暂隐藏——默认自动加载最新苏州包，
              需要手动管理时恢复下方注释即可（严格离线，仅读写本地 IndexedDB） */}
          {/* <OfflineMapPanel /> */}

          {/* 严格离线：瓦片缓存命中即渲染；未命中灰显（绝不在线回源）。
              尚未导入地图包时渲染纯色占位底图。导入/切换入口由离线地图管理模块提供（P1+）。 */}
          {/* MissionPanel 暂时隐藏，待后续功能接入时恢复 */}
          {SHOW_PENDING_PANELS && <MissionPanel />}
          {/* 红色禁飞区：左下角倾斜四边形，SVG 绘制边框 + 四角节点。
              显隐由图层控制面板「禁飞区」开关联动（layerStore），默认关 */}
          {noflyZoneVisible && <NoflyZone />}
          {SHOW_PENDING_PANELS && <div className="restricted-zone restricted-zone--orange" />}
          {/* 巡检区域：包含1条蛇形巡检轨迹线，支持拖拽移动。
              显隐由图层控制面板「巡检区域」开关联动（layerStore），默认关 */}
          {inspectionZoneVisible && (
            <InspectionZone
              position={inspectionZonePositions[0]}
              onDragStart={(e) => onInspectionZoneDragStart(0, e)}
              panelClasses={inspectionZonePanelClasses}
            />
          )}
          {/* 目标图标层：目标列表每行对应一个态势图图标（车辆 tank / 人员 people），
              三种状态背景（正常/hover·点击联动/标记重点），与 TargetListPanel
              经 targetLinkStore 双向联动（hover/点击行/标记重点/删除同步） */}
          <TargetMarkerLayer />
          {/* 无人机图标：显隐由图层控制面板「设备标签」开关联动（layerStore），默认开 */}
          {deviceLabelsVisible && (
            <>
              <AircraftLayer
                aircraft={aircraft}
                aircraftPositions={aircraftPositions}
                selectedDevices={selectedDevices}
                hoveredDevice={hoveredDevice}
                returnHomeOpen={returnHomeOpen}
                focusedAircraft={focusedAircraft}
                onHoverDevice={setHoveredDevice}
                onDragStart={onAircraftDragStart}
                onAircraftClick={(deviceIndex) => {
                  toggleDevice(deviceIndex)
                  requestOpenDevicePanel()
                }}
                onAircraftDoubleClick={handleAircraftDoubleClick}
              />
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
            </>
          )}
          <MapControls adapter={adapter} />
          {/* 地图加载进度：右下角仪表盘，挂载即显示（覆盖启动黑底等待期）——
              占位等待假进度缓升 → 离线样式就绪后按真实瓦片事件（sourcedataloading/
              sourcedata 比值）推进 → 100% 淡出。reloadKey 绑定 activeStyle 引用，
              离线地图包热切换时重置从 0 重新统计。 */}
          <MapLoadProgress map={engineInstance?.raw} reloadKey={activeStyle} />

          {/* 功能面板（互斥，自 components/FlightPanels* 拆出） */}
          <FlightCommandPanels panels={panels} anims={animations} aircraft={aircraft} selectedAircraft={selectedAircraft} handleRemoveAircraft={handleRemoveAircraft} selectedDevices={selectedDevices} aircraftPositions={aircraftPositions} />
          <WaypointFlightPanels panels={panels} anims={animations} aircraft={aircraft} selectedDevices={selectedDevices} areaLandingSpots={areaLandingSpots} aircraftPositions={aircraftPositions} />
          <FlightMissionPanels panels={panels} anims={animations} adapter={adapter} aircraft={aircraft} selectedDevices={selectedDevices} aircraftPositions={aircraftPositions} rallyPointSpots={rallyPointSpots} getFormationFlightGeometry={getFormationFlightGeometry} selectedAircraft={selectedAircraft} handleRemoveAircraft={handleRemoveAircraft} />
          {/* FlightOverlays（自 components/FlightOverlays 拆出）：连线/图钉/盘旋圆/模拟飞行图标 */}
          <FlightOverlays
            panels={panels}
            anims={animations}
            adapter={adapter}
            aircraftPositions={aircraftPositions}
            selectedDevices={selectedDevices}
            getFormationFlightGeometry={getFormationFlightGeometry}
            areaLandingSpots={areaLandingSpots}
            rallyPointSpots={rallyPointSpots}
            handleDeleteRoutePoint={handleDeleteRoutePoint}
          />

          {/* AreaSelectOverlay（自 components/AreaSelectOverlay 拆出） */}
          <AreaSelectOverlay
            setAreaLandingOpen={setAreaLandingOpen}
            setRallyPointOpen={setRallyPointOpen}
            setAreaLandingRect={setAreaLandingRect}
            setAreaLandingCorners={setAreaLandingCorners}
            setAreaLandingRouteGenerated={setAreaLandingRouteGenerated}
            areaSelectMode={areaSelectMode}
            setAreaSelectMode={setAreaSelectMode}
            areaSelectAnchor={areaSelectAnchor}
            setAreaSelectAnchor={setAreaSelectAnchor}
            areaSelectEnd={areaSelectEnd}
            setAreaSelectEnd={setAreaSelectEnd}
            areaSelectDragging={areaSelectDragging}
            setAreaSelectDragging={setAreaSelectDragging}
            areaSelectHover={areaSelectHover}
            setAreaSelectHover={setAreaSelectHover}
            areaSelectSource={areaSelectSource}
            setRallyPointRect={setRallyPointRect}
            setRallyPointRouteGenerated={setRallyPointRouteGenerated}
            stopRallyPointFlights={stopRallyPointFlights}
            adapter={adapter}
          />

          {/* 底部水平居中按钮条（自 components/BottomBar 拆出）：13 段背景图拼接，
              第 2~12 段叠加功能图标，三层结构与禁用/激活态见该组件 */}
          <BottomBar
            selectedDevices={selectedDevices}
            panelOpenState={panelOpenState}
            panelHandlers={panelHandlers}
          />

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


