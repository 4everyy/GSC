/**
 * HexagonAreaOverlay（六边形区域绘制遮罩）共享常量。
 *
 * 供主组件 HexagonAreaOverlay、geometry 几何工具、useConfirmedFrame /
 * useEditHandles 交互钩子与 HexagonTypePanel / HexagonEditVisuals /
 * HexagonDrawingSvg 子组件共用。
 */

/** 六边形外接圆半径下限（px）；拖动距离小于该值时保持最小可见 */
export const MIN_RADIUS = 32

/** 「选择区域类型」面板尺寸（与 .hexagon-area-type-panel 一致） */
export const TYPE_PANEL_WIDTH = 228
export const TYPE_PANEL_HEIGHT = 167

/** 确认态「编辑 | 删除」面板尺寸（设计稿 121×32，与 .hexagon-area-edit-panel 一致） */
export const EDIT_PANEL_WIDTH = 121
export const EDIT_PANEL_HEIGHT = 32

/** 编辑态蒙层镂空 mask id（SVG <mask> 多形状并集镂空：区域多边形 + 节点圆） */
export const EDIT_MASK_ID = 'hexagon-area-edit-highlight-mask'

/** 编辑边框视觉：白 6px + 中央 2px #7160F2 虚线（同路径闭环两层） */
export const EDIT_STROKE_COLOR = 'rgba(255, 255, 255, 0.60)'
export const EDIT_STROKE_WEIGHT = 6
export const EDIT_DASH_COLOR = '#7160F2'
export const EDIT_DASH_WIDTH = 2

/** 蒙层镂空沿边法线外扩量（px）：编辑描边 6px 的外半（见 padPolygon） */
export const EDIT_AREA_PAD = 3

/** 顶点镂空圆半径（vertex-handle.svg 20×20 的一半） */
export const EDIT_VERTEX_HOLE_R = 10

/** 边中点镂空圆半径（midpoint-handle.svg 12×12 的一半） */
export const EDIT_MID_HOLE_R = 6

/** 「删除锚点」按钮底边距顶点手柄上缘间隙（px）：默认悬挂于顶点正上方，
 *  视口顶部空间不足时翻转到下方 */
export const DELETE_ANCHOR_GAP = 4

/** 区域最少顶点数（三角形保底）：顶点数 ≤ 该值不再显示「删除锚点」按钮 */
export const MIN_VERTEX_COUNT = 3

/** 绘制阶段六边形默认视觉（截图框选效果：框内无填充，紫色虚线描边 + 顶点圆点）；
 *  确认后保留同款绘制视觉（由本遮罩继续展示，见主组件头注释「确定后的确认态」） */
export const HEX_STROKE_COLOR = '#7160f2'

/** 禁飞区（NoFlyArea）选中时的实时预览视觉：45° 斜线阴影（hatch）填充——
 *  从左下到右上的斜线、颜色 #BE070799、间距 8px，充满整个六边形
 *  （SVG <pattern> 平铺，见 HexagonDrawingSvg 渲染 defs）+ 同色系实色描边/顶点 */
export const NOFLY_HATCH_PATTERN_ID = 'hexagon-nofly-hatch'
export const NOFLY_HATCH_COLOR = '#BE070799'
export const NOFLY_STROKE_COLOR = '#BE0707'

/** 任务区（taskArea）选中时的实时预览视觉：蓝色半透明填充（#2084BA 30%，
 *  即 #2084BA4D）+ 同色描边/顶点——与该类型主题色（#2084BA）一致 */
export const TASK_FILL_COLOR = '#2084BA4D'
export const TASK_STROKE_COLOR = '#2084BA'

/** 降落区（landingArea）选中时的实时预览视觉：绿色半透明填充（#7BFF00 20%）
 *  + 同色描边/顶点——与确认后 TaskAreaLayer 持久渲染（fillOpacity 0.2）一致 */
export const LANDING_FILL_COLOR = '#7BFF0033'
export const LANDING_STROKE_COLOR = '#7BFF00'

/**
 * 区域类型选项（设计稿 2×2 布局：禁飞区/任务区 | 集结区/降落区）。
 * value 为类型字典值（写入 TaskArea.type，经 TASK_AREA_TYPE_META 映射展示标签）；
 * color 为设计稿色块颜色；left/top 为单选圆点在面板内的绝对定位。
 */
export const AREA_TYPE_OPTIONS = [
  { value: 'NoFlyArea', label: '禁飞区', color: '#f32c30', left: 16, top: 46 },
  { value: 'taskArea', label: '任务区', color: '#2084ba', left: 16, top: 82 },
  { value: 'assembleArea', label: '集结区', color: '#7160f2', left: 126, top: 46 },
  { value: 'landingArea', label: '降落区', color: '#7bff00', left: 126, top: 82 },
] as const

/** 默认选中类型（设计稿单选 on 态为「集结区」） */
export const DEFAULT_AREA_TYPE = 'assembleArea'