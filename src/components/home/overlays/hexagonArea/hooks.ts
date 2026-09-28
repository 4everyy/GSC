import { useCallback, useEffect, useRef, type Dispatch, type RefObject, type SetStateAction, type MouseEvent as ReactMouseEvent } from 'react'
import { type MapAdapter } from '../../../../map-engines/types'
import { useTaskAreaStore } from '../../../../stores/index'
import { pointInPolygon } from './rendering'

/**
 * useConfirmedPanel —— HexagonAreaOverlay 确认态「编辑 | 删除」面板 hover 管理。
 *
 * 区域本体渲染在地图层（确认态遮罩根 pointer-events none 收不到 DOM hover），
 * window mousemove 将光标与 store 全部区域顶点实时投影做射线法命中：命中即
 * 记录该区域并把面板锚定到其右下顶点显示（多区域独立，命中切换时面板跳转
 * 锚点）；鼠标位于面板矩形近旁（外扩 8px，覆盖面板与区域间隙，保证能从区域
 * 移入面板点击）时保持显示；均不满足则隐藏。已隐藏/编辑中区域跳过（与
 * TaskAreaLayer 常态 hover 面板同款过滤）；hover 区域被列表操作隐藏/移除时
 * 借 hiddenIds 订阅立即收起面板（鼠标未动不触发 mousemove 重判的兜底）。
 */

/** 区域顶点（经纬度）形状 */
export interface VertexLL {
  latitude: number
  longitude: number
}

/** 区域顶点（经纬度）→ 视口坐标（含容器偏移；adapter 未就绪返回 null） */
export function projectVertices(eng: MapAdapter | null, vertices: VertexLL[]) {
  if (!eng) return null
  const bounds = eng.getContainer().getBoundingClientRect()
  return vertices.map((v) => {
    const p = eng.project({ lng: v.longitude, lat: v.latitude })
    return { x: p.x + bounds.left, y: p.y + bounds.top }
  })
}

/** useConfirmedPanel 入参：与主组件共享的 refs 与阶段标志 */
export interface ConfirmedPanelOptions {
  /** 确认阶段（confirmedId 非空）才启用 window mousemove 命中监听 */
  confirmedPhase: boolean
  /** 编辑中标志 ref（编辑时面板已卸载，命中判定短路） */
  editingRef: { current: boolean }
  /** 最新光标 ref（同步写入：确认态遮罩收不到 mousemove，回绘制态时钉住图标） */
  mouseRef: { current: { x: number; y: number } | null }
  /** 「编辑 | 删除」面板 DOM ref（命令式定位/显隐） */
  editPanelRef: { current: HTMLDivElement | null }
  /** 地图引擎适配器 ref（顶点投影用） */
  adapterRef: { current: MapAdapter | null }
}

export function useConfirmedPanel(options: ConfirmedPanelOptions) {
  const { confirmedPhase, editingRef, mouseRef, editPanelRef, adapterRef } = options

  /** 面板最近定位矩形（hover 显隐判定：面板隐藏后 DOM hit-test 失效，以几何
   *  矩形兜底判定鼠标在面板近旁保持显示，鼠标才能从区域移入面板完成点击） */
  const lastPanelBoxRef = useRef<{ left: number; top: number } | null>(null)
  /** hover 命中的区域 id（确认态多区域独立面板；null=无命中面板隐藏） */
  const hoverAreaIdRef = useRef<string | null>(null)

  /** 面板通用定位：锚点（区域右下顶点）右侧 8px、垂直居中；右侧空间不足翻转
   *  到左侧；同步记录定位矩形供 hover 近旁保持判定（面板 display none 后几何兜底） */
  const positionEditPanel = useCallback(
    (anchor: { x: number; y: number }) => {
      const editEl = editPanelRef.current
      if (!editEl) return
      const vw = window.innerWidth
      const vh = window.innerHeight
      const flip = anchor.x + 8 + EDIT_PANEL_WIDTH > vw
      const left = flip ? Math.max(8, anchor.x - 8 - EDIT_PANEL_WIDTH) : anchor.x + 8
      const top = Math.min(
        Math.max(anchor.y - EDIT_PANEL_HEIGHT / 2, 8),
        vh - EDIT_PANEL_HEIGHT - 8,
      )
      editEl.style.left = `${left}px`
      editEl.style.top = `${top}px`
      lastPanelBoxRef.current = { left, top }
    },
    [editPanelRef],
  )

  /** 确认态命中测试：光标落在哪个区域多边形内（返回该区域 id + 投影顶点，无命中
   *  null）——多区域重叠时后加入者（数组靠后）优先；已隐藏区域不在地图上渲染
   *  （TaskAreaLayer 过滤 hiddenIds），此处同样跳过；编辑中区域一并跳过（面板已
   *  卸载，防御性兜底） */
  const pickAreaAt = useCallback(
    (cx: number, cy: number) => {
      const s = useTaskAreaStore.getState()
      for (let i = s.areas.length - 1; i >= 0; i--) {
        const a = s.areas[i]
        if (s.hiddenIds.has(a.id) || a.id === s.editingAreaId) continue
        const vs = projectVertices(adapterRef.current, a.vertices)
        if (vs && pointInPolygon(cx, cy, vs)) return { id: a.id, vs }
      }
      return null
    },
    [adapterRef],
  )

  // 确认态「编辑 | 删除」面板 hover 区域显隐（多区域独立）：见文件头注释。
  // 编辑中面板已卸载（editPanelRef 为空自然短路）。
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
  }, [confirmedPhase, pickAreaAt, positionEditPanel, editingRef, mouseRef, editPanelRef])

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
  }, [hiddenIds, editPanelRef])

  return { lastPanelBoxRef, hoverAreaIdRef, positionEditPanel, pickAreaAt }
}

/**
 * useEditAreaRequest —— 区域列表行内「编辑区域」跨层级请求消费（挂载期间持续生效）。
 *
 * editAreaRequest 出现即进入目标区域的确认+编辑态——顶点装入编辑管线
 * （蒙层/手柄/拖拽均基于此）、TaskAreaLayer 切编辑样式（editingAreaId）、
 * 注册 onMove 重投影随图联动；区域中心不在当前视口时先平滑飞转过去
 * （手柄可见才可拖拽编辑）。
 * StrictMode 重挂载/adapter 迟到场景：React 状态未丢但卸载清理已重置 store
 * 编辑标记与 onMove——按 enteredEditIdRef 幂等重建（editingRef 仍为 true
 * 表示本遮罩主观上仍在编辑；右键主动退出后 editingRef=false 不会误重建）。
 */

/** 参数均为主组件内的 refs/状态镜像（含义与生命周期见主组件注释） */
export interface UseEditAreaRequestParams {
  adapter: MapAdapter | null
  adapterRef: RefObject<MapAdapter | null>
  enteredEditIdRef: RefObject<string | null>
  editingRef: RefObject<boolean>
  confirmedVerticesLLRef: RefObject<VertexLL[] | null>
  confirmedIdRef: RefObject<string | null>
  setConfirmedId: Dispatch<SetStateAction<string | null>>
  setEditing: Dispatch<SetStateAction<boolean>>
  offMoveRef: RefObject<(() => void) | null>
  updateConfirmedRef: RefObject<() => void>
}

export function useEditAreaRequest({
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
}: UseEditAreaRequestParams) {
  const editAreaRequest = useTaskAreaStore((s) => s.editAreaRequest)
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
}

/**
 * useEditHandles —— HexagonAreaOverlay 编辑态节点手柄交互钩子。
 *
 * 职责（全部围绕「编辑节点手柄容器」委托交互 + 顶点拖拽管线）：
 * - 手柄容器 mousedown 委托（startHandleDrag）：命中顶点手柄开启角点拖拽、
 *   命中中点手柄立即在相邻两顶点间插入新顶点（经纬度中点）并转为拖拽该新顶点；
 * - hover 委托（onHandleHover/onHandleLeave）：仅顶点手柄（可删锚点）浮出
 *   「删除锚点」按钮（300ms 宽限隐藏，穿过手柄与按钮间 4px 间隙不闪隐）；
 * - 「删除锚点」点击（handleDeleteAnchor）：移除 hover 顶点（至少保留 3 个）
 *   并实时提交 store；
 * - 顶点拖拽 window 监听：mousemove 将光标反投影写入对应顶点经纬度（原地改
 *   ref，零 store 更新保证丝滑）并整帧重绘；mouseup 一次性 updateAreaVertices
 *   提交 store（重算面积）。
 */

/** 区域顶点（经纬度）形状 */
export interface AreaVertexLL {
  latitude: number
  longitude: number
}

/** useEditHandles 入参：与主组件共享的 refs / 重绘入口 */
export interface EditHandlesOptions {
  /** 地图引擎适配器 ref（顶点拖拽 unproject 用） */
  adapterRef: RefObject<MapAdapter | null>
  /** 编辑目标区域顶点经纬度 ref（拖拽原地改写） */
  confirmedVerticesLLRef: RefObject<AreaVertexLL[] | null>
  /** 编辑目标区域 id ref（mouseup 提交 store 用） */
  confirmedIdRef: RefObject<string | null>
  /** 确认态整帧重绘入口（拖拽 mousemove 每帧调用） */
  updateConfirmedRef: RefObject<() => void>
}

/**
 * 「删除锚点」按钮定位/显隐（命令式）：仅顶点手柄且顶点数 > 3 时显示于
 * 该顶点正上方（底边距手柄上缘 4px，顶部空间不足翻转到下方）；记录 hover
 * 顶点序号供点击删除与每帧跟随重定位。
 */
function positionDeleteAnchorBtnImpl(
  btn: HTMLDivElement,
  target: HTMLElement,
  vsLL: AreaVertexLL[],
  hoverVertexRef: RefObject<number | null>,
) {
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
}

export function useEditHandles(options: EditHandlesOptions) {
  const { adapterRef, confirmedVerticesLLRef, confirmedIdRef, updateConfirmedRef } = options

  // 「删除锚点」按钮（hover 顶点手柄浮现）、当前 hover 的顶点序号与延时隐藏
  // 计时器（离开手柄后宽限期内移入按钮/其他手柄则取消隐藏——按钮与手柄间
  // 有 4px 间隙，立即隐藏会导致鼠标永远移不进按钮）
  const deleteAnchorBtnRef = useRef<HTMLDivElement | null>(null)
  const hoverVertexRef = useRef<number | null>(null)
  const deleteAnchorHideTimerRef = useRef<number | null>(null)
  // 编辑拖拽中的顶点序号（中点手柄按下即插入新顶点并转为拖拽该新顶点）
  const editDragRef = useRef<number | null>(null)
  // 节点手柄容器 ref（updateConfirmedFrame 每帧同步数量/位置）
  const editHandlesRef = useRef<HTMLDivElement | null>(null)

  const positionDeleteAnchorBtn = useCallback(
    (target: HTMLElement) => {
      const btn = deleteAnchorBtnRef.current
      const vsLL = confirmedVerticesLLRef.current
      if (!btn || !vsLL) return
      positionDeleteAnchorBtnImpl(btn, target, vsLL, hoverVertexRef)
    },
    [confirmedVerticesLLRef],
  )

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

  /**
   * 手柄容器 mousedown 委托：命中手柄开启顶点拖拽——中点手柄立即在相邻两
   * 顶点间插入新顶点（经纬度中点）并转为拖拽该新顶点；顶点手柄直接拖角点。
   * 手柄位于遮罩层（DOM 高于地图容器），按下不会传给地图（无联动平移）
   */
  const startHandleDrag = useCallback(
    (e: ReactMouseEvent) => {
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
    },
    [cancelDeleteAnchorHide, confirmedVerticesLLRef, updateConfirmedRef],
  )

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
  }, [cancelDeleteAnchorHide, confirmedIdRef, confirmedVerticesLLRef, updateConfirmedRef])

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
  }, [adapterRef, confirmedIdRef, confirmedVerticesLLRef, updateConfirmedRef])

  // 卸载清理「删除锚点」按钮的在途延时隐藏计时器
  useEffect(() => {
    return () => {
      if (deleteAnchorHideTimerRef.current !== null) {
        clearTimeout(deleteAnchorHideTimerRef.current)
        deleteAnchorHideTimerRef.current = null
      }
    }
  }, [])

  return {
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
  }
}

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
