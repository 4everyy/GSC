/**
 * HomePage —— 地面站主页面（编排层）。
 *
 * 地图引擎：MapLibre GL JS（严格离线，瓦片由本地 MBTiles 经 HTTP Range 直读渲染）。
 * 页面按模块拆分（均 <500 行）：
 * - useExclusivePanels（内部 状态声明/互斥开合/查询表单文件扁平化）功能面板互斥状态机
 * - useFlightAnimations / useFlightInteractions   模拟飞行动画与地图取点监听
 * - components/*   飞机层/飞行覆盖层/功能面板组/底部按钮条等
 */
import { useCallback, useState, useEffect, useMemo, useRef } from 'react'
import { StatusHeader, MapToolbar, MapControls, MapScale } from '../../components/MapChrome/MapChrome'
import { MissionPanel, type FormationFlightFormation } from '../../components/FlightActionPanels/FlightActionPanels'
import { MapLoadProgress, MapLibreContainer } from '../../components/MapLibreContainer/MapLibreContainer'
import { AlarmPanels } from '../../components/home/alarm/AlarmPanels'
import { useMapEngine, useMapAnchorSync, usePanelClamp } from '../../hooks/index'
import { aircraft } from '../../config/index'
import { AircraftFocusPanel } from '../../components/AircraftFocusPanel/AircraftFocusPanel'
import { useLayerStore, useDeviceLinkStore, useTaskAreaStore, usePlaneStatusStore } from '../../stores/index'
import { useOfflineMap } from '../../features/offline-map/index'
import { type AircraftListItem, FlightCommandPanels, WaypointFlightPanels } from '../../components/home/panels/FlightCommandPanels'
import './HomePage.css'
import { TaskAreaLayer, getAreaBounds } from '../../components/home/zones/TaskAreaLayer'
import AircraftLayer from '../../components/home/aircraft/AircraftLayer'
import { TargetMarkerLayer } from '../../components/home/targets/TargetMarkerLayer'
import { FlightMissionPanels } from '../../components/home/panels/FlightMissionPanels'
import { useFlightInteractions } from '../../hooks/useFlightInteractions'
import { useExclusivePanels } from '../../hooks/useExclusivePanels'
import { useFlightAnimations } from '../../hooks/useFlightAnimations'
import { SHOW_PENDING_PANELS, AIRCRAFT_INITIAL_POSITIONS, AIRCRAFT_ANCHOR_OFFSETS, TARGET_NEAR_AIRCRAFT_OFFSETS, TARGET_REAL_LNGLAT_MAX_OFFSET, MAP_FOCUS_ZOOM, MAP_FOCUS_FLY_DURATION_MS, AREA_FOCUS_PADDING, AREA_FOCUS_MAX_ZOOM, getAreaLandingSpots, getRallyPointSpots, computeFormationFlightGeometry } from '../../lib/formationLayout'
import { buildTargetAnchors, useTargetLinkStore } from '../../stores/targetLinkStore'
import { loadScopedAnchors } from '../../utils/index'
import { type LngLat } from '../../map-engines/types'
import { FlightOverlays, AreaSelectOverlay } from '../../components/home/overlays/FlightOverlays'
import { BottomBar } from '../../components/home/bottom-bar/BottomBar'
import { DemoScenario } from '../../components/home/demo/DemoScenario'

export function HomePage() {
  // 告警面板状态机已抽离（WB-PF-002）：activeAlarm/pendingAlarm/alarmCollapsing 及
  // 双定时器全部下沉 alarmPanelStore，由 StatusHeader（徽标点击）与 AlarmPanels
  // （面板组渲染）各自按选择器订阅，告警交互不再重渲染 HomePage

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

  // 区域列表「添加区域」跨层级信号：AreaListPanel 挂载于 MapToolbar 内（与本组件
  // 平级，无法经 props 传递），按钮点击时 taskAreaStore.addAreaRequests 计数 +1；
  // 此处监听计数变化进入 area-list 绘制模式——六边形绘制交互
  // （按下左键自光标点拉出对称六边形 + 按住拖动放大/缩小 + 确认/取消），确认后本地新增任务区域
  const openAreaListSelect = panels.openAreaListSelect
  const addAreaRequests = useTaskAreaStore((s) => s.addAreaRequests)
  const addAreaRequestsRef = useRef(addAreaRequests)
  useEffect(() => {
    if (addAreaRequests === addAreaRequestsRef.current) return
    addAreaRequestsRef.current = addAreaRequests
    openAreaListSelect()
  }, [addAreaRequests, openAreaListSelect])

  // 区域列表行内「编辑区域」跨层级信号：同样经 taskAreaStore（面板与 HomePage
  // 平级无法经 props 传递）——监听 editAreaRequest 变化进入 area-list 绘制
  // 模式挂载 HexagonAreaOverlay；遮罩挂载后自行消费请求进入该区域的
  // 确认+编辑态（无需在此转发目标 id，避免 props 链路穿透）
  const editAreaRequest = useTaskAreaStore((s) => s.editAreaRequest)
  const editAreaRequestRef = useRef(editAreaRequest)
  useEffect(() => {
    if (editAreaRequest === editAreaRequestRef.current) return
    editAreaRequestRef.current = editAreaRequest
    if (editAreaRequest) openAreaListSelect()
  }, [editAreaRequest, openAreaListSelect])

  // 模拟飞行动画（自 useFlightAnimations 拆出）：8 套 rAF 循环动画的飞行状态与启停
  const handleAircraftDoubleClick = useCallback((index: number) => {
    // 双击同一架飞机时切换关闭，双击不同飞机时切换目标
    setFocusedAircraft((prev) => (prev === index ? null : index))
  }, [])
  const handleCloseFocusPanel = useCallback(() => setFocusedAircraft(null), [])

  // 地图引擎实例：MapLibreContainer 初始化后通过 onEngineReady 注入，
  // adapter 供业务组件（控件、比例尺等）引擎无关地操作地图。
  const { adapter, engineInstance, onEngineReady } = useMapEngine()

  // 地图取点监听 + 面板关闭/航线失效编排（自 useFlightInteractions 拆出）
  const { handleDeleteRoutePoint } = useFlightInteractions(panels, animations, adapter)
  // 离线地图：gcs-pkg:// 协议经 HTTP Range 按需直读 public/maps/suzhou.mbtiles（无导入、无 IndexedDB）。
  const { activeStyle, activePackage } = useOfflineMap()

  // 首次激活后平滑飞到包中心（苏州）。
  useEffect(() => {
    if (!adapter || !activePackage) return
    adapter.flyTo(activePackage.center, { zoom: 14, duration: 1500 })
  }, [adapter, activePackage])

  // 设备联动：hover/选中状态与设备管理面板双向同步（全局 store 承载，
  // deviceIndex 对应 config/devices.ts deviceList 下标）。
  // hoveredDevice 由 AircraftLayer 内部订阅（本组件不订阅，hover 变化不重渲染 HomePage）
  const selectedDevices = useDeviceLinkStore((s) => s.selectedDevices)
  const setHoveredDevice = useDeviceLinkStore((s) => s.setHoveredDevice)
  const toggleDevice = useDeviceLinkStore((s) => s.toggleDevice)
  const requestOpenDevicePanel = useDeviceLinkStore((s) => s.requestOpenDevicePanel)
  // 单击图标：切换选中并请求展开设备面板（引用稳定，供 AircraftLayer memo 比较）
  const handleAircraftClick = useCallback(
    (deviceIndex: number) => {
      toggleDevice(deviceIndex)
      requestOpenDevicePanel()
    },
    [toggleDevice, requestOpenDevicePanel],
  )

  // 选中飞机列表：取「设备管理」选中集合对应的设备数据。
  // 数据源与设备管理面板同源：planeStatusStore（MainApp 首页加载时请求一次
  // /api/v1/control/queryPlaneStatus 写入；接口未就绪/失败时展示 mock 兜底。
  const planeDevices = usePlaneStatusStore((s) => s.devices)
  const selectedAircraft: AircraftListItem[] = useMemo(() => {
    const indices = [...selectedDevices].sort((a, b) => a - b)
    return indices
      .map((index) => {
        const device = planeDevices[index]
        if (!device) return null
        return {
          id: String(index),
          name: device.name,
          altitude: Number(device.altitudeValue?.replace(/[^\d.]/g, '')) || 0,
          battery: Number(device.batteryValue?.replace(/[^\d.]/g, '')) || 0,
        }
      })
      .filter((item): item is AircraftListItem => item !== null)
  }, [selectedDevices, planeDevices])
  // Aircraft row delete: deselect the device (id = device index string). Store update
  // syncs device panel checkboxes, home icons, and bottom bar button states.
  const handleRemoveAircraft = useCallback(
    (id: string) => {
      toggleDevice(Number(id))
    },
    [toggleDevice],
  )

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
    // 锚点键随布局调整升版本（v2）：使旧集中布局的持久化锚点失效，重新按新偏移播种
    const saved = loadScopedAnchors('gcs:aircraft-anchors:v2', activePackage.id, ids)
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
    storageKey: 'gcs:aircraft-positions:v4',
    initialAnchors: aircraftSeedAnchors,
    anchorStorageKey: 'gcs:aircraft-anchors:v2',
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

  // 区域列表行复选框勾选联动聚焦：区域处于显示状态（「任务区域」图层开启 且
  // 未被行内眼睛/批量显示隐藏）时，态势图平滑飞转、完整框入该区域包围盒。
  // 视角换算交给引擎原生 fitBounds（MapLibre 按 512px 世界精确计算中心/缩放，
  // 上层手算米/像素易出常数口径偏差——曾因 256 瓦片常数导致 zoom 偏大一级、
  // 区域被放大出屏）；padding 让区域落在左右悬浮面板之间的中央可视带，
  // maxZoom 防止小区域过度放大；动画时长与设备/目标面板单行聚焦一致。
  // 发起端（AreaListPanel.toggleSelect）已做过显示状态判断，此处消费时
  // 再校验一次（请求间隙图层开关/区域隐藏状态可能变化）；消费后立即清除。
  const areaFocusRequest = useTaskAreaStore((s) => s.areaFocusRequest)
  const clearAreaFocusRequest = useTaskAreaStore((s) => s.clearAreaFocusRequest)
  useEffect(() => {
    if (!adapter || !areaFocusRequest) return
    const { id } = areaFocusRequest
    clearAreaFocusRequest()
    // 双重校验：请求发出后图层关闭/区域隐藏/被删则放弃聚焦（态势图无对应渲染）
    if (!useLayerStore.getState().taskAreaVisible) return
    const s = useTaskAreaStore.getState()
    const area = s.areas.find((a) => a.id === id)
    if (!area || s.hiddenIds.has(id)) return
    adapter.fitBounds(getAreaBounds(area), {
      padding: AREA_FOCUS_PADDING,
      maxZoom: AREA_FOCUS_MAX_ZOOM,
      duration: MAP_FOCUS_FLY_DURATION_MS,
    })
  }, [adapter, areaFocusRequest, clearAreaFocusRequest])

  // 目标真实经纬度签名（id+经纬度拼接字符串，按值比较）：
  // 仅当接口装载/替换目标（id 或经纬度变化）时才变化。
  // 不能直接依赖 targets 数组引用——地图移动时 applyTargetPositions 每帧更新
  // x/y 都会创建新数组引用，若 seedAnchors 随之重算，将引发
  // 「seedAnchors 变化 → effect 重投影 → targets 更新 → seedAnchors 变化」无限渲染循环
  const targetLngLatKey = useTargetLinkStore((s) =>
    s.targets
      .map((t) => (t.lngLat ? `${t.id}@${t.lngLat.lng.toFixed(7)},${t.lngLat.lat.toFixed(7)}` : ''))
      .join('|'),
  )
  // 目标图标种子锚点（同飞机模式）：接口目标（t.lngLat 真实经纬度）在初始视口内才
  // 直接锚定；离线包/视口外的远方坐标（后端测试数据常在其它城市）会投影视口之外，
  // 回退 TARGET_NEAR_AIRCRAFT_OFFSETS 无人机簇附近网格（可见且不重叠）；
  // mock 目标按包恢复 localStorage（上次拖放位置）→ 默认播种（保持原行为）
  const targetSeedAnchors = useMemo<Record<string, LngLat> | null>(() => {
    if (!activePackage) return null
    const seeded = buildTargetAnchors(activePackage.center)
    const saved = loadScopedAnchors('gcs:target-anchors', activePackage.id, Object.keys(seeded))
    const fallback = Object.keys(saved).length > 0 ? saved : seeded
    const anchors: Record<string, LngLat> = {}
    let overflowIndex = 0 // 视口外的接口目标按序取无人机附近网格偏移
    // 经 getState 读取最新 targets（签名未变时引用可能更新，内容 x/y 无关锚点）
    for (const t of useTargetLinkStore.getState().targets) {
      const real = t.lngLat
      if (real) {
        const visible =
          Math.abs(real.lng - activePackage.center.lng) <= TARGET_REAL_LNGLAT_MAX_OFFSET.lng &&
          Math.abs(real.lat - activePackage.center.lat) <= TARGET_REAL_LNGLAT_MAX_OFFSET.lat
        if (visible) {
          anchors[t.id] = real
          continue
        }
        // 远方坐标：无人机附近网格播种，池尽（目标数超 15）回退包中心
        const off = TARGET_NEAR_AIRCRAFT_OFFSETS[overflowIndex++]
        anchors[t.id] = off
          ? { lng: activePackage.center.lng + off.lng, lat: activePackage.center.lat + off.lat }
          : { ...activePackage.center }
      } else {
        // mock 目标：localStorage 恢复 → 默认播种
        anchors[t.id] = fallback[t.id] ?? { ...activePackage.center }
      }
    }
    return anchors
  }, [activePackage, targetLngLatKey])

  // 编队飞行航线几何（视口坐标）：以最左选中飞机图标正上方（水平对齐其中心、上移
  // 360px 且不越过视口上缘）为锚点，按当前队形布置降落点——目的地尽量贴近左侧
  // 原始无人机图标，并给出各机图标中心起点；航线渲染（绿色实线 + 降落点图标）与
  // 模拟飞行（滑窗确认后启动）共用同一算法；可传入队形覆盖当前状态（队形变更重启动画时使用新队形）
  const getFormationFlightGeometry = useCallback(
    (formation?: FormationFlightFormation) =>
      computeFormationFlightGeometry(
        aircraft,
        selectedDevices,
        aircraftPositions,
        formation ?? formationFlightFormation,
      ),
    // aircraft 为模块常量；选中集合/拖拽坐标/队形变化时才重建（传递给 memo 子组件）
    [selectedDevices, aircraftPositions, formationFlightFormation],
  )

  // 图层显隐（图层控制面板开关联动）：任务区域默认开（区域默认显示），设备标签默认开。
  // 「禁飞区」「巡检区域」旧静态演示图层已删除（由 TaskAreaLayer 真实数据区域
  // 统一承载），面板开关仍保留，仅记录状态、不再渲染任何地图元素。
  const deviceLabelsVisible = useLayerStore((s) => s.deviceLabelsVisible)
  const taskAreaVisible = useLayerStore((s) => s.taskAreaVisible)

  // hover 面板视口边缘平移修正（兜底）：测量实际矩形并注入 --clamp-x/--clamp-y，
  // 确保任何 hover 面板（飞机等）在任意拖拽位置都不溢出视口。
  // 依赖宿主百分比坐标与聚焦索引：拖拽改变坐标时实时重新修正；聚焦切换时面板增删亦重算。
  // WB-PF-003：坐标序列化为单个 key 字符串（useMemo 缓存），仅在坐标/显隐/聚焦
  // 变化时重新拼接，避免每渲染 N 次字符串分配 + 逐项比较；字符串按值比较语义不变。
  const clampDepsKey = useMemo(
    () =>
      [aircraftPositions.map((p) => `${p.x},${p.y}`).join(';'), focusedAircraft, deviceLabelsVisible].join(
        '|',
      ),
    [aircraftPositions, focusedAircraft, deviceLabelsVisible],
  )
  usePanelClamp({ deps: [clampDepsKey] })

  return (
    <main
      className={`design-viewport${tapReturnOpen && !tapReturnPoint ? ' tap-return-mode' : ''}${waypointFlightOpen ? ' waypoint-flight-mode' : ''}${waypointFlightOpen && waypointPickingActive && !waypointPoint ? ' waypoint-picking' : ''}${routeFlightOpen && routeFlightPicking ? ' route-flight-picking' : ''}${orbitFlightOpen && !orbitPoint ? ' orbit-flight-mode' : ''}${formationFlightOpen && !formationFlightPoint ? ' formation-flight-mode' : ''}`}
      aria-label="智能无人集群控制系统"
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

        <StatusHeader />

        <section className="map-stage">
          <MapToolbar />

          {/* 告警面板组（WB-PF-002 抽离）：常驻告警框 + 详情弹层，状态机见
              alarmPanelStore（activeAlarm/pendingAlarm/alarmCollapsing），
              展开/收起/中转切换交互详见 AlarmPanels.tsx */}
          <AlarmPanels />
          {/* 离线地图管理面板（导入 / 城市切换 / 包列表）暂隐藏——默认自动加载最新苏州包，
              需要手动管理时恢复下方注释即可（严格离线，仅读写本地 IndexedDB） */}

          {/* 严格离线：瓦片缓存命中即渲染；未命中灰显（绝不在线回源）。
              尚未导入地图包时渲染纯色占位底图。导入/切换入口由离线地图管理模块提供（P1+）。 */}
          {/* MissionPanel 暂时隐藏，待后续功能接入时恢复 */}
          {SHOW_PENDING_PANELS && <MissionPanel />}
          {/* 任务区域图层（真实后端数据）：多边形 + 名称标签，
              数据源 /api/v1/control/queryTaskAreaList（taskAreaStore 一次加载），
              显隐由图层控制面板「任务区域」开关联动（layerStore），默认开。
              areaSelectActive：任意绘制/框选遮罩激活时抑制图层自带的常态
              hover「编辑 | 删除」面板（避免与遮罩确认态面板叠加/干扰取点） */}
          {taskAreaVisible && <TaskAreaLayer adapter={adapter} areaSelectActive={areaSelectMode} />}
          {/* 橙色禁飞区：待接入功能（SHOW_PENDING_PANELS=false 暂隐藏，非开关图层） */}
          {SHOW_PENDING_PANELS && <div className="restricted-zone restricted-zone--orange" />}
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
                returnHomeOpen={returnHomeOpen}
                focusedAircraft={focusedAircraft}
                onHoverDevice={setHoveredDevice}
                onDragStart={onAircraftDragStart}
                onAircraftClick={handleAircraftClick}
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
          {/* DemoScenario：15 架无人机集群动作自动演示层（起飞/降落/区域降落/航点/
              编队/悬停/航线，60s 精确循环；地理锚定随地图移动，纯展示、
              pointer-events:none，不干扰交互） */}
          <DemoScenario adapter={adapter} />
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