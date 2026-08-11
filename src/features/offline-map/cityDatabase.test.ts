import { describe, it, expect } from 'vitest'
import {
  CITY_DATABASE,
  findCityBbox,
  findCityKey,
  findCityName,
} from './cityDatabase'

describe('cityDatabase（从 cities.json 派生）', () => {
  it('每个城市条目含唯一 key 与合法 bbox', () => {
    const keys = new Set<string>()
    for (const group of CITY_DATABASE) {
      for (const c of group.cities) {
        expect(c.key, `城市 ${c.name} 缺少 key`).toBeTruthy()
        expect(keys.has(c.key), `key 重复：${c.key}`).toBe(false)
        keys.add(c.key)
        expect(c.bbox.west).toBeLessThan(c.bbox.east)
        expect(c.bbox.south).toBeLessThan(c.bbox.north)
      }
    }
    expect(keys.size).toBeGreaterThanOrEqual(50)
  })

  it('苏州作为城市条目存在（与本地预设同源 key）', () => {
    expect(findCityKey('苏州')).toBe('suzhou')
    expect(findCityBbox('苏州')).toBeDefined()
  })

  it('findCityBbox 按名称返回 bbox', () => {
    const bj = findCityBbox('北京')
    expect(bj).toBeDefined()
    expect(bj!.north).toBeGreaterThan(39)
    expect(findCityBbox('不存在')).toBeUndefined()
  })

  it('findCityKey 按名称返回数据源 key', () => {
    expect(findCityKey('北京')).toBe('beijing')
    expect(findCityKey('上海')).toBe('shanghai')
    expect(findCityKey('不存在')).toBeUndefined()
  })

  it('findCityName 按 key 反查城市显示名', () => {
    expect(findCityName('beijing')).toBe('北京')
    expect(findCityName('suzhou')).toBe('苏州')
    expect(findCityName('no-such-key')).toBeUndefined()
  })
})
