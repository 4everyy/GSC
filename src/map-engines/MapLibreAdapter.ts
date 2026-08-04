/**
 * MapLibreAdapter —— MapLibre GL JS 适配器。
 *
 * 职责：
 * - 实现 MapAdapter 接口，封装 maplibregl.Map 的视图/覆盖物/事件 API；
 * - 把统一的 LngLat（WGS84）直接用于 MapLibre（MapLibre 原生即 WGS84，无需转换）。
 *
 * 实现要点：
 * - Marker：使用 maplibregl.Marker + 自定义 DOM 元素（HTMLelement）；
 *   拖拽由 Marker.setDraggable(true) + dragend 事件实现。
 * - Polyline：MapLibre 为"数据驱动"，每条折线对应一个 GeoJSON source + line layer；
 *   更新路径通过 source.setData(geojson) 实现。
 * - Circle：用 turf 风格的多边形近似（等角圆）绘制；为避免外部依赖，自实现圆形点生成。
 * - 销毁：removeOverlay 删除 source + 关联 layer；destroy 不 remove map（由容器组件负责）。
 */
import {
  Map as MLMap,
  Marker as MLMarker,
  type MarkerOptions as MLMarkerOptions,
  type MapMouseEvent as MLMapMouseEvent,
  type GeoJSONSource as MLGeoJSONSource,
} from 'maplibre-gl'
import type {
  CircleOptions,
  LngLat,
  MapAdapter,
  MarkerHandle,
  MarkerOptions,
  PolylineHandle,
  PolylineOptions,
} from './types'

/** 本地 GeoJSON 最小类型定义（避免依赖 @types/geojson） */
type GeoJSONPosition = number[]
type GeoJSONLineString = { type: 'LineString'; coordinates: GeoJSONPosition[] }
type GeoJSONPolygon = { type: 'Polygon'; coordinates: GeoJSONPosition[][] }
type GeoJSONGeometry = GeoJSONLineString | GeoJSONPolygon
type GeoJSONFeature = {
  type: 'Feature'
  geometry: GeoJSONGeometry
  properties: Record<string, unknown> | null
}
type GeoJSONFeatureCollection = {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
}

/** Marker 锚点位置字符串（MapLibre 的 Anchor 取值集合） */
type MLAnchorString =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

const EARTH_CIRCUMFERENCE = 40075016.686

/** 内部覆盖物记录 */
interface MapLibreOverlayEntry {
  kind: 'marker' | 'polyline' | 'circle'
  /** Marker 实例（marker 类型） */
  marker?: MLMarker
  /** source id（polyline/circle 类型） */
  sourceId?: string
  /** layer id 列表（polyline 可能有多层光晕） */
  layerIds?: string[]
}

/** 生成带前缀的唯一 id（用于 source/layer 命名） */
let uidCounter = 0
function nextId(prefix: string): string {
  uidCounter += 1
  return `${prefix}-${uidCounter}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 生成圆形多边形的 GeoJSON 坐标环（等角近似）。
 *
 * @param center 圆心 WGS84
 * @param radiusMeters 半径（米）
 * @param steps 采样点数，默认 64
 */
function circleCoordinates(center: LngLat, radiusMeters: number, steps = 64): number[][] {
  const coords: number[][] = []
  const latRad = (center.lat * Math.PI) / 180
  // 每米对应的度数近似
  const metersPerDegLat = EARTH_CIRCUMFERENCE / 360
  const metersPerDegLng = (EARTH_CIRCUMFERENCE / 360) * Math.cos(latRad)
  const radiusDegLat = radiusMeters / metersPerDegLat
  const radiusDegLng = radiusMeters / metersPerDegLng

  for (let i = 0; i <= steps; i++) {
    const angle = (2 * Math.PI * i) / steps
    const lng = center.lng + radiusDegLng * Math.cos(angle)
    const lat = center.lat + radiusDegLat * Math.sin(angle)
    coords.push([lng, lat])
  }
  return coords
}

/** 把像素锚点转换为 MapLibre 的 Anchor 选项（像素中心/九宫格） */
function pixelToAnchorString(anchor?: { x: number; y: number }): MLAnchorString | undefined {
  if (!anchor) return undefined
  // 以 1px 为容差判断对齐方向
  const cx = anchor.x
  const cy = anchor.y
  // 这里无法知道元素尺寸，故采用"中心近似"策略：
  // 若调用方传了像素锚点，一般意味着中心对齐，返回 'center'；
  // 极少数情况需精确像素偏移时，业务侧可直接传 element 并在 CSS 中用 margin 调整。
  void cx
  void cy
  return 'center'
}

/**
 * 封装 maplibregl.Map，实现引擎无关的 MapAdapter 接口。
 *
 * MapLibre 原生使用 WGS84 坐标，因此本适配器不做坐标系转换。
 */
export class MapLibreAdapter implements MapAdapter {
  readonly engine = 'maplibre' as const

  private map: MLMap
  private overlays = new Map<string, MapLibreOverlayEntry>()

  constructor(map: MLMap) {
    this.map = map
  }

  // ============ 视图控制 ============

  setCenter(lngLat: LngLat): void {
    this.map.setCenter([lngLat.lng, lngLat.lat])
  }

  getCenter(): LngLat {
    const c = this.map.getCenter()
    return { lng: c.lng, lat: c.lat }
  }

  setZoom(zoom: number): void {
    this.map.setZoom(zoom)
  }

  getZoom(): number {
    return this.map.getZoom()
  }

  zoomIn(): void {
    this.map.zoomIn()
  }

  zoomOut(): void {
    this.map.zoomOut()
  }

  panTo(lngLat: LngLat): void {
    this.map.panTo([lngLat.lng, lngLat.lat])
  }

  // ============ 坐标换算 ============

  getMetersPerPixel(): number {
    const center = this.map.getCenter()
    const zoom = this.map.getZoom()
    // 标准墨卡托每像素米数：地球周长 × cos(lat) / 2^(zoom+8)
    return (EARTH_CIRCUMFERENCE * Math.cos((center.lat * Math.PI) / 180)) / Math.pow(2, zoom + 8)
  }

  // ============ 覆盖物：标注 ============

  addMarker(id: string, lngLat: LngLat, opts?: MarkerOptions): MarkerHandle {
    const anchorStr = pixelToAnchorString(opts?.anchor)
    const options: MLMarkerOptions = {
      draggable: opts?.draggable ?? false,
      ...(opts?.element ? { element: opts.element } : {}),
      ...(anchorStr ? { anchor: anchorStr } : {}),
    }

    const marker = new MLMarker(options).setLngLat([lngLat.lng, lngLat.lat]).addTo(this.map)

    if (opts?.onDragEnd) {
      marker.on('dragend', () => {
        const ll = marker.getLngLat()
        opts.onDragEnd!({ lng: ll.lng, lat: ll.lat })
      })
    }
    if (opts?.onContextMenu) {
      marker.getElement().addEventListener('contextmenu', (e: Event) => {
        e.preventDefault()
        opts.onContextMenu!()
      })
    }
    if (opts?.onClick) {
      marker.getElement().addEventListener('click', (e: Event) => {
        e.stopPropagation()
        opts.onClick!()
      })
    }

    this.overlays.set(id, { kind: 'marker', marker })
    return { raw: marker, id, engine: 'maplibre' }
  }

  setMarkerPosition(handle: MarkerHandle, lngLat: LngLat): void {
    const marker = handle.raw as MLMarker
    marker.setLngLat([lngLat.lng, lngLat.lat])
  }

  setMarkerElement(handle: MarkerHandle, element: HTMLElement): void {
    // MapLibre Marker 更换 DOM 需要重建（无原生 replaceElement）。
    // 业务侧动画（无人机朝向）已直接操作 element.transform，故此方法多为占位。
    const marker = handle.raw as MLMarker
    const current = marker.getElement()
    if (current === element) return
    // 将新元素拷贝到旧容器内（保留 Marker 事件绑定）
    current.replaceChildren(...Array.from(element.childNodes))
  }

  removeMarker(id: string): void {
    this.removeOverlay(id)
  }

  // ============ 覆盖物：折线 ============

  addPolyline(id: string, points: LngLat[], opts?: PolylineOptions): PolylineHandle {
    const sourceId = nextId('src')
    const mainLayerId = nextId('layer')
    const layerIds = [mainLayerId]

    const coordinates = points.map((p) => [p.lng, p.lat] as [number, number])
    const geojson: GeoJSONFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates },
          properties: {},
        },
      ],
    }

    this.map.addSource(sourceId, { type: 'geojson', data: geojson })

    // 光晕层（可选）
    if (opts?.glow) {
      const glowLayerId = nextId('glow')
      this.map.addLayer({
        id: glowLayerId,
        type: 'line',
        source: sourceId,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': opts.glowColor ?? opts.color ?? '#3388ff',
          'line-width': (opts.width ?? 4) * (opts.glowWidth ?? 3),
          'line-opacity': (opts.opacity ?? 1) * 0.25,
          'line-blur': (opts.width ?? 4) * 1.2,
        },
      })
      layerIds.push(glowLayerId)
    }

    // 主线层
    this.map.addLayer({
      id: mainLayerId,
      type: 'line',
      source: sourceId,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': opts?.color ?? '#3388ff',
        'line-width': opts?.width ?? 4,
        'line-opacity': opts?.opacity ?? 1,
      },
    })

    this.overlays.set(id, { kind: 'polyline', sourceId, layerIds })
    return { raw: { sourceId, layerIds }, id, engine: 'maplibre' }
  }

  setPolylinePoints(handle: PolylineHandle, points: LngLat[]): void {
    const { sourceId } = handle.raw as { sourceId: string }
    const source = this.map.getSource(sourceId) as MLGeoJSONSource | undefined
    if (!source) return
    const coordinates = points.map((p) => [p.lng, p.lat] as [number, number])
    source.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates },
          properties: {},
        },
      ],
    })
  }

  removePolyline(id: string): void {
    this.removeOverlay(id)
  }

  // ============ 覆盖物：圆形 ============

  addCircle(id: string, center: LngLat, radiusMeters: number, opts?: CircleOptions): void {
    const sourceId = nextId('circle-src')
    const layerId = nextId('circle-layer')
    const ring = circleCoordinates(center, radiusMeters)

    this.map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [ring] },
            properties: {},
          },
        ],
      },
    })

    this.map.addLayer({
      id: layerId,
      type: 'fill',
      source: sourceId,
      layout: {},
      paint: {
        'fill-color': opts?.fillColor ?? '#1e90ff',
        'fill-opacity': opts?.fillOpacity ?? 0.12,
      },
    })

    // 边线（描边）
    const strokeLayerId = `${layerId}-stroke`
    this.map.addLayer({
      id: strokeLayerId,
      type: 'line',
      source: sourceId,
      layout: {},
      paint: {
        'line-color': opts?.strokeColor ?? '#1e90ff',
        'line-width': opts?.strokeWeight ?? 1,
        'line-opacity': opts?.strokeOpacity ?? 0.4,
      },
    })

    this.overlays.set(id, { kind: 'circle', sourceId, layerIds: [layerId, strokeLayerId] })
  }

  removeCircle(id: string): void {
    this.removeOverlay(id)
  }

  // ============ 通用覆盖物清理 ============

  removeOverlay(id: string): void {
    const entry = this.overlays.get(id)
    if (!entry) return

    if (entry.kind === 'marker' && entry.marker) {
      entry.marker.remove()
    } else {
      // polyline / circle：先删 layer，再删 source
      for (const layerId of entry.layerIds ?? []) {
        if (this.map.getLayer(layerId)) this.map.removeLayer(layerId)
      }
      if (entry.sourceId && this.map.getSource(entry.sourceId)) {
        this.map.removeSource(entry.sourceId)
      }
    }
    this.overlays.delete(id)
  }

  clearOverlays(): void {
    // 复制 key 列表避免遍历中修改
    Array.from(this.overlays.keys()).forEach((id) => this.removeOverlay(id))
  }

  // ============ 事件 ============

  onClick(handler: (lngLat: LngLat) => void): () => void {
    const fn = (e: MLMapMouseEvent) => {
      handler({ lng: e.lngLat.lng, lat: e.lngLat.lat })
    }
    this.map.on('click', fn)
    return () => this.map.off('click', fn)
  }

  onZoomEnd(handler: (zoom: number) => void): () => void {
    const fn = () => handler(this.map.getZoom())
    this.map.on('zoomend', fn)
    return () => this.map.off('zoomend', fn)
  }

  onMoveEnd(handler: (center: LngLat) => void): () => void {
    const fn = () => {
      const c = this.map.getCenter()
      handler({ lng: c.lng, lat: c.lat })
    }
    this.map.on('moveend', fn)
    return () => this.map.off('moveend', fn)
  }

  onContextMenu(handler: (lngLat: LngLat) => void): () => void {
    const fn = (e: MLMapMouseEvent) => {
      e.preventDefault()
      handler({ lng: e.lngLat.lng, lat: e.lngLat.lat })
    }
    this.map.on('contextmenu', fn)
    return () => this.map.off('contextmenu', fn)
  }

  // ============ 交互设置 ============

  setDefaultCursor(cursor: string): void {
    this.map.getCanvas().style.cursor = cursor
  }

  enableDoubleClickZoom(enabled: boolean): void {
    if (enabled) {
      this.map.doubleClickZoom.enable()
    } else {
      this.map.doubleClickZoom.disable()
    }
  }

  // ============ 生命周期 ============

  destroy(): void {
    this.clearOverlays()
    // 不在此 remove map（由 MapLibreContainer 的 useEffect cleanup 负责）
  }
}