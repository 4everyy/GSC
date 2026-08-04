/**
 * BMapAdapter —— 百度地图 BMapGL 适配器。
 *
 * 职责：
 * - 实现 MapAdapter 接口，把统一的 WGS84 坐标转换为百度 BD09 坐标后操作 BMapGL；
 * - 将 BMapGL 的覆盖物/事件/视图 API 封装为引擎无关形态，供上层业务组件使用。
 *
 * 坐标约定（重要）：
 * - 对外：所有 LngLat 均为 WGS84；
 * - 对内：BMapGL 需要 BD09，故 setCenter/panTo/addMarker 等写入前做 wgs84ToBd09，
 *   getCenter/事件回调读取后做 bd09ToWgs84。
 *
 * 多层覆盖物说明：
 * - 一条"逻辑折线"在视觉上可能是多条 BMapGL.Polyline 叠加（光晕 + 过渡 + 主线）；
 * - 一个"可拖拽 HTML 标注"在 BMapGL 中需 Label（视觉）+ 透明 Marker（交互热区）组合；
 * - 因此 overlays 表用 `raws: BMapGL.Overlay[]` 存储同一 id 下的所有物理覆盖物，
 *   removeOverlay / clearOverlays 时统一遍历清理。
 */
import type {
  CircleOptions,
  LngLat,
  MapAdapter,
  MarkerHandle,
  MarkerOptions,
  PolylineHandle,
  PolylineOptions,
} from './types'
import { wgs84ToBd09, bd09ToWgs84 } from '../utils/coordTransform'

/** 内部覆盖物记录：id → 物理覆盖物列表 */
interface BMapOverlayEntry {
  /** 同一逻辑 id 下的所有物理覆盖物（通常 1 个，光晕折线/组合标注可能有多个） */
  raws: BMapGL.Overlay[]
  /** 覆盖物类型，用于 setMarkerPosition 等的联动策略 */
  kind: 'marker' | 'polyline' | 'circle' | 'label'
}

const EARTH_CIRCUMFERENCE = 40075016.686

/** 透明图标 data URI：让 Marker 视觉不可见，仅保留拖拽/右键交互热区 */
const TRANSPARENT_ICON_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

/** BMapGL Label 外层容器样式重置：清除默认白底/边框，让内层 HTML 视觉生效 */
const LABEL_RESET_STYLE: Record<string, string> = {
  background: 'transparent',
  border: 'none',
  padding: '0',
  boxShadow: 'none',
  color: 'inherit',
  fontSize: 'inherit',
  lineHeight: '1',
  whiteSpace: 'nowrap',
}

/** 从地图鼠标事件中提取经纬度坐标（兼容 GL 版与旧版 2D API） */
function getEventPoint(e: BMapGL.MapEvent): { lng: number; lat: number } | null {
  const me = e as BMapGL.MapMouseEvent
  const p = me.latlng ?? me.point
  if (!p || typeof p.lng !== 'number' || typeof p.lat !== 'number') return null
  return { lng: p.lng, lat: p.lat }
}

/**
 * 封装 BMapGL.Map，实现引擎无关的 MapAdapter 接口。
 *
 * 所有输入坐标（LngLat）为 WGS84，内部转换为 BD09 后写入 BMapGL；
 * 所有输出坐标（getCenter / 事件回调）从 BMapGL 读出 BD09 后转回 WGS84。
 */
export class BMapAdapter implements MapAdapter {
  readonly engine = 'baidu' as const

  private map: BMapGL.Map
  /** 覆盖物表：id → 条目，便于按 id 精确移除 */
  private overlays = new Map<string, BMapOverlayEntry>()

  constructor(map: BMapGL.Map) {
    this.map = map
  }

  // ============ 视图控制 ============

  setCenter(lngLat: LngLat): void {
    const bd = wgs84ToBd09(lngLat.lng, lngLat.lat)
    this.map.setCenter(new BMapGL.Point(bd.lng, bd.lat))
  }

  getCenter(): LngLat {
    const c = this.map.getCenter()
    return bd09ToWgs84(c.lng, c.lat)
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
    const bd = wgs84ToBd09(lngLat.lng, lngLat.lat)
    this.map.panTo(new BMapGL.Point(bd.lng, bd.lat))
  }

  // ============ 坐标换算 ============

  getMetersPerPixel(): number {
    const center = this.map.getCenter()
    if (!center) return 0
    const centerPixel = this.map.pointToPixel(center)
    const p1 = this.map.pixelToPoint(new BMapGL.Pixel(centerPixel.x, centerPixel.y))
    const p2 = this.map.pixelToPoint(new BMapGL.Pixel(centerPixel.x + 100, centerPixel.y))
    const metersPerDeg =
      (EARTH_CIRCUMFERENCE / 360) * Math.cos((center.lat * Math.PI) / 180)
    return (Math.abs(p2.lng - p1.lng) * metersPerDeg) / 100
  }

  // ============ 覆盖物：标注 ============

  addMarker(id: string, lngLat: LngLat, opts?: MarkerOptions): MarkerHandle {
    const bd = wgs84ToBd09(lngLat.lng, lngLat.lat)
    const point = new BMapGL.Point(bd.lng, bd.lat)
    const anchorX = opts?.anchor?.x ?? 0
    const anchorY = opts?.anchor?.y ?? 0

    // ---- 情况 A：HTML 元素 + 可拖拽 → Label（视觉）+ 透明 Marker（交互）----
    // BMapGL 的 Label 不支持拖拽，Marker 不支持 HTML 内容，故需组合。
    if (opts?.element && opts?.draggable) {
      // 视觉层：Label 承载 HTML
      const label = new BMapGL.Label(opts.element.outerHTML, {
        position: point,
        offset: new BMapGL.Size(-anchorX, -anchorY),
      })
      label.setStyle(LABEL_RESET_STYLE)
      this.map.addOverlay(label)

      // 交互层：透明 Marker 提供拖拽热区
      const icon = new BMapGL.Icon(
        TRANSPARENT_ICON_URL,
        new BMapGL.Size(24, 24),
        { anchor: new BMapGL.Size(12, 12) },
      )
      const marker = new BMapGL.Marker(point, { enableDragging: true, icon })
      this.map.addOverlay(marker)

      if (opts.onDragEnd) {
        marker.addEventListener('dragend', (e: BMapGL.MapEvent) => {
          const pos = getEventPoint(e)
          if (!pos) return
          const wgs = bd09ToWgs84(pos.lng, pos.lat)
          opts.onDragEnd!({ lng: wgs.lng, lat: wgs.lat })
        })
      }
      if (opts.onContextMenu) {
        marker.addEventListener('rightclick', () => opts.onContextMenu!())
      }
      if (opts.onClick) {
        marker.addEventListener('click', () => opts.onClick!())
      }

      this.overlays.set(id, { raws: [label, marker], kind: 'marker' })
      return { raw: marker, id, engine: 'baidu' }
    }

    // ---- 情况 B：仅 HTML 元素（不可拖拽）→ Label ----
    if (opts?.element) {
      const label = new BMapGL.Label(opts.element.outerHTML, {
        position: point,
        offset: new BMapGL.Size(-anchorX, -anchorY),
      })
      label.setStyle(LABEL_RESET_STYLE)
      this.map.addOverlay(label)

      if (opts.onContextMenu) {
        label.addEventListener('rightclick', () => opts.onContextMenu!())
      }
      if (opts.onClick) {
        label.addEventListener('click', () => opts.onClick!())
      }

      this.overlays.set(id, { raws: [label], kind: 'label' })
      return { raw: label, id, engine: 'baidu' }
    }

    // ---- 情况 C：默认 Marker（无自定义 HTML）----
    const marker = new BMapGL.Marker(point, { enableDragging: opts?.draggable })
    this.map.addOverlay(marker)

    if (opts?.onDragEnd) {
      const cb = opts.onDragEnd
      marker.addEventListener('dragend', (e: BMapGL.MapEvent) => {
        const pos = getEventPoint(e)
        if (!pos) return
        const wgs = bd09ToWgs84(pos.lng, pos.lat)
        cb({ lng: wgs.lng, lat: wgs.lat })
      })
    }
    if (opts?.onContextMenu) {
      const cb = opts.onContextMenu
      marker.addEventListener('rightclick', () => cb())
    }
    if (opts?.onClick) {
      const cb = opts.onClick
      marker.addEventListener('click', () => cb())
    }

    this.overlays.set(id, { raws: [marker], kind: 'marker' })
    return { raw: marker, id, engine: 'baidu' }
  }

  setMarkerPosition(handle: MarkerHandle, lngLat: LngLat): void {
    const bd = wgs84ToBd09(lngLat.lng, lngLat.lat)
    const point = new BMapGL.Point(bd.lng, bd.lat)
    // 更新该 id 下所有物理覆盖物的位置（Label + Marker 组合情况需同步移动）
    const entry = this.overlays.get(handle.id)
    if (entry) {
      for (const raw of entry.raws) {
        const o = raw as BMapGL.Overlay & { setPosition?: (p: BMapGL.Point) => void }
        o.setPosition?.(point)
      }
    } else {
      // 兜底：直接操作 handle
      const o = handle.raw as BMapGL.Overlay & { setPosition?: (p: BMapGL.Point) => void }
      o.setPosition?.(point)
    }
  }

  setMarkerElement(handle: MarkerHandle, element: HTMLElement): void {
    // Label 用 setContent 更新 HTML；Marker 无此方法时忽略
    const o = handle.raw as { setContent?: (html: string) => void }
    o.setContent?.(element.outerHTML)
  }

  removeMarker(id: string): void {
    this.removeOverlay(id)
  }

  // ============ 覆盖物：折线 ============

  addPolyline(id: string, points: LngLat[], opts?: PolylineOptions): PolylineHandle {
    const pts = points.map((p) => {
      const bd = wgs84ToBd09(p.lng, p.lat)
      return new BMapGL.Point(bd.lng, bd.lat)
    })

    const color = opts?.color ?? '#3388ff'
    const width = opts?.width ?? 4
    const opacity = opts?.opacity ?? 1
    const raws: BMapGL.Overlay[] = []

    if (opts?.glow) {
      // 光晕层：粗、低透明度
      const glow = new BMapGL.Polyline(pts, {
        strokeColor: opts.glowColor ?? color,
        strokeWeight: width * (opts.glowWidth ?? 3),
        strokeOpacity: opacity * 0.25,
      })
      this.map.addOverlay(glow)
      raws.push(glow)

      // 过渡层：中等粗细
      const mid = new BMapGL.Polyline(pts, {
        strokeColor: color,
        strokeWeight: width * 1.5,
        strokeOpacity: opacity * 0.45,
      })
      this.map.addOverlay(mid)
      raws.push(mid)
    }

    // 主线层
    const main = new BMapGL.Polyline(pts, {
      strokeColor: color,
      strokeWeight: width,
      strokeOpacity: opacity,
    })
    this.map.addOverlay(main)
    raws.push(main)

    this.overlays.set(id, { raws, kind: 'polyline' })
    return { raw: main, id, engine: 'baidu' }
  }

  setPolylinePoints(handle: PolylineHandle, points: LngLat[]): void {
    const pts = points.map((p) => {
      const bd = wgs84ToBd09(p.lng, p.lat)
      return new BMapGL.Point(bd.lng, bd.lat)
    })
    // 更新该 id 下所有折线层的路径
    const entry = this.overlays.get(handle.id)
    if (entry) {
      for (const raw of entry.raws) {
        const o = raw as BMapGL.Polyline & { setPath?: (pts: BMapGL.Point[]) => void }
        o.setPath?.(pts)
      }
    } else {
      // 兜底
      const o = handle.raw as BMapGL.Polyline & { setPath?: (pts: BMapGL.Point[]) => void }
      o.setPath?.(pts)
    }
  }

  removePolyline(id: string): void {
    this.removeOverlay(id)
  }

  // ============ 覆盖物：圆形 ============

  addCircle(id: string, center: LngLat, radiusMeters: number, opts?: CircleOptions): void {
    const bd = wgs84ToBd09(center.lng, center.lat)
    const circle = new BMapGL.Circle(new BMapGL.Point(bd.lng, bd.lat), radiusMeters, {
      strokeColor: opts?.strokeColor ?? '#1e90ff',
      strokeWeight: opts?.strokeWeight ?? 1,
      strokeOpacity: opts?.strokeOpacity ?? 0.4,
      fillColor: opts?.fillColor ?? '#1e90ff',
      fillOpacity: opts?.fillOpacity ?? 0.12,
    })
    this.map.addOverlay(circle)
    this.overlays.set(id, { raws: [circle], kind: 'circle' })
  }

  removeCircle(id: string): void {
    this.removeOverlay(id)
  }

  // ============ 通用覆盖物清理 ============

  removeOverlay(id: string): void {
    const entry = this.overlays.get(id)
    if (!entry) return
    for (const raw of entry.raws) {
      try {
        this.map.removeOverlay(raw)
      } catch {
        /* 覆盖物可能已被清理，忽略 */
      }
    }
    this.overlays.delete(id)
  }

  clearOverlays(): void {
    this.overlays.forEach((entry) => {
      for (const raw of entry.raws) {
        try {
          this.map.removeOverlay(raw)
        } catch {
          /* 忽略 */
        }
      }
    })
    this.overlays.clear()
  }

  // ============ 事件 ============

  onClick(handler: (lngLat: LngLat) => void): () => void {
    const fn = (e: BMapGL.MapEvent) => {
      const pos = getEventPoint(e)
      if (!pos) return
      const wgs = bd09ToWgs84(pos.lng, pos.lat)
      handler({ lng: wgs.lng, lat: wgs.lat })
    }
    this.map.addEventListener('click', fn)
    return () => {
      this.map.removeEventListener('click', fn)
    }
  }

  onZoomEnd(handler: (zoom: number) => void): () => void {
    const fn = () => handler(this.map.getZoom())
    this.map.addEventListener('zoomend', fn)
    return () => {
      this.map.removeEventListener('zoomend', fn)
    }
  }

  onMoveEnd(handler: (center: LngLat) => void): () => void {
    const fn = () => {
      const c = this.map.getCenter()
      const wgs = bd09ToWgs84(c.lng, c.lat)
      handler({ lng: wgs.lng, lat: wgs.lat })
    }
    this.map.addEventListener('moveend', fn)
    return () => {
      this.map.removeEventListener('moveend', fn)
    }
  }

  onContextMenu(handler: (lngLat: LngLat) => void): () => void {
    const fn = (e: BMapGL.MapEvent) => {
      const pos = getEventPoint(e)
      if (!pos) return
      const wgs = bd09ToWgs84(pos.lng, pos.lat)
      handler({ lng: wgs.lng, lat: wgs.lat })
    }
    this.map.addEventListener('rightclick', fn)
    return () => {
      this.map.removeEventListener('rightclick', fn)
    }
  }

  // ============ 交互设置 ============

  setDefaultCursor(cursor: string): void {
    this.map.setDefaultCursor(cursor)
  }

  enableDoubleClickZoom(enabled: boolean): void {
    if (enabled) {
      this.map.enableDoubleClickZoom()
    } else {
      this.map.disableDoubleClickZoom()
    }
  }

  // ============ 生命周期 ============

  destroy(): void {
    this.clearOverlays()
    // 不在此销毁 map 实例（由 BMapContainer 的 useEffect cleanup 负责）
  }
}