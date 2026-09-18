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
import {
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react'
import type { MapAdapter } from '../../../../../map-engines/types'
import { useTaskAreaStore } from '../../../../../stores/taskAreaStore'
import type { VertexLL } from './useConfirmedPanel'

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
