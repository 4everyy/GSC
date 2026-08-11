import { describe, it, expect, vi } from 'vitest'
import {
  parseVectorSources,
  fetchAvailableVectorSources,
  basemapNeedsLocalSource,
} from './tileSourceAvailability'

describe('parseVectorSources', () => {
  it('仅收集 pbf / 缺失 format 的源，排除栅格格式', () => {
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

  it('空对象返回空集合', () => {
    expect(parseVectorSources({}).size).toBe(0)
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

  it('响应非对象时返回 null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => [1, 2, 3] })),
    )
    expect(await fetchAvailableVectorSources()).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('basemapNeedsLocalSource', () => {
  it('矢量暗色依赖本地源，卫星不依赖', () => {
    expect(basemapNeedsLocalSource('dark')).toBe(true)
    expect(basemapNeedsLocalSource('satellite')).toBe(false)
  })
})
