/**
 * 城市坐标数据库 —— 离线地图「按城市导入 / 切换」的城市目录。
 *
 * 数据源：./cities.json —— 前端城市选择与离线 MBTiles 包命名的单一数据源。
 * 新增 / 修改城市只需编辑 cities.json，无需多处同步。
 *
 * 数据说明：
 * - bbox 为各市市域的近似外接矩形（WGS84），并非精确行政边界；
 * - key 为城市拼音标识，约定为该城市 MBTiles 包的文件名前缀（如 suzhou.mbtiles → suzhou），
 *   供离线包导入与多包切换定位使用。
 */
import citiesData from './cities.json'

/**
 * 经纬度边界框（WGS84）。
 *
 * 离线地图包方案的公共类型：城市目录条目、MBTiles 包元数据均复用此结构。
 */
export interface BBox {
  /** 西经（最小经度） */
  west: number
  /** 东经（最大经度） */
  east: number
  /** 南纬（最小纬度） */
  south: number
  /** 北纬（最大纬度） */
  north: number
}

/** 单个城市条目 */
export interface CityEntry {
  /** 数据源 key（拼音，约定为该城市 MBTiles 包的文件名前缀，如 suzhou） */
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
 * 通用城市目录查询：返回该市市域近似边界框（WGS84）。
 * @returns 找不到时返回 undefined。
 */
export function findCityBbox(name: string): BBox | undefined {
  return FLAT.find((c) => c.name === name)?.bbox
}

/**
 * 按城市名查找数据源 key（拼音，约定为该城市 MBTiles 包文件名前缀）。
 * 通用城市目录查询。
 */
export function findCityKey(name: string): string | undefined {
  return FLAT.find((c) => c.name === name)?.key
}

/**
 * 按数据源 key 反查城市显示名。
 * 用于离线地图管理面板（城市切换）与 ensureCityPackage 的错误提示展示中文城市名。
 * @returns 找不到时返回 undefined（调用方回退为 key 本身）。
 */
export function findCityName(key: string): string | undefined {
  return FLAT.find((c) => c.key === key)?.name
}
