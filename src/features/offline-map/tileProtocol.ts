/**
 * MapLibre 自定义协议注册 —— 运行时瓦片缓存拦截层。
 *
 * 设计依据：docs/离线地图下载方案.md §5.4、§6.1。
 *
 * 背景：MapLibre 的 transformRequest 是同步的，只能返回 `{ url }`，无法
 * 直接返回 Blob。因此采用官方 addProtocol API 注册自定义协议 `gcs-cache://`：
 *  1. transformRequest 将 tileserver 瓦片/字体/sprite URL 重写为 gcs-cache://<path>；
 *  2. 协议处理器按 path 查 IndexedDB 缓存 → 命中返回本地 ArrayBuffer；
 *  3. 未命中 + 在线 → fetch 回源并异步写回缓存（懒加载）；
 *  4. 未命中 + 离线 → 栅格瓦片返回灰色占位（§6.1 方案 A）；矢量瓦片抛错
 *     （露出底图暗色背景，达到"灰显"视觉效果）。
 *
 * 缓存主键 = 归一化同源代理路径（如 `/tiles/data/v3/12/3456/7890.pbf`），
 * 与预下载引擎（tileDownload.ts）键空间一致。
 */

import { addProtocol, type AddProtocolAction } from 'maplibre-gl'
import { getTile, putTile } from './tileCache'
import type { TileCoord } from './types'

/** 自定义协议名：transformRequest 会将 tileserver 资源 URL 重写为以此协议开头 */
export const CACHE_PROTOCOL = 'gcs-cache'

/** 灰色占位瓦片颜色（与暗色底图背景协调的冷灰） */
const GRAY_PLACEHOLDER_COLOR = '#2a2f3a'

let grayPngBuffer: ArrayBuffer | null = null

/**
 * 惰性生成 1×1 灰色 PNG 占位瓦片（ArrayBuffer）。
 *
 * 使用 Canvas 绘制 1×1 像素（栅格渲染时会拉伸到瓦片大小，纯色无失真），
 * 缓存为模块级常量，避免重复编码开销。Canvas 不可用时返回 null（调用方
 * 回退为抛错）。
 */
async function getGrayPngTile(): Promise<ArrayBuffer | null> {
  if (grayPngBuffer) return grayPngBuffer
  try {
    let blob: Blob | null = null
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(1, 1)
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.fillStyle = GRAY_PLACEHOLDER_COLOR
      ctx.fillRect(0, 0, 1, 1)
      blob = await canvas.convertToBlob({ type: 'image/png' })
    } else if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.fillStyle = GRAY_PLACEHOLDER_COLOR
      ctx.fillRect(0, 0, 1, 1)
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      )
    }
    if (!blob) return null
    grayPngBuffer = await blob.arrayBuffer()
    return grayPngBuffer
  } catch {
    return null
  }
}

/** matchTilePath 解析结果 */
export interface TilePathMatch {
  /** sourceId（路径前缀） */
  sourceId: string
  /** 瓦片坐标 */
  coord: TileCoord
  /** 扩展名（小写，不含点） */
  ext: string
}

/**
 * 匹配瓦片路径，提取 sourceId / z / x / y。
 *
 * 输入为归一化同源路径（如 `/tiles/data/v3/12/3456/7890.pbf`）。
 * 支持 vector (.pbf) 与 raster (.png/.jpg/.jpeg/.webp)。
 * 非瓦片资源（glyphs .pbf、sprite、style.json）返回 null（仍可被缓存，
 * 但不参与 sourceId 分组统计）。
 */
export function matchTilePath(path: string): TilePathMatch | null {
  const m = path.match(/^(.+?)\/(\d+)\/(\d+)\/(\d+)\.(pbf|png|jpe?g|webp)$/i)
  if (!m) return null
  return {
    sourceId: m[1],
    coord: { z: Number(m[2]), x: Number(m[3]), y: Number(m[4]) },
    ext: m[5].toLowerCase(),
  }
}

/**
 * 将任意 URL（含自定义协议）归一化为同源代理路径。
 *
 * 例如 `gcs-cache:///tiles/data/v3/12/3/4.pbf` → `/tiles/data/v3/12/3/4.pbf`，
 * `http://localhost:8081/data/v3/12/3/4.pbf` → `/data/v3/12/3/4.pbf`。
 */
export function normalizeUrlToPath(url: string): string {
  return url.replace(/^[^:]+:\/*/, '/')
}

let registered = false

/**
 * 注册 `gcs-cache` 自定义协议（幂等，全应用仅注册一次）。
 *
 * 必须在创建 MapLibre 实例之前调用。MapLibre 在主线程调用该协议处理器
 * 处理所有以 `gcs-cache:` 开头的资源请求。
 */
export function registerTileCacheProtocol(): void {
  if (registered) return
  registered = true
  addProtocol(
    CACHE_PROTOCOL,
    (async (params, abortController): Promise<{ data: ArrayBuffer }> => {
      const path = normalizeUrlToPath(params.url)

      // 1. 命中缓存 → 返回本地 ArrayBuffer（零网络）
      const cached = await getTile(path)
      if (cached) {
        return { data: await cached.blob.arrayBuffer() }
      }

      // 2. 未命中 + 在线 → 回源拉取并异步写回缓存（懒加载）
      const online =
        typeof navigator === 'undefined' ? true : navigator.onLine !== false
      if (online) {
        const resp = await fetch(path, { signal: abortController.signal })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const buf = await resp.arrayBuffer()
        const contentType =
          resp.headers.get('content-type') ?? 'application/octet-stream'
        // 异步写回缓存（fire-and-forget，不阻塞渲染）
        const m = matchTilePath(path)
        if (m) {
          putTile({
            key: path,
            sourceId: m.sourceId,
            z: m.coord.z,
            x: m.coord.x,
            y: m.coord.y,
            blob: new Blob([buf], { type: contentType }),
            contentType,
            cachedAt: Date.now(),
          }).catch(() => {
            /* 写缓存失败不影响渲染 */
          })
        }
        return { data: buf }
      }

      // 3. 未命中 + 离线 → 灰显处理（§6.1）
      const m = matchTilePath(path)
      if (m && m.ext !== 'pbf') {
        // 栅格瓦片：返回灰色 PNG 占位（与已下载块形成对比）
        const gray = await getGrayPngTile()
        if (gray) return { data: gray }
      }
      // 矢量瓦片或灰色占位不可用：抛错，MapLibre 显示透明（露出暗色背景）
      throw new Error('offline: tile not cached')
    }) as AddProtocolAction,
  )
}
