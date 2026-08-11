/**
 * 通用格式化工具（离线地图模块内部使用）。
 */

/**
 * 字节数 → 人类可读字符串（KB/MB/GB）。
 *
 * @param bytes 字节数
 * @param fractionDigits 小数位数（默认 1）
 */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!bytes || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : fractionDigits)} ${units[unit]}`
}

/** 千分位格式化数字 */
export function formatNumber(n: number): string {
  return n.toLocaleString('zh-CN')
}

/** 时间戳 → 简短日期时间 */
export function formatTime(ts: number): string {
  if (!ts) return '-'
  const d = new Date(ts)
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
