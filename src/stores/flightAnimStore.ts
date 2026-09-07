/**
 * flightAnimStore —— 模拟飞行动画专用 Zustand store（自 useFlightAnimations 的 useState 迁出）。
 *
 * 动画每帧（rAF）写 state，若沿用 HomePage 级 useState 会导致整棵 HomePage 树每帧重渲染
 * （面板/工具栏/地图全覆盖）。迁到全局 store 后，rAF tick 只重渲染订阅了对应飞行状态的
 * 覆盖层叶子组件（FlightMarkerOverlays/FlightSimulationOverlays 内的选择器订阅），
 * HomePage 主体与面板组件不再参与每帧渲染。
 *
 * 结构与 useFlightAnimations 原返回值中的 8 组飞行状态一一对应：
 * - 单机：tapReturnFlight / waypointFlight / routeFlightFlight / orbitFlight；
 * - 多机（数组）：returnHomeFlights / areaLandingFlights / rallyPointFlights / formationFlightFlights。
 *
 * 写入侧仅 useFlightAnimations（rAF 循环内 setState）；读取侧为覆盖层组件与
 * FlightMissionPanels 的事件期守卫（getState 读取，不订阅）。
 */
import { create } from 'zustand'
import type { FlightState } from '../pages/HomePage/hooks/useFlightAnimations'

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
  // ---- 写入器（rAF tick 调用） ----
  setTapReturnFlight: (s: FlightState | null) => void
  setWaypointFlight: (s: FlightState | null) => void
  setRouteFlightFlight: (s: FlightState | null) => void
  setOrbitFlight: (s: FlightState | null) => void
  setReturnHomeFlights: (s: FlightState[]) => void
  setAreaLandingFlights: (s: FlightState[]) => void
  setRallyPointFlights: (s: FlightState[]) => void
  setFormationFlightFlights: (s: FlightState[]) => void
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
  setTapReturnFlight: (s) => set({ tapReturnFlight: s }),
  setWaypointFlight: (s) => set({ waypointFlight: s }),
  setRouteFlightFlight: (s) => set({ routeFlightFlight: s }),
  setOrbitFlight: (s) => set({ orbitFlight: s }),
  setReturnHomeFlights: (s) => set({ returnHomeFlights: s }),
  setAreaLandingFlights: (s) => set({ areaLandingFlights: s }),
  setRallyPointFlights: (s) => set({ rallyPointFlights: s }),
  setFormationFlightFlights: (s) => set({ formationFlightFlights: s }),
}))