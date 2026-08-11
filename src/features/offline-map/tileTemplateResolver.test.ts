import { describe, it, expect } from 'vitest'
import { buildLocalVectorTemplate } from './tileTemplateResolver'

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
