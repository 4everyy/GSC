/**
 * 离线地图（浏览器侧瓦片缓存）功能模块的公共类型定义。
 *
 * 本模块在保留现有 tileserver-gl 服务端架构的基础上，新增一层浏览器端
 * IndexedDB 缓存：首次联网时批量预取瓦片入库，后续无论联网与否优先
 * 从本地缓存读取，断网且无缓存时灰显瓦片并提示。
 *
 * 设计依据：docs/离线地图下载方案.md §5.1 数据模型。
 */

/** 底图类型：与 config/mapLibre.ts 的 MapBasemap 对齐 */
export type Basemap = 'dark' | 'satellite'

/** 经纬度边界框（WGS84） */
export interface BBox {
  /** 西经（最小经度） */
  west: number
  /** 东经（最大经度） */
  east: number
  /** 南纬（最小纬度） */
  south: number
  /** 北纬（最大纬度） */
  north: number
}

/** 瓦片坐标 */
export interface TileCoord {
  z: number
  x: number
  y: number
}

/**
 * 缓存的单个瓦片记录。
 *
 * 主键 key 为归一化后的请求路径（如 `/tiles/data/v3/12/3456/7890.pbf`），
 * 与 MapLibre transformRequest 重写后的同源代理路径一致，确保运行时
 * 缓存拦截与预下载入库使用同一套键空间（断点续传的前提）。
 */
export interface TileCacheRecord {
  /** 主键：归一化请求路径（同源代理路径） */
  key: string
  /** 来源标识（由路径前缀推断，用于按底图批量删除） */
  sourceId: string
  /** 瓦片层级 */
  z: number
  /** 瓦片列号 */
  x: number
  /** 瓦片行号 */
  y: number
  /** 瓦片二进制 */
  blob: Blob
  /** 内容类型：application/vnd.mapbox-vector-tile | image/png | ... */
  contentType: string
  /** 入库时间戳（ms） */
  cachedAt: number
}

/** 下载任务状态机（依据 §7.1 状态流转） */
export type DownloadTaskStatus =
  | 'pending'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'

/**
 * 预下载任务。
 *
 * 状态流转：pending → downloading → completed/paused/failed。
 * 任务持久化到 IndexedDB `tasks` store，刷新页面后可恢复进度（断点续传）。
 */
export interface DownloadTask {
  id: string
  /** 底图类型 */
  basemap: Basemap
  /** 区域名称（预设名或"自定义区域"） */
  regionName: string
  /** 经纬度边界 */
  bbox: BBox
  minZoom: number
  maxZoom: number
  /** 瓦片 URL 模板（含 {z}/{x}/{y} 占位符，由 style.json 解析得到） */
  tileUrlTemplate: string
  /** tile content-type（vector→application/vnd.mapbox-vector-tile；raster→image/png） */
  tileContentType: string
  /** 状态机 */
  status: DownloadTaskStatus
  /** 瓦片总数 */
  totalTiles: number
  /** 已完成瓦片数（成功） */
  completedTiles: number
  /** 失败瓦片数 */
  failedTiles: number
  /** 已下载字节数 */
  bytesDownloaded: number
  /** 错误信息（status === 'failed' 时） */
  error?: string
  /** 创建时间戳 */
  createdAt: number
  /** 最后更新时间戳 */
  updatedAt: number
}

/** 按底图聚合的缓存统计（LocalTab 展示用） */
export interface CacheGroupStat {
  /** 来源标识（路径前缀） */
  sourceId: string
  /** 底图友好名 */
  label: string
  /** 缓存块数 */
  count: number
  /** 占用字节 */
  bytes: number
  /** zoom 范围（最小） */
  minZoom: number
  /** zoom 范围（最大） */
  maxZoom: number
  /** 最近一次入库时间 */
  lastCachedAt: number
}

/** 空间预估（瓦片数 + 字节数） */
export interface DownloadEstimate {
  /** 瓦片总数 */
  tileCount: number
  /** 预估字节数 */
  estimatedBytes: number
}

/** 下载进度快照（下载引擎向外推送） */
export interface DownloadSnapshot {
  /** 已成功完成数 */
  completed: number
  /** 失败数 */
  failed: number
  /** 总数 */
  total: number
  /** 已下载字节数 */
  bytes: number
  /** 是否被中断 */
  aborted: boolean
}
