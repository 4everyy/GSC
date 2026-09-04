/**
 * planeStatusStore —— 无人机状态轮询数据（HTTP /control/queryPlaneStatus）。
 *
 * 由 App 根组件的 usePlaneStatusPolling 启动轮询（默认 3s），
 * DeviceManagementPanel / HomePage 订阅 store 读取实时设备列表。
 * 首次成功前 planeList 为空数组（面板显示「暂无设备」）。
 */
import { create } from 'zustand'
import { fetchPlaneStatus, mapPlaneToDevice, type PlaneRaw } from '../api/planeStatus'
import type { Device } from '../config/devices'

export interface PlaneDevice extends Device {
  /** 后端无人机 id（区别于列表下标，用于稳定 key/指令寻址） */
  planeId: string
}

interface PlaneStatusState {
  /** 映射为前端模型的设备列表（顺序与后端 planeList 一致） */
  devices: PlaneDevice[]
  /** 后端原始 planeList（需要原始字段时使用） */
  rawPlanes: PlaneRaw[]
  /** 汇总统计 */
  planeOnline: number
  planeInAir: number
  planeTotal: number
  /** 最近一次成功拉取时间戳（ms），null 表示尚未成功过 */
  lastUpdated: number | null
  /** 最近一次错误信息，null 表示正常 */
  error: string | null
  /** 手动/定时拉取（含竞态保护） */
  refresh: () => Promise<void>
}

let inFlight: Promise<void> | null = null

export const usePlaneStatusStore = create<PlaneStatusState>((set) => ({
  devices: [],
  rawPlanes: [],
  planeOnline: 0,
  planeInAir: 0,
  planeTotal: 0,
  lastUpdated: null,
  error: null,
  refresh: async () => {
    if (inFlight) return inFlight
    inFlight = (async () => {
      try {
        const data = await fetchPlaneStatus()
        set({
          devices: (data.planeList ?? []).map(mapPlaneToDevice),
          rawPlanes: data.planeList ?? [],
          planeOnline: data.planeOnline ?? 0,
          planeInAir: data.planeInAir ?? 0,
          planeTotal: data.planeTotal ?? 0,
          lastUpdated: Date.now(),
          error: null,
        })
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) })
      } finally {
        inFlight = null
      }
    })()
    return inFlight
  },
}))
