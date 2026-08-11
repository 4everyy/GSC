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
 * 地图底图样式枚举。
 *
 * - dark：暗色矢量底图（默认，离线，OSM 数据）
 * - satellite：卫星影像底图（同源代理路径 /satellite-tiles 经 gcs-cache 协议优先命中离线缓存，未命中在线时回源 Esri World Imagery）
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

/**
 * tileserver-gl 的绝对 origin。
 *
 * tileserver-gl 启动时通过 `--public_url http://localhost:8081` 将此 origin 注入到
 * style.json 内部的 sources.url / glyphs / sprite 等字段。浏览器直接请求这些绝对
 * URL 时，若页面从 LAN IP / IPv6 / 其他主机访问，localhost 会指向客户端自身导致
 * "Failed to fetch (0)"。
 *
 * transformRequest 会将此 origin 重写为同源代理路径 /tiles，故需集中导出。
 */
export const TILESERVER_ORIGIN = 'http://localhost:8081'

/**
 * 离线瓦片样式的基础路径（同源相对路径，通过 Vite/Nginx 代理转发到 tileserver-gl）。
 *
 * 使用相对路径而非绝对 URL，确保无论从 localhost / LAN IP / IPv6 访问页面，
 * 样式请求都走同源代理，避免浏览器跨域与 localhost 不可达问题。
 */
const OFFLINE_BASE = '/tiles/styles'

/**
 * 底图样式映射。
 *
 * 每个 key 对应一种底图模式：
 * - dark：矢量暗色底图（默认离线）
 * - satellite：卫星影像底图（代理源 /satellite-tiles + gcs-cache 离线缓存，回源 Esri）
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

/** 默认底图样式（卫星影像） */
export const MAPLIBRE_DEFAULT_BASEMAP: MapBasemap = 'satellite'

/**
 * 默认矢量城市数据源 key。
 *
 * 与本地 mbtiles 文件名前缀（suzhou.mbtiles）及 tileserver-gl config.json 的 data
 * 段 key 对齐。地图资源切换功能的默认城市；部署到其他区域时改 .env.local 或此处即可。
 */
export const MAPLIBRE_DEFAULT_CITY_KEY = 'suzhou'

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
  /**
   * 关闭右下角版权归属控件。
   *
   * 默认 MapLibre 会渲染 AttributionControl，卫星底图下会显示
   * "Imagery © Esri, Maxar, Earthstar Geographics ..." 等来源信息，
   * 项目 UI 规范不需要这些控件，故全局关闭。
   */
  attributionControl: false,
} as const
