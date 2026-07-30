import { homeImages } from '../../assets/images/home'
import './MapControls.css'

/** MapControls 组件属性 */
interface MapControlsProps {
  /** 百度地图实例，用于缩放控制 */
  map?: BMapGL.Map | null
}

export function MapControls({ map }: MapControlsProps) {
  return (
    <>
      <aside className="view-controls">
        <button type="button">2D</button>
        <button type="button">
          <img src={homeImages.iconLayer} alt="图层" />
        </button>
      </aside>
      <aside className="zoom-controls">
        <button type="button" onClick={() => map?.zoomIn()} disabled={!map}>
          <img src={homeImages.iconZoomIn} alt="放大" />
        </button>
        <button type="button" onClick={() => map?.zoomOut()} disabled={!map}>
          <img src={homeImages.iconZoomOut} alt="缩小" />
        </button>
      </aside>
    </>
  )
}
