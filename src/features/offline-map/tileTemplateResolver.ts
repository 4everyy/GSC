/**
 * style.json 解析器 —— 从底图样式中提取瓦片 URL 模板。
 *
 * 设计依据：docs/离线地图下载方案.md §5.3 buildTileUrl。
 *
 * 不同部署环境 tileserver-gl 的数据目录结构可能不同（/data/v3、
 * /data/satellite 等），硬编码模板会失配。本模块运行时拉取 style.json，
 * 解析 sources 中的瓦片模板，并应用与 transformRequest 一致的
 * origin→/tiles 重写，保证缓存主键与运行时拦截键空间一致。
 *
 * MapLibre Style Spec 允许 source 用两种方式声明瓦片源：
 *  - tiles: string[]   内联模板数组
 *  - url: string       指向 TileJSON 文档（其内含 tiles 数组）
 * tileserver-gl 生成的 style.json 普遍用 url 形式（如 /data/suzhou.json），
 * 故 resolveTileSource 会先调 expandTileJsonSources 把 url 展开为 tiles，
 * 再交给 pickTileSource 选取。
 */

import { TILESERVER_ORIGIN } from '../../config/mapLibre'
import { inferBasemap } from './constants'
import type { Basemap } from './types'

/** 同源代理前缀（与 MapLibreContainer.createTileserverTransformRequest 对齐） */
const TILE_PROXY_PREFIX = '/tiles'

/** 解析结果 */
export interface ResolvedTileSource {
  /** 瓦片 URL 模板（含 {z}/{x}/{y}，已重写为同源代理路径） */
  tileUrlTemplate: string
  /** 推断的底图类型 */
  basemap: Basemap
  /** content-type */
  contentType: string
  /** source 标识（名称） */
  sourceName: string
}

interface StyleSourceLike {
  type?: string
  tiles?: string[]
  url?: string
  tileSize?: number
}

interface StyleSpecLike {
  sources?: Record<string, StyleSourceLike>
}

/**
 * 将 tileserver-gl 注入的绝对 origin 重写为同源代理路径。
 *
 * 与 MapLibreContainer 的 transformRequest 逻辑一致，确保预下载入库的
 * 缓存键与运行时拦截的缓存键完全一致（断点续传的前提）。
 */
export function rewriteOriginToProxy(url: string): string {
  if (url.startsWith(TILESERVER_ORIGIN)) {
    return url.replace(TILESERVER_ORIGIN, TILE_PROXY_PREFIX)
  }
  return url
}

/**
 * 由数据源 key 构造本地矢量瓦片 URL 模板。
 *
 * tileserver-gl 按 config.json 的 data 段 key 暴露瓦片：
 *   /data/{key}/{z}/{x}/{y}.pbf → 经同源代理重写为 /tiles/data/{key}/{z}/{x}/{y}.pbf。
 * 与运行时 transformRequest 重写后的路径完全一致，保证预下载入库键与运行时拦截键
 * 空间一致（断点续传 + 离线渲染的前提）。
 *
 * 用于按城市下载：style.json 通常只引用单一源（默认苏州），无法覆盖多城市，
 * 故下载矢量城市时按城市 key 直接构造模板，而非解析 style.json。
 */
export function buildLocalVectorTemplate(sourceKey: string): string {
  return `${TILE_PROXY_PREFIX}/data/${sourceKey}/{z}/{x}/{y}.pbf`
}

/**
 * 从 style.json 中选取瓦片 URL 模板。
 *
 * 仅识别 sources 中已填充的内联 `tiles` 数组；对于用 `url` 指向 TileJSON
 * 的 source，需先经 {@link expandTileJsonSources} 展开为 tiles 数组。
 *
 * 优先选取与目标 basemap 类型匹配的 source：
 * - dark → type 为 vector 且含 tiles 的 source；
 * - satellite → type 为 raster 且含 tiles 的 source；
 * 无精确匹配时回退为第一个含 tiles 的 source。
 */
export function pickTileSource(
  styleSpec: StyleSpecLike,
  preferred: Basemap,
): ResolvedTileSource | null {
  const sources = styleSpec.sources
  if (!sources) return null
  const entries = Object.entries(sources).filter(([, s]) => s?.tiles?.[0])
  if (entries.length === 0) return null

  const wantType = preferred === 'satellite' ? 'raster' : 'vector'
  const matched =
    entries.find(([, s]) => s.type === wantType) ?? entries[0]

  const [sourceName, source] = matched
  const rawTemplate = source.tiles![0]
  const tileUrlTemplate = rewriteOriginToProxy(rawTemplate)
  const basemap = inferBasemap(tileUrlTemplate)
  const contentType =
    basemap === 'satellite' ? 'image/png' : 'application/vnd.mapbox-vector-tile'
  return { tileUrlTemplate, basemap, contentType, sourceName }
}

/**
 * 对 spec 中所有「仅有 url 无 tiles」的 source，异步拉取 TileJSON 填充 tiles。
 *
 * tileserver-gl 生成的 style.json 普遍用 url 形式声明 source（如
 * `"url": "http://localhost:8081/data/suzhou.json"`），而 pickTileSource
 * 只识别内联 tiles 数组。本函数把 url 形式展开为 tiles 数组，让
 * pickTileSource 能正常工作（修复卫星底图下载分支无法解析模板的 bug）。
 *
 * url 通常是 tileserver-gl 通过 `--public_url` 注入的绝对 origin
 * （http://localhost:8081/...），直接请求在 LAN/IPv6 访问时会跨域或不可达。
 * 故先用 {@link rewriteOriginToProxy} 重写为同源代理路径（/tiles/...），
 * 与运行时 transformRequest 的重写保持一致。
 *
 * 单个 source 的 TileJSON 解析失败时静默跳过（保持无 tiles），由
 * pickTileSource 自然过滤；spec 无 sources 时直接返回。
 *
 * @param spec 待填充的 style.json 对象（原地修改 sources 内的 tiles 字段）
 */
export async function expandTileJsonSources(spec: StyleSpecLike): Promise<void> {
  const sources = spec.sources
  if (!sources) return
  await Promise.all(
    Object.values(sources).map(async (s) => {
      if (!s || s.tiles?.[0] || !s.url) return
      try {
        const resp = await fetch(rewriteOriginToProxy(s.url))
        if (!resp.ok) return
        const tileJson = (await resp.json()) as { tiles?: string[] }
        if (tileJson.tiles?.[0]) {
          s.tiles = tileJson.tiles
        }
      } catch {
        // 单个 source 解析失败不阻断整体，留待 pickTileSource 过滤
      }
    }),
  )
}

/**
 * 拉取并解析 style.json，返回瓦片 URL 模板。
 *
 * 解析流程：
 * 1. fetch style.json；
 * 2. {@link expandTileJsonSources} 把 url 形式的 source 展开为 tiles 数组
 *    （兼容 tileserver-gl 默认输出格式）；
 * 3. {@link pickTileSource} 按 basemap 类型选取并重写 origin。
 *
 * @param styleUrl 底图样式 URL（如 /tiles/styles/dark/style.json）
 * @param preferred 期望的底图类型
 * @throws 网络失败或无可用瓦片 source 时抛错
 */
export async function resolveTileSource(
  styleUrl: string,
  preferred: Basemap,
): Promise<ResolvedTileSource> {
  const resp = await fetch(styleUrl)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const spec = (await resp.json()) as StyleSpecLike
  await expandTileJsonSources(spec)
  const resolved = pickTileSource(spec, preferred)
  if (!resolved) {
    throw new Error('style.json 中未找到含瓦片模板的 source')
  }
  return resolved
}
