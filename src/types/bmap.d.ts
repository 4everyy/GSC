/**
 * 百度地图 GL（BMapGL）核心类型声明。
 * 仅覆盖本项目实际使用的 API，其余 API 可按需扩展。
 * 官方文档：https://lbsyun.baidu.com/index.php?title=jspopularGL
 */
declare namespace BMapGL {
  /** 经纬度坐标点 */
  class Point {
    constructor(lng: number, lat: number)
    lng: number
    lat: number
  }

  /** 像素坐标点 */
  class Pixel {
    constructor(x: number, y: number)
    x: number
    y: number
  }

  /** 地图尺寸 */
  class Size {
    constructor(width: number, height: number)
    width: number
    height: number
  }

  /** 地图类型：底层为数字常量 */
  type MapType = number

  /** 常规矢量图 */
  const BMAP_NORMAL_MAP: MapType
  /** 卫星图 */
  const BMAP_SATELLITE_MAP: MapType
  /** 混合图（卫星图 + 路网标注） */
  const BMAP_HYBRID_MAP: MapType

  /** 地图初始化与交互配置 */
  interface MapOptions {
    enableHighResolution?: boolean
    minZoom?: number
    maxZoom?: number
    mapType?: MapType
    enableDragging?: boolean
    enableScrollWheelZoom?: boolean
    enableDoubleClickZoom?: boolean
    enableKeyboard?: boolean
    enableInertialDragging?: boolean
    enableRotate?: boolean
    enableTilt?: boolean
  }

  /** 地图事件回调参数 */
  interface MapEvent {
    type: string
    target: unknown
  }

  /** 地图实例，封装视图、覆盖物与控件操作 */
  class Map {
    constructor(container: string | HTMLElement, opts?: MapOptions)
    centerAndZoom(center: Point, zoom: number): void
    setCenter(center: Point): void
    getCenter(): Point
    setZoom(zoom: number): void
    getZoom(): number
    zoomIn(): void
    zoomOut(): void
    /** 经纬度坐标 → 屏幕像素坐标 */
    pointToPixel(point: Point): Pixel
    /** 屏幕像素坐标 → 经纬度坐标 */
    pixelToPoint(pixel: Pixel): Point
    addOverlay(overlay: Overlay): void
    removeOverlay(overlay: Overlay): void
    clearOverlays(): void
    addControl(control: Control): void
    removeControl(control: Control): void
    setMapType(mapType: MapType): void
    panTo(center: Point, opts?: { noAnimation?: boolean }): void
    reset(): void
    enableDragging(): void
    disableDragging(): void
    enableScrollWheelZoom(enable?: boolean): void
    disableScrollWheelZoom(): void
    enableDoubleClickZoom(): void
    disableDoubleClickZoom(): void
    enableKeyboard(): void
    disableKeyboard(): void
    enableInertialDragging(): void
    disableInertialDragging(): void
    enableRotate(): void
    disableRotate(): void
    enableTilt(): void
    disableTilt(): void
    setHeading(heading: number): void
    setTilt(tilt: number): void
    destroy(): void
    addEventListener(event: string, handler: (e: MapEvent) => void): void
    removeEventListener(event: string, handler: (e: MapEvent) => void): void
  }

  /** 覆盖物基类，Marker/Polygon/Polyline 均继承自该类 */
  class Overlay {}

  interface MarkerOptions {
    icon?: Icon
    enableDragging?: boolean
    rotation?: number
  }

  /** 标记覆盖物，用于在地图上标注飞行器等兴趣点 */
  class Marker extends Overlay {
    constructor(point: Point, opts?: MarkerOptions)
    setPosition(point: Point): void
    getPosition(): Point
    setRotation(rotation: number): void
    setIcon(icon: Icon): void
  }

  /** 图标选项：anchor 为锚点偏移，imageSize 为实际渲染尺寸，imageOffset 为图片裁剪偏移 */
  interface IconOptions {
    anchor?: Size
    imageSize?: Size
    imageOffset?: Size
  }

  /** 图标，配合 Marker 使用以自定义点位图片 */
  class Icon {
    constructor(url: string, size: Size, opts?: IconOptions)
    setImageSize(size: Size): void
  }

  interface PolygonOptions {
    strokeColor?: string
    strokeWeight?: number
    strokeOpacity?: number
    fillColor?: string
    fillOpacity?: number
  }

  /** 多边形覆盖物，用于渲染限制区等区域 */
  class Polygon extends Overlay {
    constructor(points: Point[], opts?: PolygonOptions)
    setPath(points: Point[]): void
    getPath(): Point[]
  }

  interface PolylineOptions {
    strokeColor?: string
    strokeWeight?: number
    strokeOpacity?: number
  }

  /** 折线覆盖物，用于渲染航线等轨迹 */
  class Polyline extends Overlay {
    constructor(points: Point[], opts?: PolylineOptions)
    setPath(points: Point[]): void
    getPath(): Point[]
  }

  /** 控件基类 */
  class Control {}

  interface ControlOptions {
    anchor?: number
    offset?: Size
  }

  /** 比例尺控件 */
  class ScaleControl extends Control {
    constructor(opts?: ControlOptions)
  }

  /** 缩放控件 */
  class ZoomControl extends Control {
    constructor(opts?: ControlOptions)
  }

  /** 定位结果：point 为 BD09 坐标，accuracy 为精度（米） */
  interface GeolocationResult {
    point: Point
    accuracy?: number
  }

  /** 定位状态码 */
  const BMAP_STATUS_SUCCESS: number

  /** 百度定位控件，返回 BD09 坐标（国内精度优于浏览器原生定位） */
  class Geolocation {
    /** 开启高精度模式（结合 GPS/Wi-Fi/基站） */
    enableHighAccuracy?: boolean
    getCurrentPosition(
      onSuccess: (this: Geolocation, result: GeolocationResult) => void,
      onError?: (this: Geolocation, error: unknown) => void,
    ): void
    getStatus(): number
  }

  interface CircleOptions {
    strokeColor?: string
    strokeWeight?: number
    strokeOpacity?: number
    fillColor?: string
    fillOpacity?: number
  }

  /** 圆形覆盖物，用于绘制定位精度范围 */
  class Circle extends Overlay {
    constructor(center: Point, radius: number, opts?: CircleOptions)
    setCenter(center: Point): void
    setRadius(radius: number): void
    getRadius(): number
  }

  // ============ 搜索相关 API ============

  /** 搜索结果中的兴趣点（POI） */
  interface Poi {
    title: string
    point: Point
    address?: string
    city?: string
  }

  /** 本地搜索结果集 */
  interface LocalResult {
    getPoi(index: number): Poi | null
    getCurrentNumPois(): number
    getNumPois(): number
    getKeyWord(): string
  }

  /** 本地搜索配置 */
  interface LocalSearchOptions {
    onSearchComplete?: (results: LocalResult) => void
    renderOptions?: {
      map?: Map
      panel?: HTMLElement | string
      selectFirstResult?: boolean
      autoViewport?: boolean
    }
  }

  /** 本地搜索服务，支持关键词检索 POI */
  class LocalSearch {
    constructor(location: Map | string, opts?: LocalSearchOptions)
    search(keyword: string): void
    gotoPage(page: number): void
  }
}
