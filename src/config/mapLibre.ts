/**
 * MapLibre 地图配置。
 *
 * 与百度地图配置（config/map.ts）分离，因为：
 * - 坐标系不同：百度用 BD09，MapLibre 用 WGS84；
 * - 样式机制不同：百度用 setMapStyleV2，MapLibre 用 Style JSON；
 * - 瓦片源不同：百度在线瓦片，MapLibre 使用本地 tileserver-gl。
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
 * 地图底图样式枚举。
 *
 * - dark：暗色矢量底图（默认，离线，OSM 数据）
 * - satellite：卫星影像底图（默认 Esri World Imagery 在线；离线替换为本地 raster mbtiles）
 *
 * 各样式 URL 均可通过环境变量覆盖，便于不同部署环境灵活配置。
 */
export type MapBasemap = 'dark' | 'satellite'

interface StyleEntry {
  /** 样式显示名 */
  label: string
  /** 样式 URL（默认值，可被环境变量覆盖） */
  url: string
}

const OFFLINE_BASE = 'http://localhost:8081/styles'

/**
 * 底图样式映射。
 *
 * 每个 key 对应一种底图模式：
 * - dark：矢量暗色底图（默认离线）
 * - satellite：卫星影像底图（默认 Esri 在线；离线时在 style.json 中替换 source）
 *
 * 环境变量覆盖规则（按底图类型）：
 * - VITE_MAPLIBRE_STYLE_URL：覆盖 dark 矢量样式 URL
 * - VITE_MAPLIBRE_SATELLITE_STYLE_URL：覆盖 satellite 卫星样式 URL
 */
export const MAPLIBRE_BASEMAPS: Record<MapBasemap, StyleEntry> = {
  dark: {
    label: '矢量暗色',
    url:
      import.meta.env.VITE_MAPLIBRE_STYLE_URL ??
      `${OFFLINE_BASE}/dark/style.json`,
  },
  satellite: {
    label: '卫星影像',
    url:
      import.meta.env.VITE_MAPLIBRE_SATELLITE_STYLE_URL ??
      `${OFFLINE_BASE}/satellite/style.json`,
  },
}

/** 默认底图样式 */
export const MAPLIBRE_DEFAULT_BASEMAP: MapBasemap = 'dark'

/**
 * 兼容旧引用：导出默认样式 URL。
 * @deprecated 使用 MAPLIBRE_BASEMAPS[basemap].url 替代。
 */
export const MAPLIBRE_STYLE_URL = MAPLIBRE_BASEMAPS[MAPLIBRE_DEFAULT_BASEMAP].url

/**
 * 是否使用离线瓦片服务（用于决定加载失败时的提示信息）
 *
 * 判定逻辑：URL 指向 localhost / 内网 IP 且非 demotiles 即视为离线模式。
 */
const DEMO_STYLE_URL = 'https://demotiles.maplibre.org/style.json'

export const MAPLIBRE_USE_OFFLINE_TILES =
  MAPLIBRE_STYLE_URL !== DEMO_STYLE_URL &&
  !MAPLIBRE_STYLE_URL.includes('demotiles.maplibre.org')

/**
 * MapLibre 地图初始化选项。
 * 保持与百度地图一致的基础交互能力。
 */
export const MAPLIBRE_MAP_OPTIONS = {
  /** 允许滚轮缩放 */
  scrollZoom: true,
  /** 允许拖拽平移 */
  dragPan: true,
  /** 允许双击放大 */
  doubleClickZoom: true,
  /** 允许键盘操作 */
  keyboard: true,
  /** 允许触摸缩放/旋转 */
  touchZoomRotate: true,
  /** 抗锯齿 */
  antialias: true,
  /** 最大缩放级别 */
  maxZoom: 18,
  /** 最小缩放级别 */
  minZoom: 3,
} as const