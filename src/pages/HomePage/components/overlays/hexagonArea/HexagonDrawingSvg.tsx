/**
 * HexagonDrawingSvg —— 六边形绘制阶段全幅 SVG 画布（蒙版/六边形/顶点圆点）。
 *
 * 仅绘制阶段挂载（含按住拉伸与定格态；确认态整体卸载——六边形交
 * TaskAreaLayer 持久渲染，防绘制视觉覆盖持久样式）。拖动期间父组件经
 * maskRef/polyRef/dotsRef 命令式直写 d/cx/cy（零 React 重渲染，丝滑关键）。
 */
import type { RefObject } from 'react'
import { hexVertices, hexPathD, type HexGeometry } from './geometry'
import {
  HEX_STROKE_COLOR,
  NOFLY_HATCH_PATTERN_ID,
  NOFLY_HATCH_COLOR,
} from './constants'

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
        {/* 截图式蒙版：全屏矩形挖去六边形（evenodd 反转填充） */}
        <mask id="hexagon-area-draw-mask">
          <path ref={maskRef} d={maskD} fill="black" fillRule="evenodd" />
        </mask>
      </defs>
      {/* 蒙层矩形（引用上 defs.mask；rgba(0,0,0,0.55) 见 CSS 类） */}
      <rect width={viewSize.w} height={viewSize.h} mask="url(#hexagon-area-draw-mask)" />
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