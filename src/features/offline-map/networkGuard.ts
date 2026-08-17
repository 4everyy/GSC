/**
 * 离线网络守卫 —— 在 MapLibre 引擎层强制「严格离线，无在线兜底」。
 *
 * 设计动机：
 * tileProtocol.ts 的 gcs-pkg:// 协议已确保「命中的瓦片来自 IndexedDB、未命中灰显」，
 * 但这仍属「按约定离线」——没有任何机制阻止未来某个样式 / 数据源把 tiles 指向在线
 * http(s) URL（例如误引入 Esri World Imagery、OSM 瓦片、tileserver-gl 等）。一旦发生，
 * MapLibre 会静默发起网络请求，违背「严格离线、无任何在线兜底」的核心约束。
 *
 * 本模块把「严格离线」从约定升级为「引擎层强制」：
 * 1. 注册 gcs-block:// 协议（addProtocol）：任何被路由到它的请求一律 reject（渲染灰块 /
 *    报错），全程零网络；
 * 2. 暴露 createOfflineTransformRequest()：作为 maplibregl.Map 的 transformRequest，把所有
 *    绝对 http(s):// URL 重写为 gcs-block://...，使其被守卫拦截；gcs-pkg:// / data: / blob: /
 *    同源相对路径一律原样放行。
 *
 * 不变量：无论 navigator.onLine 为何值，MapLibre 永不发起任何 http(s) 网络请求（无 Esri /
 * OSM / tileserver 等在线兜底）。
 */
import { addProtocol, type RequestTransformFunction } from 'maplibre-gl'

/** 拦截协议名（gcs-block://） */
export const BLOCK_PROTOCOL = 'gcs-block'

/** 拦截协议 URL 前缀 */
const BLOCK_PREFIX = `${BLOCK_PROTOCOL}://`

/**
 * 判断一个 URL 是否为「在线绝对地址」（http / https 协议）。
 *
 * 仅 http(s) 绝对地址会被守卫拦截；gcs-pkg:// / data: / blob: / 同源相对路径（/maps/...）
 * 一律放行。导出以便单元测试。
 */
export function isOnlineResourceUrl(url: string): boolean {
  return (
    typeof url === 'string' &&
    (url.startsWith('http://') || url.startsWith('https://'))
  )
}

/** maplibre-gl 自定义协议请求参数（最小结构子集，仅用 url） */
interface ProtocolRequest {
  url: string
}

/**
 * gcs-block:// 协议请求处理器（严格离线拦截）。
 *
 * 被路由到此协议的请求一律 reject——MapLibre raster source 收到错误后渲染灰块，全程零网络。
 * 返回类型 Promise<never> 语义上即「永不成功解析」。导出以便单元测试。
 */
export async function handleGcsBlockRequest(request: ProtocolRequest): Promise<never> {
  throw new Error(
    `严格离线守卫拦截在线请求：${request.url}（已禁止 MapLibre 发起任何 http(s) 网络请求，无 Esri / 在线兜底）`,
  )
}

/** 守卫协议是否已注册（防重复注册） */
let blockRegistered = false

/**
 * 注册 gcs-block:// 拦截协议（幂等）。
 *
 * 应在创建 MapLibre 地图实例前调用一次（MapLibreContainer 初始化时调用即可）。
 */
export function registerOfflineNetworkGuard(): void {
  if (blockRegistered) return
  blockRegistered = true
  addProtocol(BLOCK_PROTOCOL, handleGcsBlockRequest)
}

/**
 * 构造严格离线的 MapLibre transformRequest。
 *
 * 用法：`new maplibregl.Map({ transformRequest: createOfflineTransformRequest(), ... })`。
 *
 * 行为：
 * - 在线 http(s) URL → 重写为 gcs-block://blocked?src=<encodeURIComponent(原 URL)>，
 *   交由守卫协议拦截（灰显，零网络）；
 * - 其余（gcs-pkg:// / data: / blob: / 同源相对路径）→ 原样放行。
 *
 * 注意：transformRequest 对每种资源（瓦片 / style / glyph / sprite）都会被调用；本守卫对所有
 * 资源类型一视同仁地拦截在线地址，确保 MapLibre 完全离线、无任何在线兜底。
 */
export function createOfflineTransformRequest(): RequestTransformFunction {
  return (url) => {
    if (!isOnlineResourceUrl(url)) {
      // 放行：本地协议 / 内联数据 / 同源静态资源（gcs-pkg:// / data: / blob: / /maps/...）
      return { url }
    }
    // 拦截：重写到 gcs-block://，由守卫协议 reject（灰显，零网络）。
    // 保留原始 URL（编码进 src 查询串）以便错误信息可追溯被拦截的在线地址。
    const blockedUrl = `${BLOCK_PREFIX}blocked?src=${encodeURIComponent(url)}`
    return { url: blockedUrl }
  }
}
