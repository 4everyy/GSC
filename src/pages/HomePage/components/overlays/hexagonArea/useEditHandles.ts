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
import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import type { MapAdapter } from '../../../../../map-engines/types'
import { useTaskAreaStore } from '../../../../../stores/taskAreaStore'
import { DELETE_ANCHOR_GAP, MIN_VERTEX_COUNT } from './constants'

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