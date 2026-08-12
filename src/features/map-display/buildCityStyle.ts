/**
 * buildCityStyle —— 城市矢量源改写器（地图资源切换核心）。
 *
 * 原理：tileserver-gl 按 config.json 的 data 段 key 暴露 TileJSON endpoint
 * （/data/{key}.json），style.json 的矢量 source 通过 url 指向它。城市切换只需
 * 把矢量 source 的 url 重定向到目标城市，layer 的 "source" 引用（source key 名）
 * 保持不变——source 名字不换，只是它指向的数据换了。
 *
 * 卫星栅格源（本地 satellite.mbtiles + gcs-cache 离线缓存）不受影响：城市切换只换矢量叠加层（道路/水系/POI）。
 *
 * 与 tileTemplateResolver / tileSourceAvailability 共用同一套 /data/{key}.json 约定；
 * url 形如 tileserver-gl 的绝对 origin，经 MapLibre transformRequest 重写为同源
 * 代理路径（/tiles/data/{key}.json），故本模块无需自行处理 origin 重写。
 */
import type { StyleSpecification } from 'maplibre-gl'
import { TILESERVER_ORIGIN } from '../../config/mapLibre'

/** 矢量 source 的可变结构（便于直接赋值 url / 删除 tiles） */
type MutableVectorSource = {
  type?: string
  url?: string
  tiles?: unknown
}

/** 构造目标城市的 TileJSON 绝对 URL（经 transformRequest 重写为同源代理路径） */
export function cityTileJsonUrl(cityKey: string): string {
  return `${TILESERVER_ORIGIN}/data/${cityKey}.json`
}

/**
 * 把 style spec 中所有矢量 source 的 url 重写为目标城市（纯函数）。
 *
 * 处理规则：
 * - type === 'vector' 的 source：url 设为目标城市 TileJSON，并移除残留的 tiles（以 url 为准）；
 * - 其余 source（raster 栅格 / 卫星影像代理源）原样保留。
 *
 * 深拷贝入参，不修改原始 spec，便于单测与多次复用。
 *
 * @returns 改写后的新 StyleSpecification（与入参不共享引用）
 */
export function applyCityToVectorSources(
  spec: StyleSpecification,
  cityKey: string,
): StyleSpecification {
  // 纯 JSON 结构，安全深拷贝（避免 structuredClone 的运行时兼容差异）
  const clone = JSON.parse(JSON.stringify(spec)) as StyleSpecification
  const targetUrl = cityTileJsonUrl(cityKey)
  const sources = clone.sources
  if (sources) {
    for (const source of Object.values(sources)) {
      if (source && source.type === 'vector') {
        const v = source as MutableVectorSource
        v.url = targetUrl
        delete v.tiles
      }
    }
  }
  return clone
}

/**
 * 拉取底图 style.json 并改写为指定城市的矢量源。
 *
 * @param baseStyleUrl 底图样式 URL（如 /tiles/styles/dark/style.json，同源代理路径）
 * @param cityKey 目标城市数据源 key（如 nanjing，需已在 tileserver-gl config.json 注册）
 * @throws style.json 拉取失败时抛错（由调用方捕获并提示用户）
 */
export async function buildCityStyle(
  baseStyleUrl: string,
  cityKey: string,
): Promise<StyleSpecification> {
  const resp = await fetch(baseStyleUrl)
  if (!resp.ok) {
    throw new Error(`style.json 加载失败：HTTP ${resp.status}`)
  }
  const spec = (await resp.json()) as StyleSpecification
  return applyCityToVectorSources(spec, cityKey)
}
