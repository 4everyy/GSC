import { homeImages } from '../../assets/images/home'
import type { MapAdapter, MapEngineInstance } from '../../map-engines'
import { MAPLIBRE_BASEMAPS } from '../../config/mapLibre'
import type { MapBasemap } from '../../config/mapLibre'
import './MapControls.css'

/** MapControls 组件属性 */
interface MapControlsProps {
  /** 地图适配器，用于缩放控制（引擎无关） */
  adapter?: MapAdapter | null
  /** 当前引擎实例，用于判断是否 MapLibre 以显示底图切换 */
  engineInstance?: MapEngineInstance | null
  /** 当前底图模式（仅 MapLibre 生效） */
  basemap?: MapBasemap
  /** 切换底图回调 */
  onBasemapChange?: (basemap: MapBasemap) => void
}

export function MapControls({
  adapter,
  engineInstance,
  basemap = 'dark',
  onBasemapChange,
}: MapControlsProps) {
  const isMapLibre = engineInstance?.engine === 'maplibre'

  return (
    <>
      <aside className="view-controls">
        <button type="button">2D</button>
        {isMapLibre ? (
          <button
            type="button"
            className={basemap === 'satellite' ? 'active' : ''}
            title={
              basemap === 'satellite'
                ? `当前：${MAPLIBRE_BASEMAPS.satellite.label}，点击切回矢量`
                : `当前：${MAPLIBRE_BASEMAPS.dark.label}，点击切换卫星`
            }
            onClick={() =>
              onBasemapChange?.(basemap === 'satellite' ? 'dark' : 'satellite')
            }
          >
            <img src={homeImages.iconLayer} alt="图层" />
          </button>
        ) : (
          <button type="button">
            <img src={homeImages.iconLayer} alt="图层" />
          </button>
        )}
      </aside>
      <aside className="zoom-controls">
        <button type="button" onClick={() => adapter?.zoomIn()} disabled={!adapter}>
          <img src={homeImages.iconZoomIn} alt="放大" />
        </button>
        <button type="button" onClick={() => adapter?.zoomOut()} disabled={!adapter}>
          <img src={homeImages.iconZoomOut} alt="缩小" />
        </button>
      </aside>
    </>
  )
}