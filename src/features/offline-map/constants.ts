/**
 * 离线地图模块的常量与预设配置。
 *
 * 依据 docs/离线地图下载方案.md §6.2 瓦片数与空间预估、§6.4 配额与持久化。
 */

import type { Basemap, BBox } from './types'

/**
 * 预设下载区域。
 *
 * 与本地瓦片数据覆盖范围（苏州）对齐，提供一键选择常用 bbox；
 * 用户也可在 DownloadTab 切换到"自定义区域"手动输入经纬度。
 */
export interface PresetRegion {
  /** 区域显示名 */
  name: string
  /** 边界框 */
  bbox: BBox
  /**
   * 数据源 key（对应 tileserver-gl config.json 的 data 段 key / mbtiles 文件名）。
   * 苏州本地预设统一指向 'suzhou' 源。
   */
  sourceKey: string
}

export const PRESET_REGIONS: PresetRegion[] = [
  { name: '苏州市（全域）', bbox: { west: 119.9, east: 121.3, south: 30.7, north: 31.9 }, sourceKey: 'suzhou' },
  { name: '苏州市区', bbox: { west: 120.4, east: 120.9, south: 31.1, north: 31.45 }, sourceKey: 'suzhou' },
  { name: '吴中区', bbox: { west: 120.3, east: 120.7, south: 31.0, north: 31.4 }, sourceKey: 'suzhou' },
  { name: '工业园区', bbox: { west: 120.6, east: 120.8, south: 31.2, north: 31.4 }, sourceKey: 'suzhou' },
]

/** 最小可下载层级（与 MAPLIBRE_MAP_OPTIONS.minZoom 对齐） */
export const MIN_ZOOM_LIMIT = 3
/** 矢量暗色底图最大层级（依据 §10 风险对策：dark 全量下载） */
export const MAX_ZOOM_LIMIT_DARK = 16
/** 卫星影像底图最大层级（依据 §10 风险对策：satellite 限制 ≤16，避免耗时数小时） */
export const MAX_ZOOM_LIMIT_SATELLITE = 16

/** 大批量下载空间阈值（字节），超限需二次确认（依据 §3.2 交互流程） */
export const LARGE_DOWNLOAD_THRESHOLD = 2 * 1024 * 1024 * 1024 // 2GB

/** 配额占用告警阈值（占比，依据 §6.4：超 80% 配额时警告） */
export const QUOTA_WARN_RATIO = 0.8

/** 底图友好标签 */
export const BASEMAP_LABELS: Record<Basemap, string> = {
  dark: '矢量暗色',
  satellite: '卫星影像',
}

/**
 * 由瓦片 URL 模板推断底图类型。
 *
 * - 模板含 satellite/raster 或栅格扩展名（.png/.jpg/.webp）→ satellite；
 * - 否则视为矢量暗色（dark）。
 */
export function inferBasemap(tileUrlTemplate: string): Basemap {
  const lower = tileUrlTemplate.toLowerCase()
  if (
    lower.includes('satellite') ||
    lower.includes('raster') ||
    /\.(png|jpe?g|webp)(\?|$)/.test(lower)
  ) {
    return 'satellite'
  }
  return 'dark'
}

/**
 * 根据 sourceId（路径前缀）推断底图友好名，供 LocalTab 展示。
 *
 * 无法明确判断时回退为原始 sourceId，保证信息不丢失。
 */
export function resolveBasemapLabel(sourceId: string): string {
  const lower = sourceId.toLowerCase()
  if (lower.includes('satellite') || lower.includes('raster')) return BASEMAP_LABELS.satellite
  if (lower.includes('v3') || lower.includes('vector') || lower.includes('dark')) {
    return BASEMAP_LABELS.dark
  }
  return sourceId
}
