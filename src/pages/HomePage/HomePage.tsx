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
import { AlarmDetailPanel } from '../../components/AlarmDetailPanel/AlarmDetailPanel'
import { MapLibreContainer } from '../../components/MapLibreContainer/MapLibreContainer'
import { MapScale } from '../../components/MapScale/MapScale'
import { type FormationFlightFormation } from '../../components/FormationFlightPanel/FormationFlightPanel'
import { useMapEngine } from '../../hooks/useMapEngine'
import { aircraft } from '../../config/aircraft'
import { useDraggable } from '../../hooks/useDraggable'
import { useMapAnchorSync } from '../../hooks/useMapAnchorSync'
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
  ALARM_COLLAPSE_MS,
  SHOW_PENDING_PANELS,
  AIRCRAFT_INITIAL_POSITIONS,
  AIRCRAFT_ANCHOR_OFFSETS,
  INSPECTION_ZONE_INITIAL_POSITION,
  MAP_FOCUS_ZOOM,
  MAP_FOCUS_FLY_DURATION_MS,
} from './constants'
import { buildTargetAnchors, useTargetLinkStore } from '../../stores/targetLinkStore'
import { loadScopedAnchors } from '../../utils/geoAnchor'
import type { LngLat } from '../../map-engines/types'
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

  // 级别切换中转（先收起再打开）：已展开 A 级别时点击另一徽标，不直接换面板内容——
  // 先置 activeAlarm=null 播放收起动画，同时记录 pendingAlarm=目标级别，
  // ALARM_COLLAPSE_MS 后收起动画播完，再展开目标级别面板。
  const [pendingAlarm, setPendingAlarm] = useState<number | null>(null)

  // 告警信息面板色调：当前激活徽标（红/橙/蓝）映射为面板边框色调
  const currentAlarmColor = activeAlarm !== null ? ALARM_COLORS[activeAlarm] : undefined

  // 收起衔接状态机：activeAlarm 由非 null → null（开始收起）的瞬间挂 --collapsing，
  // 常驻面板缺口在收起动画播放全程保持补齐（两面板视觉连续）；
  // ALARM_COLLAPSE_MS（= 收起动画时长）后移除该类，缺口才恢复展示。
  // 展开（activeAlarm 非 null）时立即清除，快速"收起→再展开"亦不受影响。
  const prevActiveAlarmRef = useRef<number | null>(null)
  const [alarmCollapsing, setAlarmCollapsing] = useState(false)
  useEffect(() => {
    const prev = prevActiveAlarmRef.current
    prevActiveAlarmRef.current = activeAlarm
    if (activeAlarm !== null) {
      setAlarmCollapsing(false)
      return
    }
    if (prev !== null) {
      setAlarmCollapsing(true)
      const timer = window.setTimeout(() => setAlarmCollapsing(false), ALARM_COLLAPSE_MS)
      return () => window.clearTimeout(timer)
    }
  }, [activeAlarm])

  // 待展开定时器：收起动画播完后展开目标级别面板（先收起再打开的后半程）。
  // 收起期间用户可改点其他徽标（更新目标）或点回待展开徽标本身（取消，保持收起），
  // pendingAlarm 变化即重挂定时器，始终以最新目标为准。
  useEffect(() => {
    if (pendingAlarm === null) return
    const timer = window.setTimeout(() => {
      setActiveAlarm(pendingAlarm)
      setPendingAlarm(null)
    }, ALARM_COLLAPSE_MS)
    return () => window.clearTimeout(timer)
  }, [pendingAlarm])

  /** 顶栏徽标点击（先收起再打开的前半程在此触发）：
   *  - 未展开时点击：直接展开该级别；
   *  - 已展开同一徽标：toggle 收起；
   *  - 已展开另一级别徽标：先置 activeAlarm=null 播放收起动画，记录 pendingAlarm=目标，
   *    由上方定时器在收起动画播完后展开新级别面板（不直接换内容）；
   *  - 收起动画期间点击：点待展开徽标本身＝取消（保持收起），点其他徽标＝改目标。 */
  const handleAlarmClick = (index: number) => {
    if (pendingAlarm !== null) {
      setPendingAlarm((prev) => (prev === index ? null : index))
      return
    }
    if (activeAlarm === index) {
      setActiveAlarm(null)
      return
    }
    if (activeAlarm !== null) {
      setPendingAlarm(index)
      setActiveAlarm(null)
      return
    }
    setActiveAlarm(index)
  }

  // 详情面板收起：点击面板组外部区域时收起。顶栏告警徽标（.alarm）排除——
  // 其点击由 StatusHeader onAlarmClick toggle 承担（展开/收起同一入口），
  // 避免外部判定先收起、随后 click 又展开的双重切换。面板未展开时不挂监听。
  const alarmPanelsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // 展开中或切换收起中（存在待展开目标）均挂监听：点击外部即收起并取消待展开目标
    if (activeAlarm === null && pendingAlarm === null) return
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target) return
      // 面板组内部（常驻告警框 + 详情面板）：不收起
      if (alarmPanelsRef.current?.contains(target)) return
      // 顶栏告警徽标及其子元素：交给徽标自身 toggle
      if (target instanceof Element && target.closest('.alarm')) return
      setActiveAlarm(null)
      if (pendingAlarm !== null) setPendingAlarm(null) // 切换收起中点击外部：取消待展开目标
    }
    // 捕获阶段监听：不受子元素（地图画布等）stopPropagation 阻断
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [activeAlarm, pendingAlarm])

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
  const pruneNonSatellitePackages = useOfflineMapStore((s) => s.pruneNonSatellitePackages)
  const offlineStatus = useOfflineMapStore((s) => s.status)
  const defaultCityEnsuredRef = useRef(false)
  useEffect(() => {
    if (defaultCityEnsuredRef.current || offlineStatus !== 'ready') return
    defaultCityEnsuredRef.current = true
    void (async () => {
      // 仅保留卫星影像包：清理历史导入的矢量/街道图包（png 等），再激活默认城市
      await pruneNonSatellitePackages()
      await ensureCityPackage('suzhou')
    })()
  }, [offlineStatus, ensureCityPackage, pruneNonSatellitePackages])

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


  // 飞机图标拖拽 + 地理锚定：手动拖动图标+名称至首页任意位置；地图拖动/缩放时
  // 图标按地理锚点（LngLat）随地图一起移动（useMapAnchorSync，详见该 hook 注释）
  // 种子锚点按当前离线地图包派生：localStorage 按包恢复优先（上次拖放位置），
  // 无则包中心 + AIRCRAFT_ANCHOR_OFFSETS 播种（布局与原百分比布局观感一致）
  const aircraftSeedAnchors = useMemo<LngLat[] | null>(() => {
    if (!activePackage) return null
    const ids = aircraft.map((_, i) => i)
    const saved = loadScopedAnchors('gcs:aircraft-anchors', activePackage.id, ids)
    // 全部索引都有持久化锚点才整体采用（loadScopedAnchors 部分缺失时返回 {}）
    if (Object.keys(saved).length > 0) return ids.map((i) => saved[String(i)])
    return AIRCRAFT_ANCHOR_OFFSETS.map((off) => ({
      lng: activePackage.center.lng + off.lng,
      lat: activePackage.center.lat + off.lat,
    }))
  }, [activePackage])
  const {
    positions: aircraftPositions,
    onDragStart: onAircraftDragStart,
    getAnchor: getAircraftAnchor,
  } = useMapAnchorSync({
    adapter,
    count: aircraft.length,
    initialPositions: AIRCRAFT_INITIAL_POSITIONS,
    storageKey: 'gcs:aircraft-positions:v3',
    initialAnchors: aircraftSeedAnchors,
    anchorStorageKey: 'gcs:aircraft-anchors',
    anchorScope: activePackage?.id ?? null,
  })

  // ===== 面板单选聚焦：设备/目标面板单行勾上时地图平滑飞转到对应图标锚点 =====
  // 全选/全不选走整体替换（setSelectedDevices / setSelectedTargetIds），不产生聚焦请求。
  // 消费后立即清除请求；锚点未就绪（锚定未初始化）时仅清除不飞转。
  const mapFocusDeviceRequest = useDeviceLinkStore((s) => s.mapFocusDeviceRequest)
  const clearMapFocusDeviceRequest = useDeviceLinkStore((s) => s.clearMapFocusDeviceRequest)
  useEffect(() => {
    if (!adapter || !mapFocusDeviceRequest) return
    const anchor = getAircraftAnchor(mapFocusDeviceRequest.index)
    clearMapFocusDeviceRequest()
    if (!anchor) return
    adapter.flyTo(anchor, {
      zoom: Math.max(adapter.getZoom(), MAP_FOCUS_ZOOM),
      duration: MAP_FOCUS_FLY_DURATION_MS,
    })
  }, [adapter, mapFocusDeviceRequest, getAircraftAnchor, clearMapFocusDeviceRequest])

  const mapFocusTargetRequest = useTargetLinkStore((s) => s.mapFocusTargetRequest)
  const clearMapFocusTargetRequest = useTargetLinkStore((s) => s.clearMapFocusTargetRequest)
  useEffect(() => {
    if (!adapter || !mapFocusTargetRequest) return
    // 目标锚点存于 store（TargetMarkerLayer 初始化/拖拽后更新），按 id 读取
    const anchor = useTargetLinkStore.getState().targetAnchors[mapFocusTargetRequest.id]
    clearMapFocusTargetRequest()
    if (!anchor) return
    adapter.flyTo(anchor, {
      zoom: Math.max(adapter.getZoom(), MAP_FOCUS_ZOOM),
      duration: MAP_FOCUS_FLY_DURATION_MS,
    })
  }, [adapter, mapFocusTargetRequest, clearMapFocusTargetRequest])

  // 目标图标种子锚点（同飞机模式）：localStorage 按包恢复优先（上次拖放位置），
  // 无则包中心 + TARGET_ANCHOR_OFFSETS 播种（目标簇居中偏右下，观感与原布局一致）
  const targetSeedAnchors = useMemo<Record<string, LngLat> | null>(() => {
    if (!activePackage) return null
    const seeded = buildTargetAnchors(activePackage.center)
    const saved = loadScopedAnchors('gcs:target-anchors', activePackage.id, Object.keys(seeded))
    return Object.keys(saved).length > 0 ? saved : seeded
  }, [activePackage])

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
          onAlarmClick={handleAlarmClick}
        />

        <section className="map-stage">
          <MapToolbar />

          {/* 告警信息面板：右上角常显，色调随顶栏激活的告警徽标切换。
              详情面板（AlarmDetailPanel）：常驻挂载于详情 wrapper（alarm-panels__detail），
              点击顶栏告警徽标时由 --expanded 态驱动 CSS 过渡（grid-template-rows 0fr→1fr）
              从常驻框下缘向下延伸滑出，再次点击同一徽标收回（toggle 由 StatusHeader 承担）；
              切换其他级别徽标时不直接换内容——先收起当前面板，收起动画播完后再展开
              新级别面板（pendingAlarm 中转，见 handleAlarmClick） */}
          <div
            ref={alarmPanelsRef}
            className={`alarm-panels${activeAlarm !== null ? ' alarm-panels--expanded' : ''}${alarmCollapsing ? ' alarm-panels--collapsing' : ''}`}
          >
            <AlarmInfoPanel alarmColor={currentAlarmColor} />
            <div className="alarm-panels__detail">
              <AlarmDetailPanel alarmColor={currentAlarmColor} />
            </div>
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
          <TargetMarkerLayer
            adapter={adapter}
            seedAnchors={targetSeedAnchors}
            anchorScope={activePackage?.id ?? null}
          />
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


