/**
 * layerStore —— 首页图层显隐全局状态。
 *
 * LayerControlPanel 挂载于 MapControls 内部，与 HomePage 中的地图元素平级，
 * 无法通过 props 传递开关状态，故用 zustand 全局 store 承载（与 deviceLinkStore 同模式）：
 * - noflyZoneVisible：红色禁飞区显隐（默认关）；
 * - inspectionZoneVisible：01号巡检区显隐（默认关）；
 * - deviceLabelsVisible：无人机设备图标显隐（默认开）。
 */
import { create } from 'zustand'

interface LayerState {
  /** 禁飞区显隐（图层控制面板「禁飞区」开关，默认关） */
  noflyZoneVisible: boolean
  /** 01号巡检区显隐（图层控制面板「巡检区域」开关，默认关） */
  inspectionZoneVisible: boolean
  /** 无人机图标显隐（图层控制面板「设备标签」开关，默认开） */
  deviceLabelsVisible: boolean
  setNoflyZoneVisible: (visible: boolean) => void
  setInspectionZoneVisible: (visible: boolean) => void
  setDeviceLabelsVisible: (visible: boolean) => void
}

export const useLayerStore = create<LayerState>((set) => ({
  noflyZoneVisible: false,
  inspectionZoneVisible: false,
  deviceLabelsVisible: true,
  setNoflyZoneVisible: (visible) => set({ noflyZoneVisible: visible }),
  setInspectionZoneVisible: (visible) => set({ inspectionZoneVisible: visible }),
  setDeviceLabelsVisible: (visible) => set({ deviceLabelsVisible: visible }),
}))