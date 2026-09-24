/**
 * HexagonAreaOverlay —— 区域列表「添加区域」六边形绘制遮罩（area-list 绘制模式专用）。
 *
 * 截图式从点拉出六边形（与矩形框选同交互范式）：
 * - 进入绘制态不显示六边形，仅停机坪图标光标跟随；
 * - 按住左键拖动：半径 = 按下点到光标的距离，六边形始终平移到「右下顶点与
 *   光标（停机坪图标）精确重合」——拖着右下角顶点拉出对称正六边形；
 * - 松开左键定格，显示「选择区域类型」面板（默认集结区）；「确定」写入 store
 *   进入确认态——TaskAreaLayer 立即以持久样式渲染该区域，遮罩收起蒙版/信息卡
 *   并放行鼠标到地图，右下顶点右侧挂「编辑 | 删除」面板（onMove 地理锚定，
 *   平移/缩放每帧重投影跟随）；
 * - 确认态点「编辑」开启编辑态：区域外蒙层镂空高亮 + 白 6px 描边/紫虚线 +
 *   顶点/边中点节点手柄（拖顶点改区、按中点插点、hover 删点——详见
 *   useEditHandles）；右键退出编辑并保留内容；「删除」移除区域，全部删光才
 *   退出绘制模式；
 * - 确认态空白单击不回绘制态（防误拉新六边形重复添加）；需经区域列表重新点
 *   「添加区域」（addAreaRequests 计数变化，本遮罩监听后回绘制态）；
 * - Esc 由 useAdvancedPanelStates 全局监听退出（本组件随之卸载）；绘制阶段
 *   右键直接退出。
 *
 * 丝滑性能设计（拖动全程零 React 重渲染，视觉样式与之前完全一致）：
 * - mousemove 只写 ref + requestAnimationFrame 合帧，一帧内多次事件只绘制一次；
 * - 六边形蒙版/本体/顶点圆点与编辑视觉由 ref 命令式直写属性（无 diff 开销）；
 * - 悬浮图标仅命令式更新 transform（合成层平移）；仅按下/定格等低频时刻 setState。
 *
 * 模块拆分（./hexagonArea/，各部分细节见对应文件头注释）：
 * - constants 共享常量；geometry 几何工具与命令式 DOM 辅助；
 * - useEditHandles 编辑节点手柄交互（拖拽/插点/删点管线）；
 * - useConfirmedPanel 确认态「编辑 | 删除」面板 hover 管理；
 * - useEditAreaRequest 区域列表行内「编辑区域」请求消费；
 * - HexagonDrawingSvg / HexagonEditVisuals / HexagonTypePanel 视觉子组件。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type MapAdapter } from '../../../map-engines/types'
import { homeImages } from '../../../assets/images/home'
import { useTaskAreaStore, useLayerStore } from '../../../stores/index'
import { MIN_RADIUS, DEFAULT_AREA_TYPE, HEX_STROKE_COLOR, NOFLY_HATCH_PATTERN_ID, NOFLY_STROKE_COLOR, TASK_FILL_COLOR, TASK_STROKE_COLOR, LANDING_FILL_COLOR, LANDING_STROKE_COLOR, EDIT_AREA_PAD, useConfirmedPanel, projectVertices, type VertexLL, useEditHandles, useEditAreaRequest } from './hexagonArea/hooks'
import { BR_UNIT, TR_UNIT, hexVertices, hexPathD, padPolygon, syncEditHandles, computeTypePanelPos, computeHexInfo, type HexGeometry, HexagonDrawingSvg, HexagonEditVisuals, HexagonTypePanel } from './hexagonArea/rendering'

interface HexagonAreaOverlayProps {
  /** 地图引擎适配器（顶点视口坐标 ↔ WGS84 经纬度） */
  adapter: MapAdapter | null
  /** 退出绘制模式（绘制阶段右键/Esc；确认态右键/Esc 交还 TaskAreaLayer 持久渲染） */
  onExit: () => void
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
  // 「选择区域类型」面板当前选中类型（定格后展示；确定时随顶点一并写入 addArea）
  const [areaType, setAreaType] = useState<string>(DEFAULT_AREA_TYPE)

  // ===== 确认态（「确定」后保留绘制区域） =====
  // 已确认区域 id（store 草稿；TaskAreaLayer 跳过其渲染，由本遮罩继续展示）
  const [confirmedId, setConfirmedId] = useState<string | null>(null)
  const confirmedIdRef = useRef<string | null>(null)
  // 编辑中（确认态点「编辑」开启编辑态视觉 + 区域外蒙层，右键退出并保留）
  const [editing, setEditing] = useState(false)
  const editingRef = useRef(false)
  // 已进入编辑的目标区域 id（StrictMode 重挂载/adapter 迟到时幂等重建编辑态）
  const enteredEditIdRef = useRef<string | null>(null)
  // 确认区域 6 顶点经纬度（onMove 每帧 project 回视口坐标重绘，地理锚定）
  const confirmedVerticesLLRef = useRef<VertexLL[] | null>(null)
  // 确认态 onMove 取消句柄
  const offMoveRef = useRef<(() => void) | null>(null)
  // adapter ref（onMove 闭包/卸载清理读取最新值；渲染后经下方 useLayoutEffect 同步）
  const adapterRef = useRef(adapter)

  // 已定格：有六边形且松开了左键（类型面板/信息卡仅定格时展示）——
  // 确认态（confirmedId 非空）不算定格（信息卡收起、左键不再触发拉伸）
  const fixed = hex !== null && !dragging && confirmedId === null
  // 绘制阶段（含按住拉伸）：停机坪图标光标跟随、遮罩拦截全部鼠标
  const drawingPhase = !fixed && confirmedId === null
  // 确认阶段：保留绘制视觉；遮罩根放行鼠标到地图（仅面板可点）
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
  // 确认态「编辑 | 删除」面板（命令式定位/显隐）
  const editPanelRef = useRef<HTMLDivElement | null>(null)
  // 编辑视觉 refs（editing 时经 HexagonEditVisuals 挂载）：蒙层 mask（rect +
  // 镂空 path + 动态镂空圆）、边框双层 path、手柄容器与删除锚点按钮在钩子内
  const editMaskRef = useRef<SVGMaskElement | null>(null)
  const editAreaHoleRef = useRef<SVGPathElement | null>(null)
  const editStrokeRef = useRef<SVGPathElement | null>(null)
  const editDashRef = useRef<SVGPathElement | null>(null)

  // 确认态「编辑 | 删除」面板 hover 管理（window mousemove 射线法命中多区域、
  // 面板近旁保持、hover 区域被隐藏/移除立即收起；详见该文件头注释）
  const { hoverAreaIdRef, lastPanelBoxRef, positionEditPanel } = useConfirmedPanel({
    confirmedPhase,
    editingRef,
    mouseRef,
    editPanelRef,
    adapterRef,
  })

  // 确认态整帧重绘入口（先占位，渲染后 useLayoutEffect 同步最新实现——事件
  // 回调均经 .current 读取，占位即可保证钩子内部闭包拿到稳定 ref）
  const updateConfirmedRef = useRef<() => void>(() => {})

  // 编辑节点手柄交互（顶点拖拽管线/中点插点/「删除锚点」按钮显隐与点击，
  // 含 window 拖拽监听与计时器清理；详见该文件头注释）
  const {
    deleteAnchorBtnRef,
    hoverVertexRef,
    editHandlesRef,
    positionDeleteAnchorBtn,
    cancelDeleteAnchorHide,
    hideDeleteAnchorSoon,
    startHandleDrag,
    onHandleHover,
    onHandleLeave,
    handleDeleteAnchor,
  } = useEditHandles({
    adapterRef,
    confirmedVerticesLLRef,
    confirmedIdRef,
    updateConfirmedRef,
  })

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

  const drawFrame = useCallback(
    (h: HexGeometry) => {
      drawVertices(hexVertices(h))
    },
    [drawVertices],
  )
  const drawRef = useRef(drawFrame)

  /**
   * 确认态一帧重绘（onMove 每渲染帧 + 拖拽 mousemove + 相关重渲后调用）：
   * ①「编辑 | 删除」面板跟随——锚定 hover 命中的区域（store 最新顶点投影，
   * 多区域独立，平移/缩放每帧重定位；编辑中面板已卸载自然短路）；
   * ②编辑中视觉——边框双层（白 6px 实线 + 2px 紫虚线同路径）、节点手柄
   * （前 n 顶点 + 后 n 边中点，DOM 数量随顶点数动态增删，见 syncEditHandles）、
   * 蒙层镂空（padPolygon 沿边法线外扩 3px 盖住 6px 描边外半 + 2n 镂空圆）——
   * 全部命令式直写，拖拽/平移/缩放每帧跟随（地理锚定 + 拖拽实时改顶点）。
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
        const hvs = projectVertices(adapterRef.current, hovArea.vertices)
        if (hvs) positionEditPanel(hvs[2])
      }
    }
    // ②编辑视觉基于当前编辑目标顶点（vsLL）；非编辑且无编辑目标则到此为止
    const vsLL = confirmedVerticesLLRef.current
    const vs = vsLL ? projectVertices(adapterRef.current, vsLL) : null
    if (!vs) return
    // 编辑边框双层：白 6px 实线 + 中央 2px 紫虚线（同路径闭环；拖拽/缩放每帧重写）
    const d = hexPathD(vs)
    if (editStrokeRef.current) editStrokeRef.current.setAttribute('d', d)
    if (editDashRef.current) editDashRef.current.setAttribute('d', d)
    // 节点手柄 + 蒙层镂空圆同步（数量/位置/kind 纠偏，见 geometry.syncEditHandles）
    const handles = editHandlesRef.current
    const mask = editMaskRef.current
    if (handles && mask) syncEditHandles(handles, mask, vs)
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
  }, [positionDeleteAnchorBtn, positionEditPanel])

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

  // 区域列表行内「编辑」消费（editAreaRequest 出现即进入目标区域确认+编辑态、
  // 视口外兜底飞转、StrictMode 重挂载/adapter 迟到幂等重建）——详见该钩子注释
  useEditAreaRequest({
    adapter,
    adapterRef,
    enteredEditIdRef,
    editingRef,
    confirmedVerticesLLRef,
    confirmedIdRef,
    setConfirmedId,
    setEditing,
    offMoveRef,
    updateConfirmedRef,
  })

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

  // 定格后右下顶点信息卡：经纬度（真实反投影）+ 面积（与 addArea 包围盒估算
  // 同口径，确认后列表面积与本卡一致；计算见 geometry.computeHexInfo）
  const info = useMemo(() => {
    if (!fixed || !hex || !adapter) return null
    const bounds = adapter.getContainer().getBoundingClientRect()
    // 箭头包装保住 adapter 绑定：裸方法引用 adapter.unproject 传入 computeHexInfo
    // 后调用时 this 为 undefined，MapLibreAdapter.unproject 内 this.map 直接抛
    // "Cannot read properties of undefined (reading 'map')"（定格瞬间崩溃进 ErrorBoundary）
    return computeHexInfo(hex, (p) => adapter.unproject(p), bounds.left, bounds.top)
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
        // 编辑中右键：忽略（防误触丢编辑，退出见 contextmenu 监听）；
        // 定格后右键：清除六边形回到绘制态可重新拉出；
        // 绘制阶段右键：退出绘制模式（'area-list' 无对应功能面板，直接退出）
        if (confirmedPhase) {
          if (!editingRef.current) onExit()
        } else if (fixed) resetDrawing()
        else onExit()
      }}
    >
      {/* 绘制阶段全幅 SVG 画布（蒙版/六边形/顶点；确认态整体卸载——六边形交
          TaskAreaLayer 持久渲染，防绘制视觉覆盖），视觉细节见 HexagonDrawingSvg */}
      {!confirmedPhase && hex && (
        <HexagonDrawingSvg
          hex={hex}
          viewSize={size}
          polyFill={polyFill}
          polyStroke={polyStroke}
          maskRef={maskRef}
          polyRef={polyRef}
          dotsRef={dotsRef}
        />
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
      {/* 编辑态视觉（蒙层镂空/边框双层/节点手柄/删除锚点按钮——全部本遮罩 SVG
          层绘制，TaskAreaLayer 编辑中整体跳过该区域），详见 HexagonEditVisuals */}
      {confirmedPhase && editing && (
        <HexagonEditVisuals
          editMaskRef={editMaskRef}
          editAreaHoleRef={editAreaHoleRef}
          editStrokeRef={editStrokeRef}
          editDashRef={editDashRef}
          editHandlesRef={editHandlesRef}
          deleteAnchorBtnRef={deleteAnchorBtnRef}
          onHandleMouseDown={startHandleDrag}
          onHandleOver={onHandleHover}
          onHandleOut={onHandleLeave}
          onDeleteAnchorClick={handleDeleteAnchor}
          onCancelDeleteHide={cancelDeleteAnchorHide}
          onHideDeleteSoon={hideDeleteAnchorSoon}
        />
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
          <div
            className="hexagon-area-edit-panel__btn hexagon-area-edit-panel__btn--delete"
            onClick={handleDelete}
          >
            删除
          </div>
        </div>
      )}
      {/* 「选择区域类型」面板：仅定格态展示（确定=confirmArea 进入确认态/
          取消=清除重画；编辑态不展示——右键退出编辑并保留内容），详见
          HexagonTypePanel */}
      {fixed && typePanelPos && (
        <HexagonTypePanel
          pos={typePanelPos}
          areaType={areaType}
          onSelect={setAreaType}
          onConfirm={confirmArea}
          onCancel={resetDrawing}
        />
      )}
    </div>,
    document.body,
  )
}