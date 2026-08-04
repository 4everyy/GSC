/**
 * 地图引擎抽象层 —— 类型定义。
 *
 * 设计目标：让上层业务组件（RouteEditor / DroneSimulator / MapScale 等）
 * 依赖统一的 MapAdapter 接口，而非具体引擎（百度 BMapGL / MapLibre），
 * 从而支持运行时切换地图引擎，且业务代码无需修改。
 *
 * 核心概念：
 * - `MapAdapter`：引擎无关的地图操作接口（视图控制 / 覆盖物 / 事件 / 交互）
 * - `MarkerHandle` / `PolylineHandle`：覆盖物的引擎句柄，用于后续更新与移除
 * - `LngLat`：统一坐标格式（WGS84），百度引擎内部做 BD09 转换
 */

/** 经纬度坐标（WGS84 坐标系，统一输入输出格式） */
export interface LngLat {
  lng: number
  lat: number
}

/** 地图引擎类型标识 */
export type MapEngineType = 'baidu' | 'maplibre'

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

/** 标注（Marker）的引擎句柄，创建后可用于更新位置/内容或移除 */
export interface MarkerHandle {
  /** 引擎内部句柄（BMapGL.Marker / maplibregl.Marker 等） */
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

/**
 * 统一地图引擎适配器接口。
 *
 * 所有方法均以 WGS84 坐标为输入输出，引擎内部负责坐标系转换。
 * 覆盖物采用"创建返回句柄 + 按 id 管理"模式，避免引擎差异泄漏。
 */
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

  // ============ 坐标换算（供比例尺等使用） ============
  /**
   * 计算当前缩放级别下，每像素对应的实际米数。
   * 用于 MapScale 组件，避免依赖引擎的 pointToPixel API。
   */
  getMetersPerPixel(): number

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

  // ============ 覆盖物：圆形 ============
  addCircle(id: string, center: LngLat, radiusMeters: number, opts?: CircleOptions): void
  removeCircle(id: string): void

  // ============ 通用覆盖物清理 ============
  /** 按 id 移除任意覆盖物（marker/polyline/circle） */
  removeOverlay(id: string): void
  /** 移除所有覆盖物（切换引擎时清理） */
  clearOverlays(): void

  // ============ 事件 ============
  /** 绑定地图点击事件，返回取消绑定函数 */
  onClick(handler: (lngLat: LngLat) => void): () => void
  /** 绑定缩放结束事件 */
  onZoomEnd(handler: (zoom: number) => void): () => void
  /** 绑定平移结束事件 */
  onMoveEnd(handler: (center: LngLat) => void): () => void
  /** 绑定右键事件（用于删除航点） */
  onContextMenu(handler: (lngLat: LngLat) => void): () => void

  // ============ 交互设置 ============
  setDefaultCursor(cursor: string): void
  enableDoubleClickZoom(enabled: boolean): void

  // ============ 生命周期 ============
  destroy(): void
}

/**
 * 统一的地图引擎实例容器。
 *
 * HomePage 通过状态持有此对象，业务组件接收 adapter 进行操作。
 * `raw` 保留原始引擎实例，供少数高级用法（如 PlaceSearch 百度专属功能）使用。
 */
export interface MapEngineInstance {
  adapter: MapAdapter
  /** 引擎类型 */
  engine: MapEngineType
  /** 原始地图实例（BMapGL.Map / maplibregl.Map），引擎特定 */
  raw: unknown
}