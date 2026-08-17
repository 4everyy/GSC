/**
 * networkGuard 单元测试 —— 验证「严格离线引擎层强制」不变式。
 *
 * 覆盖：
 * - isOnlineResourceUrl：仅 http(s) 绝对地址被判定为在线（Esri / OSM / 任意 http(s)）；
 * - createOfflineTransformRequest：在线 URL 被重写到 gcs-block://，本地协议 / data: / 同源路径放行；
 * - handleGcsBlockRequest：被路由到守卫的请求一律 reject、零网络、与 navigator.onLine 无关。
 *
 * 说明：registerOfflineNetworkGuard 依赖 maplibregl.addProtocol（运行时副作用），不在此测试，
 * 与 tileProtocol.test.ts 不测 registerTileProtocol 的约定一致。
 */
import { describe, it, expect, vi } from 'vitest'

import {
  isOnlineResourceUrl,
  handleGcsBlockRequest,
  createOfflineTransformRequest,
  BLOCK_PROTOCOL,
} from './networkGuard'

describe('isOnlineResourceUrl', () => {
  it('拦截 Esri / OSM / 任意 http(s) 绝对地址', () => {
    expect(
      isOnlineResourceUrl(
        'https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/0/0/0',
      ),
    ).toBe(true)
    expect(isOnlineResourceUrl('http://tile.openstreetmap.org/0/0/0.png')).toBe(true)
    expect(isOnlineResourceUrl('https://a.b.com/x')).toBe(true)
    expect(isOnlineResourceUrl('http://192.168.1.100:8081/data/satellite/0/0/0.png')).toBe(true)
  })

  it('放行本地协议 / 内联数据 / 同源相对路径', () => {
    expect(isOnlineResourceUrl('gcs-pkg://suzhou/12/3456/7890')).toBe(false)
    expect(isOnlineResourceUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(false)
    expect(isOnlineResourceUrl('blob:https://example.com/abc-123')).toBe(false)
    expect(isOnlineResourceUrl('/maps/suzhou.mbtiles')).toBe(false)
    expect(isOnlineResourceUrl('gcs-block://blocked?src=x')).toBe(false)
  })

  it('协议名常量正确', () => {
    expect(BLOCK_PROTOCOL).toBe('gcs-block')
  })
})

describe('createOfflineTransformRequest（严格离线引擎层强制）', () => {
  const transform = createOfflineTransformRequest()

  it('把 Esri / OSM / 任意在线 URL 重写到 gcs-block://（保留原地址可追溯）', () => {
    const esri =
      'https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/1/2/3'
    const out = transform(esri)
    expect(out?.url.startsWith('gcs-block://')).toBe(true)
    expect(decodeURIComponent(out!.url.split('src=')[1])).toBe(esri)

    const osm = 'http://tile.openstreetmap.org/12/2048/1364.png'
    expect(transform(osm)?.url.startsWith('gcs-block://')).toBe(true)
  })

  it('放行 gcs-pkg:// / data: / blob: / 同源相对路径（原样返回）', () => {
    expect(transform('gcs-pkg://suzhou/12/3456/7890')?.url).toBe('gcs-pkg://suzhou/12/3456/7890')
    expect(transform('data:image/png;base64,iVBORw0KGgo=')?.url).toBe(
      'data:image/png;base64,iVBORw0KGgo=',
    )
    expect(transform('blob:https://example.com/abc')?.url).toBe('blob:https://example.com/abc')
    expect(transform('/maps/suzhou.mbtiles')?.url).toBe('/maps/suzhou.mbtiles')
  })
})

describe('handleGcsBlockRequest（守卫协议：零网络、一律拒绝）', () => {
  it('被路由到 gcs-block 的请求一律 reject，绝不回源网络', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(
      handleGcsBlockRequest({ url: 'gcs-block://blocked?src=https://esri.com/x' }),
    ).rejects.toThrow(/严格离线守卫拦截在线请求/)

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('navigator.onLine === true 时仍拒绝（强制与联网状态无关，无在线兜底）', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(
      handleGcsBlockRequest({ url: 'gcs-block://blocked?src=https://osm.org/y' }),
    ).rejects.toThrow()

    expect(fetchSpy).not.toHaveBeenCalled()
    // 还原：删除实例遮蔽属性，恢复 jsdom 原型 getter
    delete (navigator as { onLine?: boolean }).onLine
    fetchSpy.mockRestore()
  })
})
