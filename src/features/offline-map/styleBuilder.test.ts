/**
 * styleBuilder 单元测试 —— 验证由 OfflinePackageMeta 派生的栅格样式结构。
 */
import { describe, it, expect } from 'vitest'
import { buildRasterStyle } from './styleBuilder'
import type { OfflinePackageMeta } from './types'

const META: OfflinePackageMeta = {
  id: 'suzhou',
  name: '苏州卫星影像',
  format: 'jpg',
  tileSize: 256,
  minZoom: 8,
  maxZoom: 16,
  bounds: { west: 120.1, south: 31.1, east: 120.8, north: 31.6 },
  center: { lng: 120.45, lat: 31.35 },
  tileCount: 1000,
  importedAt: 1700000000000,
}

describe('buildRasterStyle', () => {
  it('生成 version 8 样式，含 background + raster 两个图层', () => {
    const style = buildRasterStyle(META)
    expect(style.version).toBe(8)
    expect(style.layers).toHaveLength(2)
    expect(style.layers[0].type).toBe('background')
    expect(style.layers[1].type).toBe('raster')
  })

  it('raster source 指向 gcs-pkg:// 协议模板', () => {
    const style = buildRasterStyle(META)
    const source = style.sources[`gcs-pkg-${META.id}`]
    expect(source).toBeDefined()
    expect(source.type).toBe('raster')
    expect(source.tiles[0]).toBe(`gcs-pkg://${META.id}/{z}/{x}/{y}`)
  })

  it('source 的 bounds / minzoom / maxzoom 与元数据一致', () => {
    const style = buildRasterStyle(META)
    const source = style.sources[`gcs-pkg-${META.id}`] as { bounds: number[]; minzoom: number; maxzoom: number }
    expect(source.bounds).toEqual([120.1, 31.1, 120.8, 31.6])
    expect(source.minzoom).toBe(8)
    expect(source.maxzoom).toBe(16)
  })

  it('raster 图层引用正确的 source id', () => {
    const style = buildRasterStyle(META)
    const rasterLayer = style.layers[1]
    expect(rasterLayer.source).toBe(`gcs-pkg-${META.id}`)
  })
})
