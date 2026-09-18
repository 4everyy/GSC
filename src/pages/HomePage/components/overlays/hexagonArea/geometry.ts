/**
 * HexagonAreaOverlay（六边形区域绘制遮罩）几何工具与命令式 DOM 辅助。
 *
 * 全部为无状态纯函数（除 buildEditHandleElement/syncEditHandles 操作 DOM），
 * 供主组件与编辑交互逻辑共用。
 */
import { taskPanelImages } from '../../../../../assets/images/task-panel'
import {
  TYPE_PANEL_WIDTH,
  TYPE_PANEL_HEIGHT,
  EDIT_VERTEX_HOLE_R,
  EDIT_MID_HOLE_R,
} from './constants'

/** 正六边形顶点方位角（度；pointy-top：自正上方起每 60°，中心对称） */
const HEX_VERTEX_ANGLES = [90, 30, -30, -90, -150, 150]
/** 顶点单位向量（屏幕坐标：x 右为正、y 下为正），模块加载时预计算一次 */
export const HEX_UNITS = HEX_VERTEX_ANGLES.map((deg) => {
  const rad = (deg * Math.PI) / 180
  return { x: Math.cos(rad), y: -Math.sin(rad) }
})
/**
 * 右下顶点（-30°，HEX_VERTEX_ANGLES[2]）单位向量。
 * 拖动时六边形平移至「右下顶点 = 光标」：center = mouse - radius * BR_UNIT。
 */
export const BR_UNIT = HEX_UNITS[2]
/** 右上顶点（30°，HEX_VERTEX_ANGLES[1]）单位向量：「选择区域类型」面板定位锚点 */
export const TR_UNIT = HEX_UNITS[1]

/** 六边形几何（中心 + 外接圆半径，视口坐标） */
export interface HexGeometry {
  cx: number
  cy: number
  r: number
}

/** 由中心 + 半径计算 6 顶点（视口坐标，正上方起顺时针） */
export function hexVertices(hex: HexGeometry) {
  return HEX_UNITS.map((u) => ({ x: hex.cx + hex.r * u.x, y: hex.cy + hex.r * u.y }))
}

/** 顶点序列 → SVG path d 字符串（自动 Z 闭环；任意顶点数通用） */
export function hexPathD(vs: { x: number; y: number }[]) {
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
export function padPolygon(vs: { x: number; y: number }[], pad: number) {
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
export function pointInPolygon(px: number, py: number, vs: { x: number; y: number }[]) {
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
export const SVG_NS = 'http://www.w3.org/2000/svg'

/** 构建编辑节点手柄 DOM：顶点手柄 20×20（vertex-handle.svg，grab 光标）、
 *  中点手柄 12×12（midpoint-handle.svg，copy 光标暗示可拖出新增点）。手柄自身
 *  pointer-events auto 接收按下（容器 none 不挡地图平移），命中后经容器
 *  mousedown 委托开启拖拽；数量/位置由 syncEditHandles 每帧同步 */
export function buildEditHandleElement(kind: 'vertex' | 'mid'): HTMLDivElement {
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
 * 编辑节点手柄 + 蒙层镂空圆逐帧同步（updateConfirmedFrame 每帧调用）：
 * 前 n = 顶点（r10 盖住 20×20 图标）、后 n = 边中点（r6 盖住 12×12 图标）——
 * 数量随顶点数动态增删（中点手柄拖拽会插入新顶点、删点减少），被复用手柄的
 * 图标/尺寸/光标随 kind 变化即时重建（DOM 复用纠偏：删点/插点后原顶点手柄
 * 可能被复用为中点（或反之），必须重建否则旧图标残留错位）。
 */
export function syncEditHandles(
  handles: HTMLDivElement,
  mask: SVGMaskElement,
  vs: { x: number; y: number }[],
) {
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

/**
 * 「选择区域类型」面板定位：置于锚点（六边形右上顶点）右侧 8px、与顶点垂直
 * 居中；右侧空间不足时翻转到顶点左侧（面板右缘距顶点 8px），上下视口钳制防溢出。
 * 定格态与编辑态共用（编辑态由 onMove 每帧重算命令式更新）。
 */
export function computeTypePanelPos(tr: { x: number; y: number }, vw: number, vh: number) {
  const flip = tr.x + TYPE_PANEL_WIDTH + 8 > vw
  return {
    left: flip
      ? Math.max(8, tr.x - 8 - TYPE_PANEL_WIDTH)
      : Math.min(tr.x + 8, vw - TYPE_PANEL_WIDTH - 8),
    top: Math.max(8, Math.min(tr.y - TYPE_PANEL_HEIGHT / 2, vh - TYPE_PANEL_HEIGHT - 8)),
  }
}
/** 定格后右下顶点信息卡数据：经纬度（顶点真实反投影）+ 面积（与
 *  taskAreaStore.addArea 包围盒估算同口径，确保确认后列表面积与本卡一致） */
export interface HexInfo {
  x: number
  y: number
  lng: string
  lat: string
  area: string
}

/** 由六边形几何 + adapter 反投影计算信息卡数据（主组件 useMemo 低频调用） */
export function computeHexInfo(
  hex: HexGeometry,
  unproject: (p: { x: number; y: number }) => { lat: number; lng: number },
  boundsLeft: number,
  boundsTop: number,
): HexInfo {
  const toLL = (x: number, y: number) => {
    const ll = unproject({ x: x - boundsLeft, y: y - boundsTop })
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
}
