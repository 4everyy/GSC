import { useState } from 'react'
import { StatusHeader } from '../../components/StatusHeader/StatusHeader'
import { MapToolbar } from '../../components/MapToolbar/MapToolbar'
import { MissionPanel } from '../../components/MissionPanel/MissionPanel'
import { AlarmInfoPanel } from '../../components/AlarmInfoPanel/AlarmInfoPanel'
import { MapControls } from '../../components/MapControls/MapControls'
import { ALARM_TYPES } from '../../config/alarms'
import { aircraft } from '../../config/aircraft'
import { homeImages } from '../../assets/images/home'
import './HomePage.css'

export function HomePage() {
  const [activeAlarm, setActiveAlarm] = useState<number | null>(null)

  const currentAlarmColor = activeAlarm !== null ? ALARM_TYPES[activeAlarm]?.color : undefined

  return (
    <main className="design-viewport" aria-label="无人机集群控制地面站">
      <div className="design-canvas">
        <StatusHeader activeAlarm={activeAlarm} onAlarmClick={setActiveAlarm} />
        <section className="map-stage">
          <MapToolbar />
          <MissionPanel />
          <AlarmInfoPanel alarmColor={currentAlarmColor} />
          <div className="restricted-zone restricted-zone--red">
            <img src={homeImages.restrictedZoneRed} alt="红色限制区域" />
          </div>
          <div className="restricted-zone restricted-zone--orange" />
          {aircraft.map((item) => (
            <span className={item.className} key={item.label}>
              <img src={item.src} alt={item.label} />
            </span>
          ))}
          <MapControls />
          <footer className="map-footer">
            <div className="emergency-actions">
              <button type="button">一键RTL</button>
              <button type="button">一键迫降</button>
              <button className="danger" type="button">
                急停
              </button>
            </div>
            <div className="scale">
              <span />
              200m
            </div>
          </footer>
        </section>
      </div>
    </main>
  )
}