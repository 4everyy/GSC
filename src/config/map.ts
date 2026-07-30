/**
 * 百度地图默认配置。
 * 集中管理中心点、缩放级别、交互开关等，便于在多组件间共享与统一调整。
 */

/** 默认中心点：深圳（福田 CBD 一带） */
export const DEFAULT_MAP_CENTER = {
  lng: 114.059719,
  lat: 22.542838,
}

/** 默认缩放级别，级别越大越精细，推荐市区范围 12-15 */
export const DEFAULT_MAP_ZOOM = 14

/**
 * 默认地图类型（语义标识）。
 * 组件在 SDK 加载后映射为对应的 BMapGL 全局常量，避免配置文件在模块加载期依赖 SDK。
 * 可选值：'normal'（矢量图）/ 'satellite'（卫星图）/ 'hybrid'（混合图：卫星 + 路网标注）
 */
export const DEFAULT_MAP_TYPE = 'satellite' as const

/** 默认地图初始化与交互选项 */
export const DEFAULT_MAP_OPTIONS = {
  /** 开启高清底图，提升文字与道路清晰度 */
  enableHighResolution: true,
  /** 允许鼠标拖拽平移地图 */
  enableDragging: true,
  /** 允许滚轮缩放，地面站大屏常用交互 */
  enableScrollWheelZoom: true,
  /** 允许双击放大 */
  enableDoubleClickZoom: true,
  /** 允许键盘操作地图 */
  enableKeyboard: true,
  /** 允许惯性拖拽，操作更顺滑 */
  enableInertialDragging: true,
  /** 允许旋转（3D 视图） */
  enableRotate: true,
  /** 允许倾斜（3D 视图） */
  enableTilt: true,
} as const