/**
 * HomePage —— 地面站主页面。
 *
 * 地图引擎：MapLibre GL JS（严格离线，瓦片由本地 MBTiles 包经 IndexedDB 渲染）。
 * - 使用 useMapEngine hook 持有 MapLibreContainer 注入的适配器实例；
 * - 所有业务组件（控件、比例尺）统一接收 adapter（引擎无关）。
 *
 * 解耦要点：
 * - HomePage 不直接 import 适配器实现类，仅通过 MapEngineInstance.adapter 操作地图；
 * - 业务组件通过 useEffect 依赖 adapter 变化自动重建覆盖物。
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { StatusHeader } from '../../components/StatusHeader/StatusHeader'
import { MapToolbar } from '../../components/MapToolbar/MapToolbar'
import { MissionPanel } from '../../components/MissionPanel/MissionPanel'
import { AlarmInfoPanel } from '../../components/AlarmInfoPanel/AlarmInfoPanel'
import { MapControls } from '../../components/MapControls/MapControls'
import { MapLibreContainer } from '../../components/MapLibreContainer/MapLibreContainer'
import { MapScale } from '../../components/MapScale/MapScale'
import { TakeoffPanel } from '../../components/TakeoffPanel/TakeoffPanel'
import { LandingPanel } from '../../components/LandingPanel/LandingPanel'
import { ReturnHomePanel } from '../../components/ReturnHomePanel/ReturnHomePanel'
import { TapReturnPanel } from '../../components/TapReturnPanel/TapReturnPanel'
import {
  AreaLandingPanel,
  type AreaLandingFormation,
} from '../../components/AreaLandingPanel/AreaLandingPanel'
import type { PanelTab } from '../../components/PanelTabs/PanelTabs'
import { HoverPanel } from '../../components/HoverPanel/HoverPanel'
import { WaypointFlightPanel } from '../../components/WaypointFlightPanel/WaypointFlightPanel'
import { SlideConfirmDialog } from '../../components/SlideConfirmDialog/SlideConfirmDialog'
import { RouteFlightPanel } from '../../components/RouteFlightPanel/RouteFlightPanel'
import { OrbitFlightPanel } from '../../components/OrbitFlightPanel/OrbitFlightPanel'
import { RallyPointPanel } from '../../components/RallyPointPanel/RallyPointPanel'
import { FormationFlightPanel } from '../../components/FormationFlightPanel/FormationFlightPanel'
import { useMapEngine } from '../../hooks/useMapEngine'
import { ALARM_TYPES } from '../../config/alarms'
import { aircraft } from '../../config/aircraft'
import batteryMidIcon from '../../assets/images/device/battery-mid.png'
import { homeImages } from '../../assets/images/home'
import { useDraggable, type DragPosition } from '../../hooks/useDraggable'
import { AircraftFocusPanel } from '../../components/AircraftFocusPanel/AircraftFocusPanel'
import { computePanelPlacement, placementToClasses } from '../../utils/panelPlacement'
import { usePanelClamp } from '../../hooks/usePanelClamp'
import './HomePage.css'
import './HoverPanelPlacement.css'
import { useOfflineMap } from '../../features/offline-map/useOfflineMap'
import { OfflineMapPanel } from '../../features/offline-map/components/OfflineMapPanel'
import { useOfflineMapStore } from '../../features/offline-map/offlineMapStore'
import { useDeviceLinkStore } from '../../stores/deviceLinkStore'
import { deviceList } from '../../config/devices'
import type { AircraftListItem } from '../../components/AircraftListPanel/AircraftListSection'

// 飞机初始位置（百分比），与 HomePage.css 中 .aircraft--xxx 的 left/top 保持一致。
// 拖拽后通过内联 style 覆盖 CSS 定位，实现自由拖动。
const AIRCRAFT_INITIAL_POSITIONS: DragPosition[] = [
  { x: 10.6, y: 6.8 }, // red (01设备)
  { x: 68.8, y: 22 }, // orange (03设备)
  { x: 44.6, y: 35.4 }, // blue (04设备)
  { x: 56, y: 59 }, // gray (02设备·离线)
  { x: 33.7, y: 71.5 }, // blue2 (05设备)
]

// 巡检区域初始位置（百分比），与 HomePage.css 中 .inspection-zone 的 left/top 保持一致
const INSPECTION_ZONE_INITIAL_POSITION: DragPosition = { x: 38.75, y: 25.5 }

// 待接入功能的临时显示开关（false = 隐藏）：
// MissionPanel / AlarmInfoPanel / 橙色禁飞区——功能就绪后置 true 或删除相关代码
const SHOW_PENDING_PANELS = false

// 底部水平居中按钮条：13 段背景切图按显示顺序（从左到右）编号拼接（高度统一 60px）。
// width 为各切图原始宽度，经 aspect-ratio 与高度联动保持每段比例，整体随视口等比缩放。
// 各段切缝的水平间距补偿见 HomePage.css 中 .bottom-bar__item:nth-child 逐缝 margin 规则。
// 第 2~12 段为功能按钮：icon 为叠加在背景框体中心的功能图标（64×64 切图），
// tooltip 为悬停时显示于按钮上方的中文名称。
// 底部功能面板类型：起飞（TakeoffPanel）/ 降落（LandingPanel）/ 返航（ReturnHomePanel）/ 指点返航（TapReturnPanel）/ 区域降落（AreaLandingPanel）/ 悬停（HoverPanel）/ 航点飞行（WaypointFlightPanel）/ 航线飞行（RouteFlightPanel）/ 环绕飞行（OrbitFlightPanel）/ 集结点（RallyPointPanel）/ 编队飞行（FormationFlightPanel）
type BottomBarPanel =
  | 'takeoff'
  | 'landing'
  | 'return-home'
  | 'tap-return'
  | 'area-landing'
  | 'hover'
  | 'waypoint-flight'
  | 'route-flight'
  | 'orbit-flight'
  | 'rally-point'
  | 'formation-flight'

const BOTTOM_BAR_ITEMS: {
  background: string
  /** 激活态背景切图：功能面板展开期间由独立发光层显示（第 2~12 段功能按钮均提供） */
  activeBackground?: string
  /** 禁用态背景切图：按钮不可用期间直接替换默认背景（第 2~12 段功能按钮均提供） */
  disabledBackground?: string
  /** 选中设备数量要求：single = 恰好 1 台（单机功能）；multi = 至少 1 台（多机功能）。
   *  不满足时按钮进入禁用态（禁用态切图 + 拦截点击 + 抑制反馈） */
  mode?: 'single' | 'multi'
  width: number
  icon?: string
  tooltip?: string
  panel?: BottomBarPanel
}[] = [
  { background: homeImages.bottomBarSeg1, width: 119 },
  {
    background: homeImages.bottomBarSeg2,
    activeBackground: homeImages.bottomBarSeg2Active,
    disabledBackground: homeImages.bottomBarSeg2Disabled,
    width: 129,
    icon: homeImages.iconTakeoff,
    tooltip: '起飞',
    mode: 'multi',
    panel: 'takeoff',
  },
  {
    background: homeImages.bottomBarSeg3,
    activeBackground: homeImages.bottomBarSeg3Active,
    disabledBackground: homeImages.bottomBarSeg3Disabled,
    width: 110,
    icon: homeImages.iconLand,
    tooltip: '降落',
    mode: 'multi',
    panel: 'landing',
  },
  {
    background: homeImages.bottomBarSeg4,
    activeBackground: homeImages.bottomBarSeg4Active,
    disabledBackground: homeImages.bottomBarSeg4Disabled,
    width: 100,
    icon: homeImages.iconReturnToHome,
    tooltip: '返航',
    mode: 'multi',
    panel: 'return-home',
  },
  {
    background: homeImages.bottomBarSeg5,
    activeBackground: homeImages.bottomBarSeg5Active,
    disabledBackground: homeImages.bottomBarSeg5Disabled,
    width: 101,
    icon: homeImages.iconTapToReturn,
    tooltip: '指点返航',
    mode: 'single',
    panel: 'tap-return',
  },
  {
    background: homeImages.bottomBarSeg6,
    activeBackground: homeImages.bottomBarSeg6Active,
    disabledBackground: homeImages.bottomBarSeg6Disabled,
    width: 92,
    icon: homeImages.iconAreaLanding,
    tooltip: '区域降落',
    mode: 'multi',
    panel: 'area-landing',
  },
  {
    background: homeImages.bottomBarSeg7,
    activeBackground: homeImages.bottomBarSeg7Active,
    disabledBackground: homeImages.bottomBarSeg7Disabled,
    width: 92,
    icon: homeImages.iconHover,
    tooltip: '悬停',
    mode: 'multi',
    panel: 'hover',
  },
  {
    background: homeImages.bottomBarSeg8,
    activeBackground: homeImages.bottomBarSeg8Active,
    disabledBackground: homeImages.bottomBarSeg8Disabled,
    width: 92,
    icon: homeImages.iconWaypointFlight,
    tooltip: '航点飞行',
    mode: 'single',
    panel: 'waypoint-flight',
  },
  {
    background: homeImages.bottomBarSeg9,
    activeBackground: homeImages.bottomBarSeg9Active,
    disabledBackground: homeImages.bottomBarSeg9Disabled,
    width: 101,
    icon: homeImages.iconRouteFlight,
    tooltip: '航线飞行',
    mode: 'single',
    panel: 'route-flight',
  },
  {
    background: homeImages.bottomBarSeg10,
    activeBackground: homeImages.bottomBarSeg10Active,
    disabledBackground: homeImages.bottomBarSeg10Disabled,
    width: 100,
    icon: homeImages.iconOrbit,
    tooltip: '环绕飞行',
    mode: 'single',
    panel: 'orbit-flight',
  },
  {
    background: homeImages.bottomBarSeg11,
    activeBackground: homeImages.bottomBarSeg11Active,
    disabledBackground: homeImages.bottomBarSeg11Disabled,
    width: 110,
    icon: homeImages.iconRallyPoint,
    tooltip: '集结点',
    mode: 'multi',
    panel: 'rally-point',
  },
  {
    background: homeImages.bottomBarSeg12,
    activeBackground: homeImages.bottomBarSeg12Active,
    disabledBackground: homeImages.bottomBarSeg12Disabled,
    width: 129,
    icon: homeImages.iconFormationFlight,
    tooltip: '编队飞行',
    mode: 'multi',
    panel: 'formation-flight',
  },
  { background: homeImages.bottomBarSeg13, width: 119 },
]


/** 航线飞行编号航点图钉：设计稿橙色切图（32×56）+ 白色序号叠加，钉尖对准取点位置。
 *  取点结束后（interactive）可交互：悬浮/双击弹出「删除航点」按钮，点击删除该航点，
 *  剩余航点自动重连成航线（序号随之重排）；取点中保持 pointer-events:none 不拦截取点 */
function RoutePinMarker({
  num,
  x,
  y,
  interactive,
  menuOpen,
  onHoverEnter,
  onHoverLeave,
  onToggleMenu,
  onDelete,
}: {
  num: number
  x: number
  y: number
  /** 取点结束后置 true：图钉接收鼠标事件（悬浮/双击/删除） */
  interactive: boolean
  /** 悬浮/双击触发：显示「删除航点」按钮 */
  menuOpen: boolean
  onHoverEnter: () => void
  onHoverLeave: () => void
  /** 双击：固定/解除固定删除菜单（鼠标移出后仍保留） */
  onToggleMenu: () => void
  onDelete: () => void
}) {
  return (
    <span
      className={`route-flight-marker${interactive ? ' route-flight-marker--interactive' : ''}`}
      style={{ left: x, top: y }}
      aria-hidden={!interactive}
      onMouseEnter={interactive ? onHoverEnter : undefined}
      onMouseLeave={interactive ? onHoverLeave : undefined}
      onDoubleClick={
        interactive
          ? (e) => {
              // 阻止冒泡到地图画布（双击缩放）
              e.stopPropagation()
              onToggleMenu()
            }
          : undefined
      }
    >
      <img src={homeImages.routeFlightPin} alt="" draggable={false} />
      <span className="route-flight-marker__num">{num}</span>
      {menuOpen && (
        <button
          type="button"
          className="route-flight-marker__delete"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          删除航点
        </button>
      )}
    </span>
  )
}
export function HomePage() {
  const [activeAlarm, setActiveAlarm] = useState<number | null>(null)

  // 聚焦视图：双击无人机图标后显示设备详情面板（存储聚焦的飞机索引）
  const [focusedAircraft, setFocusedAircraft] = useState<number | null>(null)

  // 功能面板（起飞/降落/返航/指点返航/区域降落/悬停/航点飞行）：点击底部按钮后按钮保持弹出状态，面板展开于右上角；
  // 各面板互斥——打开一个会关闭其他（底部按钮条同一时刻只有一个功能处于激活态）
  const [takeoffOpen, setTakeoffOpen] = useState(false)
  const [landingOpen, setLandingOpen] = useState(false)
  const [returnHomeOpen, setReturnHomeOpen] = useState(false)
  const [tapReturnOpen, setTapReturnOpen] = useState(false)
// 指点返航地图取点：面板打开期间点击地图记录落点（视口坐标 + WGS84 经纬度），
// 用于渲染图钉标记并回填面板「航点信息」坐标；确认后保留，取消面板时清除
const [tapReturnPoint, setTapReturnPoint] = useState<{
  x: number
  y: number
  lat: number
  lng: number
} | null>(null)
// 指点返航图钉跟随点：面板打开期间鼠标在地图上的实时位置（视口坐标，仅视觉不参与取点）。
// 原取点光标切图 54×54 超出浏览器 32×32 光标上限会回退成十字准线，
// 故改为 cursor:none + DOM 图钉跟随鼠标（与航点飞行取点同方案）
const [tapReturnHover, setTapReturnHover] = useState<{ x: number; y: number } | null>(null)
  // 航点飞行跟随点：面板打开期间鼠标在地图上移动时的实时位置
  // （视口坐标 + WGS84 经纬度），驱动图钉跟随与实时虚线连线
  const [waypointHover, setWaypointHover] = useState<{
    x: number
    y: number
    lat: number
    lng: number
  } | null>(null)
  // 航点飞行定格航点：左键点击地图后确定（视口坐标 + 经纬度），
  // 虚线随之定格为实线；再次点击覆盖，取消/切换面板时清除
  const [waypointPoint, setWaypointPoint] = useState<{
    x: number
    y: number
    lat: number
    lng: number
  } | null>(null)
  // 指点返航航线就绪：点击「航线生成」且确实画出 飞机→落点 连线后置 true，
  // 「确认」按钮据此解除置灰；落点清除（取消/重开面板）时随之复位
  const [tapReturnRouteReady, setTapReturnRouteReady] = useState(false)
  // 指点返航连线（视口屏幕坐标，SVG 绘制）：飞机图标中心 → 落点图钉；
  // 两端锚定不随地图移动的 DOM 图标（飞机百分比定位/图钉 fixed 定位），
  // 地图缩放/平移时连线始终贴合两端，不会断开漂移
  const [tapReturnLine, setTapReturnLine] = useState<{
    x1: number
    y1: number
    x2: number
    y2: number
  } | null>(null)
  // 模拟飞行状态：确认指点返航后，无人机图标沿连线循环飞向落点图钉
  // （视口屏幕坐标 + 航向角 + 图标），rAF 驱动，直至手动点击「取消」终止
  const [tapReturnFlight, setTapReturnFlight] = useState<{
    x: number
    y: number
    angle: number
    icon: string
  } | null>(null)
  const tapReturnFlightRaf = useRef<number | null>(null)
  const [areaLandingOpen, setAreaLandingOpen] = useState(false)
  // 区域降落面板信息（提升到 HomePage：面板收起（进入框选）/重开之间保留）：
  // 当前 tab、降落速度（m/s）、降落编队；rect 为框选「确认」定格的选区（视口坐标）
  const [areaLandingTab, setAreaLandingTab] = useState<PanelTab>('params')
  const [areaLandingSpeed, setAreaLandingSpeed] = useState(10)
  const [areaLandingFormation, setAreaLandingFormation] =
    useState<AreaLandingFormation>('一字型')
  const [areaLandingRect, setAreaLandingRect] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  // 选区四角经纬度（WGS84，框选确认时由视口坐标换算）：
  // 供区域降落面板「区域信息」实时显示，随选区一并创建/清除
  const [areaLandingCorners, setAreaLandingCorners] = useState<
    { lat: number; lng: number }[] | null
  >(null)
  // 区域降落/集结点框选模式：区域降落面板「航线生成」或集结点按钮/面板「航线生成」后进入——
  // 首页全屏遮罩 + 停机坪图标光标 + 拖拽自定义大小紫色虚线框；按住左键时框实时跟随光标
  // （光标锚定框右下角），松开定格，Esc/右键退出；areaSelectSource 标记选区归属面板
  const [areaSelectMode, setAreaSelectMode] = useState(false)
  // 框选起点（视口坐标 clientX/clientY），null = 尚未开始框选
  const [areaSelectAnchor, setAreaSelectAnchor] = useState<{ x: number; y: number } | null>(null)
  // 框选当前终点（拖动中的视口坐标），与起点共同确定选区矩形
  const [areaSelectEnd, setAreaSelectEnd] = useState<{ x: number; y: number } | null>(null)
  // 是否处于按住左键拖动状态（拖动期间矩形实时拉伸）
  const [areaSelectDragging, setAreaSelectDragging] = useState(false)
  // 框选模式归属：'area-landing' 区域降落（写入 areaLandingRect/corners，面板显示区域信息）/
  // 'rally-point' 集结点（写入 rallyPointRect，绘制区域不带中心地面标记徽章）——
  // Esc/右键/取消回到对应面板，确认写入对应选区并回到对应面板
  const [areaSelectSource, setAreaSelectSource] = useState<'area-landing' | 'rally-point'>(
    'area-landing',
  )
  // 集结点已确认的框选区域（视口坐标）：与区域降落同款截图式矩形，但无中心徽章
  const [rallyPointRect, setRallyPointRect] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  // Esc 退出框选模式（键盘兜底退出）
  useEffect(() => {
    if (!areaSelectMode) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAreaSelectMode(false)
        setAreaSelectAnchor(null)
        setAreaSelectEnd(null)
        // 取消绘制并重新展示对应面板（信息已提升保留）
        if (areaSelectSource === 'rally-point') setRallyPointOpen(true)
        else setAreaLandingOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [areaSelectMode, areaSelectSource])
  // 进入框选模式时清零上一轮遗留的选区状态（起点/终点/拖动标记），
  // 确保每次进入均为空白可绘制状态（兜底：任何退出路径未清干净也不影响再次绘制）
  useEffect(() => {
    if (areaSelectMode) {
      setAreaSelectAnchor(null)
      setAreaSelectEnd(null)
      setAreaSelectDragging(false)
    }
  }, [areaSelectMode])
  const [hoverOpen, setHoverOpen] = useState(false)
  const [waypointFlightOpen, setWaypointFlightOpen] = useState(false)
  // 航点飞行二次确认：面板「确认」先暂存飞行高度并弹出滑动确认弹窗，滑到最右才真正执行
  const [waypointSlide, setWaypointSlide] = useState<{ open: boolean; height: number }>({
    open: false,
    height: 10,
  })
  // 航线飞行二次确认：面板「确认」先暂存飞行高度并弹出滑动确认弹窗，滑到最右才真正执行
  const [routeSlide, setRouteSlide] = useState<{ open: boolean; height: number }>({
    open: false,
    height: 10,
  })
  const [routeFlightOpen, setRouteFlightOpen] = useState(false)
  // 航点飞行取点模式：点击面板「航线生成」后进入——光标变航点图钉、虚线连线，
  // 左键定格航点后退出取点（面板保留，可继续确认/取消）；再次「航线生成」重新取点
  const [waypointPickingActive, setWaypointPickingActive] = useState(false)
  // 航线生成状态：定格航点（保持虚线）后点击「航线生成」，虚线定格为实线；重新取点/关闭面板时复位
  const [waypointRouteGenerated, setWaypointRouteGenerated] = useState(false)
  // 航线飞行取点：点击「航线生成」后进入——光标变带编号的航线图钉，
  // 左键逐点追加航点（1、2、3…），航点1 → 航点2 → … 连线（全程虚线，不与飞机连线）；
  // 右键/Esc 结束取点（保持虚线）并解除「确认」置灰，面板保留可继续操作
  const [routeFlightPicking, setRouteFlightPicking] = useState(false)
  const [routeFlightPoints, setRouteFlightPoints] = useState<
    { x: number; y: number; lat: number; lng: number }[]
  >([])
  const [routeFlightHover, setRouteFlightHover] = useState<{
    x: number
    y: number
    lat: number
    lng: number
  } | null>(null)
  const [routeFlightFinished, setRouteFlightFinished] = useState(false)
  // 航线生成状态：标记完成（保持虚线）后点击「航线生成」，虚线定格为实线；重新取点/关闭面板时复位
  const [routeFlightGenerated, setRouteFlightGenerated] = useState(false)
  // 航点删除菜单：menu = 当前显示「删除航点」按钮的航点下标（悬浮或双击触发），
  // pinned = 双击固定的下标（鼠标移出图钉后仍保留）；删除航点/重新取点/关闭面板时清除
  const [routePinMenu, setRoutePinMenu] = useState<number | null>(null)
  const [routePinPinned, setRoutePinPinned] = useState<number | null>(null)
  const [orbitFlightOpen, setOrbitFlightOpen] = useState(false)
  // 环绕飞行图钉跟随点：面板打开期间鼠标在地图上的实时位置（视口坐标，仅视觉不参与取点）。
  // 与指点返航同方案——tap-return-marker 切图 32×56 超出浏览器 32×32 光标上限，
  // 故 cursor:none + DOM 图钉跟随鼠标
  const [orbitFlightHover, setOrbitFlightHover] = useState<{ x: number; y: number } | null>(null)
  // 环绕飞行取点：左键点击地图定格的环绕中心（视口坐标 + 经纬度），盘旋圆与最近点连线的锚点
  const [orbitPoint, setOrbitPoint] = useState<{
    x: number
    y: number
    lat: number
    lng: number
  } | null>(null)
  // 盘旋半径（米）：与面板「盘旋半径」步进联动，驱动地图盘旋圆像素半径，默认 50m
  const [orbitRadius, setOrbitRadius] = useState(50)
  // 盘旋圆随缩放刷新：缩放级别变化后 getMetersPerPixel 改变，触发重渲染重算像素半径
  const [, setOrbitZoomTick] = useState(0)
  // 航线生成状态：定格环绕中心（保持虚线）后点击「航线生成」，盘旋圆/最近点连线由虚线定格为实线；
  // 重新取点/关闭面板时复位，生成前「确认」保持置灰
  const [orbitRouteGenerated, setOrbitRouteGenerated] = useState(false)
  // 环绕飞行二次确认：面板「确认」先暂存盘旋高度/半径并弹出滑动确认弹窗，滑到最右才真正执行
  const [orbitSlide, setOrbitSlide] = useState<{ open: boolean; height: number; radius?: number }>({
    open: false,
    height: 10,
    radius: 50,
  })
  const [rallyPointOpen, setRallyPointOpen] = useState(false)
  const [formationFlightOpen, setFormationFlightOpen] = useState(false)
  // 编队飞行图钉跟随点：面板打开期间鼠标在地图上的实时位置（视口坐标，仅视觉不参与取点）。
  // 与指点返航同方案——tap-return-marker 切图 32×56 超出浏览器 32×32 光标上限，
  // 故 cursor:none + DOM 图钉跟随鼠标
  const [formationFlightHover, setFormationFlightHover] = useState<{
    x: number
    y: number
  } | null>(null)
  // 编队飞行取点：左键点击地图定格的航点（视口坐标 + 经纬度），
  // 回填面板「航点信息」坐标输入框；再次点击可重取，取消/关闭面板时清除
  const [formationFlightPoint, setFormationFlightPoint] = useState<{
    x: number
    y: number
    lat: number
    lng: number
  } | null>(null)
  const openTakeoffPanel = () => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setTakeoffOpen((v) => !v)
  }
  const openLandingPanel = () => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setTakeoffOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setLandingOpen((v) => !v)
  }
  const openReturnHomePanel = () => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setReturnHomeOpen((v) => !v)
  }
  const openTapReturnPanel = () => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setAreaLandingOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setTapReturnPoint(null)
    setTapReturnOpen((v) => !v)
  }
  const openAreaLandingPanel = () => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setAreaLandingOpen((v) => !v)
  }
  const openHoverPanel = () => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setWaypointFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setHoverOpen((v) => !v)
  }
  const openWaypointFlightPanel = () => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setHoverOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    // 面板由关到开：立即进入取点模式（光标变航点图钉），并清除上一次遗留航点
    if (!waypointFlightOpen) {
      setWaypointHover(null)
      setWaypointPoint(null)
      setWaypointRouteGenerated(false)
      setWaypointPickingActive(true)
    }
    setWaypointFlightOpen((v) => !v)
  }
  const openRouteFlightPanel = () => {
    setOrbitFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    // 面板由关到开：立即进入取点模式（光标变带编号图钉），并清除上一次遗留航线
    if (!routeFlightOpen) {
      setRouteFlightPoints([])
      setRouteFlightHover(null)
      setRouteFlightFinished(false)
      setRouteFlightGenerated(false)
      setRoutePinMenu(null)
      setRoutePinPinned(null)
      setRouteFlightPicking(true)
    }
    setRouteFlightOpen((v) => !v)
  }
  const openOrbitFlightPanel = () => {
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setRouteFlightOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    // 重新打开时清除上一轮定格的环绕中心与航线生成状态，恢复取点状态
    setOrbitPoint(null)
    setOrbitRouteGenerated(false)
    setOrbitFlightOpen((v) => !v)
  }
  const openRallyPointPanel = () => {
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setFormationFlightOpen(false)
    // 面板由关到开：先判断是否已绘制集结区域——未绘制则进入截图式框选模式
    // （停机坪图标光标 + 遮罩 + 虚线框，与区域降落同款，确认区域无中心地面标记徽章）；
    // 已绘制则直接打开集结点面板并还原正常鼠标样式（已确认区域保留在地图上，
    // 可经面板「航线生成」或区域上的「删除重绘」重选）
    if (!rallyPointOpen) {
      if (!rallyPointRect) {
        setAreaSelectSource('rally-point')
        setAreaSelectMode(true)
        return
      }
      setRallyPointOpen(true)
      return
    }
    // 面板已开：未绘制区域时再点按钮直接重新进入框选绘制（而非仅收起面板），
    // 避免「取消绘制后无法再次绘制」；已绘制区域时维持收起面板
    if (!rallyPointRect) {
      setRallyPointOpen(false)
      setAreaSelectSource('rally-point')
      setAreaSelectMode(true)
      return
    }
    setRallyPointOpen(false)
  }
  const openFormationFlightPanel = () => {
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setRallyPointOpen(false)
    // 面板由关到开：立即进入取点模式（光标变图钉，与指点返航同方案），并清除上一次遗留航点
    setFormationFlightPoint(null)
    setFormationFlightOpen((v) => !v)
  }
  // 各功能面板展开状态查询表：底部按钮「弹出 + 激活背景」统一由此判断，
  // 替代逐面板的 && 长链（第 2~12 段功能按钮均提供激活态背景切图）
  const panelOpenState: Record<BottomBarPanel, boolean> = {
    takeoff: takeoffOpen,
    landing: landingOpen,
    'return-home': returnHomeOpen,
    'tap-return': tapReturnOpen,
    'area-landing': areaLandingOpen,
    hover: hoverOpen,
    'waypoint-flight': waypointFlightOpen,
    'route-flight': routeFlightOpen,
    'orbit-flight': orbitFlightOpen,
    'rally-point': rallyPointOpen,
    'formation-flight': formationFlightOpen,
  }

  // 各功能按钮点击处理函数查询表：与 panelOpenState 平行的互斥切换入口，
  // 渲染处据此绑定 onClick（替代逐面板嵌套三元链）
  const panelHandlers: Record<BottomBarPanel, () => void> = {
    takeoff: openTakeoffPanel,
    landing: openLandingPanel,
    'return-home': openReturnHomePanel,
    'tap-return': openTapReturnPanel,
    'area-landing': openAreaLandingPanel,
    hover: openHoverPanel,
    'waypoint-flight': openWaypointFlightPanel,
    'route-flight': openRouteFlightPanel,
    'orbit-flight': openOrbitFlightPanel,
    'rally-point': openRallyPointPanel,
    'formation-flight': openFormationFlightPanel,
  }

  // 模拟飞行动画：无人机图标沿「航线生成」连线自飞机位置匀速飞向落点图钉（单程约 4s），
  // 图标按航向角旋转（切图机头默认朝上，rotate = atan2 屏幕角 + 90°）；
  // 到达落点停留 600ms 后回到起点重飞——无限循环播放，
  // 直至手动点击面板「取消」（或切换到其他功能面板）才停止。
  // 仅前端演示，待接入真实指令链路后由实时遥测驱动
  const startTapReturnFlight = (
    line: { x1: number; y1: number; x2: number; y2: number },
    icon: string,
  ) => {
    if (tapReturnFlightRaf.current !== null) cancelAnimationFrame(tapReturnFlightRaf.current)
    const duration = 4000
    const holdAtEnd = 600
    const cycle = duration + holdAtEnd
    const startTime = performance.now()
    const angle = (Math.atan2(line.y2 - line.y1, line.x2 - line.x1) * 180) / Math.PI + 90
    const step = (now: number) => {
      // 周期取模实现无限循环：0~4s 飞行 → 停留落点 600ms → 回到起点重飞
      const t = Math.min(1, ((now - startTime) % cycle) / duration)
      setTapReturnFlight({
        x: line.x1 + (line.x2 - line.x1) * t,
        y: line.y1 + (line.y2 - line.y1) * t,
        angle,
        icon,
      })
      tapReturnFlightRaf.current = requestAnimationFrame(step)
    }
    tapReturnFlightRaf.current = requestAnimationFrame(step)
  }
  // 停止循环飞行：取消动画帧并清除飞行无人机（「取消」按钮/面板收起时调用）
  const stopTapReturnFlight = () => {
    if (tapReturnFlightRaf.current !== null) {
      cancelAnimationFrame(tapReturnFlightRaf.current)
      tapReturnFlightRaf.current = null
    }
    setTapReturnFlight(null)
  }
  // 面板收起时（手动取消/点击其他功能按钮互斥切换）终止循环飞行动画；
  // 「确认」不再收起面板，因此确认后循环持续播放，仅手动取消可终止
  useEffect(() => {
    if (!tapReturnOpen) stopTapReturnFlight()
  }, [tapReturnOpen])
  // 组件卸载时终止进行中的模拟飞行动画
  useEffect(() => {
    return () => {
      if (tapReturnFlightRaf.current !== null) cancelAnimationFrame(tapReturnFlightRaf.current)
    }
  }, [])

  const handleAircraftDoubleClick = (index: number) => {
    // 双击同一架飞机时切换关闭，双击不同飞机时切换目标
    setFocusedAircraft((prev) => (prev === index ? null : index))
  }
  const handleCloseFocusPanel = () => setFocusedAircraft(null)

  // 地图引擎实例：MapLibreContainer 初始化后通过 onEngineReady 注入，
  // adapter 供业务组件（控件、比例尺等）引擎无关地操作地图。
  const { adapter, onEngineReady } = useMapEngine()

  // 面板打开期间：点击地图（.map-base 容器内）即取点——document capture 阶段监听，
  // 面板/底栏/顶栏等 UI 上的点击因不在地图容器内而被忽略；再次点击覆盖上一次落点
  useEffect(() => {
    if (!tapReturnOpen) return
    const handleMapClick = (e: MouseEvent) => {
      if (!adapter) return
      const container = adapter.getContainer()
      if (!(e.target instanceof Node) || !container.contains(e.target)) return
      const bounds = container.getBoundingClientRect()
      const ll = adapter.unproject({
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      })
      setTapReturnPoint({ x: e.clientX, y: e.clientY, lat: ll.lat, lng: ll.lng })
    }
    // mousemove 实时更新图钉跟随点（鼠标在地图内时跟随、移到 UI 上时清除），
    // 以 DOM 图钉替代原生取点光标（54×54 切图超 32×32 光标上限会回退成十字准线）
    const handleMouseMove = (e: MouseEvent) => {
      if (!adapter) return
      const container = adapter.getContainer()
      if (!container || !(e.target instanceof Node) || !container.contains(e.target)) {
        setTapReturnHover(null)
        return
      }
      setTapReturnHover({ x: e.clientX, y: e.clientY })
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('click', handleMapClick, true)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('click', handleMapClick, true)
      setTapReturnHover(null)
    }
  }, [tapReturnOpen, adapter])


  // 环绕飞行取点：面板打开期间鼠标在地图容器内移动时图钉实时跟随（钉尖对准鼠标，
  // 替代原生光标），鼠标移到面板/UI 上时隐藏跟随图钉；左键点击地图定格环绕中心
  // （携带经纬度回填面板坐标输入框，再次点击可重新取点），点击 UI（面板/底栏）不取点
  useEffect(() => {
    if (!orbitFlightOpen) return
    const handleOrbitMouseMove = (e: MouseEvent) => {
      if (!adapter) return
      const container = adapter.getContainer()
      if (!container || !(e.target instanceof Node) || !container.contains(e.target)) {
        setOrbitFlightHover(null)
        return
      }
      setOrbitFlightHover({ x: e.clientX, y: e.clientY })
    }
    const handleOrbitMapClick = (e: MouseEvent) => {
      if (!adapter) return
      const container = adapter.getContainer()
      if (!container || !(e.target instanceof Node) || !container.contains(e.target)) return
      const bounds = container.getBoundingClientRect()
      const ll = adapter.unproject({ x: e.clientX - bounds.left, y: e.clientY - bounds.top })
      // 重新取点：已生成实线航线时回到虚线待生成状态（「确认」随之重新置灰）
      setOrbitRouteGenerated(false)
      setOrbitPoint({ x: e.clientX, y: e.clientY, lat: ll.lat, lng: ll.lng })
    }
    document.addEventListener('mousemove', handleOrbitMouseMove)
    document.addEventListener('click', handleOrbitMapClick, true)
    return () => {
      document.removeEventListener('mousemove', handleOrbitMouseMove)
      document.removeEventListener('click', handleOrbitMapClick, true)
      setOrbitFlightHover(null)
    }
  }, [orbitFlightOpen, adapter])

  // 编队飞行取点：面板打开期间鼠标在地图容器内移动时图钉实时跟随（钉尖对准鼠标，
  // 替代原生光标），鼠标移到面板/UI 上时隐藏跟随图钉；左键点击地图定格航点
  // （携带经纬度回填面板坐标输入框，再次点击可重新取点），点击 UI（面板/底栏）不取点
  useEffect(() => {
    if (!formationFlightOpen) return
    const handleFormationMouseMove = (e: MouseEvent) => {
      if (!adapter) return
      const container = adapter.getContainer()
      if (!container || !(e.target instanceof Node) || !container.contains(e.target)) {
        setFormationFlightHover(null)
        return
      }
      setFormationFlightHover({ x: e.clientX, y: e.clientY })
    }
    const handleFormationMapClick = (e: MouseEvent) => {
      if (!adapter) return
      const container = adapter.getContainer()
      if (!container || !(e.target instanceof Node) || !container.contains(e.target)) return
      const bounds = container.getBoundingClientRect()
      const ll = adapter.unproject({ x: e.clientX - bounds.left, y: e.clientY - bounds.top })
      setFormationFlightPoint({ x: e.clientX, y: e.clientY, lat: ll.lat, lng: ll.lng })
    }
    document.addEventListener('mousemove', handleFormationMouseMove)
    document.addEventListener('click', handleFormationMapClick, true)
    return () => {
      document.removeEventListener('mousemove', handleFormationMouseMove)
      document.removeEventListener('click', handleFormationMapClick, true)
      setFormationFlightHover(null)
    }
  }, [formationFlightOpen, adapter])

  // 编队飞行面板关闭（取消/确认/互斥切换）时：清除跟随点与定格航点
  useEffect(() => {
    if (!formationFlightOpen) {
      setFormationFlightHover(null)
      setFormationFlightPoint(null)
    }
  }, [formationFlightOpen])

  // 盘旋圆随缩放重算：缩放结束后 getMetersPerPixel 变化，tick 触发重渲染刷新像素半径
  useEffect(() => {
    if (!adapter || !orbitFlightOpen) return
    return adapter.onZoomEnd(() => setOrbitZoomTick((t) => t + 1))
  }, [adapter, orbitFlightOpen])

  // 航点飞行取点：点击「航线生成」进入取点模式后，鼠标在地图容器内移动时图钉
  // 实时跟随（仅当地图内，移到面板/UI 上时图钉停在原地）；左键点击地图定格航点
  // （虚线变实线）并结束本轮取点，后续操作（确认/取消）继续；
  // 点击 UI（面板/底栏）不取点——capture 阶段监听，同指点返航
  useEffect(() => {
    if (!waypointFlightOpen || !waypointPickingActive || waypointPoint) return
    const toLngLat = (clientX: number, clientY: number) => {
      if (!adapter) return null
      const container = adapter.getContainer()
      if (!container) return null
      const bounds = container.getBoundingClientRect()
      const ll = adapter.unproject({ x: clientX - bounds.left, y: clientY - bounds.top })
      return { lat: ll.lat, lng: ll.lng }
    }
    const handleMouseMove = (e: MouseEvent) => {
      if (!adapter) return
      const container = adapter.getContainer()
      if (!container || !(e.target instanceof Node) || !container.contains(e.target)) return
      const ll = toLngLat(e.clientX, e.clientY)
      if (!ll) return
      setWaypointHover({ x: e.clientX, y: e.clientY, lat: ll.lat, lng: ll.lng })
    }
    const handleMapClick = (e: MouseEvent) => {
      if (!adapter) return
      const container = adapter.getContainer()
      if (!container || !(e.target instanceof Node) || !container.contains(e.target)) return
      const ll = toLngLat(e.clientX, e.clientY)
      if (!ll) return
      setWaypointPoint({ x: e.clientX, y: e.clientY, lat: ll.lat, lng: ll.lng })
    }
    // 右键取消：取点阶段（尚未定格航点）右键点击关闭面板（等价「取消」）并阻止默认右键菜单；
    // 定格航点后监听已解除，右键不再取消，只能通过面板「取消」按钮关闭
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      setWaypointFlightOpen(false)
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('click', handleMapClick, true)
    document.addEventListener('contextmenu', handleContextMenu)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('click', handleMapClick, true)
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [waypointFlightOpen, waypointPickingActive, waypointPoint, adapter])

  // 航点飞行面板关闭（取消/确认/互斥切换）时：清除跟随点、定格航点与取点模式，
  // 图钉与连线随状态清除消失
  useEffect(() => {
    if (!waypointFlightOpen) {
      setWaypointHover(null)
      setWaypointPoint(null)
      setWaypointRouteGenerated(false)
      setWaypointPickingActive(false)
    }
  }, [waypointFlightOpen])

  // 航线飞行取点：点击「航线生成」进入取点模式后，左键点击地图逐点追加编号航点，
  // 鼠标与最新航点间保持虚线连线；右键/Esc 结束取点（已有航点则保持虚线航线，
  // 解除「确认」置灰）；点击 UI（面板/底栏）不取点——同航点飞行
  useEffect(() => {
    if (!routeFlightOpen || !routeFlightPicking) return
    const toLngLat = (clientX: number, clientY: number) => {
      if (!adapter) return null
      const container = adapter.getContainer()
      if (!container) return null
      const bounds = container.getBoundingClientRect()
      const ll = adapter.unproject({ x: clientX - bounds.left, y: clientY - bounds.top })
      return { lat: ll.lat, lng: ll.lng }
    }
    const inMap = (e: MouseEvent) => {
      if (!adapter) return false
      const container = adapter.getContainer()
      return !!container && e.target instanceof Node && container.contains(e.target)
    }
    const handleMouseMove = (e: MouseEvent) => {
      if (!inMap(e)) return
      const ll = toLngLat(e.clientX, e.clientY)
      if (!ll) return
      setRouteFlightHover({ x: e.clientX, y: e.clientY, lat: ll.lat, lng: ll.lng })
    }
    const handleMapClick = (e: MouseEvent) => {
      if (!inMap(e)) return
      const ll = toLngLat(e.clientX, e.clientY)
      if (!ll) return
      setRouteFlightPoints((prev) => [...prev, { x: e.clientX, y: e.clientY, ...ll }])
    }
    // 结束取点：已放置航点则定格航线并解除「确认」置灰；未放置则仅退出取点
    const finishPicking = () => {
      setRouteFlightPicking(false)
      setRouteFlightFinished(routeFlightPoints.length > 0)
      setRouteFlightHover(null)
    }
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      finishPicking()
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finishPicking()
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('click', handleMapClick, true)
    document.addEventListener('contextmenu', handleContextMenu)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('click', handleMapClick, true)
      document.removeEventListener('contextmenu', handleContextMenu)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [routeFlightOpen, routeFlightPicking, routeFlightPoints, adapter])


  // 航线飞行面板关闭（取消/确认/互斥切换）时：清除取点状态与已画航线
  useEffect(() => {
    if (!routeFlightOpen) {
      setRouteFlightPicking(false)
      setRouteFlightPoints([])
      setRouteFlightHover(null)
      setRouteFlightFinished(false)
      setRouteFlightGenerated(false)
      setRoutePinMenu(null)
      setRoutePinPinned(null)
    }
  }, [routeFlightOpen])

  // 删除航线航点：移除对应下标的航点，剩余航点自动重连成新航线（图钉序号随之重排）；
  // 同时收起删除菜单（航点下标即将失效）
  const handleDeleteRoutePoint = (index: number) => {
    setRouteFlightPoints((prev) => prev.filter((_, i) => i !== index))
    setRoutePinMenu(null)
    setRoutePinPinned(null)
  }

  // 航点被全部删除：航线不复存在，复位取点完成/已生成标记（「确认」随之重新置灰）
  useEffect(() => {
    if (routeFlightPoints.length === 0) {
      setRouteFlightFinished(false)
      setRouteFlightGenerated(false)
    }
  }, [routeFlightPoints])

  // 重新进入取点（重取航点）：清除删除菜单，避免下标与航点错位
  useEffect(() => {
    if (routeFlightPicking) {
      setRoutePinMenu(null)
      setRoutePinPinned(null)
    }
  }, [routeFlightPicking])

  // 落点变化/清除（重新取点、取消/重开面板）时：清除旧连线并复位「确认」置灰，
  // 需再次点击「航线生成」重画
  useEffect(() => {
    setTapReturnRouteReady(false)
    setTapReturnLine(null)
  }, [tapReturnPoint])

  // 离线地图：注册 gcs-pkg:// 协议 + 加载已导入包 + 派生活跃栅格样式。
  // 严格离线机制——地图容器不读取 navigator.onLine、无「在线/离线」分支；
  // 尚未导入离线地图包时 activeStyle 为 null（渲染纯色占位底图），
  // 导入后由 gcs-pkg:// 协议从 IndexedDB 渲染。
  const { activeStyle, activePackage } = useOfflineMap()

  // 默认城市：首次加载完成且无激活包时，自动启用「苏州」离线包
  // （已导入则直接激活；未导入则从同源 public/maps/suzhou.mbtiles 拉取导入后激活）。
  // ensuredRef 保证仅执行一次，用户后续手动取消激活不会被强制切回。
  const ensureCityPackage = useOfflineMapStore((s) => s.ensureCityPackage)
  const offlineStatus = useOfflineMapStore((s) => s.status)
  const activePackageId = useOfflineMapStore((s) => s.activePackageId)
  const defaultCityEnsuredRef = useRef(false)
  useEffect(() => {
    if (defaultCityEnsuredRef.current || offlineStatus !== 'ready') return
    defaultCityEnsuredRef.current = true
    if (activePackageId) return
    void ensureCityPackage('suzhou')
  }, [offlineStatus, activePackageId, ensureCityPackage])

  // 激活包变化时（导入新包 / 切换城市）平滑飞到包中心。
  useEffect(() => {
    if (!adapter || !activePackage) return
    adapter.flyTo(activePackage.center, { zoom: 14, duration: 1500 })
  }, [adapter, activePackage])

  const currentAlarmColor = activeAlarm !== null ? ALARM_TYPES[activeAlarm]?.color : undefined

  // 设备联动：hover/选中状态与设备管理面板双向同步（全局 store 承载，
  // deviceIndex 对应 config/devices.ts deviceList 下标）
  const hoveredDevice = useDeviceLinkStore((s) => s.hoveredDevice)
  const selectedDevices = useDeviceLinkStore((s) => s.selectedDevices)
  const setHoveredDevice = useDeviceLinkStore((s) => s.setHoveredDevice)
  const toggleDevice = useDeviceLinkStore((s) => s.toggleDevice)
  const requestOpenDevicePanel = useDeviceLinkStore((s) => s.requestOpenDevicePanel)

  // 选中飞机列表：取「设备管理」选中集合对应的真实设备（名称对齐 devices.ts，
  // 高度/电量先取配置遥测值作为 mock，后续接入实时遥测后替换数据源即可）
  const selectedAircraft: AircraftListItem[] = useMemo(() => {
    const indices = [...selectedDevices].sort((a, b) => a - b)
    return indices
      .map((index) => {
        const device = deviceList[index]
        if (!device) return null
        return {
          id: String(index),
          name: device.name,
          altitude: Number(device.altitudeValue?.replace(/[^\d.]/g, '')) || 0,
          battery: Number(device.batteryValue?.replace(/[^\d.]/g, '')) || 0,
        }
      })
      .filter((item): item is AircraftListItem => item !== null)
  }, [selectedDevices])
  // Aircraft row delete: deselect the device (id = device index string). Store update
  // syncs device panel checkboxes, home icons, and bottom bar button states.
  const handleRemoveAircraft = (id: string) => {
    toggleDevice(Number(id))
  }

  // 区分「点击选中」与「拖拽」：mousedown 记录起点，click 时位移小于阈值才触发选中
  const aircraftMouseDownPos = useRef<{ x: number; y: number } | null>(null)

  // 飞机图标拖拽：鼠标左键按住拖动图标+名称至首页任意位置
  const { positions: aircraftPositions, onDragStart: onAircraftDragStart } = useDraggable({
    count: aircraft.length,
    initialPositions: AIRCRAFT_INITIAL_POSITIONS,
    storageKey: 'gcs:aircraft-positions',
  })

  // 巡检区域拖拽：鼠标左键按住拖动整个巡检区域（含轨迹线）至首页任意位置
  const { positions: inspectionZonePositions, onDragStart: onInspectionZoneDragStart } =
    useDraggable({
      count: 1,
      initialPositions: [INSPECTION_ZONE_INITIAL_POSITION],
      storageKey: 'gcs:inspection-zone-position',
    })

  // hover 面板边缘自适应方向（巡检区域）
  const inspectionZonePlacement = computePanelPlacement(
    inspectionZonePositions[0].x,
    inspectionZonePositions[0].y,
  )
  const inspectionZonePanelClasses = placementToClasses(inspectionZonePlacement)

  // hover 面板视口边缘平移修正（兜底）：测量实际矩形并注入 --clamp-x/--clamp-y，
  // 确保任何 hover 面板（飞机/巡检区域/禁飞区）在任意拖拽位置都不溢出视口。
  // 依赖宿主百分比坐标与聚焦索引：拖拽改变坐标时实时重新修正；聚焦切换时面板增删亦重算。
  usePanelClamp({
    deps: [
      ...aircraftPositions.map((p) => `${p.x},${p.y}`),
      `${inspectionZonePositions[0].x},${inspectionZonePositions[0].y}`,
      focusedAircraft,
    ],
  })

  return (
    <main
      className={`design-viewport${tapReturnOpen ? ' tap-return-mode' : ''}${waypointFlightOpen ? ' waypoint-flight-mode' : ''}${waypointFlightOpen && waypointPickingActive && !waypointPoint ? ' waypoint-picking' : ''}${routeFlightOpen && routeFlightPicking ? ' route-flight-picking' : ''}${orbitFlightOpen ? ' orbit-flight-mode' : ''}${formationFlightOpen ? ' formation-flight-mode' : ''}`}
      aria-label="无人机集群控制地面站"
    >
      <div className="design-canvas">
        {/* 地图底图：MapLibre GL JS 容器（严格离线）。尚未导入地图包时渲染纯色占位底图，
            导入后由父组件通过 styleSpec 注入 MBTiles 派生样式（P1+）。 */}
        <MapLibreContainer
          className="map-base"
          onReady={onEngineReady}
          styleSpec={activeStyle}
          autoLocate
        />

        <StatusHeader activeAlarm={activeAlarm} onAlarmClick={setActiveAlarm} />

        <section className="map-stage">
          <MapToolbar />

          {/* 离线地图管理面板（导入 / 城市切换 / 包列表）—— 严格离线，仅读写本地 IndexedDB */}
          <OfflineMapPanel />

          {/* 严格离线：瓦片缓存命中即渲染；未命中灰显（绝不在线回源）。
              尚未导入地图包时渲染纯色占位底图。导入/切换入口由离线地图管理模块提供（P1+）。 */}
          {/* MissionPanel 与 AlarmInfoPanel 暂时隐藏，待后续功能接入时恢复 */}
          {SHOW_PENDING_PANELS && <MissionPanel />}
          {SHOW_PENDING_PANELS && <AlarmInfoPanel alarmColor={currentAlarmColor} />}
          {/* 红色禁飞区：左下角倾斜四边形，SVG 绘制边框 + 四角节点 */}
          <div className="restricted-zone restricted-zone--red" aria-label="禁飞区域">
            <svg
              className="restricted-zone__border"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <polygon
                points="22,0 78,8 100,100 0,92"
                fill="rgba(220,38,38,0.35)"
                stroke="rgba(172,14,14,0.85)"
                strokeWidth="0.8"
              />
              <defs>
                <pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="8">
                  <line
                    x1="3"
                    y1="0"
                    x2="3"
                    y2="8"
                    stroke="rgba(220,38,38,0.35)"
                    strokeWidth="0.5"
                  />
                </pattern>
              </defs>
              <polygon points="22,0 78,8 100,100 0,92" fill="url(#hatch)" />
            </svg>
            {/* Hover 信息面板 */}
            <div className="block_7 flex-col" data-hover-panel>
              <div className="block_7__top">
                <span className="text_8">01禁飞区</span>
                <div className="section_3 flex-col"></div>
              </div>
              <div className="block_7__bottom">
                <div className="section_4 flex-row">
                  <div className="box_13 flex-col"></div>
                  <span className="text_9">来源</span>
                  <span className="text_10">管理员划定</span>
                </div>
                <div className="section_5 flex-row">
                  <div className="group_10 flex-col"></div>
                  <span className="text_11">面积</span>
                  <span className="text_12">156m&nbsp;x&nbsp;314m</span>
                </div>
                <div className="section_6 flex-row">
                  <div className="group_11 flex-col"></div>
                  <span className="text_13">模式</span>
                  <span className="text_14">悬停</span>
                </div>
              </div>
            </div>
            {/* 四角正方形节点标记 */}
            <span className="corner-marker corner-marker--tl" /> {/* 左上 (22%, 0%) */}
            <span className="corner-marker corner-marker--tr" /> {/* 右上 (78%, 8%) */}
            <span className="corner-marker corner-marker--br" /> {/* 右下 (100%, 100%) */}
            <span className="corner-marker corner-marker--bl" /> {/* 左下 (0%, 92%) */}
          </div>
          {SHOW_PENDING_PANELS && <div className="restricted-zone restricted-zone--orange" />}

          {/* 巡检区域：包含1条蛇形巡检轨迹线，支持拖拽移动 */}
          <div
            className={`inspection-zone ${inspectionZonePanelClasses.join(' ')}`}
            aria-label="巡检区域"
            style={{
              left: `${inspectionZonePositions[0].x}%`,
              top: `${inspectionZonePositions[0].y}%`,
            }}
            onMouseDown={(e) => onInspectionZoneDragStart(0, e)}
          >
            {/* 半透明蓝色背景 */}
            <div className="inspection-zone__bg" />

            {/* Hover 信息面板（右上角）：01号巡检区 */}
            <div className="inspection-zone__panel" data-hover-panel>
              {/* 顶部：标题+分隔线（固定高度，完全复刻禁飞区 .block_7__top 结构） */}
              <div className="inspection-zone__panel-top">
                <span className="inspection-zone__panel-title">01号巡检区</span>
                <div className="inspection-zone__panel-divider" />
              </div>
              <div className="inspection-zone__panel-body">
                <div className="inspection-zone__panel-row inspection-zone__panel-row--area">
                  <span className="inspection-zone__panel-bar" />
                  <span className="inspection-zone__panel-label">面积</span>
                  <span className="inspection-zone__panel-value">109m</span>
                  <span className="inspection-zone__panel-sup">2</span>
                </div>
                <div className="inspection-zone__panel-row inspection-zone__panel-row--task">
                  <span className="inspection-zone__panel-bar" />
                  <span className="inspection-zone__panel-label">关联任务</span>
                  <span className="inspection-zone__panel-value">情报侦察</span>
                </div>
              </div>
            </div>

            {/* SVG 轨迹线：viewBox 精确映射巡检区域内部坐标系 */}
            <svg
              className="inspection-zone__trajectories"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* 已飞行轨迹（白色）：从起点到路径中点 (50,50) */}
              <path
                className="inspection-zone__path inspection-zone__path--flown"
                d="M 9,10
                   L 91,10
                   A 4 4 0 0 1 95,14
                   L 95,26
                   A 4 4 0 0 1 91,30
                   L 9,30
                   A 4 4 0 0 0 5,34
                   L 5,46
                   A 4 4 0 0 0 9,50
                   L 50,50"
                fill="none"
                stroke="#ffffff"
                strokeWidth="3.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {/* 即将飞行轨迹（绿色）：从路径中点 (50,50) 到终点 */}
              <path
                className="inspection-zone__path inspection-zone__path--pending"
                d="M 50,50
                   L 91,50
                   A 4 4 0 0 1 95,54
                   L 95,66
                   A 4 4 0 0 1 91,70
                   L 9,70
                   A 4 4 0 0 0 5,74
                   L 5,86
                   A 4 4 0 0 0 9,90
                   L 91,90"
                fill="none"
                stroke="#00E570"
                strokeWidth="3.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>

          {aircraft.map((item, index) => {
            // hover 面板边缘自适应方向（飞机）
            const aircraftPlacement = computePanelPlacement(
              aircraftPositions[index].x,
              aircraftPositions[index].y,
            )
            const aircraftPanelClasses = placementToClasses(aircraftPlacement)
            return (
              <span
                className={`${item.className} aircraft--draggable ${aircraftPanelClasses.join(' ')}${selectedDevices.has(item.deviceIndex) ? ' aircraft--selected' : ''}${hoveredDevice === item.deviceIndex ? ' aircraft--hovered' : ''}`}
                key={item.label}
                style={{
                  left: `${aircraftPositions[index].x}%`,
                  top: `${aircraftPositions[index].y}%`,
                }}
                onMouseEnter={() => setHoveredDevice(item.deviceIndex)}
                onMouseLeave={() => setHoveredDevice(null)}
                onMouseDown={(e) => {
                  aircraftMouseDownPos.current = { x: e.clientX, y: e.clientY }
                  onAircraftDragStart(index, e)
                }}
                onClick={(e) => {
                  // 拖拽结束后的 click 不视为选中（位移超过 4px 忽略）
                  const start = aircraftMouseDownPos.current
                  if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) {
                    toggleDevice(item.deviceIndex)
                    requestOpenDevicePanel()
                  }
                }}
                onDoubleClick={() => handleAircraftDoubleClick(index)}
              >
                <img src={item.src} alt={item.label} draggable={false} />
                <span className="aircraft-label">{item.label}</span>
                {/* 返航指示：返航面板打开时，选中飞机正上方渲染地面圆形标志（内含竖直 H），绿色垂线自图标顶部向上指向标志 */}
                {returnHomeOpen && selectedDevices.has(item.deviceIndex) && (
                  <span className="aircraft-return-indicator" aria-hidden="true">
                    <span className="aircraft-return-indicator__ground">
                      <svg
                        className="aircraft-return-indicator__h"
                        viewBox="0 0 20 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <rect x="2.5" y="2" width="3.5" height="20" fill="#fff" />
                        <rect x="14" y="2" width="3.5" height="20" fill="#fff" />
                        <rect x="6" y="10.25" width="8" height="3.5" fill="#fff" />
                      </svg>
                    </span>
                    <span className="aircraft-return-indicator__line" />
                  </span>
                )}
                {/* 离线设备 Hover 面板（灰色）—— 聚焦时隐藏，避免与聚焦面板同时出现 */}
                {item.className.includes('gray') && focusedAircraft !== index && (
                  <div className="aircraft-hover-panel" data-hover-panel>
                    <div className="aircraft-hover-panel__top">
                      <div className="aircraft-hover-panel__header">
                        <span className="aircraft-hover-panel__name">02设备</span>
                        <span className="aircraft-hover-panel__status">离线</span>
                      </div>
                      <div className="aircraft-hover-panel__divider" />
                    </div>
                    <div className="aircraft-hover-panel__bottom">
                      <div className="aircraft-hover-panel__info">
                        <span className="aircraft-hover-panel__bar" />
                        <span className="aircraft-hover-panel__label">离线时间：</span>
                        <span className="aircraft-hover-panel__time">2026/08/03 23:45</span>
                      </div>
                    </div>
                  </div>
                )}
                {/* 在线设备 Hover 面板（蓝色，统一样式）—— 聚焦时隐藏，避免与聚焦面板同时出现 */}
                {!item.className.includes('gray') && focusedAircraft !== index && (
                  <div className="aircraft-info-panel" data-hover-panel>
                    <div className="aircraft-info-panel__top">
                      <div className="aircraft-info-panel__header">
                        <span className="aircraft-info-panel__name">{item.label}</span>
                        <div className="aircraft-info-panel__indicators">
                          <img
                            className="aircraft-info-panel__battery-icon"
                            src={batteryMidIcon}
                            alt="电量"
                          />
                          <span className="aircraft-info-panel__battery-text">46%</span>
                          <svg
                            className="aircraft-info-panel__signal-icon"
                            width="15"
                            height="14"
                            viewBox="0 0 15 14"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <rect x="0" y="10" width="2.5" height="4" fill="#fff" />
                            <rect x="3.5" y="7" width="2.5" height="7" fill="#fff" />
                            <rect x="7" y="4" width="2.5" height="10" fill="#fff" />
                            <rect x="10.5" y="1" width="2.5" height="13" fill="#fff" />
                          </svg>
                        </div>
                      </div>
                      <div className="aircraft-info-panel__divider" />
                    </div>
                    <div className="aircraft-info-panel__bottom">
                      <div className="aircraft-info-panel__row">
                        <span className="aircraft-info-panel__bar" />
                        <span className="aircraft-info-panel__label">位置</span>
                        <span className="aircraft-info-panel__value">
                          Lat:0000,&nbsp;Lon:0000,&nbsp;H:0000
                        </span>
                      </div>
                      <div className="aircraft-info-panel__row">
                        <span className="aircraft-info-panel__bar" />
                        <span className="aircraft-info-panel__label">速度</span>
                        <span className="aircraft-info-panel__value">
                          X:000,&nbsp;&nbsp;Y:000,&nbsp;&nbsp;Z:000
                        </span>
                      </div>
                      <div className="aircraft-info-panel__row aircraft-info-panel__row--dual">
                        <span className="aircraft-info-panel__bar" />
                        <span className="aircraft-info-panel__label">模式</span>
                        <span className="aircraft-info-panel__value">悬停</span>
                        <span className="aircraft-info-panel__bar aircraft-info-panel__bar--gap" />
                        <span className="aircraft-info-panel__label">状态</span>
                        <span className="aircraft-info-panel__value">待命</span>
                      </div>
                    </div>
                  </div>
                )}
              </span>
            )
          })}

          {/* 聚焦视图面板：双击无人机图标后从图标右侧滑入，
              图标正好卡在面板左边缘的垂直中心 */}
          {focusedAircraft !== null && (
            <AircraftFocusPanel
              name={aircraft[focusedAircraft].label}
              onClose={handleCloseFocusPanel}
              visible
              aircraftPosition={{
                x: aircraftPositions[focusedAircraft].x,
                y: aircraftPositions[focusedAircraft].y,
              }}
            />
          )}

          <MapControls adapter={adapter} />

          {/* 起飞参数面板：点击底部「起飞」按钮后在右上角展开，按钮保持弹出状态；
              确认/取消均收起面板（确认暂记录参数，待接入真实指令链路） */}
          {takeoffOpen && (
            <TakeoffPanel
              aircraft={selectedAircraft}
              onRemove={handleRemoveAircraft}
              onConfirm={(height) => {
                console.info(`[takeoff] 确认起飞，高度 ${height}m`)
                setTakeoffOpen(false)
              }}
              onCancel={() => setTakeoffOpen(false)}
            />
          )}

          {/* 降落面板：点击底部「降落」按钮后在右上角展开（与起飞面板互斥），按钮保持弹出状态；
              打开后地图光标变指点标记，图钉实时跟随鼠标并与选中飞机虚线连线（#00FF95），
              左键点击定格航点（虚线变实线）；确认/取消均收起面板并清除图钉连线 */}
          {landingOpen && (
            <LandingPanel
              aircraft={selectedAircraft}
              onRemove={handleRemoveAircraft}
              onConfirm={() => {
                console.info('[landing] 确认降落')
                setLandingOpen(false)
              }}
              onCancel={() => setLandingOpen(false)}
            />
          )}

          {/* 返航面板：点击底部「返航」按钮后在右上角展开（与其他功能面板互斥），按钮保持弹出状态；
              参数设置/飞机列表 tab + 返航高度步进，确认/取消均收起面板（确认暂记录日志，待接入真实指令链路） */}
          {returnHomeOpen && (
            <ReturnHomePanel
              aircraft={selectedAircraft}
              onRemove={handleRemoveAircraft}
              onConfirm={(height) => {
                console.info(`[return-home] 确认返航，高度 ${height}m`)
                setReturnHomeOpen(false)
              }}
              onCancel={() => setReturnHomeOpen(false)}
            />
          )}

          {/* 指点返航面板（与起飞/降落/返航面板互斥），按钮保持弹出状态；
              参数设置区块头 + 返航高度步进 + 航点信息坐标 + 确认/航线生成/取消三按钮，
              确认启动循环模拟飞行（面板保持展开，直至手动取消）；取消终止动画并收起面板 */}
          {tapReturnOpen && (
            <TapReturnPanel
              waypoint={tapReturnPoint}
              confirmMuted={!tapReturnRouteReady}
              onConfirm={(height) => {
                console.info(`[tap-return] 确认指点返航，高度 ${height}m`)
                // 确认后启动循环模拟飞行：无人机沿已生成航线飞向落点图钉并无限循环；
                // 面板保持展开，「取消」按钮可随时手动终止循环
                if (tapReturnLine) {
                  const flyIdx = aircraft.findIndex((a) => selectedDevices.has(a.deviceIndex))
                  startTapReturnFlight(
                    tapReturnLine,
                    flyIdx !== -1 ? aircraft[flyIdx].src : homeImages.aircraftRed,
                  )
                }
              }}
              onGenerateRoute={() => {
                // 航线生成：由选中飞机图标中心向落点画 1px #00FF95 连线（SVG 视口屏幕坐标）；
                // 连线两端锚定不随地图移动的 DOM 图标，地图缩放/平移不会断开；
                // 确实画出连线后才解除「确认」置灰（未取点/未选中飞机则保持置灰）
                if (!tapReturnPoint) return
                const idx = aircraft.findIndex((a) => selectedDevices.has(a.deviceIndex))
                if (idx === -1) return
                // 飞机图标按百分比挂在 .map-stage 上，换算为视口像素取图标中心（+24）
                const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
                if (!stage) return
                setTapReturnLine({
                  x1: stage.left + (aircraftPositions[idx].x / 100) * stage.width + 24,
                  y1: stage.top + (aircraftPositions[idx].y / 100) * stage.height + 24,
                  x2: tapReturnPoint.x,
                  y2: tapReturnPoint.y,
                })
                setTapReturnRouteReady(true)
              }}
              onCancel={() => {
                // 手动取消：终止循环飞行动画并清除落点/连线，收起面板
                stopTapReturnFlight()
                setTapReturnPoint(null)
                setTapReturnOpen(false)
              }}
            />
          )}

          {/* 区域降落面板（与其他功能面板互斥）：参数设置 tab（降落速度步进 m/s + 降落编队选择）/ 飞机列表 tab，确认（置灰）/ 航线生成/ 取消三按钮，确认/ 取消均收起面板（确认暂记录日志，待接入指令链路） */}
          {areaLandingOpen && (
            <AreaLandingPanel
              aircraft={selectedAircraft}
              onRemove={handleRemoveAircraft}
              tab={areaLandingTab}
              onTabChange={setAreaLandingTab}
              speed={areaLandingSpeed}
              onSpeedChange={setAreaLandingSpeed}
              formation={areaLandingFormation}
              onFormationChange={setAreaLandingFormation}
              corners={areaLandingCorners}
              onConfirm={(speed, formation) => {
                console.info(
                  '[area-landing] 确认区域降落，速度 ' +
                    speed +
                    'm/s，编队 ' +
                    formation +
                    (areaLandingRect
                      ? '，选区 ' +
                        areaLandingRect.width +
                        'x' +
                        areaLandingRect.height +
                        '@(' +
                        areaLandingRect.left +
                        ',' +
                        areaLandingRect.top +
                        ')'
                      : '，未框选区域'),
                )
                setAreaLandingOpen(false)
              }}
              onGenerateRoute={() => {
                // 航线生成：收起面板并进入首页框选模式（自定义光标 + 遮罩 + 虚线框）；
                // 重绘前清除旧的已确认区域
                setAreaLandingRect(null)
                setAreaLandingCorners(null)
                setAreaLandingOpen(false)
                setAreaSelectSource('area-landing')
                setAreaSelectMode(true)
              }}
              onCancel={() => {
                setAreaLandingRect(null)
                setAreaLandingCorners(null)
                setAreaLandingOpen(false)
              }}
            />
          )}

          {/* 悬停面板（与其他功能面板互斥）：标题 + 飞机列表 + 确认/取消，
              打开后地图光标变指点标记，图钉实时跟随鼠标并与选中飞机虚线连线（#00FF95），
              左键点击定格航点（虚线变实线）；确认/取消均收起面板并清除图钉连线 */}
          {hoverOpen && (
            <HoverPanel
              aircraft={selectedAircraft}
              onRemove={handleRemoveAircraft}
              onConfirm={() => {
                console.info('[hover] 确认悬停')
                setHoverOpen(false)
              }}
              onCancel={() => setHoverOpen(false)}
            />
          )}

          {/* 航点飞行面板（与其他功能面板互斥）：参数设置区块头 + 飞行高度步进 + 航点信息坐标 + 确认（置灰）/航线生成/取消三按钮，
              点击「航线生成」后地图光标变航点图钉，图钉实时跟随鼠标并与选中飞机虚线连线（1px #00FF95），
              左键点击定格航点（保持虚线）后恢复光标，点击「航线生成」后虚线定格为实线；确认/取消均收起面板并清除图钉连线 */}
          {waypointFlightOpen && (
            <WaypointFlightPanel
              waypoint={waypointPoint ?? waypointHover}
              confirmMuted={!waypointPoint}
              onConfirm={(height) => {
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                setWaypointSlide({ open: true, height })
              }}
              onGenerateRoute={() => {
                // 航线生成：已定格航点（虚线）→ 虚线定格为实线；已生成实线 → 清除旧航点重新取点；
                // 左键定格航点后退出取点，面板保留可继续确认/取消
                if (waypointRouteGenerated) {
                  setWaypointPoint(null)
                  setWaypointHover(null)
                  setWaypointRouteGenerated(false)
                  setWaypointPickingActive(true)
                } else if (waypointPoint) {
                  setWaypointRouteGenerated(true)
                } else {
                  setWaypointPoint(null)
                  setWaypointHover(null)
                  setWaypointPickingActive(true)
                }
              }}
              onCancel={() => setWaypointFlightOpen(false)}
            />
          )}

          {/* 航点飞行滑动二次确认弹窗（可复用 SlideConfirmDialog）：滑到最右松手执行确认并收起面板，
              点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={waypointSlide.open}
            title="航点飞行"
            message="执行航点飞行指令"
            onConfirm={() => {
              console.info(`[waypoint-flight] 确认航点飞行，高度 ${waypointSlide.height}m`)
              setWaypointSlide((s) => ({ ...s, open: false }))
              setWaypointFlightOpen(false)
            }}
            onCancel={() => setWaypointSlide((s) => ({ ...s, open: false }))}
          />

          {/* 航线飞行滑动二次确认弹窗（复用 SlideConfirmDialog）：滑到最右松手执行确认并收起面板，
              点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={routeSlide.open}
            title="航线飞行"
            message="执行航线飞行指令"
            onConfirm={() => {
              console.info(
                `[route-flight] 确认航线飞行，高度 ${routeSlide.height}m，航点 ${routeFlightPoints.length} 个`,
              )
              setRouteSlide((s) => ({ ...s, open: false }))
              setRouteFlightOpen(false)
            }}
            onCancel={() => setRouteSlide((s) => ({ ...s, open: false }))}
          />

          {/* 航线飞行面板（与其他功能面板互斥）：参数设置区块头 + 飞行高度步进 + 确认（置灰）/航线生成（置灰）/取消三按钮，无航点信息行，
              点击「航线生成」后地图光标变带编号的航线图钉，左键逐点追加航点并连线
              （1px #00FF95，标记全程保持虚线），点击「航线生成」后定格为实线、右键/Esc 结束后确认解除置灰（确认走滑动二次确认弹窗）；
              确认/取消均收起面板并清除航线 */}
          {routeFlightOpen && (
            <RouteFlightPanel
              confirmReady={routeFlightFinished}
              waypoints={routeFlightPoints}
              onConfirm={(height) => {
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                setRouteSlide({ open: true, height })
              }}
              onGenerateRoute={() => {
                // 航线生成：已标记航点（右键/Esc 结束，虚线）→ 虚线定格为实线；已生成实线 → 清除旧航线重新取点；
                // 左键逐点追加航点，右键/Esc 结束取点，面板保留可继续操作
                if (routeFlightGenerated) {
                  setRouteFlightPoints([])
                  setRouteFlightHover(null)
                  setRouteFlightFinished(false)
                  setRouteFlightGenerated(false)
                  setRouteFlightPicking(true)
                } else if (routeFlightPoints.length > 0) {
                  setRouteFlightPicking(false)
                  setRouteFlightFinished(true)
                  setRouteFlightGenerated(true)
                } else {
                  setRouteFlightPoints([])
                  setRouteFlightHover(null)
                  setRouteFlightFinished(false)
                  setRouteFlightPicking(true)
                }
              }}
              onCancel={() => setRouteFlightOpen(false)}
            />
          )}

          {/* 环绕飞行面板（与其他功能面板互斥）：参数设置区块头 + 盘旋高度步进 + 盘旋半径步进 + 航点信息坐标 + 确认（置灰）/航线生成/取消三按钮，
              打开后地图光标变指点标记，图钉实时跟随鼠标，左键点击定格环绕中心（盘旋圆+最近点连线保持虚线）；
              点击「航线生成」后虚线定格为实线并解除确认置灰，确认走滑动二次确认弹窗；确认/取消均收起面板并清除图钉连线 */}
          {orbitFlightOpen && (
            <OrbitFlightPanel
              waypoint={orbitPoint ? { lat: orbitPoint.lat, lng: orbitPoint.lng } : null}
              confirmMuted={!orbitRouteGenerated}
              onConfirm={(height, radius) => {
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                setOrbitSlide({ open: true, height, radius })
              }}
              onRadiusChange={setOrbitRadius}
              onGenerateRoute={() => {
                // 航线生成：已定格环绕中心（虚线）→ 虚线定格为实线并解除「确认」置灰；
                // 已生成实线 → 清除环绕中心重新取点；未取点 → 保持置灰等待地图取点
                if (orbitRouteGenerated) {
                  setOrbitPoint(null)
                  setOrbitRouteGenerated(false)
                } else if (orbitPoint) {
                  setOrbitRouteGenerated(true)
                }
              }}
              onCancel={() => {
                setOrbitPoint(null)
                setOrbitRouteGenerated(false)
                setOrbitFlightOpen(false)
              }}
            />
          )}

          {/* 环绕飞行滑动二次确认弹窗（复用 SlideConfirmDialog）：滑到最右松手执行确认并收起面板，
              点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={orbitSlide.open}
            title="环绕飞行"
            message="执行环绕飞行指令"
            onConfirm={() => {
              console.info(
                `[orbit-flight] 确认环绕飞行，高度 ${orbitSlide.height}m，半径 ${orbitSlide.radius}m`,
              )
              setOrbitSlide((s) => ({ ...s, open: false }))
              setOrbitPoint(null)
              setOrbitRouteGenerated(false)
              setOrbitFlightOpen(false)
            }}
            onCancel={() => setOrbitSlide((s) => ({ ...s, open: false }))}
          />

          {/* 集结点面板（与其他功能面板互斥）：参数设置 tab（起飞高度/集结速度步进 + 集结队形下拉）/ 飞机列表 tab，
              确认（置灰）/航线生成/取消三按钮，确认/取消均收起面板（确认暂记录日志，待接入指令链路） */}
          {rallyPointOpen && (
            <RallyPointPanel
              aircraft={selectedAircraft}
              onRemove={handleRemoveAircraft}
              onConfirm={(height, speed, formation) => {
                console.info(
                  `[rally-point] 确认集结，高度 ${height}m，速度 ${speed}m/s，队形 ${formation}` +
                    (rallyPointRect
                      ? `，区域 @(${rallyPointRect.left},${rallyPointRect.top}) ${rallyPointRect.width}x${rallyPointRect.height}`
                      : '，未框选区域'),
                )
                setRallyPointOpen(false)
              }}
              onGenerateRoute={() => {
                // 航线生成：收起面板并进入首页框选模式（与区域降落同款截图框选，
                // 确认区域无中心地面标记徽章）；重绘前清除旧的已确认区域
                setRallyPointRect(null)
                setRallyPointOpen(false)
                setAreaSelectSource('rally-point')
                setAreaSelectMode(true)
              }}
              onCancel={() => {
                setRallyPointRect(null)
                setRallyPointOpen(false)
              }}
            />
          )}

          {/* 编队飞行面板（与其他功能面板互斥）：参数设置区块头 + 飞行高度步进 + 编队队形下拉 + 航点信息坐标，
              确认（置灰）/航线生成/取消三按钮，确认/取消均收起面板（确认暂记录日志，待接入指令链路） */}
          {formationFlightOpen && (
            <FormationFlightPanel
              waypoint={formationFlightPoint}
              onConfirm={(height, formation) => {
                console.info(`[formation-flight] 确认编队飞行，高度 ${height}m，队形 ${formation}`)
                setFormationFlightOpen(false)
              }}
              onGenerateRoute={() => console.info('[formation-flight] 航线生成（待接入）')}
              onCancel={() => setFormationFlightOpen(false)}
            />
          )}

          {/* 已确认的区域降落范围：半透明紫色填充（rgba(113,96,242,0.3)）、直角，
              正中心圆形徽章（100×100、rgba(113,96,242,0.1) 填充、8px 白 0.2 描边）内含设计稿降落坪图标（iconAreaLandingCenter 44×52）；
              再次进入框选（重绘）、面板取消或点击左上角「删除重绘」按钮时清除 */}
          {/* 指点返航连线：飞机图标中心 → 落点图钉（SVG 视口屏幕空间，2px #00FF95）；
              两端锚定不随地图移动的 DOM 图标，地图缩放/平移时保持连接不断开；
              重新取点/取消面板时清除，「航线生成」后重画 */}
          {tapReturnLine && (
            <svg className="tap-return-route" aria-hidden="true">
              <line
                x1={tapReturnLine.x1}
                y1={tapReturnLine.y1}
                x2={tapReturnLine.x2}
                y2={tapReturnLine.y2}
                stroke="#00FF95"
                strokeWidth={1}
              />
            </svg>
          )}
          {/* 模拟飞行无人机：确认后沿连线循环飞向落点（fixed 视口定位 + 航向旋转，
              无限循环播放，手动点击「取消」后消失） */}
          {tapReturnFlight && (
            <img
              className="tap-return-drone"
              src={tapReturnFlight.icon}
              alt=""
              draggable={false}
              style={{
                left: tapReturnFlight.x,
                top: tapReturnFlight.y,
                transform: `translate(-50%, -50%) rotate(${tapReturnFlight.angle}deg)`,
              }}
            />
          )}
          {/* 指点返航落点图钉标记（32×56 切图）：钉尖对准点击点
              （translate(-50%, -100%)），确认后保留、取消面板时清除 */}
          {tapReturnPoint && (
            <>
              <img
                className="tap-return-marker"
                src={homeImages.tapReturnMarker}
                style={{ left: tapReturnPoint.x, top: tapReturnPoint.y }}
                alt="指点返航点"
                draggable={false}
              />
              {/* 落点正下方返航区域圆圈（设计稿 image-wrapper_4）：
                  48×48 白 2px 描边半透明圆 + 内含 20×24 停机坪图标 */}
              <div
                className="tap-return-zone"
                style={{ left: tapReturnPoint.x, top: tapReturnPoint.y }}
                aria-hidden="true"
              >
                <img src={homeImages.tapReturnZoneIcon} alt="" draggable={false} />
              </div>
            </>
          )}

          {/* 指点返航取点图钉（跟随鼠标）：面板打开期间替代原生取点光标——原 54×54 切图
              超出浏览器 32×32 光标上限会回退成十字准线，改为隐藏光标 + 图钉钉尖对准鼠标；
              点击定格后由上方固定落点图钉接管，鼠标移出地图（UI 上）时隐藏跟随图钉 */}
          {tapReturnOpen && tapReturnHover && (
            <img
              className="tap-return-marker"
              src={homeImages.tapReturnMarker}
              style={{ left: tapReturnHover.x, top: tapReturnHover.y }}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          )}

          {/* 环绕飞行取点图钉（跟随鼠标）：面板打开期间替代原生取点光标——
              与指点返航同方案（tap-return-marker 切图 32×56 超 32×32 光标上限），
              钉尖对准鼠标；鼠标移出地图（UI 上）时隐藏跟随图钉 */}
          {orbitFlightOpen && orbitFlightHover && (
            <img
              className="tap-return-marker"
              src={homeImages.tapReturnMarker}
              style={{ left: orbitFlightHover.x, top: orbitFlightHover.y }}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          )}

          {/* 编队飞行取点图钉（跟随鼠标）：与指点返航/环绕飞行同方案——
              tap-return-marker 切图 32×56 超出浏览器 32×32 光标上限，
              钉尖对准鼠标；鼠标移出地图（UI 上）时隐藏跟随图钉 */}
          {formationFlightOpen && formationFlightHover && (
            <img
              className="tap-return-marker"
              src={homeImages.tapReturnMarker}
              style={{ left: formationFlightHover.x, top: formationFlightHover.y }}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          )}

          {/* 编队飞行定格图钉：左键点击地图定格航点后原地保留（钉尖对准点击点），
              回填面板「航点信息」坐标；再次点击覆盖，取消/关闭面板时清除 */}
          {formationFlightOpen && formationFlightPoint && (
            <img
              className="tap-return-marker"
              src={homeImages.tapReturnMarker}
              style={{ left: formationFlightPoint.x, top: formationFlightPoint.y }}
              alt="编队飞行航点"
              draggable={false}
            />
          )}

          {/* 环绕飞行定格图钉 + 盘旋圆 + 最近点连线：左键点击地图定格环绕中心后，
              以盘旋半径（米）按当前缩放（getMetersPerPixel）换算像素半径绘制绿色虚线圆，
              并从选中飞机图标中心沿连线方向取圆周最近点画绿色虚线直线；
              半径步进/缩放/重新取点时联动刷新；确认/取消面板时清除 */}
          {orbitFlightOpen &&
            orbitPoint &&
            (() => {
              if (!adapter) return null
              const idx = aircraft.findIndex((a) => selectedDevices.has(a.deviceIndex))
              const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
              if (idx === -1 || !stage) return null
              const mpp = adapter.getMetersPerPixel()
              const rPx = Math.max(2, orbitRadius / mpp)
              // 飞机图标按百分比挂在 .map-stage 上，换算视口像素取图标中心（+24）
              const planeX = stage.left + (aircraftPositions[idx].x / 100) * stage.width + 24
              const planeY = stage.top + (aircraftPositions[idx].y / 100) * stage.height + 24
              // 圆周最近点：圆心沿「飞机→圆心」方向回退半径像素（无人机恰在圆心时取正右方）
              const dx = orbitPoint.x - planeX
              const dy = orbitPoint.y - planeY
              const dist = Math.hypot(dx, dy)
              const ux = dist > 1e-6 ? dx / dist : 1
              const uy = dist > 1e-6 ? dy / dist : 0
              return (
                <>
                  <svg className="orbit-flight-graphics" aria-hidden="true">
                    <circle
                      cx={orbitPoint.x}
                      cy={orbitPoint.y}
                      r={rPx}
                      fill="none"
                      stroke="#00FF95"
                      strokeWidth={1}
                      strokeDasharray={orbitRouteGenerated ? undefined : '16 10'}
                    />
                    <line
                      x1={planeX}
                      y1={planeY}
                      x2={orbitPoint.x - ux * rPx}
                      y2={orbitPoint.y - uy * rPx}
                      stroke="#00FF95"
                      strokeWidth={1}
                      strokeDasharray={orbitRouteGenerated ? undefined : '16 10'}
                    />
                  </svg>
                  <img
                    className="tap-return-marker"
                    src={homeImages.tapReturnMarker}
                    style={{ left: orbitPoint.x, top: orbitPoint.y }}
                    alt="环绕中心"
                    draggable={false}
                  />
                </>
              )
            })()}

          {/* 航点飞行取点：图钉实时跟随鼠标（仅航点图钉，无 H 停机坪圈），
              选中飞机中心 → 鼠标 1px #00FF95 虚线实时连线；
              左键点击后定格航点（保持虚线），点击「航线生成」后虚线定格为实线；取消/切换面板时随状态清除 */}
          {waypointFlightOpen &&
            (() => {
              const pt = waypointPoint ?? waypointHover
              if (!pt) return null
              const idx = aircraft.findIndex((a) => selectedDevices.has(a.deviceIndex))
              const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
              if (idx === -1 || !stage) return null
              return (
                <>
                  <svg className="waypoint-flight-route" aria-hidden="true">
                    <line
                      x1={stage.left + (aircraftPositions[idx].x / 100) * stage.width + 24}
                      y1={stage.top + (aircraftPositions[idx].y / 100) * stage.height + 24}
                      x2={pt.x}
                      y2={pt.y}
                      stroke="#00FF95"
                      strokeWidth={1}
                      strokeDasharray={waypointRouteGenerated ? undefined : '16 10'}
                    />
                  </svg>
                  {/* 图钉 DOM 跟随鼠标/定格点：取点阶段原生光标由 .waypoint-picking 隐藏
                      （32×56 图钉超出系统光标 32×32 上限，CSS cursor 无法呈现），左键定格后原地停留 */}
                  <img
                    className="waypoint-flight-marker"
                    src={homeImages.tapReturnMarker}
                    style={{ left: pt.x, top: pt.y }}
                    alt="航点"
                    draggable={false}
                  />
                </>
              )
            })()}

          {/* 航线飞行航线：航点1 → 航点2 → …（1px #00FF95，不与飞机连线），
              取点中全部连线保持虚线，点击「航线生成」后定格为实线；
              各航点渲染带编号的航线图钉（32×56，钉尖对准取点位置），
              取消/切换面板时随状态清除 */}
          {routeFlightOpen &&
            (() => {
              if (routeFlightPoints.length === 0 && !routeFlightHover) return null
              // 不与飞机连线：last 仅取最新航点（无航点时为 null，鼠标跟随虚线不渲染）
              const last =
                routeFlightPoints.length > 0
                  ? routeFlightPoints[routeFlightPoints.length - 1]
                  : null
              return (
                <>
                  <svg className="route-flight-route" aria-hidden="true">
                    <polyline
                      points={routeFlightPoints
                        .map((p) => `${p.x},${p.y}`)
                        .join(' ')}
                      fill="none"
                      stroke="#00FF95"
                      strokeWidth={1}
                      strokeDasharray={routeFlightGenerated ? undefined : '16 10'}
                    />
                    {routeFlightPicking && routeFlightHover && last && (
                      <line
                        x1={last.x}
                        y1={last.y}
                        x2={routeFlightHover.x}
                        y2={routeFlightHover.y}
                        stroke="#00FF95"
                        strokeWidth={1}
                        strokeDasharray="16 10"
                      />
                    )}
                  </svg>
                  {routeFlightPoints.map((p, i) => (
                    <RoutePinMarker
                      key={`${p.x}-${p.y}-${i}`}
                      num={i + 1}
                      x={p.x}
                      y={p.y}
                      interactive={!routeFlightPicking}
                      menuOpen={!routeFlightPicking && routePinMenu === i}
                      onHoverEnter={() => setRoutePinMenu(i)}
                      onHoverLeave={() => {
                        // 双击固定的菜单不移出即收起；其余图钉离开即隐藏
                        if (routePinPinned !== i) setRoutePinMenu((m) => (m === i ? null : m))
                      }}
                      onToggleMenu={() => {
                        setRoutePinPinned((prev) => (prev === i ? null : i))
                        setRoutePinMenu(i)
                      }}
                      onDelete={() => handleDeleteRoutePoint(i)}
                    />
                  ))}
                  {/* 取点中：设计稿橙色航线图钉切图（32×56）跟随鼠标——
                      原生光标由 .route-flight-picking 隐藏（超系统光标尺寸上限），钉尖对准鼠标 */}
                  {routeFlightPicking && routeFlightHover && (
                    <img
                      className="route-flight-cursor-pin"
                      src={homeImages.routeFlightPin}
                      style={{ left: routeFlightHover.x, top: routeFlightHover.y }}
                      alt=""
                      draggable={false}
                    />
                  )}
                </>
              )
            })()}

          {areaLandingRect && (
            <div
              className="area-landing-confirmed"
              style={{
                left: areaLandingRect.left,
                top: areaLandingRect.top,
                width: areaLandingRect.width,
                height: areaLandingRect.height,
              }}
            >
              <div className="area-landing-confirmed__badge">
                <img
                  className="area-landing-confirmed__icon"
                  src={homeImages.iconAreaLandingCenter}
                  alt="区域降落中心点"
                  draggable={false}
                />
              </div>
              <div
                className="area-landing-confirmed__delete-btn"
                onClick={() => {
                  setAreaLandingRect(null)
                  setAreaLandingCorners(null)
                }}
              >
                删除重绘
              </div>
            </div>
          )}

          {/* 集结点已确认区域：与区域降落同款截图式矩形（半透明紫色填充 + 删除重绘），
              但不渲染中心圆形徽章与降落坪地面标记图标；重绘/面板取消/点击删除时清除 */}
          {rallyPointRect && (
            <div
              className="area-landing-confirmed"
              style={{
                left: rallyPointRect.left,
                top: rallyPointRect.top,
                width: rallyPointRect.width,
                height: rallyPointRect.height,
              }}
            >
              <div
                className="area-landing-confirmed__delete-btn"
                onClick={() => {
                  setRallyPointRect(null)
                }}
              >
                删除重绘
              </div>
            </div>
          )}

          {/* 区域降落框选模式（航线生成）：截图式拖拽选区——按下左键确定起点，
              按住拖动实时拉伸出自定义大小的矩形（框内清晰、框外遮罩变暗），
              松开定格，Esc/右键退出 */}
          {areaSelectMode &&
            createPortal(
              <div
                className="area-select-overlay"
                style={{
                  cursor:
                    areaSelectAnchor && !areaSelectDragging
                      ? 'default'
                      : `url("${homeImages.areaLandingCursor}") 27 27, crosshair`,
                }}
                onMouseDown={(e) => {
                  if (e.button !== 0) return
                  // 已有定格选区：锁定状态，左键点击不再开启新框选，
                  // 仅「确认/取消」按钮或右键/Esc 可继续
                  if (areaSelectAnchor && !areaSelectDragging) return
                  setAreaSelectAnchor({ x: e.clientX, y: e.clientY })
                  setAreaSelectEnd({ x: e.clientX, y: e.clientY })
                  setAreaSelectDragging(true)
                }}
                onMouseMove={(e) => {
                  if (areaSelectDragging) setAreaSelectEnd({ x: e.clientX, y: e.clientY })
                }}
                onMouseUp={() => setAreaSelectDragging(false)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setAreaSelectMode(false)
                  setAreaSelectAnchor(null)
                  setAreaSelectEnd(null)
                  // 取消绘制并重新展示对应面板（信息已提升保留）
                  if (areaSelectSource === 'rally-point') setRallyPointOpen(true)
                  else setAreaLandingOpen(true)
                }}
              >
                {areaSelectAnchor &&
                  areaSelectEnd &&
                  (() => {
                    // 起终点归一化为左上角 + 尺寸（支持任意方向拖拽）
                    const left = Math.min(areaSelectAnchor.x, areaSelectEnd.x)
                    const top = Math.min(areaSelectAnchor.y, areaSelectEnd.y)
                    const width = Math.abs(areaSelectAnchor.x - areaSelectEnd.x)
                    const height = Math.abs(areaSelectAnchor.y - areaSelectEnd.y)
                    return (
                      <>
                        <div
                          className="area-select-frame"
                          style={{ left, top, width, height }}
                        />
                        {/* 松开定格后显示「确认 | 取消」按钮条：右对齐选区右缘、
                            位于选区下方 8px；onMouseDown 阻止冒泡，
                            避免点击按钮触发 overlay 的重新框选 */}
                        {!areaSelectDragging && (
                          <div
                            className="area-select-confirm-bar"
                            style={{ left: left + width - 121, top: top + height + 8 }}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <span
                              className="area-select-confirm-bar__label"
                              onClick={() => {
                                // 存储定格选区（视口坐标）到当前来源的已确认区域，
                                // 供后续航线生成业务使用
                                if (areaSelectSource === 'rally-point') {
                                  setRallyPointRect({ left, top, width, height })
                                } else {
                                  setAreaLandingRect({ left, top, width, height })
                                  // 计算选区四角经纬度（视口坐标 → 地图容器坐标 → WGS84），
                                  // 供区域降落面板「区域信息」实时显示
                                  if (adapter) {
                                    const bounds = adapter
                                      .getContainer()
                                      .getBoundingClientRect()
                                    const corner = (x: number, y: number) => {
                                      const ll = adapter.unproject({
                                        x: x - bounds.left,
                                        y: y - bounds.top,
                                      })
                                      return { lat: ll.lat, lng: ll.lng }
                                    }
                                    setAreaLandingCorners([
                                      corner(left, top),
                                      corner(left + width, top),
                                      corner(left + width, top + height),
                                      corner(left, top + height),
                                    ])
                                  } else {
                                    setAreaLandingCorners(null)
                                  }
                                }
                                // TODO: 接入航线生成业务
                                setAreaSelectMode(false)
                                setAreaSelectAnchor(null)
                                setAreaSelectEnd(null)
                                // 重新展示对应面板（信息已提升保留）
                                if (areaSelectSource === 'rally-point') setRallyPointOpen(true)
                                else setAreaLandingOpen(true)
                              }}
                            >
                              确认
                            </span>
                            <div className="area-select-confirm-bar__divider" />
                            <span
                              className="area-select-confirm-bar__label area-select-confirm-bar__label--cancel"
                              onClick={() => {
                                if (areaSelectSource === 'rally-point') {
                                  // 集结点取消：废弃定格选区并回到空白绘制状态
                                  // （取点光标恢复，可立即重新框选；Esc/右键退出并回到集结点面板）
                                  setRallyPointRect(null)
                                  setAreaSelectAnchor(null)
                                  setAreaSelectEnd(null)
                                  setAreaSelectDragging(false)
                                  return
                                }
                                setAreaLandingRect(null)
                                setAreaLandingCorners(null)
                                setAreaSelectMode(false)
                                setAreaSelectAnchor(null)
                                setAreaSelectEnd(null)
                                // 重新展示区域降落面板（信息已提升保留）
                                setAreaLandingOpen(true)
                              }}
                            >
                              取消
                            </span>
                          </div>
                        )}
                      </>
                    )
                  })()}
              </div>,
              document.body,
            )}

          {/* 底部水平居中按钮条：13 段背景图拼接，第 2~12 段叠加功能图标，具体功能待接入。
              三层结构：.bottom-bar__item（负 margin + tooltip，pointer-events:none）>
              .bottom-bar__btn（72px 命中层：clip-path 并集轮廓，静止不动）>
              .bottom-bar__visual（60px 视觉层：底部对齐，hover 弹性向上顶出）。
              命中层不动 + 视觉层上移，鼠标不会因按钮顶出而脱离 hover（避免抖动循环） */}
          <nav className="bottom-bar" aria-label="底部功能按钮条">
            {BOTTOM_BAR_ITEMS.map((item, index) => {
              // 禁用态（按选中设备数量）：单机功能需恰好选中 1 台，多机功能需至少选中 1 台；
              // 不满足时按钮进入禁用态（禁用态切图替换默认背景，激活态视觉与 tooltip
              // 一并抑制）。不用原生 disabled 属性——它会抑制浏览器 :hover 匹配，
              // 导致置灰按钮 hover 不顶出；改用 aria-disabled 语义标记 + 点击拦截，
              // 悬停反馈（置灰态顶出）仍可用
              const disabled =
                !!item.disabledBackground &&
                (item.mode === 'single' ? selectedDevices.size !== 1 : selectedDevices.size < 1)
              return (
                <span
                  className={`bottom-bar__item${
                    item.panel && panelOpenState[item.panel] && item.activeBackground && !disabled
                      ? ' bottom-bar__item--active-bg'
                      : ''
                  }`}
                  key={item.background}
                >
                  <button
                    type="button"
                    aria-disabled={disabled || undefined}
                    className={`bottom-bar__btn${item.icon ? '' : ' bottom-bar__btn--static'}${disabled ? ' bottom-bar__btn--disabled' : ''}${item.panel && panelOpenState[item.panel] && !disabled ? ' bottom-bar__btn--active' : ''}`}
                    aria-label={item.tooltip ?? `功能按钮${index + 1}`}
                    style={{ aspectRatio: `${item.width} / 72` }}
                    onClick={disabled || !item.panel ? undefined : panelHandlers[item.panel]}
                  >
                    <span
                      className="bottom-bar__visual"
                      style={{
                        // 切图文件名（bottom-bar-seg-01.png 等）含连字符，url() 统一加引号
                        // 以避免 unquoted URL 的解析歧义；激活态高亮背景由下方独立层
                        // .bottom-bar__active-glow 承载（button 的 clip-path 会裁剪发光边缘，
                        // 且元素背景无法绘制到自身盒外，视觉层内无法完整呈现激活态切图）
                        // 禁用态直接替换默认背景（两套切图规格一致，几何像素级兼容）
                        backgroundImage: `url("${disabled ? (item.disabledBackground ?? item.background) : item.background}")`,
                      }}
                    >
                      {item.icon && (
                        <img
                          className="bottom-bar__icon"
                          src={item.icon}
                          alt=""
                          draggable={false}
                        />
                      )}
                    </span>
                  </button>
                  {/* 激活态背景独立层（第 2~12 段功能按钮均提供 activeBackground）：
                    切图画布统一 76px 高，实体区 60px 高、宽与默认段一致，四周为发光/投影边缘。
                    置于 button 之外避免被其 clip-path 裁剪；内含图标副本与视觉层图标重合，
                    激活时淡入覆盖默认段，关闭时淡出，与默认背景形成交叉过渡 */}
                  {item.activeBackground && !disabled && (
                    <span
                      className="bottom-bar__active-glow"
                      style={{
                        backgroundImage: `url("${item.activeBackground}")`,
                        // 画布宽 = 段宽 + 16（左右各 8px 发光边缘）：left/width 按段宽换算百分比
                        // （left = -8/段宽、width = (段宽+16)/段宽），实体区与默认段像素级重合
                        left: `${Math.round((-8 / item.width) * 100 * 100) / 100}%`,
                        width: `${Math.round(((item.width + 16) / item.width) * 100 * 100) / 100}%`,
                      }}
                      aria-hidden="true"
                    >
                      {item.icon && (
                        <img
                          className="bottom-bar__icon bottom-bar__icon--active-glow"
                          src={item.icon}
                          alt=""
                          draggable={false}
                        />
                      )}
                    </span>
                  )}
                  {item.tooltip && !disabled && (
                    <span className="bottom-bar__tip">{item.tooltip}</span>
                  )}
                </span>
              )
            })}
          </nav>

          <footer className="map-footer">
            <div className="emergency-actions">
              <button type="button">一键RTL</button>
              <button type="button">一键迫降</button>
              <button className="danger" type="button">
                急停
              </button>
            </div>
            <MapScale adapter={adapter} />
          </footer>
        </section>
      </div>
    </main>
  )
}
