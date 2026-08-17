/**
 * 离线地图管理 —— 公共类型。
 *
 * 描述本地导入的 MBTiles 离线包元数据与瓦片坐标，供「解析 / IndexedDB 存储 /
 * gcs-pkg 协议 / 样式派生 / 上下文」各模块共享，避免重复定义。
 *
 * BBox 与城市目录（cityDatabase）同构，便于城市与离线包联动。
 */
import type { BBox } from './cityDatabase'

/** 瓦片图片格式（来自 MBTiles metadata.format），决定 raster source 解码方式 */
export type TileFormat = 'png' | 'jpg' | 'jpeg' | 'webp' | 'pbf'

/**
 * 已导入的离线地图包元数据。
 *
 * 解析 MBTiles 后写入 IndexedDB 的 packages 存储，作为多包管理、城市匹配、
 * 样式派生与 gcs-pkg:// 协议路由的唯一依据。
 */
export interface OfflinePackageMeta {
  /** 包唯一 id（URL 安全 slug，用于 gcs-pkg://{id}/{z}/{x}/{y}） */
  id: string
  /** 显示名（MBTiles metadata.name 或城市名派生） */
  name: string
  /** 图片格式（决定 raster source 解码） */
  format: TileFormat
  /** 瓦片尺寸（px），卫星包通常 256 */
  tileSize: number
  /** 最小缩放级别 */
  minZoom: number
  /** 最大缩放级别（MapLibre 在此之上做 overzoom 拉伸渲染） */
  maxZoom: number
  /** 包覆盖边界框（WGS84） */
  bounds: BBox
  /** 中心点（WGS84） */
  center: { lng: number; lat: number }
  /** 瓦片总数 */
  tileCount: number
  /** 导入时间戳（ms） */
  importedAt: number
  /** 关联的城市数据源 key（可选，用于「按城市切换」精确匹配包） */
  sourceKey?: string
}

/** XYZ 瓦片坐标（MapLibre / OSGeo XYZ 规范，原点左上角） */
export interface TileCoord {
  z: number
  x: number
  y: number
}
