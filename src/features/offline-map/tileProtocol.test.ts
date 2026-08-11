import { describe, it, expect, vi } from 'vitest'

// ── Mock 依赖，避免加载真实 maplibre-gl（worker / WebGL）与 IndexedDB ──
vi.mock('maplibre-gl', () => ({
  addProtocol: vi.fn(),
}))
vi.mock('./tileCache', () => ({
  getTile: vi.fn(),
  putTile: vi.fn(),
}))

import { CACHE_PROTOCOL, matchTilePath, normalizeUrlToPath } from './tileProtocol'

// ===================== 协议常量 =====================

describe('CACHE_PROTOCOL', () => {
  it('协议名固定为 gcs-cache（与 transformRequest 重写前缀一致）', () => {
    expect(CACHE_PROTOCOL).toBe('gcs-cache')
  })
})

// ===================== matchTilePath：瓦片路径解析 =====================

describe('matchTilePath', () => {
  it('矢量瓦片 .pbf 解析出 sourceId 与坐标', () => {
    const m = matchTilePath('/tiles/data/suzhou/12/3456/7890.pbf')
    expect(m).not.toBeNull()
    expect(m!.sourceId).toBe('/tiles/data/suzhou')
    expect(m!.coord).toEqual({ z: 12, x: 3456, y: 7890 })
    expect(m!.ext).toBe('pbf')
  })

  it('栅格瓦片 .png 解析正确', () => {
    const m = matchTilePath('/tiles/satellite/10/100/200.png')
    expect(m!.sourceId).toBe('/tiles/satellite')
    expect(m!.coord).toEqual({ z: 10, x: 100, y: 200 })
    expect(m!.ext).toBe('png')
  })

  it('.jpg 扩展名归一化为 jpg', () => {
    expect(matchTilePath('/tiles/photo/5/1/2.jpg')!.ext).toBe('jpg')
  })

  it('.jpeg 扩展名归一化为 jpeg', () => {
    expect(matchTilePath('/tiles/photo/5/1/2.jpeg')!.ext).toBe('jpeg')
  })

  it('.webp 栅格格式匹配', () => {
    expect(matchTilePath('/tiles/photo/8/100/200.webp')!.ext).toBe('webp')
  })

  it('扩展名大小写不敏感', () => {
    const pbfUpper = matchTilePath('/tiles/data/v3/8/100/200.PBF')
    expect(pbfUpper).not.toBeNull()
    expect(pbfUpper!.ext).toBe('pbf')

    const pngUpper = matchTilePath('/tiles/sat/8/100/200.PNG')
    expect(pngUpper!.ext).toBe('png')
  })

  it('多段路径前缀正确提取（如 /tiles/data/v3）', () => {
    const m = matchTilePath('/tiles/data/v3/14/13000/6500.pbf')
    expect(m!.sourceId).toBe('/tiles/data/v3')
  })

  it('字体资源（无 z/x/y 数字段）返回 null', () => {
    // 字体路径形如 /tiles/fonts/{fontstack}/{range}.pbf
    expect(matchTilePath('/tiles/fonts/Noto Sans/0-255.pbf')).toBeNull()
    expect(matchTilePath('/tiles/fonts/Open Sans/0-255.pbf')).toBeNull()
  })

  it('sprite 资源（无数字段）返回 null，不被误判为瓦片', () => {
    expect(matchTilePath('/tiles/styles/dark/sprite.json')).toBeNull()
    expect(matchTilePath('/tiles/styles/dark/sprite.png')).toBeNull()
    expect(matchTilePath('/tiles/styles/dark/sprite@2x.json')).toBeNull()
    expect(matchTilePath('/tiles/styles/dark/sprite@2x.png')).toBeNull()
  })

  it('style.json 返回 null', () => {
    expect(matchTilePath('/tiles/styles/dark/style.json')).toBeNull()
  })

  it('根路径无前缀的瓦片也能匹配', () => {
    const m = matchTilePath('/data/suzhou/5/10/20.pbf')
    expect(m!.sourceId).toBe('/data/suzhou')
    expect(m!.coord).toEqual({ z: 5, x: 10, y: 20 })
  })
})

// ===================== normalizeUrlToPath：URL 归一化 =====================

describe('normalizeUrlToPath', () => {
  it('gcs-cache:// 协议头剥离为同源路径', () => {
    expect(normalizeUrlToPath('gcs-cache:///tiles/data/v3/12/3/4.pbf')).toBe(
      '/tiles/data/v3/12/3/4.pbf',
    )
  })

  it('已是同源相对路径则不变', () => {
    expect(normalizeUrlToPath('/tiles/data/v3/12/3/4.pbf')).toBe(
      '/tiles/data/v3/12/3/4.pbf',
    )
  })

  it('http(s):// 协议头被剥离', () => {
    const result = normalizeUrlToPath('https://example.com/tiles/data/v3/12/3/4.pbf')
    expect(result).toBe('/example.com/tiles/data/v3/12/3/4.pbf')
    expect(result.endsWith('/tiles/data/v3/12/3/4.pbf')).toBe(true)
  })

  it('归一化后的路径能被 matchTilePath 正确解析', () => {
    // 端到端：协议 URL → 归一化 → 瓦片匹配，保证键空间一致
    const path = normalizeUrlToPath('gcs-cache:///tiles/data/suzhou/10/855/418.pbf')
    const m = matchTilePath(path)
    expect(m).not.toBeNull()
    expect(m!.coord).toEqual({ z: 10, x: 855, y: 418 })
  })
})
