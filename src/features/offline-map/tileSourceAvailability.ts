/**
 * tileserver-gl 可用数据源探测 —— 下载/切换按真实可用性过滤。
 *
 * 设计依据：docs/离线地图下载方案.md §3.2 + docs/离线部署指南.md「更换区域数据」。
 *
 * 原理：tileserver-gl 启动时根据 config.json 的 data 段注册 mbtiles 数据源，
 * 并在 /data.json 暴露所有已注册源（数组，每项含 format: pbf/png/jpg）。前端
 * 按需拉取此清单，据此决定哪些源可选（已准备数据）vs 灰显（未准备，回源会 404）。
 *
 * 矢量暗色底图依赖矢量(pbf)源；卫星影像底图依赖栅格(png/jpg)源——两者均严格本地化，
 * 无任何在线回源。
 */

import type { Basemap } from './types'

/** /data.json 单个数据源条目（仅取需要的字段） */
export interface DataSourceInfo {
  /** 格式：pbf(矢量) / png / jpg / webp(栅格) */
  format?: string
  /** tileserver 内部 id（与 config.json data 段 key 一致） */
  id?: string
  /** 友好名 */
  name?: string
}

/** tileserver-gl /data.json 返回的源清单；兼容数组(v5+)与对象两种形态 */
export type DataSourcesPayload = DataSourceInfo[] | Record<string, DataSourceInfo>

/** 同源代理路径（与 vite.config.ts 的 server.proxy / MapLibreContainer transformRequest 对齐） */
const DATA_JSON_URL = '/tiles/data.json'

/** 卫星栅格数据源 key（与 config.json data.satellite / satellite.mbtiles 对齐） */
export const SATELLITE_SOURCE_KEY = 'satellite'

/** 栅格格式集合（离线卫星影像） */
const RASTER_FORMATS = new Set(['png', 'jpg', 'jpeg', 'webp'])

/**
 * 将 /data.json 响应（数组或对象）归一化为 [id, info] 迭代项。
 *
 * tileserver-gl v5 的 /data.json 返回数组（每项含 id 字段）；旧版/部分实现返回
 * 对象（key 即 id）。两种形态统一处理，保证调用方只关心 id。
 */
function normalizeSourceEntries(
  payload: unknown,
): Array<{ id: string; info: DataSourceInfo }> {
  if (Array.isArray(payload)) {
    return payload
      .filter((x): x is DataSourceInfo => !!x && typeof x === 'object')
      .map((info) => ({ id: String(info.id ?? ''), info }))
      .filter((e) => e.id)
  }
  if (payload && typeof payload === 'object') {
    return Object.entries(payload as Record<string, DataSourceInfo>)
      .filter(([, info]) => !!info && typeof info === 'object')
      .map(([id, info]) => ({ id, info }))
  }
  return []
}

/** 校验 /data.json 响应是否为合法结构（对象数组 或 对象映射） */
function isValidSourcesPayload(payload: unknown): boolean {
  if (Array.isArray(payload)) {
    return payload.every((x) => !!x && typeof x === 'object')
  }
  return !!payload && typeof payload === 'object' && !Array.isArray(payload)
}

/**
 * 解析 /data.json 响应，返回矢量(pbf)数据源 id 集合。
 *
 * format 缺失时保守地视为矢量（兼容旧版 tileserver 不返回 format 的情况）；
 * 栅格格式（png/jpg/webp，离线卫星影像）不计入。
 */
export function parseVectorSources(payload: DataSourcesPayload): Set<string> {
  const keys = new Set<string>()
  for (const { id, info } of normalizeSourceEntries(payload)) {
    const fmt = (info?.format ?? '').toLowerCase()
    if (!fmt || fmt === 'pbf') {
      keys.add(id)
    }
  }
  return keys
}

/**
 * 解析 /data.json 响应，返回栅格(png/jpg/webp)数据源 id 集合。
 *
 * 用于卫星影像底图（satellite mbtiles）的可用性探测。
 */
export function parseRasterSources(payload: DataSourcesPayload): Set<string> {
  const keys = new Set<string>()
  for (const { id, info } of normalizeSourceEntries(payload)) {
    const fmt = (info?.format ?? '').toLowerCase()
    if (RASTER_FORMATS.has(fmt)) {
      keys.add(id)
    }
  }
  return keys
}

/**
 * 拉取 tileserver-gl 可用矢量数据源 id 集合。
 *
 * @returns 成功返回 Set；tileserver 不可达 / 响应异常时返回 null（调用方据此
 *          展示「无法检测」提示，并禁用矢量城市下载）。
 */
export async function fetchAvailableVectorSources(): Promise<Set<string> | null> {
  try {
    const resp = await fetch(DATA_JSON_URL, { cache: 'no-store' })
    if (!resp.ok) return null
    const payload = await resp.json()
    if (!isValidSourcesPayload(payload)) return null
    return parseVectorSources(payload)
  } catch {
    return null
  }
}

/**
 * 拉取 tileserver-gl 可用栅格数据源 id 集合（卫星影像等）。
 *
 * @returns 成功返回 Set；tileserver 不可达 / 响应异常时返回 null。
 */
export async function fetchAvailableRasterSources(): Promise<Set<string> | null> {
  try {
    const resp = await fetch(DATA_JSON_URL, { cache: 'no-store' })
    if (!resp.ok) return null
    const payload = await resp.json()
    if (!isValidSourcesPayload(payload)) return null
    return parseRasterSources(payload)
  } catch {
    return null
  }
}

/**
 * 判定某个底图类型是否需要本地数据源。
 *
 * 矢量暗色与卫星影像均严格本地化（依赖本地 mbtiles），统一返回 true——
 * 运行时不再有任何在线回源。
 */
export function basemapNeedsLocalSource(basemap: Basemap): boolean {
  void basemap
  return true
}
