import { HomePage } from './pages/HomePage/HomePage'
import { OfflineMapProvider } from './features/offline-map/useOfflineMap'
import { MapDisplayProvider } from './features/map-display/useMapDisplay'

function App() {
  return (
    <MapDisplayProvider>
      <OfflineMapProvider>
        <HomePage />
      </OfflineMapProvider>
    </MapDisplayProvider>
  )
}

export default App