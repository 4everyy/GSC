/**
 * 离线地图特性 —— 公共出口（barrel）。
 *
 * 严格离线地图管理：预构建 MBTiles → sql.js 解析 → IndexedDB 存储 →
 * gcs-pkg:// 协议渲染 + 城市切换。无 Esri / 在线兜底。
 */
// 类型
export type { OfflinePackageMeta, TileFormat, TileCoord } from './types'
export type { TileRecord, OfflineMapDB } from './indexedDb'
export type { ImportProgress } from './mbtilesLoader'
export type { OfflineMapStatus, ImportProgressState } from './offlineMapStore'
export type { UseOfflineMapResult } from './useOfflineMap'

// React 接入
export { useOfflineMap } from './useOfflineMap'
export { OfflineMapPanel } from './components/OfflineMapPanel'

// 状态管理
export { useOfflineMapStore, selectActiveStyle } from './offlineMapStore'

// 导入 / 删除
export { importMbtiles, removeMbtilesPackage, slugifyPackageId } from './mbtilesLoader'

// 样式派生
export { buildRasterStyle } from './styleBuilder'

// 协议
export { registerTileProtocol, parseTileUrl, GCS_PKG_PROTOCOL } from './tileProtocol'

// 严格离线引擎层网络守卫（拦截任何 MapLibre 在线 http(s) 请求）
export {
  createOfflineTransformRequest,
  registerOfflineNetworkGuard,
  isOnlineResourceUrl,
  handleGcsBlockRequest,
  BLOCK_PROTOCOL,
} from './networkGuard'

// IndexedDB 底层访问（高级用法）
export {
  getOfflineMapDB,
  getAllPackages,
  getPackage,
  getTile,
  countPackageTiles,
  DB_NAME,
  DB_VERSION,
} from './indexedDb'
