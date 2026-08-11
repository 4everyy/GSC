// 城市数据准备服务：进度解析器
//
// 解析 prepare-data.ps1 的 stdout 行，映射为阶段化进度。
// tilemaker 本身无标准进度输出，因此采用「里程碑」方式：
// 命中特定关键字即把进度推进到对应阶段。jobManager 维护单调递增的
// 最大进度，避免乱序输出导致进度回退。

/**
 * @typedef {Object} ParsedLine
 * @property {number} [percent]  建议进度（0-100），命中里程碑时存在
 * @property {string} [stage]    当前阶段中文名
 * @property {'info'|'ok'|'warn'|'error'|'progress'} level  语义级别
 * @property {string} message    去色后的原始行
 */

// 里程碑按脚本执行顺序排列；同一年内只取首次命中的最高位（由 jobManager 取 max）
const MILESTONES = [
  { re: /Pre-check:\s*WSL/i, percent: 3, stage: '检查运行环境（WSL / osmium / tilemaker）' },
  { re: /Step 1.*Download.*China/i, percent: 8, stage: '下载中国基础数据（首次约 1.5GB）' },
  { re: /City:\s*.+/i, percent: 18, stage: '开始处理城市区域' },
  { re: /osmium extract/i, percent: 26, stage: '裁剪城市边界（osmium）' },
  { re: /tilemaker/i, percent: 42, stage: '生成矢量瓦片（tilemaker，最耗时 5-15 分钟）' },
  { re: /Step 4.*Update config/i, percent: 88, stage: '注册数据源到瓦片服务配置' },
  { re: /\bDONE\b/i, percent: 95, stage: '数据生成完成，准备重启瓦片服务' },
]

/**
 * 解析单行 stdout。
 * @param {string} line
 * @returns {ParsedLine | null}
 */
export function parseLine(line) {
  if (!line) return null
  // 去除 ANSI/PowerShell 颜色码（脚本虽用 -ForegroundColor，但 -Command 输出通常无码，保险起见）
  const clean = String(line).replace(/\x1b\[[0-9;]*m/g, '').trim()
  if (!clean) return null

  let level = 'info'
  if (/^\[OK\]/i.test(clean)) level = 'ok'
  else if (/^\[ERROR\]/i.test(clean)) level = 'error'
  else if (/^\[WARN\]/i.test(clean)) level = 'warn'
  else if (/^\[INFO\]/i.test(clean)) level = 'info'

  // 显式进度行（未来脚本增强可输出 [PROGRESS] percent|msg，优先级最高）
  const m = /\[PROGRESS\]\s*(\d{1,3})\s*\|\s*(.+)/i.exec(clean)
  if (m) {
    return {
      percent: Math.max(0, Math.min(100, parseInt(m[1], 10))),
      stage: m[2].trim(),
      level: 'progress',
      message: clean,
    }
  }

  // 里程碑匹配
  for (const ms of MILESTONES) {
    if (ms.re.test(clean)) {
      return { percent: ms.percent, stage: ms.stage, level, message: clean }
    }
  }

  return { level, message: clean }
}
