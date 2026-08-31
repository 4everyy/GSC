/**
 * MapLibre 地图配置。
 *
 * 集中管理 MapLibre GL JS 的默认样式、中心点（WGS84）、缩放级别与交互选项，
 * 便于在多组件间共享与统一调整。
 */

/**
 * 默认中心点（WGS84）。
 *
 * 通过环境变量 VITE_MAPLIBRE_CENTER_LNG / VITE_MAPLIBRE_CENTER_LAT 配置。
 * 默认苏州市中心（120.6, 31.3），与本地瓦片数据覆盖范围匹配。
 * 深圳/其他区域部署时，在 .env.local 中覆盖即可。
 */
export const MAPLIBRE_DEFAULT_CENTER = {
  lng: Number(import.meta.env.VITE_MAPLIBRE_CENTER_LNG ?? 120.6),
  lat: Number(import.meta.env.VITE_MAPLIBRE_CENTER_LAT ?? 31.3),
}

/** 默认缩放级别（可通过 VITE_MAPLIBRE_DEFAULT_ZOOM 覆盖） */
export const MAPLIBRE_DEFAULT_ZOOM = Number(
  import.meta.env.VITE_MAPLIBRE_DEFAULT_ZOOM ?? 12,
)

/**
 * 地图样式与底图来源。
 *
 * 离线地图包方案下，地图样式由「离线地图包」驱动（见 src/features/offline-map，P1+ 实现）：
 * 运行时 MapLibre 通过 gcs-pkg:// 自定义协议从 IndexedDB 读取已导入的 MBTiles 包渲染；
 * 尚未导入任何包时，MapLibreContainer 渲染纯色占位底图。本文件只保留与样式无关的
 * 地图初始化常量（中心点 / 缩放 / 交互选项），不再持有任何瓦片服务器或样式 URL 配置。
 */

/**
 * MapLibre 地图初始化选项。
 */
export const MAPLIBRE_MAP_OPTIONS = {
  /** 最大缩放级别（写死，与苏州离线包 z9-18 数据层级对齐） */
  maxZoom: 18,
  /** 最小缩放级别（写死，与苏州离线包 z9-18 数据层级对齐，z9 以下无瓦片数据） */
  minZoom: 9,
  /**
   * 关闭右下角版权归属控件。
   *
   * 默认 MapLibre 会渲染 AttributionControl，显示数据来源信息，
   * 项目 UI 规范不需要这些控件，故全局关闭。
   */
  attributionControl: false,
} as const
