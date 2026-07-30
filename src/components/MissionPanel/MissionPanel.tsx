import { homeImages } from '../../assets/images/home'
import './MissionPanel.css'

interface MissionRoute {
  id: number
  color: string
  selected: boolean
}

const routes: MissionRoute[] = [
  { id: 1, color: '#8B9DAE', selected: false },
  { id: 2, color: '#8B9DAE', selected: false },
  { id: 3, color: '#8B9DAE', selected: false },
  { id: 4, color: '#8B9DAE', selected: false },
  { id: 5, color: '#4CAF50', selected: true },
  { id: 6, color: '#4CAF50', selected: true },
]

export function MissionPanel() {
  return (
    <section className="mission-panel" aria-label="编队任务">
      <div className="mission-routes">
        {routes.map((route) => (
          <div
            key={route.id}
            className={`mission-route ${route.selected ? 'mission-route--selected' : ''}`}
            style={{ borderColor: route.color }}
          >
            <span className="mission-route__dot" style={{ backgroundColor: route.color }}></span>
          </div>
        ))}
      </div>

      <div className="mission-aircraft-center">
        <img
          className="mission-aircraft-icon"
          src={homeImages.aircraftRed}
          alt="执行任务的飞行器"
        />
      </div>
    </section>
  )
}