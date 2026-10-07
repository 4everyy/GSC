/**
 * @file deviceLinkStore.ts
 * @description deviceLinkStore.ts（自 stores/index.ts 拆出）—— 飞机图标与设备管理面板联动：hover 索引、 勾选集合、地图聚焦请求。单一职责：跨组件联动信号。
 * @author 4everyy
 * @date 2026-10-07
 */
import { create } from 'zustand'

/** deviceLinkStore —— 首页飞机图标与设备管理面板的联动状态。 */

export interface DeviceLinkState {
  /** hover 中的设备索引（面板行或首页飞机图标），null 表示无 */
  hoveredDevice: number | null
  /** 已勾选的设备索引集合 */
  selectedDevices: Set<number>
  setHoveredDevice: (index: number | null) => void
  /** 切换指定设备的勾选状态 */
  /** +1 each time an air… */
  devicePanelOpenRequests: number
  /** Ask MapToolbar to open the device management panel */
  requestOpenDevicePanel: () => void
  toggleDevice: (index: number) => void
  /** 整体替换勾选集合（面板全选/全不选使用） */
  setSelectedDevices: (devices: Set<number>) => void
  /** 地图聚焦请求（设备管理面板单行勾选时写入）：index=设备索引，seq 递增保证重复勾选同一设备也能触发监听 effect */
  mapFocusDeviceRequest: { index: number; seq: number } | null
  /** 请求地图飞转聚焦指定设备（面板单行勾选时调用；全选走整体替换不触发） */
  requestMapFocusDevice: (index: number) => void
  /** 清除地图聚焦请求（HomePage 消费后调用，避免重复消费） */
  clearMapFocusDeviceRequest: () => void
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
  mapFocusDeviceRequest: null,
  requestMapFocusDevice: (index) =>
    set((state) => ({
      mapFocusDeviceRequest: { index, seq: (state.mapFocusDeviceRequest?.seq ?? 0) + 1 },
    })),
  clearMapFocusDeviceRequest: () => set({ mapFocusDeviceRequest: null }),
}))

