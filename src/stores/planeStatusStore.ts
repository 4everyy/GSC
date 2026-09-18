/**
 * 无人机状态 Store —— 承载 /api/v1/control/queryPlaneStatus 接口真实数据。
 *
 * 数据流：usePlaneStatusInit（MainApp 挂载，首页加载时调用一次）→ fetchPlaneStatus →
 * applyPlaneStatus（映射为 Device 模型整体写入）→ 设备管理面板 / 首页
 * AircraftFocusPanel 按选择器订阅。store 初始值取 config/devices 的 mock
 * 数据；接口成功后整体覆盖为真实数据，失败时保留上一帧/mock 并记录 lastError。
 *
 * 设备索引（deviceLinkStore 的 hoveredDevice/selectedDevices、首页 aircraft
 * 联动）直接使用 planeList 数组下标；列表长度变化（设备增删）时越界索引
 * 由消费端过滤（HomePage selectedAircraft 已做 null 过滤）。
 */
import { create } from 'zustand'
import { deviceList as mockDevices, type Device } from '../config/devices'
import {
  fetchPlaneStatus,
  mapPlaneToDevice,
  type PlaneRaw,
  type PlaneStatusData,
} from '../api/planeStatus'

/** 集群统计（queryPlaneStatus data 顶层字段） */
export interface PlaneStats {
  planeOnline: number
  planeInAir: number
  planeTotal: number
}

export interface PlaneStatusState {
  /** 映射后的设备列表（接口 planeList 顺序，下标即设备索引） */
  devices: Device[]
  /** 接口原始设备列表（保留平台/载荷等未映射字段，供后续功能使用） */
  rawPlanes: PlaneRaw[]
  /** 集群统计 */
  stats: PlaneStats
  /** 首帧是否已加载完成（面板空态判断依据） */
  loaded: boolean
  /** 最近一次请求是否成功（失败保留上一帧/mock 数据） */
  lastError: string | null
  /** 最近一次成功刷新时间（Unix 毫秒） */
  lastUpdated: number
  /** 拉取并应用最新状态（首帧加载 Hook 调用；失败时仅记录错误） */
  refresh: () => Promise<void>
  /** 直接写入接口数据（测试/调试注入用） */
  applyPlaneStatus: (data: PlaneStatusData) => void
}

/** 默认统计：接口未返回前全 0 */
const EMPTY_STATS: PlaneStats = { planeOnline: 0, planeInAir: 0, planeTotal: 0 }

export const usePlaneStatusStore = create<PlaneStatusState>((set) => ({
  // 接口就绪前先用 mock 数据展示；refresh 成功后由真实数据整体覆盖
  devices: mockDevices,
  rawPlanes: [],
  stats: EMPTY_STATS,
  loaded: false,
  lastError: null,
  lastUpdated: 0,

  refresh: async () => {
    try {
      const data = await fetchPlaneStatus()
      usePlaneStatusStore.getState().applyPlaneStatus(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // 不清空已有数据（接口暂不可用时面板继续展示 mock/上一帧），仅记录错误
      set({ lastError: message })
      console.warn('[planeStatus] queryPlaneStatus 请求失败：', message)
    }
  },

  applyPlaneStatus: (data) => {
    const list = Array.isArray(data?.planeList) ? data.planeList : []
    set({
      devices: list.map((raw, index) => mapPlaneToDevice(raw, index)),
      rawPlanes: list,
      stats: {
        planeOnline: data?.planeOnline ?? 0,
        planeInAir: data?.planeInAir ?? 0,
        planeTotal: data?.planeTotal ?? list.length,
      },
      loaded: true,
      lastError: null,
      lastUpdated: Date.now(),
    })
  },
}))

/** 非组件环境读取最新设备列表（如动画/图层工具函数） */
export function getPlaneDevices(): Device[] {
  return usePlaneStatusStore.getState().devices
}