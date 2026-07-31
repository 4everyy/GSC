/**
 * 航线规划纯函数与常量。
 *
 * 只包含与航线数据本身相关的计算（统计、id 生成、示例数据），
 * 不依赖 React 与地图 SDK，方便单测与在任意环境复用。
 */
import { distanceMeters } from '../../utils/geo'
import type { Route, RouteStats, Waypoint } from './types'

/** 生成唯一航点 id（轻量实现，满足前端场景） */
export function createWaypointId(): string {
  return `wp-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`
}

/**
 * 计算航线统计信息：总航程、预估时长、航点数。
 *
 * - 总航程：相邻航点球面距离累加；
 * - 预估时长：总航程 / defaultSpeed（未计入悬停时间，悬停逻辑在模拟阶段细化）。
 */
export function computeRouteStats(route: Route): RouteStats {
  let totalDistance = 0
  for (let i = 0; i < route.waypoints.length - 1; i++) {
    totalDistance += distanceMeters(route.waypoints[i], route.waypoints[i + 1])
  }
  const totalTime = route.defaultSpeed > 0 ? totalDistance / route.defaultSpeed : 0
  return {
    totalDistance,
    totalTime,
    waypointCount: route.waypoints.length,
  }
}

/**
 * 阶段 1 验证用：一条围绕默认中心点（深圳福田）的示例航线。
 * 后续接入交互后可删除，仅用于打通渲染链路。
 */
export const SAMPLE_ROUTE: Route = {
  id: 'sample-001',
  name: '示例巡检航线',
  color: '#00e5ff',
  defaultSpeed: 10,
  waypoints: [
    { id: 's1', lng: 114.049719, lat: 22.542838, altitude: 60, action: 'pass' },
    { id: 's2', lng: 114.064719, lat: 22.545838, altitude: 60, action: 'hover', hoverTime: 3 },
    { id: 's3', lng: 114.069719, lat: 22.536838, altitude: 60, action: 'photo' },
    { id: 's4', lng: 114.057719, lat: 22.533838, altitude: 60, action: 'pass' },
  ],
}

/** 航点默认值工厂，便于交互阶段创建新航点 */
export function createWaypoint(lng: number, lat: number, partial?: Partial<Waypoint>): Waypoint {
  return {
    id: createWaypointId(),
    lng,
    lat,
    altitude: 50,
    action: 'pass',
    ...partial,
  }
}