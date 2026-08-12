import { describe, it, expect } from 'vitest'
import type { StyleSpecification } from 'maplibre-gl'
import { applyCityToVectorSources, cityTileJsonUrl } from './buildCityStyle'
import { TILESERVER_ORIGIN } from '../../config/mapLibre'

/** 构造类似卫星 style 的 spec：含 raster(卫星影像) + vector(城市) 两个 source */
function makeSatelliteLikeSpec(): StyleSpecification {
  return {
    version: 8,
    name: 'test',
    sources: {
      satellite: {
        type: 'raster',
        tiles: ['https://example.com/{z}/{x}/{y}.png'],
        tileSize: 256,
      },
      suzhou: {
        type: 'vector',
        url: 'mbtiles://suzhou.mbtiles',
      },
    },
    layers: [
      { id: 'bg', type: 'raster', source: 'satellite' },
      { id: 'water', type: 'fill', source: 'suzhou', 'source-layer': 'water' },
    ],
    glyphs: '{fontstack}/{range}.pbf',
  } as unknown as StyleSpecification
}

describe('cityTileJsonUrl', () => {
  it('按城市 key 拼接 tileserver-gl TileJSON endpoint', () => {
    expect(cityTileJsonUrl('nanjing')).toBe(`${TILESERVER_ORIGIN}/data/nanjing.json`)
  })
})

describe('applyCityToVectorSources', () => {
  it('把矢量 source 的 url 改写为目标城市 TileJSON', () => {
    const out = applyCityToVectorSources(makeSatelliteLikeSpec(), 'nanjing')
    expect((out.sources.suzhou as { url?: string }).url).toBe(
      `${TILESERVER_ORIGIN}/data/nanjing.json`,
    )
  })

  it('栅格源（卫星影像）保持不变', () => {
    const out = applyCityToVectorSources(makeSatelliteLikeSpec(), 'nanjing')
    const sat = out.sources.satellite as { tiles?: string[]; url?: string }
    expect(sat.tiles).toEqual(['https://example.com/{z}/{x}/{y}.png'])
    expect(sat.url).toBeUndefined()
  })

  it('layer 的 source 引用保持不变（source key 名不换）', () => {
    const out = applyCityToVectorSources(makeSatelliteLikeSpec(), 'nanjing')
    expect((out.layers[1] as { source: string }).source).toBe('suzhou')
  })

  it('不修改原始 spec（深拷贝）', () => {
    const spec = makeSatelliteLikeSpec()
    applyCityToVectorSources(spec, 'nanjing')
    expect((spec.sources.suzhou as { url?: string }).url).toBe('mbtiles://suzhou.mbtiles')
  })

  it('移除矢量 source 残留的 tiles 字段，以 url 为准', () => {
    const spec = {
      version: 8,
      sources: {
        v: { type: 'vector', tiles: ['/old/{z}/{x}/{y}.pbf'], url: 'mbtiles://x.mbtiles' },
      },
      layers: [],
    } as unknown as StyleSpecification
    const out = applyCityToVectorSources(spec, 'shanghai')
    const v = out.sources.v as { tiles?: unknown; url?: string }
    expect(v.tiles).toBeUndefined()
    expect(v.url).toBe(`${TILESERVER_ORIGIN}/data/shanghai.json`)
  })
})
