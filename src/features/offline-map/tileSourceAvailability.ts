/**
 * tileserver-gl 可用数据源探测 —— 下载城市下拉框按真实可用性过滤。
 *
 * 设计依据：docs/离线地图下载方案.md §3.2 + docs/离线部署指南.md「更换区域数据」。
 *
 * 原理：tileserver-gl 启动时根据 config.json 的 data 段注册 mbtiles 数据源，
 * 并在 /data.json 暴露所有已注册源（含 format: pbf/png）。DownloadTab 挂载时
 * 拉取此清单，据此决定哪些城市可选（已准备数据）vs 灰显（未准备，回源会 404）。
 *
 * 仅用于「矢量暗色」底图（本地 mbtiles）；卫星影像走 /satellite-tiles 代理 + gcs-cache 离线缓存，无需探测本地源。
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

/** tileserver-gl /data.json 返回的源映射（key = 数据源 id） */
export type DataSourcesPayload = Record<string, DataSourceInfo>

/** 同源代理路径（与 vite.config.ts 的 server.proxy / MapLibreContainer transformRequest 对齐） */
const DATA_JSON_URL = '/tiles/data.json'

/**
 * 解析 /data.json 响应，返回矢量(pbf)数据源 id 集合。
 *
 * format 缺失时保守地视为矢量（兼容旧版 tileserver 不返回 format 的情况）；
 * 栅格格式（png/jpg/webp，离线卫星影像）不计入。
 */
export function parseVectorSources(payload: DataSourcesPayload): Set<string> {
  const keys = new Set<string>()
  for (const [id, info] of Object.entries(payload)) {
    const fmt = (info?.format ?? '').toLowerCase()
    if (!fmt || fmt === 'pbf') {
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
    const payload = (await resp.json()) as DataSourcesPayload
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null
    }
    return parseVectorSources(payload)
  } catch {
    return null
  }
}

/**
 * 判定某个底图类型是否需要本地数据源。
 *
 * 矢量暗色依赖本地 mbtiles（需探测）；卫星影像走 /satellite-tiles 代理 + 离线缓存（无需探测本地源）。
 */
export function basemapNeedsLocalSource(basemap: Basemap): boolean {
  return basemap !== 'satellite'
}
