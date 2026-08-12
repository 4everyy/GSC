/**
 * 批量下载引擎 —— 瓦片枚举 + 并发池 + 断点续传 + 可中断。
 *
 * 设计依据：docs/离线地图下载方案.md §5.3。
 *
 * 本模块为纯函数/异步函数集合，不依赖 React，可独立单元测试。
 * 调用方（OfflineMapContext）传入坐标集合、URL 模板、sourceId，并通过
 * onProgress 回调接收进度快照驱动 UI。
 */

import { getTile, getTiles, putTile } from './tileCache'
import type {
  Basemap,
  BBox,
  DownloadEstimate,
  DownloadSnapshot,
  TileCoord,
} from './types'

/** 按底图类型的平均单块字节数（用于空间预估，依据 §6.2） */
export const AVG_TILE_SIZE: Record<Basemap, number> = {
  dark: 20_000,
  satellite: 45_000,
}

/** 默认并发下载数（依据 §4：并发 6-8，避免压垮 tileserver-gl） */
export const DEFAULT_CONCURRENCY = 6

/**
 * 瓦片 content-type 映射。
 *
 * - 矢量瓦片：application/vnd.mapbox-vector-tile（.pbf）
 * - 栅格瓦片：image/png（.png）
 */
export function contentTypeForBasemap(basemap: Basemap): string {
  return basemap === 'satellite' ? 'image/png' : 'application/vnd.mapbox-vector-tile'
}

/**
 * 经纬度 → 某 zoom 层级的瓦片行列号（标准 XYZ 瓦片公式）。
 *
 * 公式与 docs §5.3 一致，使用 Web 墨卡托投影。
 */
export function lonLatToTile(
  z: number,
  lon: number,
  lat: number,
): { x: number; y: number } {
  const n = 2 ** z
  const x = Math.floor(((lon + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  // 标准公式：y = floor((1 - ln(tan(lat) + sec(lat)) / π) / 2 * n)
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  )
  return { x, y }
}

/**
 * 枚举 bbox × [minZoom, maxZoom] 范围内的所有瓦片坐标。
 *
 * 对每个层级，由 bbox 的西北角与东南角计算行列号范围，边界钳制到
 * [0, 2^z - 1]，覆盖跨日界线/极地的极端输入，避免越界。
 */
export function enumerateTiles(
  bbox: BBox,
  minZoom: number,
  maxZoom: number,
): TileCoord[] {
  const tiles: TileCoord[] = []
  // 归一化：确保 west<east、south<north
  const west = Math.min(bbox.west, bbox.east)
  const east = Math.max(bbox.west, bbox.east)
  const south = Math.min(bbox.south, bbox.north)
  const north = Math.max(bbox.south, bbox.north)
  for (let z = Math.max(0, minZoom); z <= maxZoom; z++) {
    const n = 2 ** z
    const tl = lonLatToTile(z, west, north)
    const br = lonLatToTile(z, east, south)
    const xMin = Math.max(0, Math.min(tl.x, br.x))
    const xMax = Math.min(n - 1, Math.max(tl.x, br.x))
    const yMin = Math.max(0, Math.min(tl.y, br.y))
    const yMax = Math.min(n - 1, Math.max(tl.y, br.y))
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ z, x, y })
      }
    }
  }
  return tiles
}

/**
 * 预估下载瓦片数与磁盘占用（依据 §6.2 公式）。
 *
 * 注意：enumerateTiles 会完整遍历，超大区域可能耗时；UI 防抖调用。
 */
export function estimateDownload(
  bbox: BBox,
  minZoom: number,
  maxZoom: number,
  basemap: Basemap,
): DownloadEstimate {
  const tileCount = enumerateTiles(bbox, minZoom, maxZoom).length
  return {
    tileCount,
    estimatedBytes: tileCount * AVG_TILE_SIZE[basemap],
  }
}

/**
 * 将瓦片 URL 模板与坐标合成具体请求路径。
 *
 * 模板形如 `/tiles/data/v3/{z}/{x}/{y}.pbf`，支持 {z}/{x}/{y} 占位符。
 * 返回值同时作为 IndexedDB 缓存主键，与运行时缓存拦截键空间一致。
 */
export function buildTileUrl(template: string, coord: TileCoord): string {
  return template
    .replace('{z}', String(coord.z))
    .replace('{x}', String(coord.x))
    .replace('{y}', String(coord.y))
}

/**
 * 由瓦片 URL 模板推断 sourceId（路径前缀）。
 *
 * 去掉末尾 `{z}/{x}/{y}.ext` 与尾部斜杠，保留路径前缀，
 * 与运行时缓存拦截（matchTilePath）推断的 sourceId 保持一致，
 * 保证预下载入库与懒加载缓存的 sourceId 归一。
 */
export function deriveSourceId(tileUrlTemplate: string): string {
  return tileUrlTemplate
    .replace(/\{z\}\s*\/\s*\{x\}\s*\/\s*\{y\}\.[^/]+$/i, '')
    .replace(/\/+$/, '')
}

/** 下载可调参数 */
export interface DownloadOptions {
  /** 并发数（默认 DEFAULT_CONCURRENCY） */
  concurrency?: number
  /** 中断信号（AbortController.signal） */
  signal?: AbortSignal
  /** 进度回调 */
  onProgress?: (snapshot: DownloadSnapshot) => void
}

/**
 * 批量下载指定坐标集合的瓦片，写入 IndexedDB。
 *
 * 行为：
 * - 断点续传：下载前对每个瓦片查缓存，已存在块直接计入 completed 并跳过；
 * - 并发池：concurrency 个 worker 同时拉取，避免压垮服务端；
 * - 可中断：通过 signal 取消，已完成块已入库，下次重试自动续传；
 * - 失败计数：单块失败不中断整体，最终汇总 failed 数。
 *
 * @param coords 待下载瓦片坐标集合
 * @param sourceId 缓存分组标识（路径前缀）
 * @param tileUrlTemplate 瓦片 URL 模板（含 {z}/{x}/{y}）
 * @param tileContentType 兜底 content-type（响应头缺失时使用）
 * @param options 并发/中断/进度
 * @returns 完成情况快照
 */
export async function downloadTiles(
  coords: TileCoord[],
  sourceId: string,
  tileUrlTemplate: string,
  tileContentType: string,
  options: DownloadOptions = {},
): Promise<DownloadSnapshot> {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY)
  const signal = options.signal
  const total = coords.length
  let completed = 0
  let failed = 0
  let skipped = 0
  let bytes = 0
  const emit = (): void => {
    options.onProgress?.({
      completed,
      failed,
      skipped,
      total,
      bytes,
      aborted: !!signal?.aborted,
    })
  }

  if (total === 0) {
    return {
      completed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      bytes: 0,
      aborted: false,
    }
  }

  // 断点续传：批量查询已缓存块，命中则跳过
  const keys = coords.map((c) => buildTileUrl(tileUrlTemplate, c))
  const existing = await getTiles(keys)
  existing.forEach((rec) => {
    if (rec) {
      completed++
      bytes += rec.blob.size
    }
  })
  emit()

  const pending: { coord: TileCoord; key: string }[] = []
  coords.forEach((c, i) => {
    if (!existing[i]) pending.push({ coord: c, key: keys[i] })
  })

  // 并发池：N 个 worker 抢占共享游标
  let index = 0
  async function worker(): Promise<void> {
    while (index < pending.length) {
      if (signal?.aborted) return
      const cur = pending[index++]
      try {
        const resp = await fetch(cur.key, { signal })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const buf = await resp.arrayBuffer()
        // 204 No Content / 0 字节响应：数据源无此瓦片（如占位 mbtiles 缺失高层级、
        // 栅格源在海域/边界无数据）。视为「跳过」——不写入缓存（避免 0 字节空 Blob
        // 污染 IndexedDB），不计入 completed 也不计入 failed，单独累计 skipped。
        // 注意：204 的 resp.ok 为 true（2xx），故必须在此显式判断而非依赖 !resp.ok。
        if (resp.status === 204 || buf.byteLength === 0) {
          skipped++
          emit()
          continue
        }
        const contentType = resp.headers.get('content-type') ?? tileContentType
        const len = Number(resp.headers.get('content-length')) || buf.byteLength
        await putTile({
          key: cur.key,
          sourceId,
          z: cur.coord.z,
          x: cur.coord.x,
          y: cur.coord.y,
          blob: new Blob([buf], { type: contentType }),
          contentType,
          cachedAt: Date.now(),
        })
        completed++
        bytes += len
        emit()
      } catch (err) {
        // 中断导致的异常不视为失败，直接退出 worker
        if (signal?.aborted) return
        // 仅消费 err 避免未使用变量告警；失败原因不在此层处理
        void err
        failed++
        emit()
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, pending.length) }, worker),
  )

  return {
    completed,
    failed,
    skipped,
    total,
    bytes,
    aborted: !!signal?.aborted,
  }
}

/**
 * 计算某 key 是否已缓存（单块断点续传判断的便捷封装）。
 *
 * 下载引擎内部使用批量 getTiles 以提升性能；本函数供需要单块判断的
 * 场景（如部分续传校验）使用。
 */
export async function isTileCached(key: string): Promise<boolean> {
  return !!(await getTile(key))
}

/**
 * 下载前探测数据源是否包含有效瓦片数据。
 *
 * 通过采样少量瓦片（建议 2-3 个不同层级）判断数据源是否为空
 * （如占位 mbtiles、仅含元数据无实际瓦片的文件）。所有采样瓦片
 * 均返回 204 No Content / 0 字节时判定为「无数据」，调用方可据此
 * 阻止无意义的全量下载（如 5722 块全部 skip 的场景）。
 *
 * 判定逻辑与 {@link downloadTiles} 的 204/0-byte skip 逻辑一致：
 * 响应状态码 204 或 body 为 0 字节均视为「无数据」。只要有任一采样
 * 返回有效数据（非 204 且 body > 0）即认为数据源可用。
 *
 * 单个采样失败（网络错误 / HTTP 错误）不中断探测——跳过该采样尝试下一个，
 * 因为单点失败不代表数据源整体为空。
 *
 * @param tileUrlTemplate 瓦片 URL 模板（含 {z}/{x}/{y}）
 * @param sampleCoords 采样瓦片坐标集合（建议覆盖多个层级）
 * @param signal 可选中断信号
 * @returns true = 至少一个采样瓦片有有效数据；false = 所有采样均为空/失败
 */
export async function probeTileSource(
  tileUrlTemplate: string,
  sampleCoords: TileCoord[],
  signal?: AbortSignal,
): Promise<boolean> {
  for (const coord of sampleCoords) {
    if (signal?.aborted) return false
    try {
      const key = buildTileUrl(tileUrlTemplate, coord)
      const resp = await fetch(key, { signal })
      if (!resp.ok) continue
      const buf = await resp.arrayBuffer()
      if (resp.status !== 204 && buf.byteLength > 0) return true
    } catch {
      // 单个采样网络失败：尝试下一个采样点
    }
  }
  return false
}
