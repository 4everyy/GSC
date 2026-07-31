/**
 * 航点视觉生成工具（视觉优化版）。
 *
 * 策略：航点用 BMapGL.Label 注入自定义 HTML（CSS 动画在 routeVisuals.css），
 * 保证在 BMapGL WebGL 模式下 100% 可见且支持酷炫动画。
 *
 * 视觉规则：
 * - 起点（index 0）：翠绿脉冲节点，文案"起"
 * - 终点（last）：警示红脉冲节点，文案"终"
 * - 中间点：青色霓虹节点，文案为序号
 */
import './routeVisuals.css'

/**
 * BMapGL Label 外层容器的样式重置。
 *
 * Label 默认带白色背景与边框（内置 inline style），CSS !important 无法覆盖
 * inline style，故需在创建 Label 后调用 `label.setStyle(LABEL_RESET_STYLE)`
 * 清除其默认盒模型，让内层 HTML 视觉生效。
 */
export const LABEL_RESET_STYLE: Record<string, string> = {
  background: 'transparent',
  border: 'none',
  padding: '0',
  boxShadow: 'none',
  color: 'inherit',
  fontSize: 'inherit',
  lineHeight: '1',
  whiteSpace: 'nowrap',
}

/** 航点角色分类 */
export type WaypointRole = 'start' | 'end' | 'mid'

/** 根据序号解析航点角色 */
export function resolveWaypointRole(index: number, total: number): WaypointRole {
  if (index === 0) return 'start'
  if (index === total - 1) return 'end'
  return 'mid'
}

/**
 * 解析航点应使用的展示文案：起点显示"起"，终点显示"终"，中间点显示序号。
 */
export function resolveWaypointLabel(index: number, total: number): string {
  if (index === 0) return '起'
  if (index === total - 1) return '终'
  return String(index + 1)
}

/**
 * 解析航点应使用的填充色（供面板/日志等 DOM 场景着色）。
 */
export function resolveWaypointColor(index: number, total: number, routeColor: string): string {
  if (index === 0) return '#2ee68a'
  if (index === total - 1) return '#ff5b5b'
  return routeColor
}

/**
 * 生成航点节点的完整 HTML（用于 BMapGL.Label 的 setContent）。
 *
 * 结构：`.rp-node[role] > .rp-node__pulse + .rp-node__core > 文案`
 * 视觉：渐变核心圆 + 脉冲扩散环（CSS 动画驱动）。
 *
 * @param index 当前航点序号（0 起）
 * @param total 航点总数
 * @returns 可注入 Label 的 HTML 字符串
 */
export function buildWaypointNodeHTML(index: number, total: number): string {
  const role = resolveWaypointRole(index, total)
  const text = resolveWaypointLabel(index, total)
  return (
    `<div class="rp-node rp-node--${role}">` +
    `<span class="rp-node__pulse"></span>` +
    `<span class="rp-node__core">${text}</span>` +
    `</div>`
  )
}

/**
 * 兼容旧接口：返回空样式字符串。
 * @deprecated 新代码请直接使用 {@link buildWaypointNodeHTML}，Label 的视觉由 HTML + CSS 负责。
 */
export function buildWaypointLabelStyle(
  _index: number,
  _total: number,
  _routeColor: string,
): string {
  return ''
}
