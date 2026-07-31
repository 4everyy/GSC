import { useCallback, useState } from 'react'
import { StatusHeader } from '../../components/StatusHeader/StatusHeader'
import { MapToolbar } from '../../components/MapToolbar/MapToolbar'
import { MissionPanel } from '../../components/MissionPanel/MissionPanel'
import { AlarmInfoPanel } from '../../components/AlarmInfoPanel/AlarmInfoPanel'
import { MapControls } from '../../components/MapControls/MapControls'
import { BMapContainer } from '../../components/BMapContainer/BMapContainer'
import { PlaceSearch } from '../../components/PlaceSearch/PlaceSearch'
import { MapScale } from '../../components/MapScale/MapScale'
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
  // 百度地图实例，由 BMapContainer 的 onReady 回调注入，供 PlaceSearch 使用
  const [mapInstance, setMapInstance] = useState<BMapGL.Map | null>(null)

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
        {/* 真实百度地图底图：铺满整个画布（含状态栏凹槽区域），其余 UI 通过 z-index 浮于其上 */}
        <BMapContainer
          className="map-base"
          onReady={setMapInstance}
          // 仅在未进入编辑模式时自动定位；用户开始编辑航线后不再定位，
          // 避免异步 panTo 把视野从用户新加的航点位置移走。
          autoLocate={!routeEditing}
        />
        <StatusHeader activeAlarm={activeAlarm} onAlarmClick={setActiveAlarm} />
        {/* 地址搜索框：作为画布直接子元素，定位在状态栏下方右侧（首页右上角），
            脱离 .map-stage 以避开状态栏背景凹槽的遮挡 */}
        <div className="place-search-wrapper">
          <PlaceSearch map={mapInstance} />
        </div>
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
              map={mapInstance}
              enabled={routeEditing}
              route={draftRoute}
              onMapClick={handleMapClick}
              onWaypointDrag={handleWaypointDrag}
              onWaypointRightClick={handleWaypointRightClick}
            />
          ) : (
            <RouteOverlay map={mapInstance} route={draftRoute} visible />
          )}
          {/* 航线规划：模拟飞行（非编辑模式下才显示无人机动画） */}
          {!routeEditing && (
            <DroneSimulator map={mapInstance} route={draftRoute} running={simulating} />
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
          <MapControls map={mapInstance} />
          <footer className="map-footer">
            <div className="emergency-actions">
              <button type="button">一键RTL</button>
              <button type="button">一键迫降</button>
              <button className="danger" type="button">
                急停
              </button>
            </div>
            <MapScale map={mapInstance} />
          </footer>
        </section>
      </div>
    </main>
  )
}