/**
 * @file planeStatusStore.ts
 * @description planeStatusStore.ts（自 stores/index.ts 拆出）—— 无人机状态 store：承载 queryPlaneStatus 接口数据（设备列表/集群统计/加载标志）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { create } from 'zustand'
import { type Device } from '../config/index'
import { fetchPlaneStatus, mapPlaneToDevice, type PlaneRaw, type PlaneStatusData } from '../api/index'

/** 无人机状态 Store —— 承载 /api/v1/control/queryPlaneStatus 接口真实数据。 */

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
  /** 最近一次请求是否成功（失败保留上一帧数据） */
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
  // 初始空列表：首帧数据由 usePlaneStatusInit（MainApp 挂载）拉取接口填充
  devices: [],
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
      // 不清空已有数据（接口暂不可用时面板保留上一帧），仅记录错误
      set({ lastError: message })
      console.warn('[planeStatus] queryPlaneStatus 请求失败：', message)
    }
  },

  applyPlaneStatus: (data) => {
    const list = Array.isArray(data?.planeList) ? data.planeList : []
    set({
      devices: list.map((raw) => mapPlaneToDevice(raw)),
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

