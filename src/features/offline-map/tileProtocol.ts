/**
 * gcs-pkg:// 自定义协议 —— 严格离线瓦片渲染核心。
 *
 * 职责：注册 maplibregl.addProtocol('gcs-pkg', ...)，当 MapLibre raster source
 * 请求 `gcs-pkg://{pkgId}/{z}/{x}/{y}` 时，仅从 IndexedDB 读取对应瓦片二进制返回。
 *
 * 核心不变式（严格离线，无任何在线兜底）：
 * - 命中 IndexedDB → 返回 { data: ArrayBuffer }；
 * - 未命中 → 抛错（MapLibre raster source 收到错误后渲染灰块，绝不回源网络）；
 * - 全程不读取 navigator.onLine，不存在「在线/离线」分支。
 *
 * 注意：栅格瓦片由 MapLibre 在主线程获取（worker bundle 不含 raster tile source），
 * 故此 addProtocol 运行在主线程，可直接访问 IndexedDB。
 */
import { addProtocol } from 'maplibre-gl'
import { getTile } from './indexedDb'

/** 自定义协议名（gcs-pkg://） */
export const GCS_PKG_PROTOCOL = 'gcs-pkg'

/** 协议 URL 前缀 */
const PROTOCOL_PREFIX = `${GCS_PKG_PROTOCOL}://`

/**
 * 从 gcs-pkg:// 请求 URL 中解析 {pkgId, z, x, y}。
 *
 * URL 形如 `gcs-pkg://suzhou/12/3456/7890`（无扩展名——栅格瓦片按字节内容解码格式）。
 * 导出供单元测试使用。
 * @throws URL 格式不合法时抛错
 */
export function parseTileUrl(url: string): { pkgId: string; z: number; x: number; y: number } {
  const path = url.startsWith(PROTOCOL_PREFIX) ? url.slice(PROTOCOL_PREFIX.length) : url
  // 去除可能的查询串 / hash（防御性）
  const clean = path.split('?')[0].split('#')[0]
  const parts = clean.split('/')
  if (parts.length < 4) {
    throw new Error(`gcs-pkg 协议 URL 格式非法：${url}`)
  }
  const [pkgId, zStr, xStr, yStr] = parts
  const z = Number(zStr)
  const x = Number(xStr)
  const y = Number(yStr)
  if (!pkgId || Number.isNaN(z) || Number.isNaN(x) || Number.isNaN(y)) {
    throw new Error(`gcs-pkg 协议 URL 参数非法：${url}`)
  }
  return { pkgId, z, x, y }
}

/** maplibre-gl 自定义协议请求参数（最小结构子集，仅用 url） */
interface ProtocolRequest {
  url: string
}

/** 协议返回结果（MapLibre raster source 接收 { data: ArrayBuffer }） */
interface ProtocolResult {
  data: ArrayBuffer
}

/** 协议是否已注册（防重复注册） */
let registered = false

/**
 * gcs-pkg:// 协议请求处理器（严格离线核心）。
 *
 * 导出以便单元测试锁定「无在线兜底」不变式：
 * - 命中 IndexedDB → 返回 { data }；
 * - 未命中 → reject（MapLibre 渲染灰块），绝不回源网络、绝不 fetch 在线瓦片源
 *   （Esri / tileserver / OSM 等一律不可达）；
 * - 不读取 navigator.onLine（严格离线下无「在线/离线」概念）。
 */
export async function handleGcsPkgRequest(
  request: ProtocolRequest,
): Promise<ProtocolResult> {
  const { pkgId, z, x, y } = parseTileUrl(request.url)
  const record = await getTile(pkgId, z, x, y)
  if (!record) {
    // 严格离线：未命中一律 reject（灰显），绝不回源网络。
    throw new Error(
      `gcs-pkg 瓦片未命中（离线包 ${pkgId} 无 z=${z}/x=${x}/y=${y}），严格离线不回源`,
    )
  }
  // 返回 ArrayBuffer；MapLibre raster source 按字节内容自动解码 png/jpg/webp。
  return { data: record.data }
}

/**
 * 注册 gcs-pkg:// 协议（幂等）。
 *
 * 应在应用初始化时调用一次（useOfflineMap 在 mount 时调用）。
 */
export function registerTileProtocol(): void {
  if (registered) return
  registered = true
  addProtocol(GCS_PKG_PROTOCOL, handleGcsPkgRequest)
}
