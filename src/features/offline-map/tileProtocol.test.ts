/**
 * tileProtocol 单元测试 —— 验证 gcs-pkg:// URL 解析。
 *
 * 注意：registerTileProtocol 依赖 maplibregl.addProtocol + IndexedDB，
 * 不在此测试（需集成环境）；仅测纯函数 parseTileUrl。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// 严格离线不变式测试：mock 掉 IndexedDB 层，断言协议处理器「未命中不回源、不在线兜底」。
vi.mock('./indexedDb', () => ({
  getTile: vi.fn(),
}))

import {
  parseTileUrl,
  GCS_PKG_PROTOCOL,
  handleGcsPkgRequest,
} from './tileProtocol'
import { getTile } from './indexedDb'

const mockedGetTile = vi.mocked(getTile)

describe('parseTileUrl', () => {
  it('解析标准 gcs-pkg:// URL', () => {
    const result = parseTileUrl(`gcs-pkg://suzhou/12/3456/7890`)
    expect(result).toEqual({ pkgId: 'suzhou', z: 12, x: 3456, y: 7890 })
  })

  it('去除查询串与 hash', () => {
    const result = parseTileUrl(`gcs-pkg://shanghai/8/100/200?token=abc#frag`)
    expect(result).toEqual({ pkgId: 'shanghai', z: 8, x: 100, y: 200 })
  })

  it('合法化不带协议前缀的 URL（防御性）', () => {
    const result = parseTileUrl('beijing/0/0/0')
    expect(result).toEqual({ pkgId: 'beijing', z: 0, x: 0, y: 0 })
  })

  it('段数不足时抛错', () => {
    expect(() => parseTileUrl('gcs-pkg://only-pkg/12')).toThrow(/非法/)
  })

  it('坐标非数字时抛错', () => {
    expect(() => parseTileUrl('gcs-pkg://pkg/abc/1/2')).toThrow(/非法/)
  })

  it('协议名常量正确', () => {
    expect(GCS_PKG_PROTOCOL).toBe('gcs-pkg')
  })
})

describe('handleGcsPkgRequest（严格离线核心：无在线兜底）', () => {
  beforeEach(() => {
    mockedGetTile.mockReset()
  })

  it('命中 IndexedDB → 返回瓦片数据（零网络）', async () => {
    const buf = new ArrayBuffer(16)
    mockedGetTile.mockResolvedValue({ data: buf } as never)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const result = await handleGcsPkgRequest({ url: 'gcs-pkg://suzhou/12/3456/7890' })

    expect(result.data).toBe(buf)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('未命中 → reject（MapLibre 渲染灰块），绝不回源网络', async () => {
    mockedGetTile.mockResolvedValue(undefined)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(
      handleGcsPkgRequest({ url: 'gcs-pkg://suzhou/12/3456/7890' }),
    ).rejects.toThrow(/严格离线不回源/)

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('navigator.onLine === true 时未命中也不回源（无 Esri / 在线兜底）', async () => {
    // 严格离线：不论联网与否，缓存未命中一律灰显，绝不在线抓取。
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    mockedGetTile.mockResolvedValue(undefined)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(
      handleGcsPkgRequest({ url: 'gcs-pkg://suzhou/8/3/4' }),
    ).rejects.toThrow()

    expect(fetchSpy).not.toHaveBeenCalled()
    // 还原：删除实例遮蔽属性，恢复 jsdom 的原型 getter
    delete (navigator as { onLine?: boolean }).onLine
    fetchSpy.mockRestore()
  })
})
