/**
 * 航线规划（Route Planning）功能模块入口。
 *
 * 对外只暴露类型与必要 API，内部实现细节（覆盖物管理、模拟器等）
 * 由各子文件自行负责，遵循"高内聚、低耦合"。
 *
 * 使用示例：
 * ```ts
 * import { RouteOverlay, RouteEditor, RoutePanel, useRouteEditor } from '@/features/routePlanning'
 * ```
 */
export { RouteOverlay } from './RouteOverlay'
export { RouteEditor } from './RouteEditor'
export { RoutePanel } from './RoutePanel'
export { DroneSimulator } from './DroneSimulator'
export { useRouteEditor } from './useRouteEditor'
export { SAMPLE_ROUTE, computeRouteStats, createWaypoint, createWaypointId } from './routeModel'
export { DEFAULT_ROUTE_COLOR, DEFAULT_ROUTE_SPEED } from './config'
export type {
  DroneState,
  DroneStatus,
  Route,
  RouteStats,
  Waypoint,
  WaypointAction,
} from './types'
export type { UseRouteEditor } from './useRouteEditor'