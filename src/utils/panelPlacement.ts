/**
 * panelPlacement —— hover 面板边缘自适应定位工具。
 *
 * 问题背景：
 * 飞机图标 / 巡检区域 / 禁飞区等元素可拖动或固定在视口任意位置，
 * 其 hover 信息面板默认向「右侧 + 上方」展开。当宿主元素靠近视口右/上/下边缘时，
 * 面板会溢出可视区域导致内容被裁剪、显示不全。
 *
 * 解决方案：
 * 根据宿主元素在视口中的百分比位置（0-100），判定面板应朝哪个方向展开更安全，
 * 返回一组方向修饰类名（如 `panel-right` / `panel-left`、`panel-up` / `panel-down`），
 * 由 CSS 据此翻转面板的 left/right 与 top/bottom 定位，保证面板始终完整可见。
 *
 * 设计要点：
 * - 输入仅依赖百分比位置，与拖拽 hook 的坐标系一致，无需 DOM 测量，实时性高；
 * - 阈值可配置，默认基于现有面板尺寸（宽约 203-229px、高约 69-117px）
 *   在常见 1280-1920 视口下换算为百分比的安全边距；
 * - 对不同面板类型（窄/宽、矮/高）提供阈值覆盖，避免一刀切。
 */

export interface PanelThreshold {
  /** 右侧空间不足该百分比时，面板改为向左展开 */
  rightEdge: number
  /** 左侧空间不足该百分比时，面板改为向右展开（兜底，通常不会触发） */
  leftEdge: number
  /** 下方空间不足该百分比时，面板改为向上展开 */
  bottomEdge: number
  /** 上方空间不足该百分比时，面板改为向下展开 */
  topEdge: number
}

export const DEFAULT_PANEL_THRESHOLD: PanelThreshold = {
  // 面板宽度约 203-229px，在 1280px 视口约占 16-18%；留 4% 余量
  rightEdge: 20,
  leftEdge: 8,
  // 面板高度约 69-117px，在 720px 视口约占 10-16%；留 4% 余量
  bottomEdge: 18,
  topEdge: 10,
}

export interface PanelPlacement {
  /** 水平方向：面板向右展开（默认）还是向左 */
  horizontal: 'right' | 'left'
  /** 垂直方向：面板向上展开（默认）还是向下 */
  vertical: 'up' | 'down'
}

/**
 * 根据宿主元素的百分比位置，计算 hover 面板的安全展开方向。
 *
 * @param x 宿主元素水平百分比位置（0-100）
 * @param y 宿主元素垂直百分比位置（0-100）
 * @param threshold 判定阈值，可按面板尺寸覆盖
 * @returns 面板应采用的展开方向
 */
export function computePanelPlacement(
  x: number,
  y: number,
  threshold: PanelThreshold = DEFAULT_PANEL_THRESHOLD,
): PanelPlacement {
  return {
    horizontal: x > 100 - threshold.rightEdge ? 'left' : 'right',
    vertical: y < threshold.topEdge ? 'down' : 'up',
  }
}

/**
 * 将展开方向转换为 CSS 修饰类名数组，便于附加到宿主元素 className。
 *
 * 约定：
 * - 默认（无修饰类）= 向右 + 向上
 * - `panel-left` = 向左展开（覆盖默认向右）
 * - `panel-down` = 向下展开（覆盖默认向上）
 *
 * @param placement 展开方向
 * @returns 修饰类名数组
 */
export function placementToClasses(placement: PanelPlacement): string[] {
  const classes: string[] = []
  if (placement.horizontal === 'left') classes.push('panel-left')
  if (placement.vertical === 'down') classes.push('panel-down')
  return classes
}