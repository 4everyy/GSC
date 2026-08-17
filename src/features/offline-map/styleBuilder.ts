/**
 * 离线地图样式派生 —— 由 OfflinePackageMeta 构建栅格 StyleSpecification。
 *
 * 生成的样式包含：
 * - 一个 raster source，tiles 模板指向 gcs-pkg://{id}/{z}/{x}/{y}（本地协议）；
 * - 一个 background 层（深色底，使包未覆盖区域与占位底图一致）；
 * - 一个 raster 图层（引用上述 source）。
 *
 * 所有配置（tileSize / bounds / minzoom / maxzoom）均来自 MBTiles metadata，
 * 保证渲染范围与导入数据精确匹配，杜绝凭空渲染包外瓦片。
 */
import type { StyleSpecification } from 'maplibre-gl'
import type { OfflinePackageMeta } from './types'
import { GCS_PKG_PROTOCOL } from './tileProtocol'

/** 占位底图背景色（与 MapLibreContainer 的 PLACEHOLDER_STYLE 一致） */
const BACKGROUND_COLOR = '#1a2a3a'

/**
 * 由离线包元数据派生栅格 StyleSpecification。
 *
 * @param meta 离线包元数据
 * @returns 可直接传入 map.setStyle 的完整样式
 */
export function buildRasterStyle(meta: OfflinePackageMeta): StyleSpecification {
  const sourceId = `gcs-pkg-${meta.id}`
  return {
    version: 8,
    sources: {
      [sourceId]: {
        type: 'raster',
        // gcs-pkg:// 自定义协议：由 tileProtocol 从 IndexedDB 读取，无网络请求。
        tiles: [`${GCS_PKG_PROTOCOL}://${meta.id}/{z}/{x}/{y}`],
        tileSize: meta.tileSize,
        // bounds 限制瓦片请求范围：包外区域不请求（MapLibre 自动裁剪）。
        bounds: [meta.bounds.west, meta.bounds.south, meta.bounds.east, meta.bounds.north],
        minzoom: meta.minZoom,
        maxzoom: meta.maxZoom,
        attribution: '',
      },
    },
    layers: [
      {
        id: 'gcs-background',
        type: 'background',
        paint: { 'background-color': BACKGROUND_COLOR },
      },
      {
        id: `gcs-raster-${meta.id}`,
        type: 'raster',
        source: sourceId,
        paint: {},
      },
    ],
  }
}
