/**
 * @file layerStore.ts
 * @description layerStore.ts（自 stores/index.ts 拆出）—— 首页图层显隐全局状态（禁飞区/巡检区/设备标签/任务区域）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { create } from 'zustand'

/** layerStore —— 首页图层显隐全局状态。 */

interface LayerState {
  /** 禁飞区显隐（图层控制面板「禁飞区」开关，默认关） */
  noflyZoneVisible: boolean
  /** 01号巡检区显隐（图层控制面板「巡检区域」开关，默认关） */
  inspectionZoneVisible: boolean
  /** 无人机图标显隐（图层控制面板「设备标签」开关，默认开） */
  deviceLabelsVisible: boolean
  /** 任务区域显隐（图层控制面板「任务区域」开关，默认开；后端 queryTaskAreaList） */
  taskAreaVisible: boolean
  setNoflyZoneVisible: (visible: boolean) => void
  setInspectionZoneVisible: (visible: boolean) => void
  setDeviceLabelsVisible: (visible: boolean) => void
  setTaskAreaVisible: (visible: boolean) => void
}

export const useLayerStore = create<LayerState>((set) => ({
  noflyZoneVisible: false,
  inspectionZoneVisible: false,
  deviceLabelsVisible: true,
  taskAreaVisible: true,
  setNoflyZoneVisible: (visible) => set({ noflyZoneVisible: visible }),
  setInspectionZoneVisible: (visible) => set({ inspectionZoneVisible: visible }),
  setDeviceLabelsVisible: (visible) => set({ deviceLabelsVisible: visible }),
  setTaskAreaVisible: (visible) => set({ taskAreaVisible: visible }),
}))

