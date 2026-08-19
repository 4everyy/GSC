/**
 * deviceLinkStore —— 首页飞机图标与设备管理面板的联动状态。
 *
 * 设备管理面板挂载于 MapToolbar 内部，与 HomePage 平级，无法通过 props 传递
 * hover/选中状态，故用 zustand 全局 store 承载（设备索引 = devices.ts deviceList 下标）：
 * - hoveredDevice：当前 hover 的设备索引（面板行与首页飞机图标双向同步）；
 * - selectedDevices：已勾选设备索引集合（面板复选框与首页图标单击同步）。
 */
import { create } from 'zustand'

interface DeviceLinkState {
  /** hover 中的设备索引（面板行或首页飞机图标），null 表示无 */
  hoveredDevice: number | null
  /** 已勾选的设备索引集合 */
  selectedDevices: Set<number>
  setHoveredDevice: (index: number | null) => void
  /** 切换指定设备的勾选状态 */
  /** Open-panel request counter: +1 each time an aircraft icon is clicked on home page */
  devicePanelOpenRequests: number
  /** Ask MapToolbar to open the device management panel */
  requestOpenDevicePanel: () => void
  toggleDevice: (index: number) => void
  /** 整体替换勾选集合（面板全选/全不选使用） */
  setSelectedDevices: (devices: Set<number>) => void
}

export const useDeviceLinkStore = create<DeviceLinkState>((set) => ({
  hoveredDevice: null,
  devicePanelOpenRequests: 0,
  selectedDevices: new Set(),
  setHoveredDevice: (index) => set({ hoveredDevice: index }),
  toggleDevice: (index) =>
    set((state) => {
      const next = new Set(state.selectedDevices)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return { selectedDevices: next }
    }),
  setSelectedDevices: (devices) => set({ selectedDevices: devices }),
  requestOpenDevicePanel: () =>
    set((state) => ({ devicePanelOpenRequests: state.devicePanelOpenRequests + 1 })),
}))