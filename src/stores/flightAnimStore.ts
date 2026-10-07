/**
 * @file flightAnimStore.ts
 * @description flightAnimStore.ts（自 stores/index.ts 拆出）—— 模拟飞行动画专用 store：返航/降落/集结等 动画快照与巡检任务飞行状态。独立变化的动画时序职责。
 * @author 4everyy
 * @date 2026-10-07
 */
import { create } from 'zustand'
import { type FlightState } from '../hooks/useFlightAnimations'

/** flightAnimStore —— 模拟飞行动画专用 Zustand store… */

interface FlightAnimState {
  // ---- 单机动画 ----
  tapReturnFlight: FlightState | null
  waypointFlight: FlightState | null
  routeFlightFlight: FlightState | null
  orbitFlight: FlightState | null
  // ---- 多机动画 ----
  returnHomeFlights: FlightState[]
  areaLandingFlights: FlightState[]
  rallyPointFlights: FlightState[]
  formationFlightFlights: FlightState[]
  // ---- 巡检任务（一键创建，遥测驱动） ----
  /** 巡检任务飞行状态：planeId → 最新快照（经纬度/高度来自实时遥测 */
  reconFlights: Record<string, FlightState>
  /** 巡检任务进行中的设备主键（一键创建回执到达后写入，驱动巡检渲染循环；空数组=未在巡检） */
  reconFlightIds: string[]
  // ---- 写入器（rAF tick 调用） ----
  setTapReturnFlight: (s: FlightState | null) => void
  setWaypointFlight: (s: FlightState | null) => void
  setRouteFlightFlight: (s: FlightState | null) => void
  setOrbitFlight: (s: FlightState | null) => void
  setReturnHomeFlights: (s: FlightState[]) => void
  setAreaLandingFlights: (s: FlightState[]) => void
  setRallyPointFlights: (s: FlightState[]) => void
  setFormationFlightFlights: (s: FlightState[]) => void
  /** 巡检任务：整体写入全部飞行快照（每帧遥测驱动） */
  setReconFlights: (s: Record<string, FlightState>) => void
  /** 巡检任务：清除单机快照（落地/指令超时/面板关闭时） */
  clearReconFlight: (planeId: string) => void
  /** 巡检任务：清空全部巡检飞行（取消任务/面板关闭时） */
  clearReconFlights: () => void
  /** 巡检任务：回执到达后启动（写入 ids 并清空旧快照） */
  startReconFlights: (ids: string[]) => void
  /** 巡检任务：停止巡检（清空 ids 与快照，取消任务/重新创建时调用） */
  stopReconFlights: () => void
}

export const useFlightAnimStore = create<FlightAnimState>((set) => ({
  tapReturnFlight: null,
  waypointFlight: null,
  routeFlightFlight: null,
  orbitFlight: null,
  returnHomeFlights: [],
  areaLandingFlights: [],
  rallyPointFlights: [],
  formationFlightFlights: [],
  reconFlights: {},
  reconFlightIds: [],
  setTapReturnFlight: (s) => set({ tapReturnFlight: s }),
  setWaypointFlight: (s) => set({ waypointFlight: s }),
  setRouteFlightFlight: (s) => set({ routeFlightFlight: s }),
  setOrbitFlight: (s) => set({ orbitFlight: s }),
  setReturnHomeFlights: (s) => set({ returnHomeFlights: s }),
  setAreaLandingFlights: (s) => set({ areaLandingFlights: s }),
  setRallyPointFlights: (s) => set({ rallyPointFlights: s }),
  setFormationFlightFlights: (s) => set({ formationFlightFlights: s }),
  setReconFlights: (s) => set({ reconFlights: s }),
  clearReconFlight: (planeId) =>
    set((state) => {
      if (!(planeId in state.reconFlights)) return state
      const next = { ...state.reconFlights }
      delete next[planeId]
      return { reconFlights: next }
    }),
  clearReconFlights: () => set({ reconFlights: {} }),
  startReconFlights: (ids) => set({ reconFlightIds: ids, reconFlights: {} }),
  stopReconFlights: () => set({ reconFlightIds: [], reconFlights: {} }),
}))

