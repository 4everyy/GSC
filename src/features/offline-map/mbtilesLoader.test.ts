/**
 * mbtilesLoader 单元测试 —— 验证纯解析函数（slugify / parseBounds / parseCenter）。
 *
 * importMbtiles 依赖 sql.js + IndexedDB，不在此测试（需集成环境）。
 */
import { describe, it, expect } from 'vitest'
import { slugifyPackageId, parseBounds, parseCenter } from './mbtilesLoader'

describe('slugifyPackageId', () => {
  it('去除 .mbtiles 扩展名并小写', () => {
    expect(slugifyPackageId('suzhou.mbtiles')).toBe('suzhou')
  })

  it('把空格/特殊字符转为连字符', () => {
    expect(slugifyPackageId('My Package.mbtiles')).toBe('my-package')
  })

  it('多个连续特殊字符合并为单个连字符并去首尾', () => {
    expect(slugifyPackageId('  A -- B.mbtiles  ')).toBe('a-b')
  })

  it('纯符号文件名回退到默认 id', () => {
    expect(slugifyPackageId('!!!.mbtiles')).toBe('offline-package')
  })
})

describe('parseBounds', () => {
  it('解析标准 "west,south,east,north" 字符串', () => {
    expect(parseBounds('120.1,31.1,120.8,31.6')).toEqual({
      west: 120.1,
      south: 31.1,
      east: 120.8,
      north: 31.6,
    })
  })

  it('容忍空格', () => {
    expect(parseBounds(' 1 , 2 , 3 , 4 ')).toEqual({
      west: 1,
      south: 2,
      east: 3,
      north: 4,
    })
  })

  it('段数不足时抛错', () => {
    expect(() => parseBounds('1,2,3')).toThrow(/非法/)
  })

  it('非数字时抛错', () => {
    expect(() => parseBounds('a,b,c,d')).toThrow(/非法/)
  })
})

describe('parseCenter', () => {
  it('解析 "lng,lat,zoom"', () => {
    expect(parseCenter('120.5,31.3,12')).toEqual({ lng: 120.5, lat: 31.3, zoom: 12 })
  })

  it('zoom 缺省时 zoom 为 undefined', () => {
    expect(parseCenter('120.5,31.3')).toEqual({ lng: 120.5, lat: 31.3, zoom: undefined })
  })

  it('段数不足时抛错', () => {
    expect(() => parseCenter('120.5')).toThrow(/非法/)
  })
})
