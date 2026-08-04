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
 * 使用 'satellite'（纯卫星图）：真实航拍卫星影像底图，保留完整地质纹理与色彩细节。
 * 目标效果：参考截图——清晰卫星影像 + 零地名干扰（建筑、道路、植被纹理完整可见）。
 */
export const DEFAULT_MAP_TYPE = 'satellite' as const

/**
 * 洁净卫星图样式：逐个隐藏各类标注要素，保留完整卫星底图质感。
 *
 * ⚠️ 关键原则：
 * - 绝对不用 `featureType: 'all'`！它会触发百度地图的全局风格替换机制，
 *   把卫星栅格瓦片也覆盖掉，导致底图变灰或变成矢量风格。
 * - 必须逐个指定 featureType，只操作 labels（文字），完全不碰 geometry。
 * - 这样 setMapStyleV2 只会"过滤掉文字标注层"，而不影响底层卫星影像瓦片。
 *
 * 隐藏范围：路名、POI、建筑物名、道路编号、公交站、地铁站等所有文字标注。
 * 保留：纯卫星影像底图（无任何文字叠加）= 参考截图效果。
 */
export const CLEAN_SATELLITE_STYLE: BMapGL.MapStyleFeature[] = [
  // ===== 道路相关标注 =====
  { featureType: 'highway', elementType: 'labels', stylers: { visibility: 'off' } },
  { featureType: 'arterial', elementType: 'labels', stylers: { visibility: 'off' } },
  { featureType: 'local', elementType: 'labels', stylers: { visibility: 'off' } },

  // ===== POI / 兴趣点标注 =====
  { featureType: 'poi', elementType: 'labels', stylers: { visibility: 'off' } },
  { featureType: 'poiname', elementType: 'labels', stylers: { visibility: 'off' } },
  { featureType: 'poilabel', elementType: 'labels', stylers: { visibility: 'off' } },

  // ===== 建筑物标注 =====
  { featureType: 'building', elementType: 'labels', stylers: { visibility: 'off' } },
  { featureType: 'buildingname', elementType: 'labels', stylers: { visibility: 'off' } },

  // ===== 行政区划标注（可选：保留或隐藏）=====
  { featureType: 'districtlabel', elementType: 'labels', stylers: { visibility: 'off' } },
  { featureType: 'citylabel', elementType: 'labels', stylers: { visibility: 'off' } },
  { featureType: 'provincelabel', elementType: 'labels', stylers: { visibility: 'off' } },

  // ===== 交通设施标注 =====
  { featureType: 'busstop', elementType: 'labels', stylers: { visibility: 'off' } },
  { featureType: 'subwaystation', elementType: 'labels', stylers: { visibility: 'off' } },
  { featureType: 'railwaystation', elementType: 'labels', stylers: { visibility: 'off' } },
  { featureType: 'airportlabel', elementType: 'labels', stylers: { visibility: 'off' } },

  // ===== 地理要素标注 =====
  { featureType: 'water', elementType: 'labels', stylers: { visibility: 'off' } },
  { featureType: 'green', elementType: 'labels', stylers: { visibility: 'off' } },
  { featureType: 'scenicspots', elementType: 'labels', stylers: { visibility: 'off' } },
  { featureType: 'education', elementType: 'labels', stylers: { visibility: 'off' } },
  { featureType: 'medical', elementType: 'labels', stylers: { visibility: 'off' } },
  { featureType: 'finance', elementType: 'labels', stylers: { visibility: 'off' } },

  // ===== 辅助线标注（道路编号、距离等）=====
  { featureType: 'line', elementType: 'labels', stylers: { visibility: 'off' } },
  { featureType: 'background', elementType: 'labels', stylers: { visibility: 'off' } },
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