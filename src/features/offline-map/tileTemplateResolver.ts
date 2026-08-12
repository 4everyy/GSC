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
 * 由数据源 key 构造本地栅格影像瓦片 URL 模板（静态默认，扩展名固定 .png）。
 *
 * ⚠️ 静态默认扩展名可能与 tileserver 实际提供的不一致——tileserver-gl 按
 * mbtiles 的 format 元数据（png/jpg/webp）决定瓦片扩展名，且**仅**在该扩展名
 * 提供。下载场景应优先用 {@link resolveRasterTemplateFromTileJson} 从 tilejson
 * 动态获取真实扩展名；本函数仅作为 tilejson 不可达时的兜底。
 *
 *   /data/{key}/{z}/{x}/{y}.png → 经同源代理重写为 /tiles/data/{key}/{z}/{x}/{y}.png。
 */
export function buildLocalRasterTemplate(sourceKey: string): string {
  return `${TILE_PROXY_PREFIX}/data/${sourceKey}/{z}/{x}/{y}.png`
}

/**
 * 从 tileserver-gl 的 TileJSON 文档动态解析栅格瓦片 URL 模板。
 *
 * tileserver-gl 按 mbtiles 的 format 元数据（png/jpg/webp）决定瓦片扩展名，
 * 且**仅**在该扩展名的 URL 提供瓦片，其余扩展名一律 404。若下载模板硬编码
 * 扩展名，会出现：① 探测/请求 404（probe 误判数据源为空）；② 预下载缓存键
 * 与运行时渲染键不一致（离线渲染命不中缓存）。
 *
 * 本函数实时拉取 `${TILESERVER_ORIGIN}/data/{key}.json`，取 tiles[0] 并重写为
 * 同源代理路径，保证与运行时 transformRequest 拦截键空间完全一致（断点续传 +
 * 离线渲染的前提）。tileserver 更换 mbtiles（png↔jpg）时无需改代码。
 *
 * @returns 重写后的模板；tilejson 不可达 / 非 2xx / 无 tiles 时返回 null，
 *          调用方应回退到 {@link buildLocalRasterTemplate}。
 */
export async function resolveRasterTemplateFromTileJson(
  sourceKey: string,
): Promise<string | null> {
  const tileJsonUrl = `${TILESERVER_ORIGIN}/data/${sourceKey}.json`
  try {
    const resp = await fetch(tileJsonUrl)
    if (!resp.ok) return null
    const tj = (await resp.json()) as { tiles?: string[] }
    const first = tj.tiles?.[0]
    if (!first) return null
    return rewriteOriginToProxy(first)
  } catch {
    return null
  }
}

/**
 * tileserver-gl TileJSON 暴露的数据源实际缩放覆盖。
 *
 * 严格离线下，本地 mbtiles 的真实数据覆盖（缩放区间）才是离线下载的边界——
 * 用户选择的层级必须与数据源实际覆盖取交集，否则越界层级会全部返回 204（数据源
 * 无此瓦片），造成「下载完成但大量跳过」的误导。例如 satellite.mbtiles 仅含
 * z10-z12 时，按 z8-z14 枚举会让 z8/z9/z13/z14 全部 204 跳过。
 *
 * 复用与 {@link resolveRasterTemplateFromTileJson} 相同的 TileJSON 端点
 * （/data/{key}.json），读取 minzoom/maxzoom。mbtiles 元数据须准确（由
 * prepare-satellite.py 打包完成后回填实际 minzoom/maxzoom/bounds）。
 *
 * @returns {minzoom, maxzoom}；tilejson 不可达 / 无 minzoom|maxzoom / 非有限数时
 *          返回 null，调用方据此放弃钳制（回退 UI 默认层级范围）。
 */
export async function fetchSourceCoverage(
  sourceKey: string,
): Promise<{ minzoom: number; maxzoom: number } | null> {
  const tileJsonUrl = `${TILESERVER_ORIGIN}/data/${sourceKey}.json`
  try {
    const resp = await fetch(tileJsonUrl, { cache: 'no-store' })
    if (!resp.ok) return null
    const tj = (await resp.json()) as { minzoom?: unknown; maxzoom?: unknown }
    const min = Number(tj.minzoom)
    const max = Number(tj.maxzoom)
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null
    return { minzoom: min, maxzoom: max }
  } catch {
    return null
  }
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
