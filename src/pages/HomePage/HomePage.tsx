import { useState } from 'react'
import { StatusHeader } from '../../components/StatusHeader/StatusHeader'
import { MapToolbar } from '../../components/MapToolbar/MapToolbar'
import { MissionPanel } from '../../components/MissionPanel/MissionPanel'
import { AlarmInfoPanel } from '../../components/AlarmInfoPanel/AlarmInfoPanel'
import { MapControls } from '../../components/MapControls/MapControls'
import { BMapContainer } from '../../components/BMapContainer/BMapContainer'
import { PlaceSearch } from '../../components/PlaceSearch/PlaceSearch'
import { MapScale } from '../../components/MapScale/MapScale'
import { ALARM_TYPES } from '../../config/alarms'
import { aircraft } from '../../config/aircraft'
import { homeImages } from '../../assets/images/home'
import './HomePage.css'

export function HomePage() {
  const [activeAlarm, setActiveAlarm] = useState<number | null>(null)
  // 百度地图实例，由 BMapContainer 的 onReady 回调注入，供 PlaceSearch 使用
  const [mapInstance, setMapInstance] = useState<BMapGL.Map | null>(null)

  const currentAlarmColor = activeAlarm !== null ? ALARM_TYPES[activeAlarm]?.color : undefined

  return (
    <main className="design-viewport" aria-label="无人机集群控制地面站">
      <div className="design-canvas">
        {/* 真实百度地图底图：铺满整个画布（含状态栏凹槽区域），其余 UI 通过 z-index 浮于其上 */}
        <BMapContainer className="map-base" onReady={setMapInstance} />
        <StatusHeader activeAlarm={activeAlarm} onAlarmClick={setActiveAlarm} />
        <section className="map-stage">
          <MapToolbar />
          {/* 地址搜索框：浮于地图右上方，输入地址精确定位 */}
          <div className="place-search-wrapper">
            <PlaceSearch map={mapInstance} />
          </div>
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