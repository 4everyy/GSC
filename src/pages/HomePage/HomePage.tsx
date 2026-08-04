/**
 * HomePage —— 地面站主页面。
 *
 * 引擎切换设计：
 * - 使用 useMapEngine hook 管理当前引擎类型与适配器实例；
 * - 根据 engineType 条件渲染 BMapContainer 或 MapLibreContainer；
 * - 所有业务组件（航线、模拟飞行、控件、比例尺）统一接收 adapter（引擎无关）；
 * - PlaceSearch 是百度专有功能，仅在百度引擎下渲染，使用 raw BMapGL.Map。
 *
 * 解耦要点：
 * - HomePage 不直接 import 适配器实现类，仅通过 MapEngineInstance.adapter 操作地图；
 * - 切换引擎时 useMapEngine 自动销毁旧实例，业务组件通过 useEffect 依赖 adapter 变化自动重建覆盖物。
 */
import { useCallback, useState } from 'react'
import {
  MAPLIBRE_BASEMAPS,
  MAPLIBRE_DEFAULT_BASEMAP,
  type MapBasemap,
} from '../../config/mapLibre'
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
import {
  DroneSimulator,
  RouteEditor,
  RouteOverlay,
  RoutePanel,
  useRouteEditor,
} from '../../features/routePlanning'
import { ALARM_TYPES } from '../../config/alarms'
import { aircraft } from '../../config/aircraft'
import { homeImages } from '../../assets/images/home'
import './HomePage.css'

export function HomePage() {
  const [activeAlarm, setActiveAlarm] = useState<number | null>(null)

  // MapLibre 底图模式（矢量暗色 / 卫星影像）。切换时通过 key 重建容器，
  // 自动复用引擎切换机制：adapter 变化 → 业务覆盖物自动重建。
  const [basemap, setBasemap] = useState<MapBasemap>(MAPLIBRE_DEFAULT_BASEMAP)

  // 地图引擎管理：engineType 决定渲染哪个 Container，adapter 供业务组件使用
  const {
    engineType,
    adapter,
    engineInstance,
    switchEngine,
    onEngineReady,
  } = useMapEngine('baidu')

  // PlaceSearch 需要百度原始地图实例（百度专有 POI 搜索 API）
  const bmapRawInstance =
    engineType === 'baidu' && engineInstance?.engine === 'baidu'
      ? (engineInstance.raw as BMapGL.Map)
      : null

  const currentAlarmColor = activeAlarm !== null ? ALARM_TYPES[activeAlarm]?.color : undefined

  // 航线规划：编辑模式 + 草稿航线状态
  const [routeEditing, setRouteEditing] = useState(false)
  // 模拟飞行：是否正在运行（true=飞行中，false=暂停/未开始）
  const [simulating, setSimulating] = useState(false)
  // 解构出稳定引用（useRouteEditor 内部已用 useCallback 固定），避免下游
  // useCallback 因 editor 对象每次新建而反复失效，导致 RouteEditor 重复注册事件
  const {
    route: draftRoute,
    stats: draftStats,
    addWaypoint,
    updateWaypoint,
    removeWaypoint,
    moveWaypoint,
    clear: clearRoute,
  } = useRouteEditor()

  // 编辑模式下点击地图空白处 → 追加航点
  const handleMapClick = useCallback(
    (lng: number, lat: number) => {
      addWaypoint(lng, lat)
    },
    [addWaypoint],
  )
  // 拖拽航点结束 → 更新坐标
  const handleWaypointDrag = useCallback(
    (id: string, lng: number, lat: number) => {
      updateWaypoint(id, { lng, lat })
    },
    [updateWaypoint],
  )
  // 右键航点 → 删除
  const handleWaypointRightClick = useCallback(
    (id: string) => {
      removeWaypoint(id)
    },
    [removeWaypoint],
  )

  // 模拟飞行：切换开始/暂停
  const handleToggleSimulate = useCallback(() => {
    setSimulating((v) => !v)
  }, [])

  return (
    <main className="design-viewport" aria-label="无人机集群控制地面站">
      <div className="design-canvas">
        {/* 地图底图：根据 engineType 条件渲染百度或 MapLibre 容器 */}
        {engineType === 'baidu' ? (
          <BMapContainer
            className="map-base"
            onReady={onEngineReady}
            autoLocate={!routeEditing}
          />
        ) : (
          <MapLibreContainer
            key={basemap}
            className="map-base"
            styleUrl={MAPLIBRE_BASEMAPS[basemap].url}
            onReady={onEngineReady}
            autoLocate={!routeEditing}
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
          {/* 限制区与飞行器图标暂时隐藏，待后续接入真实数据时恢复 */}
          {false && (
            <div className="restricted-zone restricted-zone--red">
              <img src={homeImages.restrictedZoneRed} alt="红色限制区域" />
            </div>
          )}
          {false && <div className="restricted-zone restricted-zone--orange" />}
          {false &&
            aircraft.map((item) => (
              <span className={item.className} key={item.label}>
                <img src={item.src} alt={item.label} />
              </span>
            ))}

          {/* 航线规划：编辑模式下用 RouteEditor 交互；非编辑用 RouteOverlay 只读渲染 */}
          {routeEditing ? (
            <RouteEditor
              adapter={adapter}
              enabled={routeEditing}
              route={draftRoute}
              onMapClick={handleMapClick}
              onWaypointDrag={handleWaypointDrag}
              onWaypointRightClick={handleWaypointRightClick}
            />
          ) : (
            <RouteOverlay adapter={adapter} route={draftRoute} visible />
          )}

          {/* 航线规划：模拟飞行（非编辑模式下才显示无人机动画） */}
          {!routeEditing && (
            <DroneSimulator adapter={adapter} route={draftRoute} running={simulating} />
          )}

          {/* 航线规划面板：统计 + 航点列表 + 操作 */}
          <RoutePanel
            editing={routeEditing}
            onToggleEditing={() => setRouteEditing((v) => !v)}
            waypoints={draftRoute.waypoints}
            stats={draftStats}
            routeName={draftRoute.name}
            onMove={moveWaypoint}
            onRemove={removeWaypoint}
            onClear={clearRoute}
            simulating={simulating}
            canSimulate={draftRoute.waypoints.length >= 2 && !routeEditing}
            onToggleSimulate={handleToggleSimulate}
          />

          <MapControls
            adapter={adapter}
            engineInstance={engineInstance}
            basemap={basemap}
            onBasemapChange={setBasemap}
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