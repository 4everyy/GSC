/**
 * offlineMapStore 单元测试 —— 验证严格离线同源 URL 构造（buildCityPackageUrl）。
 *
 * 不测 zustand action 本身（依赖 IndexedDB / sql.js，需集成环境）；
 * 仅锁定「城市离线包仅从同源静态目录加载、杜绝在线回源」这一不变式。
 */
import { describe, it, expect } from 'vitest'
import { buildCityPackageUrl } from './offlineMapStore'

describe('buildCityPackageUrl（严格离线同源约束）', () => {
  it('构造同源 /maps/{key}.mbtiles URL', () => {
    expect(buildCityPackageUrl('suzhou')).toBe('/maps/suzhou.mbtiles')
    expect(buildCityPackageUrl('shanghai')).toBe('/maps/shanghai.mbtiles')
  })

  it('仅小写字母/数字/连字符合法', () => {
    expect(buildCityPackageUrl('nan-jing1')).toBe('/maps/nan-jing1.mbtiles')
  })

  it('拒绝大写字母（防歧义 key）', () => {
    expect(() => buildCityPackageUrl('Suzhou')).toThrow(/非法/)
  })

  it('拒绝绝对地址 / 协议注入 / 路径穿越（杜绝在线回源）', () => {
    // 在线协议注入
    expect(() => buildCityPackageUrl('//evil.com/x')).toThrow(/非法/)
    expect(() => buildCityPackageUrl('https://esri.com/x')).toThrow(/非法/)
    // path traversal
    expect(() => buildCityPackageUrl('../secret')).toThrow(/非法/)
    // 空字符串
    expect(() => buildCityPackageUrl('')).toThrow(/非法/)
  })
})
