import { describe, it, expect } from 'vitest'
import {
  buildLocalRasterTemplate,
  buildLocalVectorTemplate,
  fetchSourceCoverage,
  resolveRasterTemplateFromTileJson,
} from './tileTemplateResolver'

describe('buildLocalVectorTemplate', () => {
  it('按 source key 生成同源代理矢量模板', () => {
    expect(buildLocalVectorTemplate('suzhou')).toBe(
      '/tiles/data/suzhou/{z}/{x}/{y}.pbf',
    )
    expect(buildLocalVectorTemplate('beijing')).toBe(
      '/tiles/data/beijing/{z}/{x}/{y}.pbf',
    )
  })

  it('模板含 {z}/{x}/{y} 占位符（与 buildTileUrl 对齐）', () => {
    const t = buildLocalVectorTemplate('nanjing')
    expect(t).toContain('{z}')
    expect(t).toContain('{x}')
    expect(t).toContain('{y}')
  })
})

describe('buildLocalRasterTemplate', () => {
  it('按 source key 生成同源代理栅格影像模板', () => {
    expect(buildLocalRasterTemplate('satellite')).toBe(
      '/tiles/data/satellite/{z}/{x}/{y}.png',
    )
  })

  it('模板含 {z}/{x}/{y} 占位符且扩展名为 .png', () => {
    const t = buildLocalRasterTemplate('satellite')
    expect(t).toContain('{z}')
    expect(t).toContain('{x}')
    expect(t).toContain('{y}')
    expect(t.endsWith('.png')).toBe(true)
  })

  it('与矢量模板共享 /tiles/data 前缀（键空间一致）', () => {
    const raster = buildLocalRasterTemplate('satellite')
    const vector = buildLocalVectorTemplate('satellite')
    expect(raster.startsWith('/tiles/data/satellite/')).toBe(true)
    expect(vector.startsWith('/tiles/data/satellite/')).toBe(true)
    // 仅扩展名不同（.png vs .pbf）
    expect(raster.replace('.png', '.pbf')).toBe(vector)
  })
})

describe('resolveRasterTemplateFromTileJson', () => {
  it('jpg 格式 tilejson → 返回 .jpg 同源代理模板', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          tiles: ['http://localhost:8081/data/satellite/{z}/{x}/{y}.jpg'],
        }),
      })),
    )
    expect(await resolveRasterTemplateFromTileJson('satellite')).toBe(
      '/tiles/data/satellite/{z}/{x}/{y}.jpg',
    )
    vi.unstubAllGlobals()
  })

  it('png 格式 tilejson → 返回 .png 同源代理模板（向后兼容占位 mbtiles）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          tiles: ['http://localhost:8081/data/satellite/{z}/{x}/{y}.png'],
        }),
      })),
    )
    expect(await resolveRasterTemplateFromTileJson('satellite')).toBe(
      '/tiles/data/satellite/{z}/{x}/{y}.png',
    )
    vi.unstubAllGlobals()
  })

  it('tilejson 非 2xx → null（调用方回退静态模板）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })))
    expect(await resolveRasterTemplateFromTileJson('satellite')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('tilejson 无 tiles → null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
    )
    expect(await resolveRasterTemplateFromTileJson('satellite')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('网络异常 → null（不抛出）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network') }))
    expect(await resolveRasterTemplateFromTileJson('satellite')).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('fetchSourceCoverage', () => {
  it('tilejson 含 minzoom/maxzoom → 返回覆盖范围', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ minzoom: 10, maxzoom: 12 }),
      })),
    )
    expect(await fetchSourceCoverage('satellite')).toEqual({
      minzoom: 10,
      maxzoom: 12,
    })
    vi.unstubAllGlobals()
  })

  it('缺 minzoom/maxzoom → null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ tiles: [] }),
      })),
    )
    expect(await fetchSourceCoverage('satellite')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('minzoom/maxzoom 非有限数 → null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ minzoom: 'abc', maxzoom: 12 }),
      })),
    )
    expect(await fetchSourceCoverage('satellite')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('tilejson 非 2xx → null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })))
    expect(await fetchSourceCoverage('satellite')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('网络异常 → null（不抛出）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network') }))
    expect(await fetchSourceCoverage('satellite')).toBeNull()
    vi.unstubAllGlobals()
  })
})
