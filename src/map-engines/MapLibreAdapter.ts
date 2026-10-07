/**
 * @file MapLibreAdapter.ts
 * @description MapLibreAdapter —— MapLibre GL JS 适配器（视图控制/覆盖物/事件编排；工具见 maplibre-utils，交互与重放见 maplibre-overlay-ops）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { Map as MLMap, Marker as MLMarker, LngLatBounds as MLLngLatBounds, type MarkerOptions as MLMarkerOptions, type MapMouseEvent as MLMapMouseEvent, type GeoJSONSource as MLGeoJSONSource, type StyleSpecification as MLStyleSpecification } from 'maplibre-gl'
import { type CircleOptions, type FitBoundsOptions, type LngLat, type LngLatBounds, type MapAdapter, type MapStyleSpec, type MarkerHandle, type MarkerOptions, type PolylineHandle, type PolylineHighlightOptions, type PolylineInteractionOptions, type PolylineOptions, type PolygonOptions } from './types'
import { EARTH_CIRCUMFERENCE, ICON_PIXEL_RATIO, circleCoordinates, nextId, pickAnchorString, rasterizeIcon, type GeoJSONFeatureCollection, type MapLibreOverlayEntry, type MLAnchorString } from './maplibre-utils'
import { applyPolylineHighlight, attachPolylineInteraction, replayOverlaysAfterStyleChange } from './maplibre-overlay-ops'

/** 封装 maplibregl.Map，实现引擎无关的 MapAdapter 接口。 */
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

  flyTo(lngLat: LngLat, options?: { zoom?: number; duration?: number }): void {
    this.map.flyTo({
      center: [lngLat.lng, lngLat.lat],
      ...(options?.zoom !== undefined ? { zoom: options.zoom } : {}),
      ...(options?.duration !== undefined ? { duration: options.duration } : {}),
    })
  }

  fitBounds(bounds: LngLatBounds, options?: FitBoundsOptions): void {
    // 原生 fitBounds 按 512px 世界精确换算中心/缩放（MapLibre z0 世界 512px
    const mlBounds = new MLLngLatBounds([bounds.west, bounds.south], [bounds.east, bounds.north])
    this.map.fitBounds(mlBounds, {
      ...(options?.padding
        ? {
            // MapLibre PaddingOptions 各字段必填：未指定的边按 0（无边距）补齐
            padding: {
              top: options.padding.top ?? 0,
              bottom: options.padding.bottom ?? 0,
              left: options.padding.left ?? 0,
              right: options.padding.right ?? 0,
            },
          }
        : {}),
      ...(options?.maxZoom !== undefined ? { maxZoom: options.maxZoom } : {}),
      ...(options?.duration !== undefined ? { duration: options.duration } : {}),
    })
  }

  // ============ 坐标换算 ============

  getMetersPerPixel(): number {
    const center = this.map.getCenter()
    const zoom = this.map.getZoom()
    // 标准墨卡托每像素米数：地球周长 × cos(lat) / 2^(zoom+8)
    return (EARTH_CIRCUMFERENCE * Math.cos((center.lat * Math.PI) / 180)) / Math.pow(2, zoom + 8)
  }

  getContainer(): HTMLElement {
    return this.map.getContainer()
  }

  unproject(point: { x: number; y: number }): LngLat {
    const ll = this.map.unproject([point.x, point.y])
    return { lng: ll.lng, lat: ll.lat }
  }

  project(lngLat: LngLat): { x: number; y: number } {
    const pt = this.map.project([lngLat.lng, lngLat.lat])
    return { x: pt.x, y: pt.y }
  }

  // ============ 覆盖物：标注 ============

  addMarker(id: string, lngLat: LngLat, opts?: MarkerOptions): MarkerHandle {
    // 选择最匹配的 MapLibre 九宫格锚点：- 提供自定义元素 + 像素锚点：测量元素尺寸后推断（图钉底部中心 → 'bottom'）- 仅提供像素锚点：无法测量尺寸
    let resolvedAnchor: MLAnchorString | undefined
    if (opts?.anchor && opts?.element) {
      const w = opts.element.offsetWidth
      const h = opts.element.offsetHeight
      resolvedAnchor = w > 0 && h > 0 ? pickAnchorString(opts.anchor, w, h) : 'center'
    } else if (opts?.anchor) {
      resolvedAnchor = 'center'
    }

    const options: MLMarkerOptions = {
      draggable: opts?.draggable ?? false,
      ...(opts?.element ? { element: opts.element } : {}),
      ...(resolvedAnchor ? { anchor: resolvedAnchor } : {}),
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
        // 虚线（测距橡皮筋预览）：与 line-cap:round 组合时首尾端点仍为圆头
        ...(opts?.dash ? { 'line-dasharray': [2, 2] } : {}),
      },
    })

    const entry: MapLibreOverlayEntry = {
      kind: 'polyline',
      sourceId,
      layerIds,
      recreate: () => this.addPolyline(id, points, opts),
    }
    this.overlays.set(id, entry)

    // 沿线方向箭头（可选，异步）：symbol-placement:'line' 使箭头沿折线逐段自动旋转（图标 x 轴对齐切线 → 指向点序行进方向）
    if (opts?.arrows) {
      const { iconUrl, iconSize = 24, spacing = 100, pulse = false, pulsePeriod = 1400 } = opts.arrows
      const arrowLayerId = nextId('arrow')
      const imageId = `polyline-arrow-${iconSize}`
      rasterizeIcon(iconUrl, iconSize, ICON_PIXEL_RATIO)
        .then((icon) => {
          if (this.overlays.get(id) !== entry || !this.map.getSource(sourceId)) return
          if (!this.map.hasImage(imageId)) {
            this.map.addImage(imageId, icon, { pixelRatio: ICON_PIXEL_RATIO })
          }
          this.map.addLayer({
            id: arrowLayerId,
            type: 'symbol',
            source: sourceId,
            layout: {
              'symbol-placement': 'line',
              'symbol-spacing': spacing,
              'icon-image': imageId,
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            },
            paint: { 'icon-opacity': opts.opacity ?? 1 },
          })
          layerIds.push(arrowLayerId)
          // 箭头闪光呼吸动画（可选）：rAF 按正弦脉动 icon-opacity（0.45~1 × 基准不透明度）与 icon-size（1~1.15 轻微放大）
          if (pulse) {
            const baseOpacity = opts.opacity ?? 1
            const startTime = performance.now()
            const tick = () => {
              if (this.overlays.get(id) !== entry || !this.map.getLayer(arrowLayerId)) return
              const wave =
                (Math.sin(((performance.now() - startTime) / pulsePeriod) * Math.PI * 2) + 1) / 2
              this.map.setPaintProperty(
                arrowLayerId,
                'icon-opacity',
                (0.45 + 0.55 * wave) * baseOpacity,
              )
              this.map.setLayoutProperty(arrowLayerId, 'icon-size', 1 + 0.15 * wave)
              requestAnimationFrame(tick)
            }
            requestAnimationFrame(tick)
          }
        })
        .catch((err: unknown) => {
          console.warn('[MapLibreAdapter] 沿线箭头贴图加载失败，跳过箭头层：', err)
        })
    }

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

  setPolylineInteractive(id: string, opts: PolylineInteractionOptions): () => void {
    return attachPolylineInteraction(this.map, this.overlays, id, opts)
  }

  setPolylineHighlight(
    id: string,
    highlighted: boolean,
    opts?: PolylineHighlightOptions,
  ): void {
    applyPolylineHighlight(this.map, this.overlays, id, highlighted, opts)
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

    this.overlays.set(id, {
      kind: 'circle',
      sourceId,
      layerIds: [layerId, strokeLayerId],
      recreate: () => this.addCircle(id, center, radiusMeters, opts),
    })
  }

  removeCircle(id: string): void {
    this.removeOverlay(id)
  }

  // ============ 覆盖物：多边形 ============

  addPolygon(id: string, vertices: LngLat[], opts?: PolygonOptions): void {
    if (vertices.length < 3) return
    // GeoJSON Polygon 首尾坐标需闭合
    const ring = vertices.map((v) => [v.lng, v.lat])
    ring.push([ring[0][0], ring[0][1]])

    const sourceId = nextId('polygon-src')
    const fillLayerId = nextId('polygon-fill')

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
      id: fillLayerId,
      type: 'fill',
      source: sourceId,
      layout: {},
      paint: {
        'fill-color': opts?.fillColor ?? '#40a9ff',
        'fill-opacity': opts?.fillOpacity ?? 0.12,
      },
    })

    const strokeLayerId = `${fillLayerId}-stroke`
    this.map.addLayer({
      id: strokeLayerId,
      type: 'line',
      source: sourceId,
      layout: {},
      paint: {
        'line-color': opts?.strokeColor ?? opts?.fillColor ?? '#40a9ff',
        'line-width': opts?.strokeWeight ?? 1.5,
        'line-opacity': opts?.strokeOpacity ?? 0.9,
      },
    })

    this.overlays.set(id, {
      kind: 'polygon',
      sourceId,
      layerIds: [fillLayerId, strokeLayerId],
      recreate: () => this.addPolygon(id, vertices, opts),
    })
  }

  removePolygon(id: string): void {
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

  onMove(handler: () => void): () => void {
    this.map.on('move', handler)
    return () => this.map.off('move', handler)
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

  onMouseMove(handler: (lngLat: LngLat) => void): () => void {
    const fn = (e: MLMapMouseEvent) => {
      handler({ lng: e.lngLat.lng, lat: e.lngLat.lat })
    }
    this.map.on('mousemove', fn)
    return () => this.map.off('mousemove', fn)
  }

  // ============ 交互设置 ============

  setDefaultCursor(cursor: string): void {
    // 空串表示恢复默认光标（测距模式退出等），MapLibre canvas 默认为空串
    this.map.getCanvas().style.cursor = cursor
  }

  enableDoubleClickZoom(enabled: boolean): void {
    if (enabled) {
      this.map.doubleClickZoom.enable()
    } else {
      this.map.doubleClickZoom.disable()
    }
  }

  // ============ 底图样式（运行时热切换） ============

  setStyle(style: MapStyleSpec): void {
    this.map.setStyle(style as MLStyleSpecification)
    replayOverlaysAfterStyleChange(this.map, this.overlays)
  }

  // ============ 生命周期 ============

  destroy(): void {
    this.clearOverlays()
    // 不在此 remove map（由 MapLibreContainer 的 useEffect cleanup 负责）
  }
}