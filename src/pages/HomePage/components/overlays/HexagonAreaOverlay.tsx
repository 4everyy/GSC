/**
 * HexagonAreaOverlay —— 区域列表「添加区域」六边形绘制遮罩（area-list 绘制模式专用）。
 *
 * 截图式从点拉出六边形（与矩形框选同交互范式）：
 * - 进入绘制态不显示六边形，仅停机坪图标光标跟随；
 * - 按下左键：自按下点（图标处）的一个点开始；
 * - 按住左键拖动：半径 = 按下点到光标的距离，且六边形始终平移到
 *   「右下顶点与光标（停机坪图标）精确重合」的位置——即拖着右下角顶点拉出
 *   对称正六边形，远离放大、靠近缩小；
 * - 松开左键定格，显示「选择区域类型」面板（228×167 毛玻璃：禁飞区/任务区/
 *   集结区/降落区 2×2 单选，默认集结区 + 确定/取消按钮）；
 * - 定格后右键/「取消」清除六边形回到绘制态，可重新拉出；绘制阶段右键退出；
 *   Esc 由 useAdvancedPanelStates 全局监听退出（本组件随之卸载）。
 *
 * 「确定」后的确认态（confirmedId 非空）——保留编辑能力而非立即退出：
 * - 区域数据经 addArea(vertices, type) 写入 store（不标记草稿），TaskAreaLayer
 *   立即以持久样式渲染该区域（类型色填充/禁飞区斜线/名称标签/降落区中心图标
 *   ——与确认前完全一致）；遮罩不再绘制六边形，避免绘制视觉覆盖持久样式；
 * - 截图变暗蒙版与信息卡收起，遮罩根 pointer-events 置 none——地图交互恢复
 *   （可拖动/缩放查看区域），仅编辑/删除面板恢复点击（编辑中蒙层为纯视觉，
 *   同样不拦截地图交互）；
 * - 右下顶点右侧 8px 挂 121×32 毛玻璃「编辑 | 删除」面板（设计稿样式：
 *   rgba(75,188,249,0.4) 底 + #4BBCF9 描边 + blur(3px)，中缝 1px 竖线分隔）；
 * - 面板位置地理锚定：注册 adapter.onMove 每渲染帧将 6 顶点经纬度 project 回
 *   视口坐标，命令式更新编辑/删除面板位置——平移/缩放地图时
 *   面板精确跟随区域顶点；
 * - 「编辑」开启编辑态：写入 taskAreaStore.editingAreaId——TaskAreaLayer 整体
 *   跳过该区域，编辑视觉全部由本遮罩 SVG 层绘制：去填充、
 *   rgba(255,255,255,0.60) 6px 白描边 + 中央 2px #7160F2 虚线、顶点
 *   顶点 vertex-handle / 边中点 midpoint-handle 节点手柄；同时展示截图式变暗蒙版
 *   （SVG mask 并集镂空：区域多边形（边法线外扩 3px 盖住描边外半）+
 *   顶点/中点圆形，区域外蒙层变暗、边框与节点镂空高亮）；
 * - 编辑态节点手柄可拖拽改变绘制区域：拖顶点手柄移动对应角点、按住中点
 *   手柄即在相邻两顶点间插入新顶点并拖拽（顶点数动态增长）——拖拽全程
 *   命令式重绘边框/虚线/手柄/蒙层镂空（高亮实时跟随，零 React 重渲染），
 *   松手一次性 unproject 回经纬度 updateAreaVertices 提交 store；
 *   编辑/删除面板整体收起；
 * - 编辑态不再展示「选择区域类型」/「编辑 | 删除」面板；右键置回
 *   editingAreaId=null 恢复持久样式与全亮地图（面板随之重新可见）；
 *   「删除」removeArea 移除区域并退出绘制模式（鼠标恢复正常样式）；
 *   确认态保持至右键/Esc 退出或删光全部区域——空白处单击不再回到绘制态
 *   （确认后随手点按地图即拉出新六边形、类型面板又极易被误点「确定」，
 *   造成「只添加一个却多出好几个区域」）；需再画新区域回区域列表重新点
 *   「添加区域」（addAreaRequests 计数变化，本遮罩监听后回绘制态）；
 * - Esc/右键退出（遮罩卸载）：区域已由 TaskAreaLayer 持久渲染，直接离开即可
 *   （卸载清理同步清空 editingAreaId，防悬留编辑态）。
 *
 * 丝滑性能设计（拖动全程零 React 重渲染，视觉样式与之前完全一致）：
 * - mousemove 只写 ref + requestAnimationFrame 合帧，一帧内多次事件只绘制一次；
 * - 六边形蒙版/本体/顶点圆点由 ref 命令式直写 d/cx/cy（无 React diff、无字符串重建开销）；
 * - 悬浮图标仅命令式更新 transform（合成层平移，保留 CSS 居中 translate(-50%,-50%)）；
 * - 仅按下/定格等低频时刻 setState，拖动帧率即浏览器渲染帧率。
 * 截图式变暗蒙版：SVG 路径 fill-rule evenodd（外矩形 + 六边形镂空），框外变暗框内清晰。
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type { MapAdapter } from '../../../../map-engines/types'
import { homeImages } from '../../../../assets/images/home'
import { taskPanelImages } from '../../../../assets/images/task-panel'
import { useTaskAreaStore } from '../../../../stores/taskAreaStore'
import { useLayerStore } from '../../../../stores/layerStore'

/** 六边形外接圆半径下限（px）；拖动距离小于该值时保持最小可见 */
const MIN_RADIUS = 32
/** 正六边形顶点方位角（度；pointy-top：自正上方起每 60°，中心对称） */
const HEX_VERTEX_ANGLES = [90, 30, -30, -90, -150, 150]
/** 顶点单位向量（屏幕坐标：x 右为正、y 下为正），模块加载时预计算一次 */
const HEX_UNITS = HEX_VERTEX_ANGLES.map((deg) => {
  const rad = (deg * Math.PI) / 180
  return { x: Math.cos(rad), y: -Math.sin(rad) }
})
/**
 * 右下顶点（-30°，HEX_VERTEX_ANGLES[2]）单位向量。
 * 拖动时六边形平移至「右下顶点 = 光标」：center = mouse - radius * BR_UNIT。
 */
const BR_UNIT = HEX_UNITS[2]
/** 右上顶点（30°，HEX_VERTEX_ANGLES[1]）单位向量：「选择区域类型」面板定位锚点 */
const TR_UNIT = HEX_UNITS[1]
/** 「选择区域类型」面板尺寸（与 .hexagon-area-type-panel 一致） */
const TYPE_PANEL_WIDTH = 228
const TYPE_PANEL_HEIGHT = 167
/** 确认态「编辑 | 删除」面板尺寸（设计稿 121×32，与 .hexagon-area-edit-panel 一致） */
const EDIT_PANEL_WIDTH = 121
const EDIT_PANEL_HEIGHT = 32
/** 编辑态蒙层镂空 mask id（SVG <mask> 多形状并集镂空：区域多边形 + 节点圆） */
const EDIT_MASK_ID = 'hexagon-area-edit-highlight-mask'
/** 编辑边框视觉：白 6px + 中央 2px #7160F2 虚线（同路径闭环两层） */
const EDIT_STROKE_COLOR = 'rgba(255, 255, 255, 0.60)'
const EDIT_STROKE_WEIGHT = 6
const EDIT_DASH_COLOR = '#7160F2'
const EDIT_DASH_WIDTH = 2
/** 蒙层镂空沿边法线外扩量（px）：编辑描边 6px 的外半（见 padPolygon） */
const EDIT_AREA_PAD = 3
/** 顶点镂空圆半径（vertex-handle.svg 20×20 的一半） */
const EDIT_VERTEX_HOLE_R = 10
/** 边中点镂空圆半径（midpoint-handle.svg 12×12 的一半） */
const EDIT_MID_HOLE_R = 6
/** 「删除锚点」按钮底边距顶点手柄上缘间隙（px）：默认悬挂于顶点正上方，
 *  视口顶部空间不足时翻转到下方 */
const DELETE_ANCHOR_GAP = 4
/** 区域最少顶点数（三角形保底）：顶点数 ≤ 该值不再显示「删除锚点」按钮 */
const MIN_VERTEX_COUNT = 3

/**
 * 区域类型选项（设计稿 2×2 布局：禁飞区/任务区 | 集结区/降落区）。
 * value 为类型字典值（写入 TaskArea.type，经 TASK_AREA_TYPE_META 映射展示标签）；
 * color 为设计稿色块颜色；left/top 为单选圆点在面板内的绝对定位。
 */
const AREA_TYPE_OPTIONS = [
  { value: 'NoFlyArea', label: '禁飞区', color: '#f32c30', left: 16, top: 46 },
  { value: 'taskArea', label: '任务区', color: '#2084ba', left: 16, top: 82 },
  { value: 'assembleArea', label: '集结区', color: '#7160f2', left: 126, top: 46 },
  { value: 'landingArea', label: '降落区', color: '#7bff00', left: 126, top: 82 },
] as const

/** 默认选中类型（设计稿单选 on 态为「集结区」） */
const DEFAULT_AREA_TYPE = 'assembleArea'

/** 绘制阶段六边形默认视觉（截图框选效果：框内无填充，紫色虚线描边 + 顶点圆点）；
 *  确认后保留同款绘制视觉（由本遮罩继续展示，见组件头注释「确定后的确认态」） */
const HEX_STROKE_COLOR = '#7160f2'

/** 禁飞区（NoFlyArea）选中时的实时预览视觉：45° 斜线阴影（hatch）填充——
 *  从左下到右上的斜线、颜色 #BE070799、间距 8px，充满整个六边形
 *  （SVG <pattern> 平铺，见渲染区 defs）+ 同色系实色描边/顶点 */
const NOFLY_HATCH_PATTERN_ID = 'hexagon-nofly-hatch'
const NOFLY_HATCH_COLOR = '#BE070799'
const NOFLY_STROKE_COLOR = '#BE0707'

/** 任务区（taskArea）选中时的实时预览视觉：蓝色半透明填充（#2084BA 30%，
 *  即 #2084BA4D）+ 同色描边/顶点——与该类型主题色（#2084BA）一致 */
const TASK_FILL_COLOR = '#2084BA4D'
const TASK_STROKE_COLOR = '#2084BA'

/** 降落区（landingArea）选中时的实时预览视觉：绿色半透明填充（#7BFF00 20%）
 *  + 同色描边/顶点——与确认后 TaskAreaLayer 持久渲染（fillOpacity 0.2）一致 */
const LANDING_FILL_COLOR = '#7BFF0033'
const LANDING_STROKE_COLOR = '#7BFF00'

interface HexagonAreaOverlayProps {
  /** 地图引擎适配器（顶点视口坐标 ↔ WGS84 经纬度） */
  adapter: MapAdapter | null
  /** 退出绘制模式（绘制阶段右键/Esc；确认态右键/Esc 交还 TaskAreaLayer 持久渲染） */
  onExit: () => void
}

/** 六边形几何（中心 + 外接圆半径，视口坐标） */
interface HexGeometry {
  cx: number
  cy: number
  r: number
}

/** 由中心 + 半径计算 6 顶点（视口坐标，正上方起顺时针） */
function hexVertices(hex: HexGeometry) {
  return HEX_UNITS.map((u) => ({ x: hex.cx + hex.r * u.x, y: hex.cy + hex.r * u.y }))
}

/** 顶点序列 → SVG path d 字符串（自动 Z 闭环；任意顶点数通用） */
function hexPathD(vs: { x: number; y: number }[]) {
  return `M ${vs.map((p) => `${p.x},${p.y}`).join(' L ')} Z`
}

/** 单条边（a→b）的外法线单位向量；sign 按多边形绕向翻转，保证指向外侧 */
function edgeOutwardNormal(
  a: { x: number; y: number },
  b: { x: number; y: number },
  sign: 1 | -1,
) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  return { x: (-dy / len) * sign, y: (dx / len) * sign }
}

/** 任意简单多边形整体向外偏移 pad 像素：逐顶点沿邻边外法线和的角平分线
 *  方向平移并按 miter 公式（1/cos(半角)）补偿，使每条边恰沿法线外移 pad
 *  （编辑蒙层镂空用；cos 钳制 0.3 防尖角偏移爆炸——插点后多边形可能不规则） */
function padPolygon(vs: { x: number; y: number }[], pad: number) {
  const n = vs.length
  if (n < 3) return vs
  // 有符号面积二倍值判断绕向，保证法线指外侧
  let area2 = 0
  for (let i = 0; i < n; i++) {
    const a = vs[i]
    const b = vs[(i + 1) % n]
    area2 += a.x * b.y - b.x * a.y
  }
  const sign: 1 | -1 = area2 > 0 ? 1 : -1
  return vs.map((p, i) => {
    const n1 = edgeOutwardNormal(vs[(i - 1 + n) % n], p, sign)
    const n2 = edgeOutwardNormal(p, vs[(i + 1) % n], sign)
    let bx = n1.x + n2.x
    let by = n1.y + n2.y
    const len = Math.hypot(bx, by) || 1
    bx /= len
    by /= len
    const cosHalf = Math.max(0.3, bx * n2.x + by * n2.y)
    const s = pad / cosHalf
    return { x: p.x + bx * s, y: p.y + by * s }
  })
}

/** 射线法点在多边形内判定：确认态区域本体渲染在地图层（遮罩根
 *  pointer-events none 收不到 DOM hover），「编辑 | 删除」面板的 hover
 *  显隐由 window mousemove + 本几何判定驱动 */
function pointInPolygon(px: number, py: number, vs: { x: number; y: number }[]) {
  let inside = false
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x
    const yi = vs[i].y
    const xj = vs[j].x
    const yj = vs[j].y
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** SVG 命名空间（命令式创建 mask 镂空圆用） */
const SVG_NS = 'http://www.w3.org/2000/svg'

/** 构建编辑节点手柄 DOM：顶点手柄 20×20（vertex-handle.svg，grab 光标）、
 *  中点手柄 12×12（midpoint-handle.svg，copy 光标暗示可拖出新增点）。手柄自身
 *  pointer-events auto 接收按下（容器 none 不挡地图平移），命中后经容器
 *  mousedown 委托开启拖拽；数量/位置由 updateConfirmedFrame 每帧同步 */
function buildEditHandleElement(kind: 'vertex' | 'mid'): HTMLDivElement {
  const el = document.createElement('div')
  const size = kind === 'vertex' ? 20 : 12
  el.dataset.handleKind = kind
  el.style.cssText = [
    'position: absolute',
    `width: ${size}px`,
    `height: ${size}px`,
    'transform: translate(-50%, -50%)',
    'pointer-events: auto',
    `cursor: ${kind === 'vertex' ? 'grab' : 'copy'}`,
    'line-height: 0',
  ].join('; ')
  const img = document.createElement('img')
  img.src = kind === 'vertex' ? taskPanelImages.vertexHandle : taskPanelImages.midpointHandle
  img.style.cssText = 'width: 100%; height: 100%; display: block'
  img.draggable = false
  img.alt = ''
  el.appendChild(img)
  return el
}

/**
 * 「选择区域类型」面板定位：置于锚点（六边形右上顶点）右侧 8px、与顶点垂直
 * 居中；右侧空间不足时翻转到顶点左侧（面板右缘距顶点 8px），上下视口钳制防溢出。
 * 定格态与编辑态共用（编辑态由 onMove 每帧重算命令式更新）。
 */
function computeTypePanelPos(tr: { x: number; y: number }, vw: number, vh: number) {
  const flip = tr.x + TYPE_PANEL_WIDTH + 8 > vw
  return {
    left: flip
      ? Math.max(8, tr.x - 8 - TYPE_PANEL_WIDTH)
      : Math.min(tr.x + 8, vw - TYPE_PANEL_WIDTH - 8),
    top: Math.max(8, Math.min(tr.y - TYPE_PANEL_HEIGHT / 2, vh - TYPE_PANEL_HEIGHT - 8)),
  }
}

export function HexagonAreaOverlay({ adapter, onExit }: HexagonAreaOverlayProps) {
  // 视口尺寸（resize 跟随）：蒙版外矩形与半径上限均依赖
  const [size, setSize] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }))
  // 六边形几何（React 状态仅供挂载/定格 UI；拖动期间零 setState，几何最新值在 ref）
  const [hex, setHex] = useState<HexGeometry | null>(null)
  const hexRef = useRef<HexGeometry | null>(null)
  // 按住左键拉伸中 / 已定格（松开后，显示「选择区域类型」面板）
  const [dragging, setDragging] = useState(false)
  // 「选择区域类型」面板当前选中类型（定格后展示；确定时随顶点一并写入 addArea，
  // 编辑态确定时仅 updateAreaType）
  const [areaType, setAreaType] = useState<string>(DEFAULT_AREA_TYPE)

  // ===== 确认态（「确定」后保留绘制区域） =====
  // 已确认区域 id（store 草稿；TaskAreaLayer 跳过其渲染，由本遮罩继续展示）
  const [confirmedId, setConfirmedId] = useState<string | null>(null)
  const confirmedIdRef = useRef<string | null>(null)
  // 编辑中（确认态点「编辑」开启编辑态视觉 + 区域外蒙层，点「完成」退出）
  const [editing, setEditing] = useState(false)
  const editingRef = useRef(false)
  // 区域列表行内「编辑区域」跨层级请求（挂载期间持续监听：挂载时已在途/
  // 确认态中再次点击行内编辑，均进入目标区域编辑态）
  const editAreaRequest = useTaskAreaStore((s) => s.editAreaRequest)
  // 已进入编辑的目标区域 id（StrictMode 重挂载/adapter 迟到时幂等重建编辑态）
  const enteredEditIdRef = useRef<string | null>(null)
  // 确认区域 6 顶点经纬度（onMove 每帧 project 回视口坐标重绘，地理锚定）
  const confirmedVerticesLLRef = useRef<{ latitude: number; longitude: number }[] | null>(null)
  // 确认态 onMove 取消句柄
  const offMoveRef = useRef<(() => void) | null>(null)
  // adapter ref（onMove 闭包/卸载清理读取最新值；渲染后经下方 useLayoutEffect 同步）
  const adapterRef = useRef(adapter)

  // 已定格：有六边形且松开了左键（类型面板/信息卡仅定格时展示）——
  // 确认态（confirmedId 非空）不算定格（信息卡收起、左键不再触发拉伸）
  const fixed = hex !== null && !dragging && confirmedId === null
  // 绘制阶段（含按住拉伸）：停机坪图标光标跟随、遮罩拦截全部鼠标
  const drawingPhase = !fixed && confirmedId === null
  // 确认阶段：保留绘制视觉；遮罩根放行鼠标到地图（仅编辑/删除/类型面板可点）
  const confirmedPhase = confirmedId !== null

  // 按下点（半径基准）：按下点 → 当前光标的距离即半径
  const anchorRef = useRef<{ x: number; y: number } | null>(null)
  // 最新光标位置（mousemove 只写这里，rAF 回调读取最新值合帧绘制）
  const mouseRef = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef(0)
  // rAF 句柄：body cursor 双跳变强制浏览器重算鼠标样式（见 forceCursorRecompute）
  const cursorRafRef = useRef(0)
  // 半径上限（中心随光标移动，取保守视口半边，保证六边形基本保持在视口内）
  const maxRadius = Math.max(MIN_RADIUS, Math.min(size.w, size.h) / 2 - 24)
  const maxRadiusRef = useRef(maxRadius)

  // 视口尺寸 ref：rAF/resize 回调读取最新值，避免闭包过期（渲染后统一同步）
  const viewRef = useRef(size)
  // 命令式 DOM 引用：蒙版/六边形/顶点/悬浮图标（拖动期间绕过 React 直写属性）
  const maskRef = useRef<SVGPathElement | null>(null)
  const polyRef = useRef<SVGPathElement | null>(null)
  const dotsRef = useRef<(SVGCircleElement | null)[]>([])
  const cursorImgRef = useRef<HTMLImageElement | null>(null)
  // 确认态命令式 DOM 引用：编辑/删除面板、定格态类型面板、编辑态蒙层镂空
  //（mask 内六边形 path + 顶点/中点 circles）——六边形本体已交 TaskAreaLayer
  // 持久渲染，遮罩仅面板/蒙层需命令式定位
  const editPanelRef = useRef<HTMLDivElement | null>(null)
  // 「编辑 | 删除」面板最近定位矩形（hover 显隐判定：面板隐藏后 DOM
  // hit-test 失效，以几何矩形兜底判定鼠标在面板近旁保持显示，鼠标才能
  // 从区域移入面板完成点击）
  const lastPanelBoxRef = useRef<{ left: number; top: number } | null>(null)
  // hover 命中的区域 id（确认态多区域独立面板：mousemove 射线法命中哪个区域，
  // 「编辑 | 删除」面板就锚定到哪个区域的右下顶点；null=无命中面板隐藏）
  const hoverAreaIdRef = useRef<string | null>(null)
  const typePanelRef = useRef<HTMLDivElement | null>(null)
  // 编辑视觉 refs（editing 时 JSX 挂载）：蒙层 mask（rect + 镂空 path + 动态
  // 镂空圆）、边框双层 path（白 6px 实线 + 紫虚线）、手柄容器（顶点/中点
  // 手柄 DOM 动态增删）
  const editMaskRef = useRef<SVGMaskElement | null>(null)
  const editAreaHoleRef = useRef<SVGPathElement | null>(null)
  const editStrokeRef = useRef<SVGPathElement | null>(null)
  const editDashRef = useRef<SVGPathElement | null>(null)
  const editHandlesRef = useRef<HTMLDivElement | null>(null)
  // 编辑拖拽中的顶点序号（中点手柄按下即插入新顶点并转为拖拽该新顶点）
  const editDragRef = useRef<number | null>(null)
  // 「删除锚点」按钮（hover 顶点手柄浮现）、当前 hover 的顶点序号与延时隐藏
  // 计时器（离开手柄后宽限期内移入按钮/其他手柄则取消隐藏——按钮与手柄间
  // 有 4px 间隙，立即隐藏会导致鼠标永远移不进按钮）
  const deleteAnchorBtnRef = useRef<HTMLDivElement | null>(null)
  const hoverVertexRef = useRef<number | null>(null)
  const deleteAnchorHideTimerRef = useRef<number | null>(null)

  /**
   * 命令式按顶点绘制一帧（蒙版 + 本体 + 顶点圆点）：直写 d/cx/cy 属性，
   * 不触碰 React 状态——丝滑关键（无 diff、无重渲染）。
   * 拖动帧（hexVertices 几何）与 resize 重绘共用（确认态六边形已交
   * TaskAreaLayer 持久渲染，本函数不再参与）。
   */
  const drawVertices = useCallback((vs: { x: number; y: number }[]) => {
    const d = hexPathD(vs)
    if (maskRef.current) {
      maskRef.current.setAttribute(
        'd',
        `M 0 0 H ${viewRef.current.w} V ${viewRef.current.h} H 0 Z ${d}`,
      )
    }
    if (polyRef.current) polyRef.current.setAttribute('d', d)
    dotsRef.current.forEach((dot, i) => {
      if (!dot) return
      dot.setAttribute('cx', String(vs[i].x))
      dot.setAttribute('cy', String(vs[i].y))
    })
  }, [])

  const drawFrame = useCallback((h: HexGeometry) => {
    drawVertices(hexVertices(h))
  }, [drawVertices])
  const drawRef = useRef(drawFrame)

  /**
   * 「删除锚点」按钮定位/显隐（命令式）：仅顶点手柄且顶点数 > 3 时显示于
   * 该顶点正上方（底边距手柄上缘 4px，顶部空间不足翻转到下方）；记录 hover
   * 顶点序号供点击删除与每帧跟随重定位。
   */
  const positionDeleteAnchorBtn = useCallback((target: HTMLElement) => {
    const btn = deleteAnchorBtnRef.current
    const vsLL = confirmedVerticesLLRef.current
    if (!btn || !vsLL) return
    if (target.dataset.handleKind !== 'vertex' || vsLL.length <= MIN_VERTEX_COUNT) {
      btn.style.display = 'none'
      hoverVertexRef.current = null
      return
    }
    hoverVertexRef.current = Number(target.dataset.handleIndex)
    btn.style.display = 'flex'
    const x = parseFloat(target.style.left)
    const y = parseFloat(target.style.top)
    const btnH = btn.offsetHeight || 28
    if (y - 10 - DELETE_ANCHOR_GAP - btnH >= 8) {
      btn.style.left = `${x}px`
      btn.style.top = `${y - 10 - DELETE_ANCHOR_GAP}px`
      btn.style.transform = 'translate(-50%, -100%)'
    } else {
      btn.style.left = `${x}px`
      btn.style.top = `${y + 10 + DELETE_ANCHOR_GAP}px`
      btn.style.transform = 'translate(-50%, 0)'
    }
  }, [])

  /** 取消「删除锚点」按钮的在途延时隐藏（移入按钮/命中手柄时调用） */
  const cancelDeleteAnchorHide = useCallback(() => {
    if (deleteAnchorHideTimerRef.current !== null) {
      clearTimeout(deleteAnchorHideTimerRef.current)
      deleteAnchorHideTimerRef.current = null
    }
  }, [])

  /** 延时隐藏「删除锚点」按钮：按钮与手柄间存在 4px 间隙，立即隐藏会让鼠标
   *  在穿过间隙途中按钮就消失——宽限 300ms 供鼠标从手柄移入按钮 */
  const hideDeleteAnchorSoon = useCallback(() => {
    cancelDeleteAnchorHide()
    deleteAnchorHideTimerRef.current = window.setTimeout(() => {
      deleteAnchorHideTimerRef.current = null
      if (deleteAnchorBtnRef.current) deleteAnchorBtnRef.current.style.display = 'none'
      hoverVertexRef.current = null
    }, 300)
  }, [cancelDeleteAnchorHide])

  /** 「编辑 | 删除」面板通用定位：锚点（区域右下顶点）右侧 8px、垂直居中；
   *  右侧空间不足翻转到左侧；同步记录定位矩形供 hover 近旁保持判定
   *  （面板 display none 后几何兜底） */
  const positionEditPanel = useCallback((anchor: { x: number; y: number }) => {
    const editEl = editPanelRef.current
    if (!editEl) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const flip = anchor.x + 8 + EDIT_PANEL_WIDTH > vw
    const left = flip ? Math.max(8, anchor.x - 8 - EDIT_PANEL_WIDTH) : anchor.x + 8
    const top = Math.min(Math.max(anchor.y - EDIT_PANEL_HEIGHT / 2, 8), vh - EDIT_PANEL_HEIGHT - 8)
    editEl.style.left = `${left}px`
    editEl.style.top = `${top}px`
    lastPanelBoxRef.current = { left, top }
  }, [])

  /** 区域顶点（经纬度）→ 视口坐标（adapter 未就绪返回 null） */
  const projectVertices = useCallback(
    (vertices: { latitude: number; longitude: number }[]) => {
      const eng = adapterRef.current
      if (!eng) return null
      const bounds = eng.getContainer().getBoundingClientRect()
      return vertices.map((v) => {
        const p = eng.project({ lng: v.longitude, lat: v.latitude })
        return { x: p.x + bounds.left, y: p.y + bounds.top }
      })
    },
    [],
  )

  /** 确认态命中测试：光标落在哪个区域多边形内（返回该区域 id + 投影顶点，
   *  无命中 null）——多区域重叠时后加入者（数组靠后）优先；已隐藏区域不在
   *  地图上渲染（TaskAreaLayer 过滤 hiddenIds），此处同样跳过——hover 隐藏
   *  区域不得弹「编辑 | 删除」面板（与 TaskAreaLayer 常态 hover 面板同款
   *  过滤），编辑中区域一并跳过（面板已卸载，防御性兜底） */
  const pickAreaAt = useCallback(
    (cx: number, cy: number) => {
      const s = useTaskAreaStore.getState()
      for (let i = s.areas.length - 1; i >= 0; i--) {
        const a = s.areas[i]
        if (s.hiddenIds.has(a.id) || a.id === s.editingAreaId) continue
        const vs = projectVertices(a.vertices)
        if (vs && pointInPolygon(cx, cy, vs)) return { id: a.id, vs }
      }
      return null
    },
    [projectVertices],
  )

  /**
   * 确认态一帧重绘（onMove 每渲染帧 + 拖拽 mousemove + 相关重渲后调用）：
   * ①「编辑 | 删除」面板跟随——锚定 hover 命中的区域（store 最新顶点投影，
   * 多区域独立，平移/缩放每帧重定位；编辑中面板已卸载自然短路）；
   * ②编辑中视觉——边框双层（白 6px 实线 + 2px 紫虚线同路径）、节点手柄
   * （前 n 顶点 + 后 n 边中点，DOM 数量随顶点数动态增删）、蒙层镂空
   * （padPolygon 沿边法线外扩 3px 盖住 6px 描边外半 + 2n 镂空圆）——全部
   * 命令式直写，拖拽/平移/缩放每帧跟随（地理锚定 + 拖拽实时改顶点）。
   */
  const updateConfirmedFrame = useCallback(() => {
    if (!adapterRef.current) return
    // ①面板跟随：按 hover 区域 id 从 store 取最新顶点重投影重定位；hover 中
    // 的区域被隐藏/移除（列表操作）时立即收起面板——鼠标未移动不会触发
    // mousemove 重判，不校验会残留可点的「编辑 | 删除」按钮作用于隐藏区域
    const hovId = hoverAreaIdRef.current
    if (editPanelRef.current && hovId) {
      const s = useTaskAreaStore.getState()
      const hovArea = s.areas.find((a) => a.id === hovId)
      if (!hovArea || s.hiddenIds.has(hovId)) {
        hoverAreaIdRef.current = null
        lastPanelBoxRef.current = null
        editPanelRef.current.style.display = 'none'
      } else {
        const hvs = projectVertices(hovArea.vertices)
        if (hvs) positionEditPanel(hvs[2])
      }
    }
    // ②编辑视觉基于当前编辑目标顶点（vsLL）；非编辑且无编辑目标则到此为止
    const vsLL = confirmedVerticesLLRef.current
    const vs = vsLL ? projectVertices(vsLL) : null
    if (!vs) return
    // 编辑边框双层：白 6px 实线 + 中央 2px 紫虚线（同路径闭环；拖拽/缩放每帧重写）
    const d = hexPathD(vs)
    if (editStrokeRef.current) editStrokeRef.current.setAttribute('d', d)
    if (editDashRef.current) editDashRef.current.setAttribute('d', d)
    // 节点手柄 + 蒙层镂空圆：前 n = 顶点（r10 盖住 20×20 图标）、后 n = 边中点
    //（r6 盖住 12×12 图标）——数量随顶点数动态增删（中点手柄拖拽会插入
    // 新顶点、删点减少），被复用手柄的图标/尺寸/光标随 kind 变化即时重建
    const handles = editHandlesRef.current
    const mask = editMaskRef.current
    if (handles && mask) {
      const n = vs.length
      while (handles.children.length > 2 * n) handles.lastChild?.remove()
      while (mask.children.length > 2 + 2 * n) mask.lastChild?.remove()
      for (let i = handles.children.length; i < 2 * n; i++) {
        handles.appendChild(buildEditHandleElement(i < n ? 'vertex' : 'mid'))
        mask.appendChild(document.createElementNS(SVG_NS, 'circle'))
      }
      for (let i = 0; i < 2 * n; i++) {
        const isVertex = i < n
        const kind: 'vertex' | 'mid' = isVertex ? 'vertex' : 'mid'
        const idx = isVertex ? i : i - n
        const a = vs[idx]
        const b = vs[(idx + 1) % n]
        const p = isVertex ? a : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        // DOM 复用纠偏：删点/插点后数量变化，原顶点手柄可能被复用为中点
        //（或反之）——图标/尺寸/光标必须随 kind 重建，否则旧 20px 顶点图
        // 标残留显示在中点位置，造成「删除锚点后中点自动新增锚点」的错觉
        //（锚点只能经拖拽中点转换产生，见 startHandleDrag；中点不可删）
        let h = handles.children[i] as HTMLDivElement
        if (h.dataset.handleKind !== kind) {
          const fresh = buildEditHandleElement(kind)
          handles.replaceChild(fresh, h)
          h = fresh
        }
        h.style.left = `${p.x}px`
        h.style.top = `${p.y}px`
        h.dataset.handleIndex = String(idx)
        const c = mask.children[2 + i] as SVGCircleElement
        c.setAttribute('cx', String(p.x))
        c.setAttribute('cy', String(p.y))
        c.setAttribute('r', String(isVertex ? EDIT_VERTEX_HOLE_R : EDIT_MID_HOLE_R))
        c.setAttribute('fill', 'black')
      }
    }
    // 蒙层区域镂空：padPolygon 每条边恰沿法线外移 3px（盖住 6px 描边外半），
    // 多个 black 形状自动并集镂空（重叠处不会重新变暗），高亮严格贴合区域
    if (editAreaHoleRef.current) {
      editAreaHoleRef.current.setAttribute('d', hexPathD(padPolygon(vs, EDIT_AREA_PAD)))
    }
    // hover 中的「删除锚点」按钮跟随其顶点手柄重定位（平移/缩放保持贴合）
    const dBtn = deleteAnchorBtnRef.current
    const hv = hoverVertexRef.current
    if (dBtn && hv !== null && handles && dBtn.style.display !== 'none') {
      const t = handles.children[hv] as HTMLElement | undefined
      if (t) positionDeleteAnchorBtn(t)
    }
  }, [positionDeleteAnchorBtn, positionEditPanel, projectVertices])
  const updateConfirmedRef = useRef(updateConfirmedFrame)

  // 渲染后统一同步各 ref 最新值（事件回调/rAF/onMove 闭包读取；useLayoutEffect
  // 在 paint 前同步执行，同帧调度的 rAF 回调晚于此，不会读到过期值）
  useLayoutEffect(() => {
    adapterRef.current = adapter
    maxRadiusRef.current = maxRadius
    viewRef.current = size
    drawRef.current = drawFrame
    updateConfirmedRef.current = updateConfirmedFrame
  })

  /** 悬浮图标跟随（命令式）：保留 CSS 居中 translate(-50%,-50%)，仅追加位移；
   *  移回/首次移动时恢复可见（onMouseLeave 曾隐藏） */
  const moveCursor = useCallback((x: number, y: number) => {
    const el = cursorImgRef.current
    if (el) {
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
      el.style.opacity = '1'
    }
  }, [])

  /** rAF 合帧：一帧内多次 mousemove 只在下一帧绘制一次最新几何（拖动路径） */
  const scheduleDragDraw = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const anchor = anchorRef.current
      const m = mouseRef.current
      if (!anchor || !m) return
      // 半径 = 按下点到光标的距离（远离放大、靠近缩小，钳制上限）；
      // 六边形平移至右下顶点与光标精确重合——拖着右下角顶点拉出
      const r = Math.min(Math.hypot(m.x - anchor.x, m.y - anchor.y), maxRadiusRef.current)
      const h = { cx: m.x - r * BR_UNIT.x, cy: m.y - r * BR_UNIT.y, r }
      hexRef.current = h
      drawRef.current(h)
      // 图标与右下顶点同帧同步（同一光标位置），保证精确重合
      moveCursor(m.x, m.y)
    })
  }, [moveCursor])

  /**
   * 强制浏览器立即重算鼠标样式（Chromium 已知问题 workaround）：
   * 光标下的元素被移除/替换后，浏览器在鼠标真正移动前不会重算 cursor，
   * 经典解法是对 document.body 行内 cursor 做双跳变（先置 none，下一帧还原
   * finalCursor）：root 级 cursor 变化会强制浏览器立即按「当前光标下的元素
   * 链」重新求值鼠标样式，全程无需移动鼠标。
   */
  const forceCursorRecompute = useCallback((finalCursor = '') => {
    if (cursorRafRef.current) cancelAnimationFrame(cursorRafRef.current)
    document.body.style.cursor = 'none'
    cursorRafRef.current = requestAnimationFrame(() => {
      cursorRafRef.current = 0
      document.body.style.cursor = finalCursor
    })
  }, [])

  // 进入绘制模式即重算一次（鼠标可能仍停在「添加区域」按钮的手势光标上）
  useEffect(() => {
    forceCursorRecompute()
  }, [forceCursorRecompute])

  // 卸载（退出绘制模式）清理：取消未决 rAF、确认态 onMove 监听；清空编辑态标记
  // （TaskAreaLayer 无缝恢复该区域持久渲染——Esc/右键退出时编辑面板无机会
  // 走确定/取消，须在此兜底）、双跳变恢复页面默认光标
  // （遮罩 cursor:none 移除后 Chromium 同样不会主动重算）
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (cursorRafRef.current) {
        cancelAnimationFrame(cursorRafRef.current)
        cursorRafRef.current = 0
      }
      if (deleteAnchorHideTimerRef.current !== null) {
        clearTimeout(deleteAnchorHideTimerRef.current)
        deleteAnchorHideTimerRef.current = null
      }
      if (offMoveRef.current) {
        offMoveRef.current()
        offMoveRef.current = null
      }
      // 兜底清空编辑态标记（未在编辑时为 no-op）：区域恢复持久样式
      useTaskAreaStore.getState().setEditingArea(null)
      document.body.style.cursor = 'none'
      requestAnimationFrame(() => {
        document.body.style.cursor = ''
      })
    }
  }, [])

  // 区域列表行内「编辑」消费（挂载期间持续生效）：editAreaRequest 出现即进入
  // 目标区域的确认+编辑态——顶点装入编辑管线（蒙层/手柄/拖拽均基于此）、
  // TaskAreaLayer 切编辑样式（editingAreaId）、注册 onMove 重投影随图联动；
  // 区域中心不在当前视口时先平滑飞转过去（手柄可见才可拖拽编辑）。
  // StrictMode 重挂载/adapter 迟到场景：React 状态未丢但卸载清理已重置 store
  // 编辑标记与 onMove——按 enteredEditIdRef 幂等重建（editingRef 仍为 true
  // 表示本遮罩主观上仍在编辑；右键主动退出后 editingRef=false 不会误重建）
  useEffect(() => {
    const state = useTaskAreaStore.getState()
    const reestablish =
      !editAreaRequest &&
      enteredEditIdRef.current !== null &&
      editingRef.current &&
      state.editingAreaId === null
    const targetId = editAreaRequest
      ? editAreaRequest.id
      : reestablish
        ? enteredEditIdRef.current
        : null
    if (editAreaRequest) {
      state.clearEditAreaRequest()
      enteredEditIdRef.current = editAreaRequest.id
    }
    if (!targetId) return
    const area = state.areas.find((a) => a.id === targetId)
    const eng = adapterRef.current
    if (!area || !eng) return
    // 与 handleEdit 同款进入管线（叠加防重复注册 onMove）
    if (offMoveRef.current) {
      offMoveRef.current()
      offMoveRef.current = null
    }
    confirmedVerticesLLRef.current = area.vertices.map((v) => ({ ...v }))
    confirmedIdRef.current = area.id
    setConfirmedId(area.id)
    useTaskAreaStore.getState().setEditingArea(area.id)
    editingRef.current = true
    setEditing(true)
    offMoveRef.current = eng.onMove(() => updateConfirmedRef.current())
    // 视口外兜底：区域中心投影落在视口边缘 MARGIN 外则飞转到区域中心
    const vs = area.vertices
    const center = {
      lng: vs.reduce((s, v) => s + v.longitude, 0) / vs.length,
      lat: vs.reduce((s, v) => s + v.latitude, 0) / vs.length,
    }
    const pr = eng.project(center)
    const rect = eng.getContainer().getBoundingClientRect()
    const MARGIN = 120
    if (
      pr.x + rect.left < MARGIN ||
      pr.y + rect.top < MARGIN ||
      pr.x + rect.left > window.innerWidth - MARGIN ||
      pr.y + rect.top > window.innerHeight - MARGIN
    ) {
      eng.flyTo(center, { zoom: Math.max(eng.getZoom(), 14), duration: 1200 })
    }
  }, [editAreaRequest, adapter])

  // resize 跟随：更新状态（蒙版外矩形重建）并按当前几何命令式重绘
  useEffect(() => {
    const onResize = () => {
      setSize({ w: window.innerWidth, h: window.innerHeight })
      if (hexRef.current && !confirmedIdRef.current) {
        requestAnimationFrame(() => drawRef.current(hexRef.current!))
      } else if (confirmedIdRef.current) {
        requestAnimationFrame(() => updateConfirmedRef.current())
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /** 清除六边形回到绘制态：不显示六边形，可重新按住左键拉出（定格后右键/「取消」
   *  走此函数——确认态「删除」移除区域后同样回到绘制态重新开始） */
  const resetDrawing = useCallback(() => {
    anchorRef.current = null
    hexRef.current = null
    setHex(null)
    setDragging(false)
    // 类型选择恢复默认（下次绘制从设计稿默认态开始）
    setAreaType(DEFAULT_AREA_TYPE)
    // 定格面板（含 cursor:pointer 的按钮）随之卸载，强制重算清除残留手势光标
    forceCursorRecompute()
  }, [forceCursorRecompute])

  /** 清理确认态挂起资源（onMove 监听/refs），不动绘制几何（供删除/退出复用）；
   *  同步清空 store 编辑态标记（TaskAreaLayer 恢复该区域持久样式） */
  const clearConfirmed = useCallback(() => {
    if (offMoveRef.current) {
      offMoveRef.current()
      offMoveRef.current = null
    }
    confirmedVerticesLLRef.current = null
    confirmedIdRef.current = null
    hoverAreaIdRef.current = null
    editingRef.current = false
    setEditing(false)
    setConfirmedId(null)
    if (useTaskAreaStore.getState().editingAreaId !== null) {
      useTaskAreaStore.getState().setEditingArea(null)
    }
  }, [])

  // 确认态相关重渲（进入确认/编辑切换/adapter 就绪）后立即按投影修正一帧：
  // useLayoutEffect 在 paint 前执行，避免 JSX 初值（确认时的旧视口坐标）闪烁
  useLayoutEffect(() => {
    if (confirmedId) updateConfirmedFrame()
  }, [confirmedId, editing, adapter, updateConfirmedFrame])

  // 拖动结束（松开左键）定格：未拖出最小半径时以右下顶点为锚兜底为最小六边形
  const finishDrag = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    const h = hexRef.current
    if (!h) {
      setDragging(false)
      return
    }
    let final = h
    if (h.r < MIN_RADIUS) {
      const r = MIN_RADIUS
      final = { cx: h.cx + (h.r - r) * BR_UNIT.x, cy: h.cy + (h.r - r) * BR_UNIT.y, r }
      hexRef.current = final
      drawRef.current(final)
    }
    // 低频时刻才 setState：触发定格 UI（按钮条/恢复默认光标）
    setHex(final)
    setDragging(false)
  }, [])

  // window 级兜底：鼠标移出窗口后松开左键同样定格
  useEffect(() => {
    if (!dragging) return
    const onMouseUp = () => finishDrag()
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [dragging, finishDrag])

  /**
   * 手柄容器 mousedown 委托：命中手柄开启顶点拖拽——中点手柄立即在相邻两
   * 顶点间插入新顶点（经纬度中点）并转为拖拽该新顶点；顶点手柄直接拖角点。
   * 手柄位于遮罩层（DOM 高于地图容器），按下不会传给地图（无联动平移）
   */
  const startHandleDrag = useCallback((e: ReactMouseEvent) => {
    if (e.button !== 0) return
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-handle-index]')
    if (!target) return
    e.preventDefault()
    e.stopPropagation()
    // 开启拖拽即隐藏「删除锚点」按钮（防拖拽中误点删点）并取消在途延时隐藏
    if (deleteAnchorBtnRef.current) deleteAnchorBtnRef.current.style.display = 'none'
    hoverVertexRef.current = null
    cancelDeleteAnchorHide()
    const vsLL = confirmedVerticesLLRef.current
    if (!vsLL) return
    let index = Number(target.dataset.handleIndex)
    if (target.dataset.handleKind === 'mid') {
      const a = vsLL[index]
      const b = vsLL[(index + 1) % vsLL.length]
      vsLL.splice(index + 1, 0, {
        latitude: (a.latitude + b.latitude) / 2,
        longitude: (a.longitude + b.longitude) / 2,
      })
      index += 1
      // 立即重绘一帧：手柄/镂空圆数量 +1（新顶点手柄就位于按下位置）
      updateConfirmedRef.current()
    }
    editDragRef.current = index
  }, [cancelDeleteAnchorHide])

  /** 手柄容器 hover 委托（可删锚点划分）：仅顶点手柄（锚点）取消在途
   *  延时隐藏并在其正上方浮出「删除锚点」按钮；边中点手柄不是可删
   *  锚点——hover 命中中点时立即隐藏按钮并清 hover 顶点（不走 300ms
   *  宽限，防快速移动丢 mouseover 时按钮滞留中点旁造成「中点可删」错觉） */
  const onHandleHover = useCallback(
    (e: ReactMouseEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-handle-index]')
      if (!target) return
      if (target.dataset.handleKind !== 'vertex') {
        cancelDeleteAnchorHide()
        if (deleteAnchorBtnRef.current) deleteAnchorBtnRef.current.style.display = 'none'
        hoverVertexRef.current = null
        return
      }
      cancelDeleteAnchorHide()
      positionDeleteAnchorBtn(target)
    },
    [cancelDeleteAnchorHide, positionDeleteAnchorBtn],
  )

  /** 手柄容器 hover 离开：移入删除按钮自身或另一顶点手柄（可删锚点）时
   *  保持显示；移入边中点手柄立即隐藏（中点不支持删除，划分清楚不走
   *  宽限计时）；其余（空白/窗口外）延时 300ms 隐藏——宽限穿过手柄与
   *  按钮间 4px 间隙，期间移入按钮/顶点手柄则取消 */
  const onHandleLeave = useCallback(
    (e: ReactMouseEvent) => {
      const btn = deleteAnchorBtnRef.current
      if (!btn) return
      const related = e.relatedTarget as HTMLElement | null
      if (related && btn.contains(related)) return
      const handle = related?.closest<HTMLElement>('[data-handle-kind]') ?? null
      if (handle) {
        if (handle.dataset.handleKind === 'vertex') return
        // 边中点：非可删锚点，按钮立即隐藏（不留宽限）
        cancelDeleteAnchorHide()
        btn.style.display = 'none'
        hoverVertexRef.current = null
        return
      }
      hideDeleteAnchorSoon()
    },
    [cancelDeleteAnchorHide, hideDeleteAnchorSoon],
  )

  /** 「删除锚点」点击：移除 hover 顶点（至少保留 3 个）并实时提交 store */
  const handleDeleteAnchor = useCallback(() => {
    const idx = hoverVertexRef.current
    const vsLL = confirmedVerticesLLRef.current
    const id = confirmedIdRef.current
    if (idx === null || !vsLL || !id || vsLL.length <= MIN_VERTEX_COUNT) return
    vsLL.splice(idx, 1)
    hoverVertexRef.current = null
    cancelDeleteAnchorHide()
    if (deleteAnchorBtnRef.current) deleteAnchorBtnRef.current.style.display = 'none'
    updateConfirmedRef.current()
    useTaskAreaStore.getState().updateAreaVertices(id, vsLL.map((v) => ({ ...v })))
  }, [cancelDeleteAnchorHide])

  // 编辑态右键退出本地编辑并保留全部编辑内容（window 级监听：确认态遮罩根
  // pointer-events none，地图上的右键不会进入遮罩）：拖点/插点/删点均已实时
  // 提交 store，直接置回 editingAreaId=null 即「退出并保留」——恢复持久样式
  // 与全亮地图，「编辑 | 删除」面板重新可见
  useEffect(() => {
    if (!editing) return
    const onCtx = (e: MouseEvent) => {
      e.preventDefault()
      if (!editingRef.current) return
      useTaskAreaStore.getState().setEditingArea(null)
      editingRef.current = false
      setEditing(false)
      forceCursorRecompute()
    }
    window.addEventListener('contextmenu', onCtx)
    return () => window.removeEventListener('contextmenu', onCtx)
  }, [editing, forceCursorRecompute])

  // 编辑态顶点拖拽：mousemove 将光标反投影写入对应顶点经纬度（原地改 ref，
  // 零 store 更新保证丝滑）并整帧重绘（边框/手柄/蒙层高亮实时跟随）；
  // mouseup 一次性 updateAreaVertices 提交 store（重算面积；TaskAreaLayer
  // 编辑中跳过该区域，store 更新引起的 effect 重跑无引擎级变化）
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const index = editDragRef.current
      const vsLL = confirmedVerticesLLRef.current
      const eng = adapterRef.current
      if (index === null || !vsLL || !eng) return
      const bounds = eng.getContainer().getBoundingClientRect()
      const ll = eng.unproject({ x: e.clientX - bounds.left, y: e.clientY - bounds.top })
      vsLL[index] = { latitude: ll.lat, longitude: ll.lng }
      updateConfirmedRef.current()
    }
    const onMouseUp = () => {
      if (editDragRef.current === null) return
      editDragRef.current = null
      const id = confirmedIdRef.current
      const vsLL = confirmedVerticesLLRef.current
      if (id && vsLL) {
        useTaskAreaStore.getState().updateAreaVertices(id, vsLL.map((v) => ({ ...v })))
      }
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // 确认态「编辑 | 删除」面板 hover 区域显隐（多区域独立）：区域本体渲染在
  // 地图层（遮罩根 pointer-events none 收不到 DOM hover）——window mousemove
  // 将光标与 store 全部区域顶点实时投影做射线法命中：命中即记录该区域并把
  // 面板锚定到其右下顶点显示（命中区域切换时面板随之跳转锚点）；鼠标位于
  // 面板矩形近旁（外扩 8px，覆盖面板与区域间隙，保证能从区域移入面板点击）
  // 时保持显示；均不满足则隐藏。每个区域独立判定——删除任一区域后其余
  // 区域 hover 仍可用；编辑中面板已卸载（editPanelRef 为空自然短路）
  useEffect(() => {
    if (!confirmedPhase) return
    const onHoverMove = (e: MouseEvent) => {
      // 同步 mouseRef：确认态遮罩根 pointer-events none 收不到 mousemove，
      // 「添加区域」重触发回绘制态时停机坪图标可钉在最近光标处
      mouseRef.current = { x: e.clientX, y: e.clientY }
      if (editingRef.current) return
      const panel = editPanelRef.current
      if (!panel) return
      const hit = pickAreaAt(e.clientX, e.clientY)
      if (hit) {
        hoverAreaIdRef.current = hit.id
        positionEditPanel(hit.vs[2])
        panel.style.display = ''
        return
      }
      const box = lastPanelBoxRef.current
      const nearPanel =
        !!box &&
        e.clientX >= box.left - 8 &&
        e.clientX <= box.left + EDIT_PANEL_WIDTH + 8 &&
        e.clientY >= box.top - 8 &&
        e.clientY <= box.top + EDIT_PANEL_HEIGHT + 8
      // 面板隐藏时同步作废定位矩形：nearPanel 仅凭几何矩形判定、不校验区域
      // 可见性，box 残留旧坐标会让鼠标移到面板原位置（即使对应区域已隐藏/
      // 已移除）时凭空复现面板——矩形作废后，复现面板的唯一入口是重新命中
      // 可见区域（pickAreaAt 已过滤 hiddenIds/editingAreaId）
      if (!nearPanel) {
        hoverAreaIdRef.current = null
        lastPanelBoxRef.current = null
      }
      panel.style.display = nearPanel ? '' : 'none'
    }
    window.addEventListener('mousemove', onHoverMove)
    return () => window.removeEventListener('mousemove', onHoverMove)
  }, [confirmedPhase, pickAreaAt, positionEditPanel])

  // hover 中的区域被隐藏/移除（区域列表操作）时立即收起面板：鼠标未动不触发
  // mousemove 重判，无此兜底面板会残留可点（toggleHidden 每次新建 Set，订阅
  // hiddenIds 引用变化即重跑）；收起同时作废定位矩形（防鼠标移到面板原位置
  // 凭空复现，见上 onHoverMove）
  const hiddenIds = useTaskAreaStore((s) => s.hiddenIds)
  useEffect(() => {
    const id = hoverAreaIdRef.current
    if (!id) return
    const s = useTaskAreaStore.getState()
    if (s.hiddenIds.has(id) || !s.areas.some((a) => a.id === id)) {
      hoverAreaIdRef.current = null
      lastPanelBoxRef.current = null
      if (editPanelRef.current) editPanelRef.current.style.display = 'none'
    }
  }, [hiddenIds])

  /**
   * 确定（定格态）：按六边形 6 顶点经纬度 + 所选类型本地新增任务区域；
   * 随即自动开启「任务区域」图层（TaskAreaLayer 立即以持久样式渲染该区域）
   * 并进入确认态——遮罩收起截图蒙版/信息卡并放行鼠标到地图，右下顶点右侧挂
   * 「编辑 | 删除」面板；注册 onMove 地理锚定（面板位置随平移/缩放跟随）。
   */
  const confirmArea = () => {
    const h = hexRef.current
    if (!adapter || !h) {
      onExit()
      return
    }
    const bounds = adapter.getContainer().getBoundingClientRect()
    const vertices = hexVertices(h).map((v) => {
      const ll = adapter.unproject({ x: v.x - bounds.left, y: v.y - bounds.top })
      return { latitude: ll.lat, longitude: ll.lng }
    })
    // 不标记草稿：TaskAreaLayer 立即以持久样式渲染（类型色填充/禁飞区斜线/
    // 名称标签/降落区中心图标），遮罩不再绘制六边形（避免绘制视觉覆盖持久样式）
    const id = useTaskAreaStore.getState().addArea(vertices, areaType)
    if (!id) {
      onExit()
      return
    }
    // 自动开启「任务区域」图层：退出确认态后（或列表中）区域持久可见
    const layer = useLayerStore.getState()
    if (!layer.taskAreaVisible) layer.setTaskAreaVisible(true)
    // 进入确认态：记录顶点经纬度 + 区域 id，注册 onMove 重投影
    confirmedVerticesLLRef.current = vertices
    confirmedIdRef.current = id
    setConfirmedId(id)
    setEditing(false)
    offMoveRef.current = adapter.onMove(() => updateConfirmedRef.current())
  }

  /** 确认态「编辑」：面板所属区域（hover 命中）为编辑目标——写入
   *  taskAreaStore.editingAreaId（TaskAreaLayer 将该区域切换为编辑样式：去
   *  填充、白 6px 描边 + 紫虚线、顶点/边中点图标、名称标签隐藏），同时本遮罩
   *  展示区域外变暗蒙层（区域内镂空高亮）；编辑/删除面板整体收起（右键退出
   *  编辑态并保留编辑内容，见 contextmenu 监听） */
  const handleEdit = () => {
    const id = hoverAreaIdRef.current ?? confirmedIdRef.current
    const area = id ? useTaskAreaStore.getState().areas.find((a) => a.id === id) : null
    if (!area) return
    // 编辑目标切到面板所属区域：其顶点装入编辑管线（蒙层/手柄/拖拽基于此）
    confirmedVerticesLLRef.current = area.vertices.map((v) => ({ ...v }))
    confirmedIdRef.current = area.id
    useTaskAreaStore.getState().setEditingArea(area.id)
    editingRef.current = true
    setEditing(true)
  }


  /** 确认态「删除」（多区域独立）：移除面板所属（hover 命中）的区域并收起
   *  面板——仍剩其他区域则留在确认态（继续 hover 其余区域可编辑/删除，
   *  鼠标保持默认样式）；全部删光才退出绘制模式（恢复正常光标，不进入
   *  停机坪图标绘制态；需再画新区域可回区域列表重新点「添加区域」） */
  const handleDelete = () => {
    const id = hoverAreaIdRef.current ?? confirmedIdRef.current
    if (id) useTaskAreaStore.getState().removeArea(id)
    // 收起面板并清理 hover 态（区域已移除，重投影自然落空）
    hoverAreaIdRef.current = null
    if (editPanelRef.current) editPanelRef.current.style.display = 'none'
    lastPanelBoxRef.current = null
    if (useTaskAreaStore.getState().areas.length === 0) {
      clearConfirmed()
      onExit()
    }
  }

  // 区域列表「添加区域」再次触发（确认态/编辑态/定格中重按按钮）：
  // taskAreaStore.addAreaRequests 计数 +1——退出确认/编辑态并清空绘制几何，
  // 回到干净的绘制态拉出下一个区域。确认态不再支持空白单击回到绘制态：
  // 确认后随手单击/微拖地图即拉出新六边形并弹出类型面板，后续点击极易
  // 误触「确定」——「只添加一个区域，态势图却多出好几个」的根源；每轮
  // 新增必须显式经区域列表「添加区域」按钮触发
  const addAreaRequests = useTaskAreaStore((s) => s.addAreaRequests)
  const addReqRef = useRef(addAreaRequests)
  useEffect(() => {
    if (addAreaRequests === addReqRef.current) return
    addReqRef.current = addAreaRequests
    clearConfirmed()
    resetDrawing()
  }, [addAreaRequests, clearConfirmed, resetDrawing])

  // 定格后「选择区域类型」面板定位：置于六边形右上顶点右侧 8px、与顶点垂直居中
  // （右侧空间不足时翻转到顶点左侧，面板右缘距顶点 8px），上下视口钳制防溢出
  const typePanelPos = useMemo(() => {
    if (!hex) return null
    // 右上顶点（30° 方位角）
    const tr = { x: hex.cx + hex.r * TR_UNIT.x, y: hex.cy + hex.r * TR_UNIT.y }
    return computeTypePanelPos(tr, size.w, size.h)
  }, [hex, size.w, size.h])

  // 定格后右下顶点信息卡：经纬度（顶点真实反投影）+ 面积（与 taskAreaStore.addArea
  // 包围盒估算同口径，确保确认后列表面积与本卡数值一致）——确认态收起
  // （右下顶点右侧改挂「编辑 | 删除」面板）
  const info = useMemo(() => {
    if (!fixed || !hex || !adapter) return null
    const bounds = adapter.getContainer().getBoundingClientRect()
    const toLL = (x: number, y: number) => {
      const ll = adapter.unproject({ x: x - bounds.left, y: y - bounds.top })
      return { lat: ll.lat, lng: ll.lng }
    }
    const br = toLL(hex.cx + hex.r * BR_UNIT.x, hex.cy + hex.r * BR_UNIT.y)
    const vs = hexVertices(hex).map((v) => toLL(v.x, v.y))
    const lats = vs.map((v) => v.lat)
    const lngs = vs.map((v) => v.lng)
    const avgLat = (Math.max(...lats) + Math.min(...lats)) / 2
    const widthM =
      (Math.max(...lngs) - Math.min(...lngs)) * 111_320 * Math.cos((avgLat * Math.PI) / 180)
    const heightM = (Math.max(...lats) - Math.min(...lats)) * 110_540
    return {
      x: hex.cx + hex.r * BR_UNIT.x,
      y: hex.cy + hex.r * BR_UNIT.y,
      lng: br.lng.toFixed(6),
      lat: br.lat.toFixed(6),
      area: Math.round(Math.abs(widthM * heightM)).toLocaleString('zh-CN'),
    }
  }, [fixed, hex, adapter])

  // 是否选中「禁飞区」/「降落区」/「任务区」：定格面板单选变化即切换六边形实时
  // 预览视觉（低频 setState）——禁飞区 45° 斜线阴影（#BE070799、间距 8px）、
  // 降落区绿色半透明填充、任务区蓝色半透明填充（#2084BA4D）、
  // 其余类型保持紫色无填充（截图框选效果）
  const isNoFly = areaType === 'NoFlyArea'
  const isLanding = areaType === 'landingArea'
  const isTask = areaType === 'taskArea'

  // 按当前选中类型解析六边形填充/描边（禁飞区 → 斜线 pattern url，其余按类型）
  const polyFill = isNoFly
    ? `url(#${NOFLY_HATCH_PATTERN_ID})`
    : isLanding
      ? LANDING_FILL_COLOR
      : isTask
        ? TASK_FILL_COLOR
        : 'none'
  const polyStroke = isNoFly
    ? NOFLY_STROKE_COLOR
    : isLanding
      ? LANDING_STROKE_COLOR
      : isTask
        ? TASK_STROKE_COLOR
        : HEX_STROKE_COLOR

  return createPortal(
    <div
      className="hexagon-area-overlay"
      style={{
        // 绘制阶段（含按住拉伸）隐藏原生光标（DOM 停机坪图标跟随）；
        // 定格后恢复默认光标便于点击「确定/取消」；
        // 确认态放行鼠标到地图（pointer-events none），面板自身 cursor 接管
        cursor: drawingPhase ? 'none' : 'default',
        // 确认态：地图交互恢复（可拖动/缩放查看区域），仅编辑/删除面板与
        // 编辑中的类型面板 pointer-events auto 可点
        pointerEvents: confirmedPhase ? 'none' : 'auto',
      }}
      onMouseDown={(e) => {
        if (e.button !== 0) return
        // 已定格：等待「确定/取消」（右键也可清除重画）；确认态遮罩已放行
        // 鼠标（收不到）；仅绘制阶段可按下拉伸
        if (fixed || confirmedPhase) return
        // 按下点为半径基准；六边形挂载（r=0 即一个点）后全程命令式更新
        anchorRef.current = { x: e.clientX, y: e.clientY }
        mouseRef.current = { x: e.clientX, y: e.clientY }
        hexRef.current = { cx: e.clientX, cy: e.clientY, r: 0 }
        setHex({ cx: e.clientX, cy: e.clientY, r: 0 })
        setDragging(true)
        // 图标立即钉住按下点（拖动中的右下顶点）
        moveCursor(e.clientX, e.clientY)
      }}
      onMouseMove={(e) => {
        mouseRef.current = { x: e.clientX, y: e.clientY }
        if (dragging) scheduleDragDraw()
        else moveCursor(e.clientX, e.clientY)
      }}
      onMouseLeave={() => {
        mouseRef.current = null
        if (!dragging && cursorImgRef.current) cursorImgRef.current.style.opacity = '0'
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        // 确认态右键：结束流程退出（遮罩卸载、草稿交还 TaskAreaLayer 持久渲染）；
        // 编辑中右键：忽略（防误触丢编辑）；
        // 定格后右键：清除六边形回到绘制态可重新拉出；
        // 绘制阶段右键：退出绘制模式（'area-list' 无对应功能面板，直接退出）
        if (confirmedPhase) {
          if (!editingRef.current) onExit()
        } else if (fixed) resetDrawing()
        else onExit()
      }}
    >
      {/* 全幅 SVG 画布：蒙版/六边形/顶点节点均绘制其上。
          按下即挂载（r=0 隐形起点），此后蒙版/本体/顶点全部命令式更新（零重渲染）；
          确认态整体卸载——六边形交 TaskAreaLayer 持久渲染（防绘制视觉覆盖） */}
      {!confirmedPhase && hex && (
        <svg className="hexagon-area-overlay__svg">
          <defs>
            {/* 禁飞区斜线阴影 pattern：8×8 tile 平铺 45° 斜线（左下→右上 "/" 方向，
                相邻 tile 首尾相接无缝）；stroke 2px #BE070799，间距 8px。
                patternUnits=userSpaceOnUse：以视口坐标平铺（与六边形同一坐标系），
                六边形移动/缩放时纹理铺满整个绘制区域 */}
            <pattern
              id={NOFLY_HATCH_PATTERN_ID}
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M-2 2 l4 -4 M0 8 l8 -8 M6 10 l4 -4"
                stroke={NOFLY_HATCH_COLOR}
                strokeWidth="2"
              />
            </pattern>
          </defs>
          {/* 截图式变暗蒙版：外矩形 + 六边形镂空（fill-rule evenodd），框外变暗框内清晰。
              确认态收起（地图全亮，区域由 TaskAreaLayer 渲染） */}
          {!confirmedPhase && (
            <path
              ref={maskRef}
              d={`M 0 0 H ${size.w} V ${size.h} H 0 Z ${hexPathD(hexVertices(hex))}`}
              fill="rgba(0, 0, 0, 0.45)"
              fillRule="evenodd"
            />
          )}
          {/* 六边形本体：默认无填充（截图框选效果，框内地图清晰可见）
              + 2px 虚线描边（与框选虚线框同风格）；
              选中「禁飞区」/「降落区」/「任务区」时立即预览确认后的视觉——
              禁飞区 45° 斜线阴影（#BE070799、间距 8px、充满区域）、降落区绿色
              半透明填充（#7BFF00 20%）、任务区蓝色半透明填充（#2084BA 30%）
              + 各自同色描边，其余类型保持紫色无填充 */}
          <path
            ref={polyRef}
            d={hexPathD(hexVertices(hex))}
            fill={polyFill}
            stroke={polyStroke}
            strokeWidth={2}
            strokeDasharray="8 5"
          />
          {/* 顶点节点：白描边圆点，强化多边形绘制感（cx/cy 命令式更新）；
              禁飞区/降落区/任务区选中时同步切各自主题色（与描边一致） */}
          {hexVertices(hex).map((v, i) => (
            <circle
              key={i}
              ref={(el) => {
                dotsRef.current[i] = el
              }}
              cx={v.x}
              cy={v.y}
              r={4}
              fill={polyStroke}
              stroke="#fff"
              strokeWidth={1.5}
            />
          ))}
        </svg>
      )}
      {/* 降落区中心地面图标：定格且选中「降落区」时的预览——与指点返航落点圆圈
          同款视觉（48×48 白 2px 描边半透明圆 + 内含 20×24 H 停机坪图标），居中于
          六边形质心；确认后由 TaskAreaLayer 在质心挂同款图标（持久渲染） */}
      {fixed && isLanding && hex && (
        <div
          className="hexagon-area-overlay__landing-center"
          style={{ left: hex.cx, top: hex.cy }}
          aria-hidden="true"
        >
          <img src={homeImages.tapReturnZoneIcon} alt="" draggable={false} />
        </div>
      )}
      {/* 绘制阶段跟随光标的停机坪图标（与框选遮罩同方案/样式）；
          拖动中光标即右下顶点 → 图标与右下顶点精确重合。
          left/top 固定 0，仅命令式 transform 位移（保留 CSS 居中，合成层平移）；
          定格/确认后卸载——恢复正常系统光标；
          点「取消」/定格后右键清除/确认态「删除」回到绘制态（图标重新挂载恢复跟随） */}
      {drawingPhase && (
        <img
          ref={(el) => {
            // 仅首次挂载初始化；dataset 标志避免重渲时 ref 重跑覆盖命令式 transform。
            // 已知光标位置（取消/右键/删除清除后重挂载、mousemove 持续冒泡更新
            // mouseRef）时直接钉到该处——停机坪图标立即可见，明确告知已回到绘制态
            // 可重新绘制；否则（首次进入绘制模式，尚无 mousemove）置于屏幕外，
            // 待首次 mousemove 命令式定位
            cursorImgRef.current = el
            if (el && !el.dataset.init) {
              el.dataset.init = '1'
              const m = mouseRef.current
              if (m) {
                el.style.transform = `translate(${m.x}px, ${m.y}px) translate(-50%, -50%)`
                el.style.opacity = '1'
              } else {
                el.style.transform = 'translate(-100px, -100px) translate(-50%, -50%)'
              }
            }
          }}
          className="area-select-cursor"
          src={homeImages.areaLandingCursor}
          style={{ left: 0, top: 0 }}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      )}
      {/* 定格后右下顶点信息卡：经度/纬度（真实反投影值）+ 面积（㎡）。
          置于绘制区域外——右下顶点右侧 8px、垂直居中对齐；右侧空间不足时
          翻转到顶点左侧（仍在六边形外），防止溢出视口；确认态收起
          （该位置改挂「编辑 | 删除」面板） */}
      {fixed && info && (
        <div
          className="hexagon-area-overlay__info"
          style={{
            left: info.x + 8,
            top: Math.min(Math.max(info.y - 9, 8), size.h - 26),
            ...(info.x + 232 > size.w
              ? { left: Math.max(8, info.x - 8), transform: 'translateX(-100%)' }
              : {}),
          }}
        >
          经度：{info.lng}°，纬度：{info.lat}°
          <br />
          面积：{info.area}㎡
        </div>
      )}
      {/* 编辑态视觉（全部本遮罩 SVG 层绘制，TaskAreaLayer 编辑中整体跳过该区域）：
          ①截图式变暗蒙层——SVG <mask> 并集镂空：区域多边形（padPolygon 沿边
          法线外扩 3px 盖住 6px 描边外半）+ 顶点圆（r10）+ 边中点圆（r6），
          高亮恰好只比绘制区域多出边框与节点，其余蒙层变暗；②编辑边框双层
          ——白 6px 实线 + 中央 2px #7160F2 虚线（同路径闭环）；③节点手柄
          容器——顶点 vertex-handle（20×20）/边中点 midpoint-handle（12×12），数量随
          顶点数动态增删、可拖拽改区。全部几何由 onMove/拖拽 mousemove 每帧
          命令式更新（updateConfirmedFrame），蒙层 SVG pointer-events none
          （CSS）不拦截地图交互，手柄自身 auto 接收按下 */}
      {confirmedPhase && editing && (
        <>
          <svg className="hexagon-area-overlay__svg">
            <defs>
              {/* SVG mask 亮度语义：white=遮罩生效（该处蒙层显示、变暗）、
                  black=镂空（该处蒙层不显示、保持高亮）——全屏 white 打底让
                  区域外蒙层变暗；区域多边形/节点圆用 black 且由
                  updateConfirmedFrame 命令式动态增删（2 + 顶点数×2 个子元素：
                  rect + 镂空 path + 动态 circle），多个 black 形状自动并集
                  镂空（重叠处不会像 evenodd 那样重新变暗） */}
              <mask
                ref={editMaskRef}
                id={EDIT_MASK_ID}
                maskUnits="userSpaceOnUse"
                x="0"
                y="0"
                width="100%"
                height="100%"
              >
                <rect width="100%" height="100%" fill="white" />
                <path ref={editAreaHoleRef} fill="black" />
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0, 0, 0, 0.45)"
              mask={`url(#${EDIT_MASK_ID})`}
            />
          </svg>
          {/* 编辑边框双层（同一 d，updateConfirmedFrame 每帧重写）：白 6px
              实线衬底 + 紫虚线居中，pointer-events none 不拦截手柄/地图 */}
          <svg className="hexagon-area-overlay__svg">
            <path
              ref={editStrokeRef}
              fill="none"
              stroke={EDIT_STROKE_COLOR}
              strokeWidth={EDIT_STROKE_WEIGHT}
            />
            <path
              ref={editDashRef}
              fill="none"
              stroke={EDIT_DASH_COLOR}
              strokeWidth={EDIT_DASH_WIDTH}
              strokeDasharray="2 2"
            />
          </svg>
          {/* 节点手柄容器（全幅、pointer-events none；手柄子元素 auto）：
              mousedown 委托 startHandleDrag 识别手柄开启拖拽——顶点拖拽移动
              角点、中点拖拽插入新顶点；mouseover/mouseout 委托 hover 命中顶点
              手柄时浮出「删除锚点」按钮；位置/数量每帧命令式同步 */}
          <div
            ref={editHandlesRef}
            className="hexagon-area-overlay__edit-handles"
            onMouseDown={startHandleDrag}
            onMouseOver={onHandleHover}
            onMouseOut={onHandleLeave}
          />
          {/* 「删除锚点」按钮：hover 顶点手柄时浮现于该顶点正上方（顶部空间
              不足翻转到下方），点击删除该锚点（顶点数 > 3 才显示）；位置由
              positionDeleteAnchorBtn 命令式更新并随地图每帧跟随。显隐采用
              延时宽限：移入按钮取消在途计时保持可点，离开按钮/手柄 300ms
              后才真正隐藏（鼠标穿过两者间 4px 间隙途中不闪隐） */}
          <div
            ref={deleteAnchorBtnRef}
            className="hexagon-area-overlay__delete-anchor"
            onClick={handleDeleteAnchor}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseEnter={cancelDeleteAnchorHide}
            onMouseLeave={hideDeleteAnchorSoon}
            style={{ display: 'none' }}
          >
            删除锚点
          </div>
        </>
      )}
      {/* 确认态「编辑 | 删除」面板：hover 区域时才出现（window mousemove
          射线法命中多边形，或鼠标位于面板矩形近旁外扩 8px 内保持显示以便
          点击）、初始隐藏；右下顶点右侧 8px、垂直居中（右侧空间不足翻转到
          左侧）——设计稿 121×32 毛玻璃（rgba(75,188,249,0.4) 底 + #4BBCF9
          描边 + blur(3px) + 投影），中缝 1px 竖线分隔，文字 14px MiSans 330
          白色；位置由 onMove 投影命令式更新（随地图精确跟随）；编辑中整体
          收起（右键退出编辑态后随重挂载恢复初始隐藏，hover 区域再现） */}
      {confirmedPhase && !editing && (
        <div
          ref={editPanelRef}
          className="hexagon-area-edit-panel"
          style={{ display: 'none' }}
        >
          <div
            className="hexagon-area-edit-panel__btn hexagon-area-edit-panel__btn--edit"
            onClick={handleEdit}
          >
            编辑
          </div>
          <div className="hexagon-area-edit-panel__divider" />
          <div className="hexagon-area-edit-panel__btn hexagon-area-edit-panel__btn--delete" onClick={handleDelete}>
            删除
          </div>
        </div>
      )}
      {/* 「选择区域类型」面板：仅定格态展示（确定=confirmArea 进入确认态/
          取消=清除重画；编辑态不再展示——右键退出编辑并保留内容）；
          置于六边形右上顶点右侧 8px、与顶点垂直居中（右侧空间不足时翻转到顶点
          左侧，视口钳制防溢出）；2×2 单选（定格默认集结区）
          + 确定/取消；onMouseDown 阻断遮罩拖拽触发。 */}
      {fixed && typePanelPos && (
        <div
          ref={typePanelRef}
          className="hexagon-area-type-panel"
          style={typePanelPos}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="hexagon-area-type-panel__title">选择区域类型</div>
          {AREA_TYPE_OPTIONS.map((opt) => (
            <div
              key={opt.value}
              className={
                areaType === opt.value
                  ? 'hexagon-area-type-panel__option hexagon-area-type-panel__option--on'
                  : 'hexagon-area-type-panel__option'
              }
              style={{ left: opt.left, top: opt.top }}
              onClick={() => setAreaType(opt.value)}
              role="radio"
              aria-checked={areaType === opt.value}
              aria-label={opt.label}
            >
              {areaType === opt.value ? (
                /* 选中态：设计稿 radio.svg（白 0.8 底圆 + #0EA7F9 蓝环） */
                <img
                  className="hexagon-area-type-panel__radio-img"
                  src={taskPanelImages.radioChecked}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                />
              ) : (
                <div className="hexagon-area-type-panel__radio" />
              )}
              <div
                className="hexagon-area-type-panel__swatch"
                style={{ background: opt.color }}
              />
              <div className="hexagon-area-type-panel__label">{opt.label}</div>
            </div>
          ))}
          <div
            className="hexagon-area-type-panel__btn hexagon-area-type-panel__btn--ok"
            onClick={confirmArea}
          >
            确定
          </div>
          <div
            className="hexagon-area-type-panel__btn hexagon-area-type-panel__btn--cancel"
            onClick={resetDrawing}
          >
            取消
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}