/**
 * @file index.ts
 * @description stores/index.ts（原 575 行，已按 store 拆为 6 个文件）—— 此文件保留为兼容 re-export。
 * @author 4everyy
 * @date 2026-10-07
 */
export { useLayerStore } from './layerStore'
export {
  useDeviceLinkStore,
  type DeviceLinkState,
} from './deviceLinkStore'
export { useFlightAnimStore } from './flightAnimStore'
export { useAlarmPanelStore } from './alarmPanelStore'
export {
  usePlaneStatusStore,
  getPlaneDevices,
  type PlaneStats,
  type PlaneStatusState,
} from './planeStatusStore'
export { useTaskAreaStore } from './taskAreaStore'
