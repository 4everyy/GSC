/**
 * targetLinkStore —— 首页态势图目标图标与目标列表面板的联动状态。
 *
 * TargetListPanel 挂载于 MapToolbar 内部，与 HomePage 平级，无法通过 props 传递
 * hover/点击联动/标记重点/删除等状态，故用 zustand 全局 store 承载
 * （与 deviceLinkStore 同模式，目标 id 对应 config/targets.ts targetList 的 id）：
 * - targets：当前会话的目标列表（含地图坐标 x/y 百分比）；
 *   由 TargetListPanel 挂载时初始化、确认删除后同步移除；
 * - hoveredTargetId：hover 中的目标 id（列表行与地图图标双向同步）；
 * - clickedTargetId：点击联动中的目标 id（列表行点击与地图图标点击双向同步，
 *   再次点击同一目标解除联动）；
 * - markedIds：已标记重点的目标 id 集合（列表旗标与地图图标标记背景同步）；
 * - selectedTargetIds：已勾选目标 id 集合（列表勾选框与地图图标单击双向同步，
 *   与 deviceLinkStore.selectedDevices 同模式）；
 * - targetPanelOpenRequests：面板打开请求计数器（首页地图图标点击时 +1，
 *   MapToolbar 监听后打开目标列表面板，与 devicePanelOpenRequests 同模式）。
 */
import { create } from 'zustand'
import { targetList, type TargetItem } from '../config/targets'

/** 目标地图图标坐标（map-stage 百分比），与飞机初始位置错开分散分布 */
export const TARGET_MAP_POSITIONS: Record<string, { x: number; y: number }> = {
  '01': { x: 21.5, y: 18.2 },
  '02': { x: 76.4, y: 12.6 },
  '03': { x: 60.2, y: 47.8 },
  '04': { x: 15.8, y: 41.5 },
  '05': { x: 47.3, y: 63.6 },
  '06': { x: 80.6, y: 72.4 },
  '07': { x: 27.9, y: 84.8 },
}

/** 地图图标层读取的目标数据（TargetItem + 地图坐标） */
export interface TargetMarkerItem extends TargetItem {
  x: number
  y: number
}

interface TargetLinkState {
  /** 当前会话目标列表（含坐标），删除后同步收缩 */
  targets: TargetMarkerItem[]
  /** hover 中的目标 id（列表行或地图图标），null 表示无 */
  hoveredTargetId: string | null
  /** 点击联动态的目标 id（列表行或地图图标点击置入，再次点击解除），null 表示无 */
  clickedTargetId: string | null
  /** 已标记重点的目标 id 集合 */
  markedIds: Set<string>
  /** 已勾选目标的 id 集合（列表勾选框与地图图标单击双向同步） */
  selectedTargetIds: Set<string>
  /** Open-panel request counter: +1 each time a target icon is clicked on home page */
  targetPanelOpenRequests: number
  setTargets: (targets: TargetMarkerItem[]) => void
  setHoveredTargetId: (id: string | null) => void
  /** 点击目标（列表行/地图图标）：再次点击同一目标解除联动 */
  toggleClickedTarget: (id: string) => void
  /** 清除点击联动态（面板关闭等场景） */
  clearClickedTarget: () => void
  toggleMarked: (id: string) => void
  /** 批量同步标记集合（面板删除目标后清理对应标记） */
  setMarkedIds: (ids: Set<string>) => void
  /** 切换指定目标的勾选状态（列表勾选框 / 地图图标单击共用） */
  toggleTarget: (id: string) => void
  /** 整体替换勾选集合（面板全选/全不选、刷新清空使用） */
  setSelectedTargetIds: (ids: Set<string>) => void
  /** Ask MapToolbar to open the target list panel */
  requestOpenTargetPanel: () => void
  /** 拖拽更新目标图标坐标（map-stage 百分比，自动夹取到 0~100） */
  moveTarget: (id: string, x: number, y: number) => void
}

const initialTargets: TargetMarkerItem[] = targetList.map((t) => ({
  ...t,
  ...(TARGET_MAP_POSITIONS[t.id] ?? { x: 50, y: 50 }),
}))

export const useTargetLinkStore = create<TargetLinkState>((set) => ({
  targets: initialTargets,
  hoveredTargetId: null,
  clickedTargetId: null,
  markedIds: new Set(),
  selectedTargetIds: new Set(),
  targetPanelOpenRequests: 0,
  setTargets: (targets) => set({ targets }),
  setHoveredTargetId: (id) => set({ hoveredTargetId: id }),
  toggleClickedTarget: (id) =>
    set((state) => ({
      clickedTargetId: state.clickedTargetId === id ? null : id,
    })),
  clearClickedTarget: () => set({ clickedTargetId: null }),
  toggleMarked: (id) =>
    set((state) => {
      const next = new Set(state.markedIds)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return { markedIds: next }
    }),
  setMarkedIds: (ids) => set({ markedIds: ids }),
  toggleTarget: (id) =>
    set((state) => {
      const next = new Set(state.selectedTargetIds)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return { selectedTargetIds: next }
    }),
  setSelectedTargetIds: (ids) => set({ selectedTargetIds: ids }),
  requestOpenTargetPanel: () =>
    set((state) => ({ targetPanelOpenRequests: state.targetPanelOpenRequests + 1 })),
  moveTarget: (id, x, y) =>
    set((state) => ({
      targets: state.targets.map((t) =>
        t.id === id
          ? {
              ...t,
              x: Math.min(100, Math.max(0, x)),
              y: Math.min(100, Math.max(0, y)),
            }
          : t,
      ),
    })),
}))
