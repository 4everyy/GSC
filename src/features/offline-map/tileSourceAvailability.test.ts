import { describe, it, expect, vi } from 'vitest'
import {
  SATELLITE_SOURCE_KEY,
  parseVectorSources,
  parseRasterSources,
  fetchAvailableVectorSources,
  fetchAvailableRasterSources,
  basemapNeedsLocalSource,
} from './tileSourceAvailability'

describe('parseVectorSources', () => {
  it('对象形态：仅收集 pbf / 缺失 format 的源，排除栅格格式', () => {
    const keys = parseVectorSources({
      suzhou: { format: 'pbf', id: 'suzhou' },
      beijing: { format: 'pbf' },
      satellite: { format: 'png' },
      photo: { format: 'jpg' },
      legacy: {},
    })
    expect(keys.has('suzhou')).toBe(true)
    expect(keys.has('beijing')).toBe(true)
    expect(keys.has('legacy')).toBe(true)
    expect(keys.has('satellite')).toBe(false)
    expect(keys.has('photo')).toBe(false)
    expect(keys.size).toBe(3)
  })

  it('数组形态（tileserver v5+）：按 id 字段收集矢量源', () => {
    const keys = parseVectorSources([
      { id: 'suzhou', format: 'pbf', name: '苏州' },
      { id: 'satellite', format: 'png', name: '卫星影像' },
      { id: 'beijing', format: 'pbf' },
      { id: 'legacy' },
    ])
    expect(keys.has('suzhou')).toBe(true)
    expect(keys.has('beijing')).toBe(true)
    expect(keys.has('legacy')).toBe(true)
    expect(keys.has('satellite')).toBe(false)
    expect(keys.size).toBe(3)
  })

  it('空对象返回空集合', () => {
    expect(parseVectorSources({}).size).toBe(0)
  })
})

describe('parseRasterSources', () => {
  it('对象形态：收集 png/jpg/webp 栅格源，排除 pbf/无格式', () => {
    const keys = parseRasterSources({
      suzhou: { format: 'pbf' },
      satellite: { format: 'png', id: 'satellite' },
      photo: { format: 'jpg' },
      webp: { format: 'webp' },
      legacy: {},
    })
    expect(keys.has('satellite')).toBe(true)
    expect(keys.has('photo')).toBe(true)
    expect(keys.has('webp')).toBe(true)
    expect(keys.has('suzhou')).toBe(false)
    expect(keys.has('legacy')).toBe(false)
    expect(keys.size).toBe(3)
  })

  it('数组形态：按 id 字段收集栅格源', () => {
    const keys = parseRasterSources([
      { id: 'suzhou', format: 'pbf' },
      { id: 'satellite', format: 'png' },
    ])
    expect(keys.has('satellite')).toBe(true)
    expect(keys.has('suzhou')).toBe(false)
    expect(keys.size).toBe(1)
  })
})

describe('fetchAvailableVectorSources', () => {
  it('tileserver 返回 200 时返回矢量源集合', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ suzhou: { format: 'pbf' }, beijing: {} }),
      })),
    )
    const v = await fetchAvailableVectorSources()
    expect(v).not.toBeNull()
    expect(v!.has('suzhou')).toBe(true)
    expect(v!.has('beijing')).toBe(true)
    vi.unstubAllGlobals()
  })

  it('数组形态响应也能正确解析', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [{ id: 'suzhou', format: 'pbf' }],
      })),
    )
    const v = await fetchAvailableVectorSources()
    expect(v).not.toBeNull()
    expect(v!.has('suzhou')).toBe(true)
    vi.unstubAllGlobals()
  })

  it('HTTP 非 2xx 时返回 null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })))
    expect(await fetchAvailableVectorSources()).toBeNull()
    vi.unstubAllGlobals()
  })

  it('网络异常时返回 null（不抛错）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network')
      }),
    )
    expect(await fetchAvailableVectorSources()).toBeNull()
    vi.unstubAllGlobals()
  })

  it('响应非合法结构（含非对象元素的数组）时返回 null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => [1, 2, 3] })),
    )
    expect(await fetchAvailableVectorSources()).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('fetchAvailableRasterSources', () => {
  it('tileserver 返回 200 时返回栅格源集合', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { id: 'suzhou', format: 'pbf' },
          { id: 'satellite', format: 'png' },
        ],
      })),
    )
    const r = await fetchAvailableRasterSources()
    expect(r).not.toBeNull()
    expect(r!.has(SATELLITE_SOURCE_KEY)).toBe(true)
    expect(r!.has('suzhou')).toBe(false)
    vi.unstubAllGlobals()
  })

  it('HTTP 非 2xx 时返回 null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })))
    expect(await fetchAvailableRasterSources()).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('basemapNeedsLocalSource', () => {
  it('矢量暗色与卫星影像均依赖本地源（严格离线）', () => {
    expect(basemapNeedsLocalSource('dark')).toBe(true)
    expect(basemapNeedsLocalSource('satellite')).toBe(true)
  })
})
