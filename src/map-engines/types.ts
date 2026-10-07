/**
 * @file types.ts
 * @description 地图引擎抽象层 —— 类型定义。
 * @author 4everyy
 * @date 2026-10-07
 */

/** 经纬度坐标（WGS84 坐标系，统一输入输出格式） */
export interface LngLat {
  lng: number
  lat: number
}

/** 经纬度包围盒（WGS84，fitBounds 输入） */
export interface LngLatBounds {
  west: number
  south: number
  east: number
  north: number
}

/** fitBounds（飞转适配包围盒）选项 */
export interface FitBoundsOptions {
  /** 视口边距（px）：包围盒与容器各边的安全距离，用于避开悬浮面板遮挡 */
  padding?: { top?: number; bottom?: number; left?: number; right?: number }
  /** 最大缩放级别（防止小区域被过度放大） */
  maxZoom?: number
  /** 动画时长（ms） */
  duration?: number
}

/** 引擎无关的底图样式描述。 */
export type MapStyleSpec = object

/** 地图引擎类型标识（当前仅 MapLibre） */
export type MapEngineType = 'maplibre'

/** 标注（Marker）创建选项 */
export interface MarkerOptions {
  /** 标注的 HTML 元素；不传则使用引擎默认图钉 */
  element?: HTMLElement
  /** 锚点偏移：标注元素内的哪个点对齐到坐标（像素，相对元素左上角） */
  anchor?: { x: number; y: number }
  /** 是否可拖拽（引擎自行实现 pointer 事件） */
  draggable?: boolean
  /** 拖拽结束回调（仅 draggable=true 生效），参数为拖拽后的 WGS84 坐标 */
  onDragEnd?: (lngLat: LngLat) => void
  /** 右键点击回调 */
  onContextMenu?: () => void
  /** 左键点击回调 */
  onClick?: () => void
}

/** 沿线方向箭头选项：图标沿折线按段自动旋转（指向行进方向），叠加在线上方 */
export interface PolylineArrowsOptions {
  /** 箭头贴图资源 URL（svg/png 均可；适配器负责异步加载并注册为引擎贴图） */
  iconUrl: string
  /** 箭头逻辑渲染尺寸（px，正方形贴图边长，默认 24） */
  iconSize?: number
  /** 沿线箭头间距（px，默认 100） */
  spacing?: number
  /** 箭头闪烁开关：开启后箭头按正弦呼吸脉动（透明度 0.45~1 + 尺寸 1~1.15轻微放大） */
  pulse?: boolean
  /** 闪烁呼吸周期（ms，默认 1400）：一个完整明暗呼吸循环时长 */
  pulsePeriod?: number
}

/** 折线（Polyline）创建选项 */
export interface PolylineOptions {
  /** 线宽（像素） */
  width?: number
  /** 线颜色（CSS 颜色字符串，如 `#ff9800`） */
  color?: string
  /** 透明度 0-1 */
  opacity?: number
  /** 是否带光晕效果（双层渲染：模糊底 + 主线） */
  glow?: boolean
  /** 光晕颜色（仅 glow=true 时生效） */
  glowColor?: string
  /** 光晕宽度倍数（相对 width，默认 3） */
  glowWidth?: number
  /** 是否虚线（如测距橡皮筋预览）。MapLibre 用 line-dasharray 实现 */
  dash?: boolean
  /** 沿线方向箭头（可选）：图标沿折线自动旋转指向行进方向（如巡检航线指示） */
  arrows?: PolylineArrowsOptions
}

/** 折线悬停交互选项（setPolylineInteractive 用） */
export interface PolylineInteractionOptions {
  /** 透明命中层宽度（px），用于扩大悬停命中范围，默认 18 */
  hitWidth?: number
  /** 鼠标进入命中区（lngLat 为进入点地理坐标，用于定位悬浮删除按钮） */
  onEnter?: (lngLat: LngLat) => void
  /** 鼠标在命中区内移动（删除按钮跟随光标、实时记录悬停位置以定位悬停线段） */
  onMove?: (lngLat: LngLat) => void
  /** 鼠标离开命中区 */
  onLeave?: () => void
}

/** 折线高亮选项（setPolylineHighlight 用） */
export interface PolylineHighlightOptions {
  /** 高亮线宽倍数（相对原始 width），默认 1.8 */
  widthScale?: number
  /** 高亮颜色（默认沿用原色） */
  color?: string
}

/** 圆形覆盖物创建选项 */
export interface CircleOptions {
  /** 边线颜色 */
  strokeColor?: string
  /** 边线宽度 */
  strokeWeight?: number
  /** 边线透明度 */
  strokeOpacity?: number
  /** 填充颜色 */
  fillColor?: string
  /** 填充透明度 */
  fillOpacity?: number
}

/** 多边形（Polygon）创建选项 */
export interface PolygonOptions {
  /** 填充颜色（CSS 颜色字符串，如 `#40a9ff`） */
  fillColor?: string
  /** 填充透明度 0-1 */
  fillOpacity?: number
  /** 边线颜色 */
  strokeColor?: string
  /** 边线宽度（像素） */
  strokeWeight?: number
  /** 边线透明度 0-1 */
  strokeOpacity?: number
}

/** 标注（Marker）的引擎句柄，创建后可用于更新位置/内容或移除 */
export interface MarkerHandle {
  /** 引擎内部句柄（maplibregl.Marker 等） */
  raw: unknown
  /** 唯一 id，便于按 id 管理 */
  id: string
  /** 引擎类型 */
  engine: MapEngineType
}

/** 折线（Polyline）的引擎句柄 */
export interface PolylineHandle {
  raw: unknown
  id: string
  engine: MapEngineType
}

/** 统一地图引擎适配器接口。 */
export interface MapAdapter {
  /** 引擎类型标识 */
  readonly engine: MapEngineType

  // ============ 视图控制 ============
  setCenter(lngLat: LngLat): void
  getCenter(): LngLat
  setZoom(zoom: number): void
  getZoom(): number
  zoomIn(): void
  zoomOut(): void
  panTo(lngLat: LngLat): void
  /** 平滑飞到目标点（用于切换城市时定位；动画由引擎实现） */
  flyTo(lngLat: LngLat, options?: { zoom?: number; duration?: number }): void

  /** 平滑飞转以完整容纳包围盒：视图中心/缩放自适应（区域聚焦等场景）。 */
  fitBounds(bounds: LngLatBounds, options?: FitBoundsOptions): void

  // ============ 坐标换算（供比例尺等使用） ============
  /** 计算当前缩放级别下，每像素对应的实际米数。 */
  getMetersPerPixel(): number

  /** 获取地图容器 DOM 元素。 */
  getContainer(): HTMLElement
  /** 容器像素坐标 → 经纬度（WGS84），用于屏幕选区换算地理坐标 */
  unproject(point: { x: number; y: number }): LngLat
  /** 经纬度 → 容器像素坐标（与 unproject 互逆；供 DOM 覆盖物按地理坐标锚定到地图） */
  project(lngLat: LngLat): { x: number; y: number }

  // ============ 覆盖物：标注 ============
  addMarker(id: string, lngLat: LngLat, opts?: MarkerOptions): MarkerHandle
  /** 更新标注位置 */
  setMarkerPosition(handle: MarkerHandle, lngLat: LngLat): void
  /** 更新标注 DOM 内容（用于动画朝向更新） */
  setMarkerElement(handle: MarkerHandle, element: HTMLElement): void
  removeMarker(id: string): void

  // ============ 覆盖物：折线 ============
  addPolyline(id: string, points: LngLat[], opts?: PolylineOptions): PolylineHandle
  /** 更新折线路径（动画轨迹用） */
  setPolylinePoints(handle: PolylineHandle, points: LngLat[]): void
  removePolyline(id: string): void
  /** 为已存在折线附加悬停交互：插入一层透明命中区（扩大可悬停范围）并绑定进入/离开回调 */
  setPolylineInteractive(id: string, opts: PolylineInteractionOptions): () => void
  /** 切换折线高亮（加宽/改色）；highlighted=false 恢复原始线宽/线色 */
  setPolylineHighlight(id: string, highlighted: boolean, opts?: PolylineHighlightOptions): void

  // ============ 覆盖物：圆形 ============
  addCircle(id: string, center: LngLat, radiusMeters: number, opts?: CircleOptions): void
  removeCircle(id: string): void

  // ============ 覆盖物：多边形 ============
  /** 添加多边形覆盖物（任务区域等）；顶点按顺序连线闭合，无需首尾重复 */
  addPolygon(id: string, vertices: LngLat[], opts?: PolygonOptions): void
  removePolygon(id: string): void

  // ============ 通用覆盖物清理 ============
  /** 按 id 移除任意覆盖物（marker/polyline/circle） */
  removeOverlay(id: string): void
  /** 移除所有覆盖物（切换引擎时清理） */
  clearOverlays(): void

  // ============ 事件 ============
  /** 绑定地图点击事件，返回取消绑定函数 */
  onClick(handler: (lngLat: LngLat) => void): () => void
  /** 绑定地图移动事件（拖动/缩放/惯性/飞行动画期间每渲染帧触发），返回取消绑定函数。 */
  onMove(handler: () => void): () => void
  /** 绑定缩放结束事件 */
  onZoomEnd(handler: (zoom: number) => void): () => void
  /** 绑定平移结束事件 */
  onMoveEnd(handler: (center: LngLat) => void): () => void
  /** 绑定右键事件（用于删除航点） */
  onContextMenu(handler: (lngLat: LngLat) => void): () => void
  /** 绑定鼠标移动事件（用于测距橡皮筋预览等），返回取消绑定函数 */
  onMouseMove(handler: (lngLat: LngLat) => void): () => void

  // ============ 交互设置 ============
  setDefaultCursor(cursor: string): void
  enableDoubleClickZoom(enabled: boolean): void

  // ============ 底图样式（运行时热切换） ============

  /** 运行时切换底图样式（热切换，不重建地图实例）。 */
  setStyle(style: MapStyleSpec): void

  // ============ 生命周期 ============
  destroy(): void
}

/** 统一的地图引擎实例容器。 */
export interface MapEngineInstance {
  adapter: MapAdapter
  /** 引擎类型 */
  engine: MapEngineType
  /** 原始地图实例（maplibregl.Map），引擎特定 */
  raw: unknown
}