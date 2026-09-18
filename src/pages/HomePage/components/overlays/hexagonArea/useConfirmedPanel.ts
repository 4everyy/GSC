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
import { useCallback, useEffect, useRef } from 'react'
import type { MapAdapter } from '../../../../../map-engines/types'
import { useTaskAreaStore } from '../../../../../stores/taskAreaStore'
import { pointInPolygon } from './geometry'
import { EDIT_PANEL_WIDTH, EDIT_PANEL_HEIGHT } from './constants'

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