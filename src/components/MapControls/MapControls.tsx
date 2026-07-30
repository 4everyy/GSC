import { homeImages } from '../../assets/images/home'
import './MapControls.css'

export function MapControls() {
  return (
    <>
      <aside className="view-controls">
        <button type="button">2D</button>
        <button type="button">
          <img src={homeImages.iconLayer} alt="图层" />
        </button>
      </aside>
      <aside className="zoom-controls">
        <button type="button">
          <img src={homeImages.iconZoomIn} alt="放大" />
        </button>
        <button type="button">
          <img src={homeImages.iconZoomOut} alt="缩小" />
        </button>
      </aside>
    </>
  )
}