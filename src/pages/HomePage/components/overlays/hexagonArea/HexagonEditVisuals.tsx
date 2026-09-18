/**
 * HexagonEditVisuals —— 六边形区域编辑态视觉（蒙层镂空/边框双层/手柄容器/
 * 「删除锚点」按钮）。
 *
 * 编辑中挂载：区域外蒙层（mask 镂空多边形 + 动态镂空圆，区域内保持全亮）、
 * 编辑边框双层（白 6px 实线 + 中央 2px #7160F2 虚线，同路径闭环）、节点手柄
 * 容器（数量/位置由 syncEditHandles 每帧同步）与「删除锚点」按钮（hover 顶点
 * 手柄浮现，显隐/定位由 useEditHandles 命令式管理）。
 */
import type { RefObject, MouseEvent as ReactMouseEvent } from 'react'
import {
  EDIT_MASK_ID,
  EDIT_STROKE_COLOR,
  EDIT_STROKE_WEIGHT,
  EDIT_DASH_COLOR,
  EDIT_DASH_WIDTH,
} from './constants'

/** 主组件透传的编辑视觉 DOM refs（useEditHandles/updateConfirmedFrame 命令式操作） */
export interface HexagonEditVisualsRefs {
  editMaskRef: RefObject<SVGMaskElement | null>
  editAreaHoleRef: RefObject<SVGPathElement | null>
  editStrokeRef: RefObject<SVGPathElement | null>
  editDashRef: RefObject<SVGPathElement | null>
  editHandlesRef: RefObject<HTMLDivElement | null>
  deleteAnchorBtnRef: RefObject<HTMLDivElement | null>
}

/** 主组件透传的交互回调（来自 useEditHandles） */
export interface HexagonEditVisualsHandlers {
  onHandleMouseDown: (e: ReactMouseEvent) => void
  onHandleOver: (e: ReactMouseEvent) => void
  onHandleOut: (e: ReactMouseEvent) => void
  onDeleteAnchorClick: () => void
  onCancelDeleteHide: () => void
  onHideDeleteSoon: () => void
}

export function HexagonEditVisuals({
  refs,
  handlers,
}: {
  refs: HexagonEditVisualsRefs
  handlers: HexagonEditVisualsHandlers
}) {
  return (
    <>
      {/* 区域外变暗蒙层：SVG mask = 全屏白 rect（亮）+ black 镂空形状（挖洞）——
          区域多边形（padPolygon 外扩 3px 盖住 6px 描边外半）+ 每个节点手柄位置
          的镂空圆（数量随顶点数动态增删，syncEditHandles 动态 append 到 mask） */}
      <svg className='hexagon-area-edit-mask' aria-hidden='true'>
        <defs>
          <mask id={EDIT_MASK_ID} ref={refs.editMaskRef}>
            <rect x='0' y='0' width='100%' height='100%' fill='white' />
            <path ref={refs.editAreaHoleRef} d='' fill='black' />
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
      <svg className='hexagon-area-edit-stroke' aria-hidden='true'>
        <path
          ref={refs.editStrokeRef}
          d=''
          fill='none'
          stroke={EDIT_STROKE_COLOR}
          strokeWidth={EDIT_STROKE_WEIGHT}
        />
        <path
          ref={refs.editDashRef}
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
        ref={refs.editHandlesRef}
        className='hexagon-area-edit-handles'
        onMouseDown={handlers.onHandleMouseDown}
        onMouseOver={handlers.onHandleOver}
        onMouseOut={handlers.onHandleOut}
      />
      {/* 「删除锚点」按钮：hover 顶点手柄浮现（display:flex 命令式控制；定位
          见 useEditHandles.positionDeleteAnchorBtn），点击删点、宽限期逻辑见钩子 */}
      <div
        ref={refs.deleteAnchorBtnRef}
        className='hexagon-area-edit-delete-anchor'
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
