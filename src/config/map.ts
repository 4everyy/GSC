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
 *
 * 使用 'satellite'（纯卫星图）：底图为真实航拍卫星影像，原样显示，不应用任何自定义样式。
 * （地名/路名随卫星瓦片原生显示，后续如需弱化再单独处理。）
 */
export const DEFAULT_MAP_TYPE = 'satellite' as const

/**
 * 个性化地图样式：洁净卫星图（弱化/隐藏地名、路名、POI 等次要信息）。
 *
 * 核弹级写法：一次性关闭所有要素的几何线条(geometry) + 文字标注(labels)，
 * 彻底清除 hybrid 叠加的全部矢量路网/地名/POI，使画面回归纯卫星影像观感；
 * 最后白名单保留 `districtlabel`（省/市/区名）并淡化为白色，便于宏观定位。
 *
 * 卫星影像本身是栅格瓦片，不受 geometry/labels 样式影响。
 */
export const CLEAN_SATELLITE_STYLE: BMapGL.MapStyleFeature[] = [
  // 关闭所有要素的几何线条/面（路网线条、区域边界等矢量叠加层）
  { featureType: 'all', elementType: 'geometry', stylers: { visibility: 'off' } },
  // 关闭所有文字标注（路名、POI 名等）
  { featureType: 'all', elementType: 'labels', stylers: { visibility: 'off' } },
  // 行政区划名（省/市/区）：弱化保留为白色，便于宏观定位
  {
    featureType: 'districtlabel',
    elementType: 'labels',
    stylers: { visibility: 'on', color: '#ffffffff' },
  },
]

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