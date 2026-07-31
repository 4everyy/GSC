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

  /** 个性化样式规则：针对特定 feature/element 应用 stylers */
  interface MapStyleFeature {
    featureType: string
    elementType: string
    stylers: Record<string, string>
  }

  /** 个性化地图样式配置（用于 setMapStyleV2） */
  interface MapStyleOptions {
    styleJson?: MapStyleFeature[]
    styleId?: string
  }

  /** 地图事件回调参数 */
  interface MapEvent {
    type: string
    target: unknown
  }

  /** 带坐标的鼠标事件（click / dblclick / rightclick / dragend 等）。
   *  注意：BMapGL WebGL 版的事件坐标在 `latlng` 字段（旧版 2D API 为 `point`），
   *  为兼容两种实现，两字段均声明为可选，使用时需做兼容处理。 */
  interface MapMouseEvent extends MapEvent {
    /** 旧版 2D API 的坐标字段 */
    point?: Point
    /** WebGL 版(GL)的坐标字段 */
    latlng?: Point
    pixel: Pixel
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
    /**
     * 根据传入的坐标点数组自动调整地图视野，使所有点都可见。
     * @param points 需要纳入视野的坐标点数组
     * @param opts 可选：margins 边距、zoom 级别、animation 是否动画
     */
    setViewport(
      points: Point[],
      opts?: { margins?: number[]; zoom?: number; animation?: boolean },
    ): void
    /** 设置地图容器的默认鼠标光标（如 'crosshair'） */
    setDefaultCursor(cursor: string): void
    /**
     * 设置个性化地图样式（V2）。
     *
     * 通过 styleJson 精确控制底图各类要素（道路、建筑、POI 文字等）的颜色与可见性，
     * 常用于"洁净卫星图"场景：隐藏卫星图上密集的 POI/地名标注，保留卫星影像底图，
     * 使态势图更清爽。也可传入云端样式 ID（styleId）替代 styleJson。
     *
     * 注意：在 BMapGL 中，个性化样式作用于矢量要素图层，卫星影像本身不受影响。
     */
    setMapStyleV2(opts: MapStyleOptions): void
    destroy(): void
    addEventListener(event: string, handler: (e: MapEvent) => void): void
    removeEventListener(event: string, handler: (e: MapEvent) => void): void
  }

  /** 覆盖物基类，Marker/Polygon/Polyline 均继承自该类 */
  class Overlay {
    addEventListener(event: string, handler: (e: MapEvent) => void): void
    removeEventListener(event: string, handler: (e: MapEvent) => void): void
  }

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

  /** Label 选项 */
  interface LabelOptions {
    position?: Point
    offset?: Size
  }

  /** 文本标签覆盖物，常用于给 Marker 附加编号/说明 */
  class Label extends Overlay {
    constructor(content?: string, opts?: LabelOptions)
    setContent(content: string): void
    setPosition(position: Point): void
    getPosition(): Point | null
    setStyle(style: string | Record<string, string>): void
    setOffset(offset: Size): void
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
    /** 线型：'solid' 实线 / 'dashed' 虚线 / 'dotted' 点线 */
    style?: 'solid' | 'dashed' | 'dotted'
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
