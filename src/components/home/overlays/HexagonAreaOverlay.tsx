/**
 * @file HexagonAreaOverlay.tsx
 * @description HexagonAreaOverlay —— 任务区域绘制遮罩（状态机编排层）。 结构：绘制管线 useDrawingPipeline / 交互 hooks.ts / 渲染 rendering.tsx / 阶段视觉 visuals.tsx，均自本文件拆出（单一职责、接口可控）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type MapAdapter } from '../../../map-engines/types'
import { useTaskAreaStore, useLayerStore } from '../../../stores/index'
import {
  DEFAULT_AREA_TYPE,
  HEX_STROKE_COLOR,
  NOFLY_HATCH_PATTERN_ID,
  NOFLY_STROKE_COLOR,
  TASK_FILL_COLOR,
  TASK_STROKE_COLOR,
  LANDING_FILL_COLOR,
  LANDING_STROKE_COLOR,
  EDIT_AREA_PAD,
  useConfirmedPanel,
  projectVertices,
  type VertexLL,
  useEditHandles,
  useEditAreaRequest,
} from './hexagonArea/hooks'
import {
  TR_UNIT,
  hexVertices,
  hexPathD,
  padPolygon,
  syncEditHandles,
  computeTypePanelPos,
  computeHexInfo,
  type HexGeometry,
  HexagonDrawingSvg,
  HexagonEditVisuals,
  HexagonTypePanel,
} from './hexagonArea/rendering'
import { useDrawingPipeline } from './hexagonArea/useDrawingPipeline'
import {
  LandingCenterIcon,
  DrawingCursorImg,
  HexagonInfoCard,
  ConfirmedEditPanel,
} from './hexagonArea/visuals'

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
  // 六边形几何（React 状态仅供挂载/定格 UI；拖动期间零 setState
  const [hex, setHex] = useState<HexGeometry | null>(null)
  const hexRef = useRef<HexGeometry | null>(null)
  // 按住左键拉伸中 / 已定格（松开后，显示「选择区域类型」面板）
  const [dragging, setDragging] = useState(false)
  // 「选择区域类型」面板当前选中类型（定格后展示；确定时随顶点一并写入 addArea）
  const [areaType, setAreaType] = useState<string>(DEFAULT_AREA_TYPE)
  // 确定（addNewTaskArea 上送）进行中：面板按钮禁用防重复提交
  const [submitting, setSubmitting] = useState(false)
  // 同步 ref（confirmArea 闭包读取，防 await 期间重复触发）
  const submittingRef = useRef(false)

  // 确认态（「确定」后保留绘制区域）已确认区域 id（store 草稿；TaskAreaLayer 跳过其渲染，由本遮罩继续展示）
  const [confirmedId, setConfirmedId] = useState<string | null>(null)
  const confirmedIdRef = useRef<string | null>(null)
  // 编辑中（确认态点「编辑」开启编辑态视觉 + 区域外蒙层，右键退出并保留）
  const [editing, setEditing] = useState(false)
  const editingRef = useRef(false)
  // 已进入编辑的目标区域 id（StrictMode 重挂载/adapter 迟到时幂等重建编辑态）
  const enteredEditIdRef = useRef<string | null>(null)
  // 确认区域 4 顶点经纬度（onMove 每帧 project 回视口坐标重绘，地理锚定）
  const confirmedVerticesLLRef = useRef<VertexLL[] | null>(null)
  // 确认态 onMove 取消句柄
  const offMoveRef = useRef<(() => void) | null>(null)
  // adapter ref…
  const adapterRef = useRef(adapter)

  // 已定格：有六边形且松开了左键（类型面板/信息卡仅定格时展示）——确认态（confirmedId 非空）不算定格（信息卡收起
  const fixed = hex !== null && !dragging && confirmedId === null
  // 绘制阶段（含按住拉伸）：停机坪图标光标跟随、遮罩拦截全部鼠标
  const drawingPhase = !fixed && confirmedId === null
  // 确认阶段：保留绘制视觉；遮罩根放行鼠标到地图（仅面板可点）
  const confirmedPhase = confirmedId !== null

  // 绘制管线（按下锚点/光标跟随/rAF 合帧命令式绘制/定格；含蒙版/六边形/顶点 refs）——详见 useDrawingPipeline
  const {
    anchorRef,
    mouseRef,
    rafRef,
    cursorRafRef,
    maskRef,
    polyRef,
    dotsRef,
    cursorImgRef,
    drawRef,
    moveCursor,
    scheduleDragDraw,
    forceCursorRecompute,
    finishDrag,
  } = useDrawingPipeline({ size, hexRef, setHex, setDragging })

  // 确认态「编辑 | 删除」面板（命令式定位/显隐）
  const editPanelRef = useRef<HTMLDivElement | null>(null)
  // 编辑视觉 refs（editing 时经 HexagonEditVisuals 挂载）：蒙层 mask（rect +镂空 path + 动态镂空圆）
  const editMaskRef = useRef<SVGMaskElement | null>(null)
  const editAreaHoleRef = useRef<SVGPathElement | null>(null)
  const editStrokeRef = useRef<SVGPathElement | null>(null)
  const editDashRef = useRef<SVGPathElement | null>(null)

  // 确认态「编辑 | 删除」面板 hover 管理（window mousemove 射线法命中多区域、面板近旁保持
  const { hoverAreaIdRef, lastPanelBoxRef, positionEditPanel } = useConfirmedPanel({
    confirmedPhase,
    editingRef,
    mouseRef,
    editPanelRef,
    adapterRef,
  })

  // 确认态整帧重绘入口（先占位，渲染后 useLayoutEffect 同步最新实现——事件回调均经 .current 读取
  const updateConfirmedRef = useRef<() => void>(() => {})

  // 编辑节点手柄交互（顶点拖拽管线/中点插点/「删除锚点」按钮显隐与点击，含 window 拖拽监听与计时器清理；详见该文件头注释）
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

  /** 确认态整帧重绘：①「编辑 | 删除」面板跟随 hover 区域重定位 ②编辑视觉按投影重绘 */
  const updateConfirmedFrame = useCallback(() => {
    if (!adapterRef.current) return
    // ①面板跟随：按 hover 区域 id 从 store 取最新顶点重投影重定位
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
    // 节点手柄 + 蒙层镂空圆同步…
    const handles = editHandlesRef.current
    const mask = editMaskRef.current
    if (handles && mask) syncEditHandles(handles, mask, vs)
    // 蒙层区域镂空：padPolygon 每条边恰沿法线外移 3px（盖住 6px 描边外半）
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

  // 渲染后统一同步 adapter 最新值（事件回调/rAF/onMove 闭包读取；useLayoutEffect 在 paint 前同步执行
  useLayoutEffect(() => {
    adapterRef.current = adapter
    updateConfirmedRef.current = updateConfirmedFrame
  })

  // 进入绘制模式即重算一次（鼠标可能仍停在「添加区域」按钮的手势光标上）
  useEffect(() => {
    forceCursorRecompute()
  }, [forceCursorRecompute])

  // 卸载（退出绘制模式）清理：取消未决 rAF、确认态 onMove 监听
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
      // 兜底退出编辑（未在编辑时为 no-op）：先提交区域编辑（Esc/卸载路径无右键确认机会，顶点修改仅在本地 store，持久化统一在此补上送 updTaskArea）
      if (editingRef.current && confirmedIdRef.current) {
        useTaskAreaStore.getState().commitAreaEdit(confirmedIdRef.current)
      }
      useTaskAreaStore.getState().setEditingArea(null)
      document.body.style.cursor = 'none'
      requestAnimationFrame(() => {
        document.body.style.cursor = ''
      })
    }
  }, [])

  // 区域列表行内「编辑」消费（editAreaRequest 出现即进入目标区域确认+编辑态、视口外兜底飞转
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

  /** 清除六边形回到绘制态：不显示六边形，可重新按住左键拉出（定格后右键/「取消」走此函数——确认态「删除」移除区域后同样回到绘制态重新开始） */
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

  /** 清理确认态挂起资源（onMove 监听/refs），不动绘制几何（供删除/退出复用） */
  const clearConfirmed = useCallback(() => {
    if (editingRef.current && confirmedIdRef.current) {
      useTaskAreaStore.getState().commitAreaEdit(confirmedIdRef.current)
    }
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

  // 确认态相关重渲（进入确认/编辑切换/adapter 就绪）后立即按投影修正一帧：useLayoutEffect 在 paint 前执行
  useLayoutEffect(() => {
    if (confirmedId) updateConfirmedFrame()
  }, [confirmedId, editing, adapter, updateConfirmedFrame])

  // window 级兜底：鼠标移出窗口后松开左键同样定格
  useEffect(() => {
    if (!dragging) return
    const onMouseUp = () => finishDrag()
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [dragging, finishDrag])

  // 编辑态右键：先 commit 区域编辑（顶点修改仅在本地 store，持久化在此补上送 updTaskArea）再退出编辑
  useEffect(() => {
    if (!editing) return
    const onCtx = (e: MouseEvent) => {
      e.preventDefault()
      if (!editingRef.current) return
      if (confirmedIdRef.current) {
        useTaskAreaStore.getState().commitAreaEdit(confirmedIdRef.current)
      }
      useTaskAreaStore.getState().setEditingArea(null)
      editingRef.current = false
      setEditing(false)
      forceCursorRecompute()
    }
    window.addEventListener('contextmenu', onCtx)
    return () => window.removeEventListener('contextmenu', onCtx)
  }, [editing, forceCursorRecompute])

  /** 确定（定格态）：按四边形 4 顶点经纬度 + 所选类型上送 addNewTaskArea… */
  const confirmArea = async () => {
    const h = hexRef.current
    if (!adapter || !h) {
      onExit()
      return
    }
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    const bounds = adapter.getContainer().getBoundingClientRect()
    const vertices = hexVertices(h).map((v) => {
      const ll = adapter.unproject({ x: v.x - bounds.left, y: v.y - bounds.top })
      return { latitude: ll.lat, longitude: ll.lng }
    })
    // 上送接口并以后端数据刷新列表（失败 store 内 toast，返回 null 留在定格态）
    const id = await useTaskAreaStore.getState().addArea(vertices, areaType)
    submittingRef.current = false
    setSubmitting(false)
    if (!id) return
    // 自动开启「任务区域」图层：退出确认态后（或列表中）区域持久可见
    const layer = useLayerStore.getState()
    if (!layer.taskAreaVisible) layer.setTaskAreaVisible(true)
    // 进入确认态：记录顶点经纬度 + 区域 id，注册 onMove 重投影（以后端返回顶点为准对齐持久渲染）
    const created = useTaskAreaStore.getState().areas.find((a) => a.id === id)
    const vsLL = created ? created.vertices : vertices
    confirmedVerticesLLRef.current = vsLL
    confirmedIdRef.current = id
    setConfirmedId(id)
    setEditing(false)
    offMoveRef.current = adapter.onMove(() => updateConfirmedRef.current())
  }

  /** 确认态「编辑」：面板所属区域（hover 命中）为编辑目标——写入taskAreaStore.editingAreaId… */
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

  /** 确认态「删除」（多区域独立）：移除面板所属（hover 命中）的区域并收起面板——仍剩其他区域则留在确认态（继续 hover 其余区域可编辑/删除，鼠标保持默认样式） */
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

  // 区域列表「添加区域」再次触发（确认态/编辑态/定格中重按按钮）：taskAreaStore.addAreaRequests 计数 +1——退出确认/编辑态并清空绘制几何
  const addAreaRequests = useTaskAreaStore((s) => s.addAreaRequests)
  const addReqRef = useRef(addAreaRequests)
  useEffect(() => {
    if (addAreaRequests === addReqRef.current) return
    addReqRef.current = addAreaRequests
    clearConfirmed()
    resetDrawing()
  }, [addAreaRequests, clearConfirmed, resetDrawing])

  // 定格后「选择区域类型」面板定位：置于六边形右上顶点右侧 8px
  const typePanelPos = useMemo(() => {
    if (!hex) return null
    // 右上顶点（30° 方位角）
    const tr = { x: hex.cx + hex.r * TR_UNIT.x, y: hex.cy + hex.r * TR_UNIT.y }
    return computeTypePanelPos(tr, size.w, size.h)
  }, [hex, size.w, size.h])

  // 定格后右下顶点信息卡：经纬度（真实反投影）+ 面积（与 addArea 包围盒估算同口径
  const info = useMemo(() => {
    if (!fixed || !hex || !adapter) return null
    const bounds = adapter.getContainer().getBoundingClientRect()
    // 箭头包装保住 adapter 绑定：裸方法引用 adapter.unproject 传入 computeHexInfo后调用时 this 为 undefined
    return computeHexInfo(hex, (p) => adapter.unproject(p), bounds.left, bounds.top)
  }, [fixed, hex, adapter])

  // 定格面板单选变化即切换六边形实时预览视觉（低频 setState）——禁飞区 45° 斜线阴影…
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
        // 绘制阶段（含按住拉伸）隐藏原生光标（DOM 停机坪图标跟随）
        cursor: drawingPhase ? 'none' : 'default',
        // 确认态：地图交互恢复（可拖动/缩放查看区域），仅编辑/删除面板与编辑中的类型面板 pointer-events auto 可点
        pointerEvents: confirmedPhase ? 'none' : 'auto',
      }}
      onMouseDown={(e) => {
        if (e.button !== 0) return
        // 已定格：等待「确定/取消」（右键也可清除重画）
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
        // 确认态右键：结束流程退出（遮罩卸载、草稿交还 TaskAreaLayer 持久渲染）
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
      {/* 降落区中心地面图标（定格且选中「降落区」时的预览），详见 LandingCenterIcon */}
      {fixed && isLanding && hex && <LandingCenterIcon hex={hex} />}
      {/* 绘制阶段跟随光标的停机坪图标，详见 DrawingCursorImg */}
      {drawingPhase && <DrawingCursorImg cursorImgRef={cursorImgRef} mouseRef={mouseRef} />}
      {/* 定格后右下顶点信息卡，详见 HexagonInfoCard */}
      {fixed && info && <HexagonInfoCard info={info} viewSize={size} />}
      {/* 编辑态视觉（蒙层镂空/边框双层/节点手柄/删除锚点按钮），详见 HexagonEditVisuals */}
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
      {/* 确认态「编辑 | 删除」面板，详见 ConfirmedEditPanel */}
      {confirmedPhase && !editing && (
        <ConfirmedEditPanel panelRef={editPanelRef} onEdit={handleEdit} onDelete={handleDelete} />
      )}
      {/* 「选择区域类型」面板（仅定格态展示；确定=上送、取消=重画；submitting 禁用防重复提交），详见 HexagonTypePanel */}
      {fixed && typePanelPos && (
        <HexagonTypePanel
          pos={typePanelPos}
          areaType={areaType}
          submitting={submitting}
          onSelect={setAreaType}
          onConfirm={confirmArea}
          onCancel={resetDrawing}
        />
      )}
    </div>,
    document.body,
  )
}