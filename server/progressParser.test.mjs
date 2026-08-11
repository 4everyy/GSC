// progressParser 单元测试 —— 验证 prepare-data.ps1 stdout 的里程碑进度解析。
//
// 这套测试覆盖后端核心纯函数：把 PowerShell 脚本的结构化输出行
// 映射为阶段化百分比，是前端进度条的数据来源。

import { describe, it, expect } from 'vitest'
import { parseLine } from './progressParser.mjs'

describe('progressParser.parseLine', () => {
  it('空行 / null / 纯空白返回 null', () => {
    expect(parseLine('')).toBeNull()
    expect(parseLine(null)).toBeNull()
    expect(parseLine('   ')).toBeNull()
  })

  it('识别 [OK]/[ERROR]/[WARN]/[INFO] 前缀为语义级别', () => {
    expect(parseLine('[OK] done').level).toBe('ok')
    expect(parseLine('[ERROR] fail').level).toBe('error')
    expect(parseLine('[WARN] hmm').level).toBe('warn')
    expect(parseLine('[INFO] hi').level).toBe('info')
  })

  it('里程碑关键字映射到阶段化百分比', () => {
    const wsl = parseLine('========== Pre-check: WSL and tools ==========')
    expect(wsl.percent).toBe(3)
    expect(wsl.stage).toMatch(/WSL/)

    expect(parseLine('========== Step 1: Download China OSM PBF ==========').percent).toBe(8)

    expect(parseLine('========== City: 苏州 (suzhou) bbox=... ==========').percent).toBe(18)

    const osmium = parseLine('[INFO] osmium extract (苏州)...')
    expect(osmium.percent).toBe(26)

    const tilemaker = parseLine('[INFO] tilemaker 生成 suzhou 瓦片（可能需 5-15 分钟）...')
    expect(tilemaker.percent).toBe(42)
    expect(tilemaker.stage).toMatch(/tilemaker/)

    expect(parseLine('========== Step 4: Update config.json + dark style ==========').percent).toBe(88)
    expect(parseLine('========== DONE ==========').percent).toBe(95)
  })

  it('显式 [PROGRESS] percent|msg 行优先级最高', () => {
    const p = parseLine('[PROGRESS] 73 | 正在写入 zoom 12')
    expect(p.percent).toBe(73)
    expect(p.stage).toBe('正在写入 zoom 12')
    expect(p.level).toBe('progress')
  })

  it('普通日志行不附带 percent', () => {
    const line = parseLine('[INFO] some random message')
    expect(line.percent).toBeUndefined()
    expect(line.message).toBe('[INFO] some random message')
  })

  it('百分比超过 100 时钳制到 100', () => {
    expect(parseLine('[PROGRESS] 150 | overflow').percent).toBe(100)
    expect(parseLine('[PROGRESS] 999 | big').percent).toBe(100)
  })
})
