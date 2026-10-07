/**
 * @file HomePage.tsx
 * @description HomePage —— 地面站主页面（编排层）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { useCallback, useState, useEffect, useMemo, useRef } from 'react'
import { Alert } from 'antd'
import {
  StatusHeader,
  MapToolbar,
  MapControls,
  MapScale,
} from '../../components/MapChrome/MapChrome'
import {
  MissionPanel,
  type FormationFlightFormation,
} from '../../components/FlightActionPanels/FlightActionPanels'
import {
  MapLoadProgress,
  MapLibreContainer,
} from '../../components/MapLibreContainer/MapLibreContainer'
import { AlarmPanels } from '../../components/home/alarm/AlarmPanels'
import { useMapEngine, useMapAnchorSync, usePanelClamp } from '../../hooks/index'
import { aircraft } from '../../config/index'
import { AircraftFocusPanel } from '../../components/AircraftFocusPanel/AircraftFocusPanel'
import {
  useLayerStore,
  useDeviceLinkStore,
  useTaskAreaStore,
  usePlaneStatusStore,
  useFlightAnimStore,
} from '../../stores/index'
import { useOfflineMap } from '../../features/offline-map/index'
import { type AircraftListItem } from '../../components/AircraftListPanel/AircraftListPanel'
import { FlightCommandPanels } from '../../components/home/panels/FlightCommandPanels'
import { WaypointFlightPanels } from '../../components/home/panels/WaypointFlightPanels'
import './HomePage.css'
import { TaskAreaLayer } from '../../components/home/zones/TaskAreaLayer'
import { InspectionRouteLayer } from '../../components/home/zones/InspectionRouteLayer'
import { ReconFlightOverlay } from '../../components/home/overlays/ReconFlightOverlay'
import AircraftLayer from '../../components/home/aircraft/AircraftLayer'
import { TargetMarkerLayer } from '../../components/home/targets/TargetMarkerLayer'
import { FlightMissionPanels } from '../../components/home/panels/FlightMissionPanels'
import { useFlightInteractions } from '../../hooks/useFlightInteractions'
import { useExclusivePanels } from '../../hooks/useExclusivePanels'
import { useFlightAnimations } from '../../hooks/useFlightAnimations'
import {
  SHOW_PENDING_PANELS,
  AIRCRAFT_INITIAL_POSITIONS,
  getAreaLandingSpots,
  getRallyPointSpots,
  computeFormationFlightGeometry,
} from '../../lib/formationLayout'
import { FlightOverlays } from '../../components/home/overlays/FlightOverlays'
import { AreaSelectOverlay } from '../../components/home/overlays/AreaSelectOverlay'
import { BottomBar } from '../../components/home/bottom-bar/BottomBar'
import { useMapFocusRequests } from './useMapFocusRequests'
import { useAircraftSeedAnchors, useTargetLngLatKey, useTargetSeedAnchors } from './useSeedAnchors'


export function HomePage() {
  // activeAlarm/pendingAlarm/alarmCollapsing 及双定时器全部…

  // 聚焦视图：双击无人机图标后显示设备详情面板（存储聚焦的飞机索引）
  const [focusedAircraft, setFocusedAircraft] = useState<number | null>(null)

  // 功能面板状态机（自 useExclusivePanels 拆出）：持有 11 个功能面板的全部状态
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
    setAreaLandingConfirmed,
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
    rallyPointRectGeo,
    setRallyPointRectGeo,
    setRallyPointRouteGenerated,
    rallyPointFormation,
    formationFlightPoint,
    formationFlightFormation,
    panelOpenState,
    panelHandlers,
  } = panels

  const animations = useFlightAnimations()
  const { stopRallyPointFlights, stopWaypointFlight } = animations

  // 应急指令（一键RTL/一键迫降/急停）与航点跟飞互斥：点击即中断航点飞行动效状态机（climbing/following → idle）
  const handleEmergencyInterrupt = useCallback(() => {
    stopWaypointFlight()
  }, [stopWaypointFlight])

  // 区域列表「添加区域」跨层级信号：AreaListPanel 挂载于 MapToolbar 内（与本组件平级，无法经 props 传递）
  const openAreaListSelect = panels.openAreaListSelect
  const addAreaRequests = useTaskAreaStore((s) => s.addAreaRequests)
  const addAreaRequestsRef = useRef(addAreaRequests)
  useEffect(() => {
    if (addAreaRequests === addAreaRequestsRef.current) return
    addAreaRequestsRef.current = addAreaRequests
    openAreaListSelect()
  }, [addAreaRequests, openAreaListSelect])

  // 同样经 taskAreaStore（面板与 HomePage平级无法经 props 传递）——监听 ed…
  const editAreaRequest = useTaskAreaStore((s) => s.editAreaRequest)
  const editAreaRequestRef = useRef(editAreaRequest)
  useEffect(() => {
    if (editAreaRequest === editAreaRequestRef.current) return
    editAreaRequestRef.current = editAreaRequest
    if (editAreaRequest) openAreaListSelect()
  }, [editAreaRequest, openAreaListSelect])

  // 8 套 rAF 循环动画的…
  const handleAircraftDoubleClick = useCallback((index: number) => {
    // 双击同一架飞机时切换关闭，双击不同飞机时切换目标
    setFocusedAircraft((prev) => (prev === index ? null : index))
  }, [])
  const handleCloseFocusPanel = useCallback(() => setFocusedAircraft(null), [])

  // 地图引擎实例：MapLibreContainer 初始化后通过 onEngineReady 注入，adapter 供业务组件（控件
  const { adapter, engineInstance, onEngineReady } = useMapEngine()

  // 地图取点监听 + 面板关闭/航线失效编排（自 useFlightInteractions 拆出）
  const { handleDeleteRoutePoint } = useFlightInteractions(panels, animations, adapter)
  // 离线地图：gcs-pkg:// 协议经 HTTP Range 按需直读 public/maps/suzhou.mbtiles（无导入
  const { activeStyle, activePackage, status: offlineStatus, error: offlineError } = useOfflineMap()

  // 设备联动：hover/选中状态与设备管理面板双向同步（全局 store 承载
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
  // Aircraft row delete: deselect the device (id = device index string).
  const handleRemoveAircraft = useCallback(
    (id: string) => {
      toggleDevice(Number(id))
    },
    [toggleDevice],
  )

  // 区域降落降落坪排列：算法迁至 formationLayout.getAreaLandingSpots（队形/选区/选中飞机数变化时联动重排）
  const areaLandingSpots = useMemo(
    () => getAreaLandingSpots(areaLandingRect, areaLandingFormation, selectedAircraft.length),
    [areaLandingRect, areaLandingFormation, selectedAircraft.length],
  )

  // 集结点集结坪布局（与区域降落同款交互）：按集结队形在已确认集结区域内布置「数量=选中飞机数」的集结坪
  const rallyPointSpots = useMemo<{ x: number; y: number }[]>(
    () => getRallyPointSpots(rallyPointRect, rallyPointFormation, selectedAircraft.length),
    [rallyPointRect, rallyPointFormation, selectedAircraft.length],
  )

  // 集结模拟飞行全部落地定格…
  const rallyPointLandedAll = useFlightAnimStore(
    (s) => s.rallyPointFlights.length > 0 && s.rallyPointFlights.every((f) => f.landed === true),
  )

  // 集结区域地理锚定：框选确认时记录的选区四角经纬度（rallyPointRectGeo，由AreaSelectOverlay 确认回调换算
  useEffect(() => {
    if (!adapter || !rallyPointRectGeo || rallyPointRectGeo.length !== 4) return
    const update = () => {
      const b = adapter.getContainer().getBoundingClientRect()
      const pts = rallyPointRectGeo.map((g) => {
        const p = adapter.project({ lng: g.lng, lat: g.lat })
        return { x: b.left + p.x, y: b.top + p.y }
      })
      const xs = pts.map((p) => p.x)
      const ys = pts.map((p) => p.y)
      const left = Math.min(...xs)
      const top = Math.min(...ys)
      setRallyPointRect({
        left,
        top,
        width: Math.max(...xs) - left,
        height: Math.max(...ys) - top,
      })
    }
    return adapter.onMove(update)
  }, [adapter, rallyPointRectGeo, setRallyPointRect])

  // 飞机图标拖拽 + 地理锚定：手动拖动图标+名称至首页任意位置
  const planeLngLatKey = usePlaneStatusStore((s) =>
    aircraft
      .map((a) => {
        const raw = s.rawPlanes[a.deviceIndex]
        return raw && typeof raw.latitude === 'number' && typeof raw.longitude === 'number'
          ? `${a.deviceIndex}@${raw.latitude.toFixed(7)},${raw.longitude.toFixed(7)}`
          : ''
      })
      .join('|'),
  )
  // 首次定位：引擎/离线包就绪后平滑飞到初始视口——优先 queryPlaneStatus 真实机群簇中心（离线包 bounds 内坐标的均值）…
  const initialFlightDoneRef = useRef(false)
  useEffect(() => {
    if (!adapter || !activePackage || initialFlightDoneRef.current) return
    const [west, south, east, north] = activePackage.bounds
    const pts = usePlaneStatusStore
      .getState()
      .rawPlanes.map((p) => {
        if (!p || typeof p.longitude !== 'number' || typeof p.latitude !== 'number') return null
        const inPkg =
          p.longitude >= west && p.longitude <= east && p.latitude >= south && p.latitude <= north
        return inPkg ? { lng: p.longitude, lat: p.latitude } : null
      })
      .filter((q): q is { lng: number; lat: number } => q !== null)
    if (pts.length === 0) {
      adapter.flyTo(activePackage.center, { zoom: 14, duration: 1500 })
      return
    }
    adapter.flyTo(
      {
        lng: pts.reduce((s, q) => s + q.lng, 0) / pts.length,
        lat: pts.reduce((s, q) => s + q.lat, 0) / pts.length,
      },
      { zoom: 14, duration: 1500 },
    )
    initialFlightDoneRef.current = true
  }, [adapter, activePackage, planeLngLatKey])
  // 飞机种子锚点（自 useSeedAnchors 拆出）：真实坐标 bounds 校验 + v2 持久化 + 偏移网格回退
  const aircraftSeedAnchors = useAircraftSeedAnchors(activePackage, planeLngLatKey)
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

  // 面板行聚焦飞转（设备/目标/区域三类信号消费，自 useMapFocusRequests 拆出）
  useMapFocusRequests(adapter, getAircraftAnchor)

  // 目标真实经纬度签名 + 种子锚点（自 useSeedAnchors 拆出）
  const targetLngLatKey = useTargetLngLatKey()
  const targetSeedAnchors = useTargetSeedAnchors(activePackage, targetLngLatKey)

  // 编队飞行航线几何（视口坐标）：以最左选中飞机图标正上方（水平对齐其中心、上移360px 且不越过视口上缘）为锚点
  const getFormationFlightGeometry = useCallback(
    (formation?: FormationFlightFormation) => {
      // 集结落坪续飞：集结任务全部落地定格（every landed）时
      const rallyFlights = useFlightAnimStore.getState().rallyPointFlights
      const landedOrigins =
        rallyFlights.length > 0 && rallyFlights.every((f) => f.landed === true)
          ? rallyFlights.map((f) => ({ x: f.x, y: f.y }))
          : undefined
      return computeFormationFlightGeometry(
        aircraft,
        selectedDevices,
        aircraftPositions,
        formation ?? formationFlightFormation,
        // 机身切图按接口状态动态取色（与 AircraftLayer 地面图标同口径），调用时经getState 一次性快照读取（不引入订阅重渲染）
        usePlaneStatusStore.getState().devices,
        landedOrigins,
      )
    },
    // aircraft 为模块常量；选中集合/拖拽坐标/队形变化时才重建（传递给 memo 子组件）
    [selectedDevices, aircraftPositions, formationFlightFormation],
  )

  // 图层显隐（图层控制面板开关联动）：任务区域默认开（区域默认显示），设备标签默认开。
  const deviceLabelsVisible = useLayerStore((s) => s.deviceLabelsVisible)
  const taskAreaVisible = useLayerStore((s) => s.taskAreaVisible)

  // hover 面板视口边缘平移修正（兜底）：测量实际矩形并注入 --clamp-x/--clamp-y
  const clampDepsKey = useMemo(
    () =>
      [
        aircraftPositions.map((p) => `${p.x},${p.y}`).join(';'),
        focusedAircraft,
        deviceLabelsVisible,
      ].join('|'),
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
          locateBounds={activePackage?.bounds ?? null}
        />

        <StatusHeader />


        <section className="map-stage">
          {offlineStatus === 'error' && (
            <Alert
              type="error"
              showIcon
              message="离线地图加载失败"
              description={offlineError ?? '未知错误'}
              style={{
                position: 'absolute',
                top: 76,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 30,
                maxWidth: 480,
              }}
            />
          )}
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
          {/* 区域巡检预设航线：一键创建成功返回的 plane_line 连线（4px， */}
          {/* inspectionRouteStore 驱动，随 adapter 就绪挂载 */}
          <InspectionRouteLayer adapter={adapter} />
          {/* 巡检任务飞行动效：一键创建成功后执行飞机自当前位置爬升→转场至航线起点→
              40m/s 沿线循环巡航（reconFlights 快照驱动 DroneFlightIcon + 高度标注） */}
          <ReconFlightOverlay adapter={adapter} />
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
          <FlightCommandPanels
            panels={panels}
            anims={animations}
            aircraft={aircraft}
            selectedAircraft={selectedAircraft}
            handleRemoveAircraft={handleRemoveAircraft}
            selectedDevices={selectedDevices}
            aircraftPositions={aircraftPositions}
          />
          <WaypointFlightPanels
            panels={panels}
            anims={animations}
            aircraft={aircraft}
            selectedDevices={selectedDevices}
            areaLandingSpots={areaLandingSpots}
            aircraftPositions={aircraftPositions}
            adapter={adapter}
          />
          <FlightMissionPanels
            panels={panels}
            anims={animations}
            adapter={adapter}
            aircraft={aircraft}
            selectedDevices={selectedDevices}
            aircraftPositions={aircraftPositions}
            rallyPointSpots={rallyPointSpots}
            getFormationFlightGeometry={getFormationFlightGeometry}
            selectedAircraft={selectedAircraft}
            handleRemoveAircraft={handleRemoveAircraft}
          />
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
            setAreaLandingConfirmed={setAreaLandingConfirmed}
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
            setRallyPointRectGeo={setRallyPointRectGeo}
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
            // 编队飞行按钮解锁标记：集结任务全部落坪定格后才取消置灰（BottomBar 内与选中数量条件叠加判定），编队自集结落坪位置续飞
            formationFlightUnlocked={rallyPointLandedAll}
          />

          <footer className="map-footer">
            <div className="emergency-actions">
              <button type="button" onClick={handleEmergencyInterrupt}>
                一键RTL
              </button>
              <button type="button" onClick={handleEmergencyInterrupt}>
                一键迫降
              </button>
              <button className="danger" type="button" onClick={handleEmergencyInterrupt}>
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
