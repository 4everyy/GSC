/**
 * 城市坐标数据库 —— 按城市名选择下载区域，替代手填经纬度。
 *
 * 设计依据：docs/离线地图下载方案.md §3.2 Tab1「区域选择」易用性改进。
 *
 * 数据源：./cities.json —— 前端下拉框与 tileserver 数据准备脚本（prepare-data.ps1）
 * 共用同一份城市清单（单一数据源）。新增/修改城市只需编辑 cities.json，无需多处同步。
 *
 * 数据说明：
 * - bbox 为各市市域的近似外接矩形（WGS84），并非精确行政边界；
 * - key 为城市拼音标识，对应 tileserver-gl config.json 的 data 段 key 与 mbtiles 文件名前缀；
 * - 瓦片覆盖范围受限于本地 tileserver-gl 已注册的 mbtiles，DownloadTab 会按 key 探测
 *   /data.json 实时过滤可选城市。
 */
import citiesData from './cities.json'
import type { BBox } from './types'

/** 单个城市条目 */
export interface CityEntry {
  /** 数据源 key（拼音，对应 tileserver-gl 的 data 段 key / mbtiles 文件名前缀） */
  key: string
  /** 城市显示名 */
  name: string
  /** 市域近似边界框 */
  bbox: BBox
}

/** 城市分组（按地理大区，便于下拉框 optgroup 展示） */
export interface CityRegion {
  /** 分组显示名 */
  label: string
  /** 该分组下的城市 */
  cities: CityEntry[]
}

/** cities.json 原始条目形状 */
interface RawCity {
  key: string
  name: string
  group: string
  bbox: { west: number; east: number; south: number; north: number }
}

const RAW = citiesData as unknown as RawCity[]

/** 按首次出现顺序建立分组，保证下拉框顺序稳定 */
const GROUP_ORDER: string[] = []
const GROUP_MAP = new Map<string, CityEntry[]>()
for (const r of RAW) {
  const entry: CityEntry = { key: r.key, name: r.name, bbox: { ...r.bbox } }
  if (!GROUP_MAP.has(r.group)) {
    GROUP_ORDER.push(r.group)
    GROUP_MAP.set(r.group, [])
  }
  GROUP_MAP.get(r.group)!.push(entry)
}

/** 全国主要城市坐标数据库（按地理大区分组，直辖市 + 省会 + 计划单列市 + 江苏/浙江全域） */
export const CITY_DATABASE: CityRegion[] = GROUP_ORDER.map((label) => ({
  label,
  cities: GROUP_MAP.get(label)!,
}))

/** 扁平城市清单（便于按 key/name 查找） */
const FLAT: CityEntry[] = RAW.map((r) => ({
  key: r.key,
  name: r.name,
  bbox: { ...r.bbox },
}))

/**
 * 按城市名查找 bbox（O(城市数)，数据量小无需索引）。
 * 用于 DownloadTab 选择城市后填充下载区域边界。
 * @returns 找不到时返回 undefined（调用方回退为自定义经纬度）。
 */
export function findCityBbox(name: string): BBox | undefined {
  return FLAT.find((c) => c.name === name)?.bbox
}

/**
 * 按城市名查找数据源 key。
 * 用于构造矢量瓦片下载模板（/tiles/data/{key}/{z}/{x}/{y}.pbf）。
 */
export function findCityKey(name: string): string | undefined {
  return FLAT.find((c) => c.name === name)?.key
}

/**
 * 按数据源 key 反查城市显示名。
 * 用于城市数据准备流程展示中文城市名（MapDisplayTab 触发生成 / 进度完成提示）。
 * @returns 找不到时返回 undefined（调用方回退为 key 本身）。
 */
export function findCityName(key: string): string | undefined {
  return FLAT.find((c) => c.key === key)?.name
}
