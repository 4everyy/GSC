/**
 * @file maplibre-utils.ts
 * @description MapLibre 适配器共享工具：GeoJSON 最小类型、覆盖物记录、id 生成、圆形坐标、图标栅格化与锚点推断。
 * @author 4everyy
 * @date 2026-10-07
 */
import type { LngLat } from './types'

/** 本地 GeoJSON 最小类型定义（避免依赖 @types/geojson） */
export type GeoJSONPosition = number[]
export type GeoJSONLineString = { type: 'LineString'; coordinates: GeoJSONPosition[] }
export type GeoJSONPolygon = { type: 'Polygon'; coordinates: GeoJSONPosition[][] }
export type GeoJSONGeometry = GeoJSONLineString | GeoJSONPolygon
export type GeoJSONFeature = {
  type: 'Feature'
  geometry: GeoJSONGeometry
  properties: Record<string, unknown> | null
}
export type GeoJSONFeatureCollection = {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
}

/** Marker 锚点位置字符串（MapLibre 的 Anchor 取值集合） */
export type MLAnchorString =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

export const EARTH_CIRCUMFERENCE = 40075016.686

/** 内部覆盖物记录 */
export interface MapLibreOverlayEntry {
  kind: 'marker' | 'polyline' | 'circle' | 'polygon'
  /** Marker 实例（marker 类型） */
  marker?: import('maplibre-gl').Marker
  /** source id（polyline/circle 类型） */
  sourceId?: string
  /** layer id 列表（polyline 可能有多层光晕） */
  layerIds?: string[]
  /** 透明命中层 id（setPolylineInteractive 创建 */
  hitLayerId?: string
  /** 高亮前的原始线宽（setPolylineHighlight 缓存，用于恢复） */
  baseLineWidth?: number
  /** 高亮前的原始线色（setPolylineHighlight 缓存，用于恢复） */
  baseLineColor?: string
  /** 创建参数重放闭包：setStyle 整体替换 style 会清空动态 source/layer（DOM marker 不受影响） */
  recreate?: () => void
}

/** 生成带前缀的唯一 id（用于 source/layer 命名） */
let uidCounter = 0
export function nextId(prefix: string): string {
  uidCounter += 1
  return `${prefix}-${uidCounter}-${Math.random().toString(36).slice(2, 8)}`
}

/** 生成圆形多边形的 GeoJSON 坐标环（等角近似）。 */
export function circleCoordinates(center: LngLat, radiusMeters: number, steps = 64): number[][] {
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

/** 沿线箭头贴图栅格化像素比（2x：保证高清屏下箭头边缘清晰） */
export const ICON_PIXEL_RATIO = 2

/** 图标栅格缓存（url#尺寸 → ImageData）：同一资源多处复用免重复加载/重绘 */
const iconRasterCache = new Map<string, ImageData>()

/** 图标异步栅格化：Image 加载（svg/png 同一入口）→ 按逻辑尺寸 × 像素比放大重绘到 canvas。 */
export function rasterizeIcon(
  url: string,
  sizePx: number,
  pixelRatio: number,
): Promise<ImageData> {
  const cacheKey = `${url}#${sizePx}`
  const cached = iconRasterCache.get(cacheKey)
  if (cached) return Promise.resolve(cached)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(sizePx * pixelRatio)
        canvas.height = Math.round(sizePx * pixelRatio)
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('canvas 2d context unavailable')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
        iconRasterCache.set(cacheKey, data)
        resolve(data)
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
    img.onerror = () => reject(new Error(`icon load failed: ${url}`))
    img.src = url
  })
}

/** 根据像素锚点（相对元素左上角）与元素尺寸，推断最匹配的 MapLibre 九宫格锚点字符串。 */
export function pickAnchorString(
  anchor: { x: number; y: number },
  width: number,
  height: number,
): MLAnchorString {
  // 负值锚点（如距离标签的"上方偏移"）视为语义偏移，保持 center
  if (anchor.x < 0 || anchor.y < 0) return 'center'
  const ax = anchor.x
  const ay = anchor.y
  const nearTop = ay <= height * 0.15
  const nearBottom = ay >= height * 0.85
  const nearLeft = ax <= width * 0.15
  const nearRight = ax >= width * 0.85
  const centerH = !nearLeft && !nearRight
  const centerV = !nearTop && !nearBottom
  if (nearTop && centerH) return 'top'
  if (nearBottom && centerH) return 'bottom'
  if (centerV && nearLeft) return 'left'
  if (centerV && nearRight) return 'right'
  if (nearTop && nearLeft) return 'top-left'
  if (nearTop && nearRight) return 'top-right'
  if (nearBottom && nearLeft) return 'bottom-left'
  if (nearBottom && nearRight) return 'bottom-right'
  return 'center'
}