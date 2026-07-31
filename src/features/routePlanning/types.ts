/**
 * 航线规划（Route Planning）功能类型定义。
 *
 * 本功能自包含于 `src/features/routePlanning`，对外通过类型与纯函数与
 * 地图/页面交互，避免与其它模块耦合。
 *
 * 坐标约定：所有经纬度均为 **BD09（百度坐标系）**，
 * 与项目地图实例一致；如需对接外部 WGS84 数据，请在边界处用
 * `src/utils/coordTransform.ts` 转换后再进入本模块。
 */

/** 单个航点 */
export interface Waypoint {
  /** 唯一标识，用于 React key 与精准更新 */
  id: string
  /** BD09 经度 */
  lng: number
  /** BD09 纬度 */
  lat: number
  /** 模拟飞行高度（米），默认 50 */
  altitude: number
  /** 到达该航点后的动作 */
  action: WaypointAction
  /** 悬停时长（秒），仅当 action === 'hover' 生效 */
  hoverTime?: number
}

/** 航点动作类型 */
export type WaypointAction = 'pass' | 'hover' | 'photo'

/** 航线 */
export interface Route {
  id: string
  /** 航线名称，用于面板展示 */
  name: string
  /** 航点序列（按飞行顺序） */
  waypoints: Waypoint[]
  /** 航线/折线颜色 */
  color: string
  /** 默认飞行速度（m/s），可被航点级 speed 覆盖（后续阶段支持） */
  defaultSpeed: number
}

/** 无人机模拟状态 */
export interface DroneState {
  /** 关联的航线 id */
  routeId: Route['id']
  status: DroneStatus
  /** 当前所在航段索引（即正飞往的航点索引，从 1 开始计） */
  segmentIndex: number
  /** 当前段内进度 0~1 */
  progress: number
  /** 实时 BD09 经度 */
  lng: number
  /** 实时 BD09 纬度 */
  lat: number
  /** 航向角（度，正北为 0，顺时针） */
  heading: number
  /** 已飞行距离（米） */
  traveledDistance: number
}

/** 无人机运行状态 */
export type DroneStatus = 'idle' | 'flying' | 'paused' | 'arrived'

/** 航线统计信息（由纯函数 {@link computeRouteStats} 计算） */
export interface RouteStats {
  /** 总航程（米） */
  totalDistance: number
  /** 预估总时长（秒），基于 defaultSpeed 估算 */
  totalTime: number
  /** 航点数量 */
  waypointCount: number
}