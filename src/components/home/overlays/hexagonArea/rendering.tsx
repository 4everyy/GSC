import { taskPanelImages } from '../../../../assets/images/task-panel/index'
import { TYPE_PANEL_WIDTH, TYPE_PANEL_HEIGHT, EDIT_VERTEX_HOLE_R, EDIT_MID_HOLE_R, HEX_STROKE_COLOR, NOFLY_HATCH_PATTERN_ID, NOFLY_HATCH_COLOR, EDIT_MASK_ID, EDIT_STROKE_COLOR, EDIT_STROKE_WEIGHT, EDIT_DASH_COLOR, EDIT_DASH_WIDTH, AREA_TYPE_OPTIONS } from './hooks'
import { type RefObject, type MouseEvent as ReactMouseEvent } from 'react'

/**
 * HexagonAreaOverlay（六边形区域绘制遮罩）几何工具与命令式 DOM 辅助。
 *
 * 全部为无状态纯函数（除 buildEditHandleElement/syncEditHandles 操作 DOM），
 * 供主组件与编辑交互逻辑共用。
 */

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

/**
 * HexagonDrawingSvg —— 六边形绘制阶段全幅 SVG 画布（蒙版/六边形/顶点圆点）。
 *
 * 仅绘制阶段挂载（含按住拉伸与定格态；确认态整体卸载——六边形交
 * TaskAreaLayer 持久渲染，防绘制视觉覆盖持久样式）。拖动期间父组件经
 * maskRef/polyRef/dotsRef 命令式直写 d/cx/cy（零 React 重渲染，丝滑关键）。
 */

export interface HexagonDrawingSvgProps {
  /** 六边形几何（挂载/重挂载初值；拖动帧经 ref 命令式更新） */
  hex: HexGeometry
  /** 视口尺寸（蒙版外矩形宽度/高度） */
  viewSize: { w: number; h: number }
  /** 六边形填充（定格后按所选类型：none / 斜线 pattern url / 半透明色） */
  polyFill: string
  /** 六边形描边（默认紫 #7160f2；禁飞/降落/任务区为各自主题色） */
  polyStroke: string
  /** 蒙版 path ref（外矩形 - 六边形镂空，截图式遮暗四周） */
  maskRef: RefObject<SVGPathElement | null>
  /** 六边形本体 path ref */
  polyRef: RefObject<SVGPathElement | null>
  /** 6 顶点圆点 refs（紫色描边白芯小圆点标记角点） */
  dotsRef: RefObject<(SVGCircleElement | null)[]>
}

export function HexagonDrawingSvg({
  hex,
  viewSize,
  polyFill,
  polyStroke,
  maskRef,
  polyRef,
  dotsRef,
}: HexagonDrawingSvgProps) {
  const vs = hexVertices(hex)
  const d = hexPathD(vs)
  const maskD = `M 0 0 H ${viewSize.w} V ${viewSize.h} H 0 Z ${d}`
  return (
    <svg
      className="hexagon-area-overlay__svg"
      width={viewSize.w}
      height={viewSize.h}
      aria-hidden="true"
    >
      <defs>
        {/* 禁飞区 45° 斜线阴影 pattern：8×8 平铺、从左下到右上的斜线
            （stroke #BE070799 1.5px），充满整个六边形 */}
        <pattern
          id={NOFLY_HATCH_PATTERN_ID}
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="8" stroke={NOFLY_HATCH_COLOR} strokeWidth="1.5" />
        </pattern>
      </defs>
      {/* 截图式变暗蒙层：外矩形 + 六边形组合路径 evenodd 直填 —— 六边形为镂空
          亮区、四周 rgba(0,0,0,0.55) 变暗（与编辑态 HexagonEditVisuals 同暗度）。
          注：原先 <mask> 内黑 path + 裸 rect 的写法在亮度遮罩语义下（黑 / 未覆盖
          = 隐藏）使蒙层 rect 完全渲染不出，四周从未变暗；改为直填后拖动帧仍由
          drawVertices 命令式重写 d（M0,0 外矩形 + 六边形 组合结构保持不变）。 */}
      <path ref={maskRef} d={maskD} fill="rgba(0,0,0,0.55)" fillRule="evenodd" />
      {/* 六边形本体：默认无填充紫色描边（截图框选效果）；定格后按所选类型
          切换实时预览（禁飞区斜线/降落区绿/任务区蓝半透明） */}
      <path ref={polyRef} d={d} fill={polyFill} stroke={polyStroke} strokeWidth={2} />
      {/* 6 顶点圆点（白芯 + 当前描边色描边；拖动期间命令式更新 cx/cy） */}
      {vs.map((v, i) => (
        <circle
          key={i}
          ref={(el) => {
            dotsRef.current[i] = el
          }}
          cx={v.x}
          cy={v.y}
          r={3}
          fill="#fff"
          stroke={polyStroke || HEX_STROKE_COLOR}
          strokeWidth={1.5}
        />
      ))}
    </svg>
  )
}

/**
 * HexagonEditVisuals —— 六边形区域编辑态视觉（蒙层镂空/边框双层/手柄容器/
 * 「删除锚点」按钮）。
 *
 * 编辑中挂载：区域外蒙层（mask 镂空多边形 + 动态镂空圆，区域内保持全亮）、
 * 编辑边框双层（白 6px 实线 + 中央 2px #7160F2 虚线，同路径闭环）、节点手柄
 * 容器（数量/位置由 syncEditHandles 每帧同步）与「删除锚点」按钮（hover 顶点
 * 手柄浮现，显隐/定位由 useEditHandles 命令式管理）。
 */

/** 主组件透传的交互回调（来自 useEditHandles） */
export interface HexagonEditVisualsHandlers {
  onHandleMouseDown: (e: ReactMouseEvent) => void
  onHandleOver: (e: ReactMouseEvent) => void
  onHandleOut: (e: ReactMouseEvent) => void
  onDeleteAnchorClick: () => void
  onCancelDeleteHide: () => void
  onHideDeleteSoon: () => void
}

/**
 * 编辑视觉 props：DOM refs 以独立 prop 逐个传递（与 HexagonDrawingSvg 同模式）。
 * React hooks 规则禁止渲染期访问 ref 对象成员（refs.xxx 视为读取 ref 值），
 * 独立 prop 传 RefObject 后直接绑定到 ref 属性是官方推荐用法。
 */
interface HexagonEditVisualsProps extends HexagonEditVisualsHandlers {
  /** 蒙层 mask ref（useEditHandles/updateConfirmedFrame 命令式操作） */
  editMaskRef: RefObject<SVGMaskElement | null>
  /** 蒙层区域镂空 path ref */
  editAreaHoleRef: RefObject<SVGPathElement | null>
  /** 编辑边框白实线 path ref */
  editStrokeRef: RefObject<SVGPathElement | null>
  /** 编辑边框紫虚线 path ref */
  editDashRef: RefObject<SVGPathElement | null>
  /** 节点手柄容器 ref */
  editHandlesRef: RefObject<HTMLDivElement | null>
  /** 「删除锚点」按钮 ref */
  deleteAnchorBtnRef: RefObject<HTMLDivElement | null>
}

export function HexagonEditVisuals({
  editMaskRef,
  editAreaHoleRef,
  editStrokeRef,
  editDashRef,
  editHandlesRef,
  deleteAnchorBtnRef,
  ...handlers
}: HexagonEditVisualsProps) {
  return (
    <>
      {/* 区域外变暗蒙层：SVG mask = 全屏白 rect（亮）+ black 镂空形状（挖洞）——
          区域多边形（padPolygon 外扩 3px 盖住 6px 描边外半）+ 每个节点手柄位置
          的镂空圆（数量随顶点数动态增删，syncEditHandles 动态 append 到 mask） */}
      <svg className='hexagon-area-overlay__edit-mask' aria-hidden='true'>
        <defs>
          <mask id={EDIT_MASK_ID} ref={editMaskRef}>
            <rect x='0' y='0' width='100%' height='100%' fill='white' />
            <path ref={editAreaHoleRef} d='' fill='black' />
          </mask>
        </defs>
        <rect
          x='0'
          y='0'
          width='100%'
          height='100%'
          fill='rgba(0,0,0,0.55)'
          mask={'url(#' + EDIT_MASK_ID + ')'}
        />
      </svg>
      {/* 编辑边框双层：白 6px 实线 + 中央 2px 紫虚线（同路径闭环；d 由
          updateConfirmedFrame 每帧命令式重写，拖拽/平移/缩放实时跟随） */}
      <svg className='hexagon-area-overlay__edit-stroke' aria-hidden='true'>
        <path
          ref={editStrokeRef}
          d=''
          fill='none'
          stroke={EDIT_STROKE_COLOR}
          strokeWidth={EDIT_STROKE_WEIGHT}
        />
        <path
          ref={editDashRef}
          d=''
          fill='none'
          stroke={EDIT_DASH_COLOR}
          strokeWidth={EDIT_DASH_WIDTH}
          strokeDasharray='6 4'
        />
      </svg>
      {/* 编辑节点手柄容器：前 n 顶点 + 后 n 边中点（由 syncEditHandles 命令式
          填充/定位）；容器自身 pointer-events auto 接收委托 mousedown/mouseover/
          mouseout 开启拖拽与「删除锚点」按钮显隐 */}
      <div
        ref={editHandlesRef}
        className='hexagon-area-overlay__edit-handles'
        onMouseDown={handlers.onHandleMouseDown}
        onMouseOver={handlers.onHandleOver}
        onMouseOut={handlers.onHandleOut}
      />
      {/* 「删除锚点」按钮：hover 顶点手柄浮现（display:flex 命令式控制；定位
          见 useEditHandles.positionDeleteAnchorBtn），点击删点、宽限期逻辑见钩子 */}
      <div
        ref={deleteAnchorBtnRef}
        className='hexagon-area-overlay__delete-anchor'
        style={{ display: 'none' }}
        onClick={handlers.onDeleteAnchorClick}
        onMouseEnter={handlers.onCancelDeleteHide}
        onMouseLeave={handlers.onHideDeleteSoon}
      >
        删除锚点
      </div>
    </>
  )
}

/**
 * HexagonTypePanel —— 六边形定格后「选择区域类型」面板（2×2 单选 + 确定/取消）。
 *
 * 仅定格态展示：单选切换即时预览六边形填充视觉（父组件低频 setState）；
 * 「确定」写入 store 进入确认态、「取消」清除重画；位置由父组件
 * computeTypePanelPos 计算（六边形右上顶点右侧 8px、右侧空间不足翻转左侧）。
 */

export interface HexagonTypePanelProps {
  /** 面板视口定位（left/top；翻转场景已换算） */
  pos: { left: number; top: number }
  /** 当前选中类型 value（AREA_TYPE_OPTIONS 之一） */
  areaType: string
  /** 单选切换（父组件 setState → 六边形实时预览新类型视觉） */
  onSelect: (type: string) => void
  /** 确定：按 6 顶点经纬度 + 所选类型写入 store，进入确认态 */
  onConfirm: () => void
  /** 取消：清除六边形回到绘制态 */
  onCancel: () => void
}

export function HexagonTypePanel({
  pos,
  areaType,
  onSelect,
  onConfirm,
  onCancel,
}: HexagonTypePanelProps) {
  return (
    <div
      className='hexagon-area-type-panel'
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div className='hexagon-area-type-panel__title'>选择区域类型</div>
      {AREA_TYPE_OPTIONS.map((opt) => {
        const checked = areaType === opt.value
        const radioCls = checked
          ? 'hexagon-area-type-panel__radio hexagon-area-type-panel__radio--on'
          : 'hexagon-area-type-panel__radio'
        return (
          <label
            key={opt.value}
            className='hexagon-area-type-panel__option'
            style={{ left: opt.left, top: opt.top }}
          >
            <span
              className={radioCls}
              style={checked ? { borderColor: opt.color } : undefined}
            >
              {checked && (
                <span
                  className='hexagon-area-type-panel__radio-inner'
                  style={{ background: opt.color }}
                />
              )}
            </span>
            <span className='hexagon-area-type-panel__swatch' style={{ background: opt.color }} />
            <span className='hexagon-area-type-panel__label'>{opt.label}</span>
            <input
              type='radio'
              name='hexagon-area-type'
              value={opt.value}
              checked={checked}
              onChange={() => onSelect(opt.value)}
            />
          </label>
        )
      })}
      <div className='hexagon-area-type-panel__actions'>
        <button type='button' className='hexagon-area-type-panel__btn' onClick={onCancel}>
          取消
        </button>
        <button
          type='button'
          className='hexagon-area-type-panel__btn hexagon-area-type-panel__btn--primary'
          onClick={onConfirm}
        >
          确定
        </button>
      </div>
    </div>
  )
}
