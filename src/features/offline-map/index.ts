import { addProtocol, type RequestTransformFunction, type StyleSpecification } from 'maplibre-gl'
import { useEffect, useMemo, useState } from 'react'
import { type LngLat } from '../../map-engines/types'

/**
 * 离线地图特性 —— 公共出口（barrel）。
 * 现行方案：HTTP Range 按需直读 public/maps/suzhou.mbtiles（无导入、无 IndexedDB、无 sql.js）。
 */

// 严格离线引擎层网络守卫：BLOCK_PROTOCOL / createOfflineTransformRequest / handleGcsBlockRequest / isOnlineResourceUrl / registerOfflineNetworkGuard 定义见本文件后文

/** 离线地图共享类型（HTTP Range 直读方案）。 */

/** 边界框 [west, south, east, north] */
export type BBox = [number, number, number, number]

/** 离线包元信息（供 UI 消费的轻量描述） */
export interface OfflinePackageMeta {
  id: string
  name: string
  format: string
  minZoom: number
  maxZoom: number
  bounds: BBox
  center: [number, number]
}

/**
 * MBTiles 远程直读源：HTTP Range + sqliteRange 读取器。
 * 职责：probe 元数据、注册 gcs-pkg:// MapLibre 协议、清理旧版 IndexedDB 数据。
 * 替代旧「整包下载 + sql.js 解析 + IndexedDB 导入」链路。
 */

export const GCS_PKG_PROTOCOL = 'gcs-pkg'
/** 默认数据源：苏州卫星影像（同源静态资源） */
export const MBTILES_URL = '/maps/suzhou.mbtiles'
/** 数据源标识（锚点 localStorage 按包隔离的 scope key） */
export const MBTILES_ID = 'suzhou'

export interface MbtilesMeta {
  name: string
  format: string
  minZoom: number
  maxZoom: number
  /** [west, south, east, north] */
  bounds: [number, number, number, number]
  center: [number, number]
}

function httpRange(url: string): RangeFetch {
  return async (offset, length) => {
    const res = await fetch(url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } })
    if (res.status !== 206) {
      throw new Error(`服务器不支持 HTTP Range（status ${res.status}），无法直读 MBTiles`)
    }
    return new Uint8Array(await res.arrayBuffer())
  }
}

function parseMeta(raw: Record<string, string>): MbtilesMeta {
  const parts = (raw.bounds ?? '').split(',').map(Number)
  if (parts.length !== 4 || parts.some(Number.isNaN)) throw new Error('MBTiles metadata 缺少合法 bounds')
  const bounds: [number, number, number, number] = [parts[0], parts[1], parts[2], parts[3]]
  const c = (raw.center ?? '').split(',').map(Number)
  const center: [number, number] =
    c.length === 2 && !c.some(Number.isNaN) ? [c[0], c[1]] : [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2]
  return {
    name: raw.name || '苏州卫星影像',
    format: raw.format || 'jpeg',
    minZoom: raw.minzoom ? Number(raw.minzoom) : 0,
    maxZoom: raw.maxzoom ? Number(raw.maxzoom) : 18,
    bounds,
    center,
  }
}

let reader: SqliteRangeReader | null = null

/** 初始化（幂等）直读源并返回元数据 */
export async function ensureMbtilesSource(): Promise<MbtilesMeta> {
  if (!reader) {
    const r = new SqliteRangeReader(httpRange(MBTILES_URL))
    await r.init()
    reader = r
  }
  return parseMeta(await reader.getMetadata())
}

/** 注册 gcs-pkg:// 瓦片协议（幂等）：URL 形如 gcs-pkg://tiles/{z}/{x}/{y}（XYZ） */
export function registerGcsPkgProtocol(): void {
  addProtocol(GCS_PKG_PROTOCOL, async (params: { url: string }) => {
    const m = /\/(\d+)\/(\d+)\/(\d+)/.exec(params.url)
    if (!m || !reader) throw new Error(`瓦片请求无效或数据源未就绪: ${params.url}`)
    const tile = await reader.getTile(Number(m[1]), Number(m[2]), Number(m[3]))
    if (!tile) throw new Error(`瓦片不存在: ${params.url}`)
    return { data: tile.buffer.slice(tile.byteOffset, tile.byteOffset + tile.byteLength) as ArrayBuffer }
  })
}

/** 清理旧版「整包导入」链路遗留的 IndexedDB 数据库（一次性） */
export function cleanupLegacyIndexedDB(): void {
  try {
    globalThis.indexedDB?.deleteDatabase('gcs-offline-map')
  } catch {
    /* 忽略 */
  }
}

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

/**
 * SQLite Range 读取器 —— 通过 HTTP Range 远程直读 SQLite(MBtiles) B-tree，零依赖。
 * 用于按需读取 GB 级 public/maps/*.mbtiles：不整包下载、不导入本地库。
 * 构造时注入 fetchRange 适配器（浏览器 fetch Range / Node fs 均可）。
 */

/** 读取远程文件 [offset, offset+length) 字节 */
export type RangeFetch = (offset: number, length: number) => Promise<Uint8Array>

const HDR = 100
const DECODER = new TextDecoder()

const u16 = (b: Uint8Array, p: number) => (b[p] << 8) | b[p + 1]
const u32 = (b: Uint8Array, p: number) => ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0

/** 解 varint，返回 [值(安全整数), 下一字节位置] */
function varint(b: Uint8Array, p: number): [number, number] {
  let v = 0n
  for (let i = 0; i < 8; i++) {
    const c = b[p + i]
    v = (v << 7n) | BigInt(c & 0x7f)
    if ((c & 0x80) === 0) return [Number(v), p + i + 1]
  }
  return [Number((v << 8n) | BigInt(b[p + 8])), p + 9]
}

/** 记录列描述：t=serial type, n=字节长, o=记录体内偏移 */
interface Col { t: number; n: number; o: number }

/** 解析记录头，返回各列描述 */
function recordCols(f: Uint8Array): Col[] {
  const [hl, hp] = varint(f, 0)
  const sizes = [0, 1, 2, 3, 4, 6, 8, 8, 0, 0, 0, 0]
  const cols: Col[] = []
  let p = hp
  let o = hl
  while (p < hl) {
    const [t, np] = varint(f, p)
    p = np
    const n = t >= 12 ? (t - 12) >> 1 : sizes[t]
    cols.push({ t, n, o })
    o += n
  }
  return cols
}

function intVal(f: Uint8Array, c: Col): number {
  if (c.t === 8) return 0
  if (c.t === 9) return 1
  if (c.t < 1 || c.t > 6) return 0
  let v = 0n
  for (let i = 0; i < c.n; i++) v = (v << 8n) | BigInt(f[c.o + i])
  if (c.n < 8 && (f[c.o] & 0x80)) v -= 1n << BigInt(c.n * 8)
  return Number(v)
}

function textVal(f: Uint8Array, c: Col): string {
  return c.t >= 13 && c.t % 2 === 1 ? DECODER.decode(f.subarray(c.o, c.o + c.n)) : ''
}

export class SqliteRangeReader {
  private readonly fetchRange: RangeFetch
  private pageSize = 0
  private usable = 0
  private rootTiles = 0
  private rootIdx = 0
  private rootMeta = 0
  private readonly cache = new Map<number, Promise<Uint8Array>>()

  constructor(fetchRange: RangeFetch) {
    this.fetchRange = fetchRange
  }

  async init(): Promise<void> {
    const h = await this.fetchRange(0, HDR)
    const magic = 'SQLite format 3'
    for (let i = 0; i < magic.length; i++) {
      if (h[i] !== magic.charCodeAt(i)) throw new Error('非法 SQLite/MBTiles 文件')
    }
    let ps = u16(h, 16)
    if (ps === 1) ps = 65536
    this.pageSize = ps
    this.usable = ps - h[20]
    const rows: Uint8Array[] = []
    await this.collectRows(1, rows)
    for (const r of rows) {
      const cols = recordCols(r)
      if (cols.length < 5) continue
      const typ = textVal(r, cols[0])
      const name = textVal(r, cols[1])
      const tbl = textVal(r, cols[2])
      const root = intVal(r, cols[3])
      if (typ === 'table' && name === 'tiles') this.rootTiles = root
      else if (typ === 'table' && name === 'metadata') this.rootMeta = root
      else if (typ === 'index' && tbl === 'tiles' && !this.rootIdx) this.rootIdx = root
    }
    if (!this.rootTiles || !this.rootMeta) throw new Error('MBTiles 缺少 tiles/metadata 表')
  }

  /** 读取 metadata 表为键值对 */
  async getMetadata(): Promise<Record<string, string>> {
    const rows: Uint8Array[] = []
    await this.collectRows(this.rootMeta, rows)
    const out: Record<string, string> = {}
    for (const r of rows) {
      const cols = recordCols(r)
      if (cols.length < 2) continue
      const k = textVal(r, cols[0])
      if (k) out[k] = textVal(r, cols[1])
    }
    return out
  }

  /** 取瓦片（XYZ 规范，原点左上）；内部翻转 TMS 行号。未命中返回 null。 */
  async getTile(z: number, x: number, yXyz: number): Promise<Uint8Array | null> {
    const yTms = (1 << z) - 1 - yXyz
    const rowid = this.rootIdx ? await this.indexSearch(this.rootIdx, z, x, yTms) : null
    if (rowid == null) return null
    const rec = await this.tableSearch(this.rootTiles, rowid)
    if (!rec) return null
    const cols = recordCols(rec)
    const blob = cols[3]
    if (!blob || blob.t < 12) return null
    return rec.subarray(blob.o, blob.o + blob.n)
  }

  private page(n: number): Promise<Uint8Array> {
    let p = this.cache.get(n)
    if (!p) {
      p = this.fetchRange((n - 1) * this.pageSize, this.pageSize)
      this.cache.set(n, p)
      p.catch(() => {
        if (this.cache.get(n) === p) this.cache.delete(n)
      })
      if (this.cache.size > 3000) {
        const first = this.cache.keys().next().value
        if (typeof first === 'number') this.cache.delete(first)
      }
    }
    return p
  }

  /** 计算 payload 本地字节数（SQLite 溢出公式） */
  private localLen(P: number, index: boolean): number {
    const U = this.usable
    const X = index ? Math.floor(((U - 12) * 64) / 255) - 23 : U - 23
    if (P <= X) return P
    const M = Math.floor(((U - 12) * 32) / 255) - 23
    const K = M + ((P - M) % (U - 4))
    return K <= X ? K : M
  }

  /** 组装完整 payload（跟随溢出页链） */
  private async readPayload(b: Uint8Array, start: number, P: number, index: boolean): Promise<Uint8Array> {
    const local = this.localLen(P, index)
    if (local >= P) return b.subarray(start, start + P)
    const out = new Uint8Array(P)
    out.set(b.subarray(start, start + local))
    let next = u32(b, start + local)
    let off = local
    while (off < P && next) {
      const pg = await this.page(next)
      const n = Math.min(this.usable - 4, P - off)
      out.set(pg.subarray(4, 4 + n), off)
      off += n
      next = u32(pg, 0)
    }
    return out
  }

  /** 索引 B-tree 查 (z,x,yTms) → rowid */
  private async indexSearch(pageNo: number, z: number, x: number, y: number): Promise<number | null> {
    const b = await this.page(pageNo)
    const h = pageNo === 1 ? HDR : 0
    const type = b[h]
    const n = u16(b, h + 3)
    const ptrBase = h + (type === 0x02 || type === 0x05 ? 12 : 8)
    if (type === 0x02) {
      for (let i = 0; i < n; i++) {
        const cell = u16(b, ptrBase + 2 * i)
        const child = u32(b, cell)
        const [P, p2] = varint(b, cell + 4)
        const key = await this.readPayload(b, p2, P, true)
        const cols = recordCols(key)
        if (cols.length < 4) continue
        const c = cmpKey(key, cols, z, x, y)
        if (c === 0) return intVal(key, cols[3])
        if (c > 0) return this.indexSearch(child, z, x, y)
      }
      return this.indexSearch(u32(b, h + 8), z, x, y)
    }
    if (type === 0x0a) {
      for (let i = 0; i < n; i++) {
        const cell = u16(b, ptrBase + 2 * i)
        const [P, p2] = varint(b, cell)
        const key = await this.readPayload(b, p2, P, true)
        const cols = recordCols(key)
        if (cols.length < 4) continue
        const c = cmpKey(key, cols, z, x, y)
        if (c === 0) return intVal(key, cols[3])
        if (c > 0) return null
      }
      return null
    }
    throw new Error(`索引页类型异常: ${type}`)
  }

  /** 表 B-tree 按 rowid 查整行记录 */
  private async tableSearch(pageNo: number, rowid: number): Promise<Uint8Array | null> {
    const b = await this.page(pageNo)
    const h = pageNo === 1 ? HDR : 0
    const type = b[h]
    const n = u16(b, h + 3)
    const ptrBase = h + (type === 0x02 || type === 0x05 ? 12 : 8)
    if (type === 0x05) {
      for (let i = 0; i < n; i++) {
        const cell = u16(b, ptrBase + 2 * i)
        const child = u32(b, cell)
        const [key] = varint(b, cell + 4)
        if (rowid <= key) return this.tableSearch(child, rowid)
      }
      return this.tableSearch(u32(b, h + 8), rowid)
    }
    if (type === 0x0d) {
      for (let i = 0; i < n; i++) {
        const cell = u16(b, ptrBase + 2 * i)
        const [P, q] = varint(b, cell)
        const [rid, start] = varint(b, q)
        if (rid === rowid) return this.readPayload(b, start, P, false)
        if (rid > rowid) return null
      }
      return null
    }
    throw new Error(`表页类型异常: ${type}`)
  }

  /** 全量遍历表 B-tree 行（仅用于 sqlite_master / metadata 小表） */
  private async collectRows(pageNo: number, out: Uint8Array[]): Promise<void> {
    const b = await this.page(pageNo)
    const h = pageNo === 1 ? HDR : 0
    const type = b[h]
    const n = u16(b, h + 3)
    const ptrBase = h + (type === 0x02 || type === 0x05 ? 12 : 8)
    if (type === 0x05) {
      for (let i = 0; i < n; i++) {
        const cell = u16(b, ptrBase + 2 * i)
        await this.collectRows(u32(b, cell), out)
      }
      await this.collectRows(u32(b, h + 8), out)
      return
    }
    if (type !== 0x0d) throw new Error(`表页类型异常: ${type}`)
    for (let i = 0; i < n; i++) {
      const cell = u16(b, ptrBase + 2 * i)
      const [P, q] = varint(b, cell)
      const [, start] = varint(b, q)
      out.push(await this.readPayload(b, start, P, false))
    }
  }
}

function cmpKey(k: Uint8Array, cols: Col[], z: number, x: number, y: number): number {
  const target = [z, x, y]
  for (let i = 0; i < 3; i++) {
    const a = intVal(k, cols[i])
    if (a !== target[i]) return a < target[i] ? -1 : 1
  }
  return 0
}

/**
 * 离线地图 Hook：挂载即激活 suzhou.mbtiles 直读源，派生活跃栅格样式。
 * 无导入流程、无 IndexedDB；失败时允许下次挂载重试。
 */

export type OfflineMapStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface OfflinePackageLite {
  id: string
  name: string
  center: LngLat
  bounds: [number, number, number, number]
  minZoom: number
  maxZoom: number
}

export interface UseOfflineMapResult {
  activeStyle: StyleSpecification | null
  activePackage: OfflinePackageLite | null
  status: OfflineMapStatus
  error: string | null
}

let activatePromise: Promise<MbtilesMeta> | null = null

function activate(): Promise<MbtilesMeta> {
  if (!activatePromise) {
    registerGcsPkgProtocol()
    cleanupLegacyIndexedDB()
    activatePromise = ensureMbtilesSource()
  }
  return activatePromise
}

function buildRasterStyle(m: MbtilesMeta): StyleSpecification {
  return {
    version: 8,
    sources: {
      'offline-mbtiles': {
        type: 'raster',
        tiles: [`${GCS_PKG_PROTOCOL}://tiles/{z}/{x}/{y}`],
        tileSize: 256,
        minzoom: m.minZoom,
        maxzoom: m.maxZoom,
      },
    },
    layers: [{ id: 'offline-satellite', type: 'raster', source: 'offline-mbtiles' }],
  }
}

export function useOfflineMap(): UseOfflineMapResult {
  const [meta, setMeta] = useState<MbtilesMeta | null>(null)
  const [status, setStatus] = useState<OfflineMapStatus>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let on = true
    activate()
      .then((m) => {
        if (!on) return
        setMeta(m)
        setStatus('ready')
      })
      .catch((e: unknown) => {
        if (!on) return
        setError(e instanceof Error ? e.message : String(e))
        setStatus('error')
        activatePromise = null
      })
    return () => {
      on = false
    }
  }, [])

  const activePackage = useMemo(
    () =>
      meta
        ? {
            id: MBTILES_ID,
            name: meta.name,
            center: { lng: meta.center[0], lat: meta.center[1] },
            bounds: meta.bounds,
            minZoom: meta.minZoom,
            maxZoom: meta.maxZoom,
          }
        : null,
    [meta],
  )
  const activeStyle = useMemo(() => (meta ? buildRasterStyle(meta) : null), [meta])
  return { activeStyle, activePackage, status, error }
}
