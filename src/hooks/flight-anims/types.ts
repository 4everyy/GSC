/**
 * @file types.ts
 * @description Shared types for flight animation hooks (extracted from useFlightAnimations.ts)
 * @author 4everyy
 * @date 2026-10-07
 */
/** 单个飞行体的瞬时状态：视口屏幕坐标 + 航向角（度，切图机头朝右为 0° */
export interface FlightState {
  x: number
  y: number
  angle: number
  icon: string
  /** 飞行中目标设备主键（WS telemetry 键）：AircraftLayer 据此隐藏该机原地面高度标注（起飞前冻结的 0.000m） */
  planeId?: string
  /** 实时高度（m，视觉插值已向遥测对齐）：航点/航线/环绕飞行高度标注用 */
  altitude?: number
  /** 地面轨迹点视口 y（未含升空偏移）：高度虚线从图标 (y) 垂直延伸到地面 (groundY) */
  groundY?: number
  /** 集结点飞行完成标记：阶段四「精准落坪定格」置 true（其余阶段恒 false）——渲染层据此判定任务完成：隐藏绿色航线 */
  landed?: boolean
}

/** 航点/航线飞行动效所需的最小地图适配器能力… */
export interface WaypointFlightMapAdapter {
  getContainer(): HTMLElement
  project(lngLat: { lng: number; lat: number }): { x: number; y: number }
  unproject(point: { x: number; y: number }): { lng: number; lat: number }
  /** 当前比例尺下每像素米数（可选；航线飞行地理锚定的地面速度换算用） */
  getMetersPerPixel?: () => number
}
