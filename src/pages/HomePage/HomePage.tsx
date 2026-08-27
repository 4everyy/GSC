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
import { MapControls } from '../../components/MapControls/MapControls'
import { AlarmInfoPanel } from '../../components/AlarmInfoPanel/AlarmInfoPanel'
// 告警详情面板暂隐藏（点击顶栏徽标也不展示），功能就绪后恢复：
// import { AlarmDetailPanel } from '../../components/AlarmDetailPanel/AlarmDetailPanel'
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
import {
  RallyPointPanel,
  type RallyPointFormation,
} from '../../components/RallyPointPanel/RallyPointPanel'
import {
  FormationFlightPanel,
  type FormationFlightFormation,
} from '../../components/FormationFlightPanel/FormationFlightPanel'
import { useMapEngine } from '../../hooks/useMapEngine'
import { aircraft } from '../../config/aircraft'
import batteryMidIcon from '../../assets/images/device/battery-mid.png'
import { homeImages } from '../../assets/images/home'
import { useDraggable, type DragPosition } from '../../hooks/useDraggable'
import { AircraftFocusPanel } from '../../components/AircraftFocusPanel/AircraftFocusPanel'
import { computePanelPlacement, placementToClasses } from '../../utils/panelPlacement'
import { useLayerStore } from '../../stores/layerStore'
import { usePanelClamp } from '../../hooks/usePanelClamp'
import './HomePage.css'
import './HoverPanelPlacement.css'
import { useOfflineMap } from '../../features/offline-map/useOfflineMap'
// 离线地图管理面板暂隐藏（默认自动加载最新苏州包），需要手动管理时恢复：
// // 离线地图管理面板暂隐藏（默认自动加载最新苏州包），需要手动管理时恢复：
// import { OfflineMapPanel } from '../../features/offline-map/components/OfflineMapPanel'
import { useOfflineMapStore } from '../../features/offline-map/offlineMapStore'
import { useDeviceLinkStore } from '../../stores/deviceLinkStore'
import { deviceList } from '../../config/devices'
import type { AircraftListItem } from '../../components/AircraftListPanel/AircraftListSection'
import type { AlarmColor } from '../../types'

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
// MissionPanel / 橙色禁飞区——功能就绪后置 true 或删除相关代码
const SHOW_PENDING_PANELS = false

// 告警信息面板色调映射：与顶栏告警徽标（红/橙/蓝，config/alarms.ts ALARM_BADGES 顺序）按下标一一对应
const ALARM_COLORS: AlarmColor[] = ['red', 'orange', 'blue']

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
// 集结点集结坪布局纯函数：按集结队形在已确认集结区域内布置 count 个集结坪（视口坐标），
// 组件内 rallyPointSpots memo 与队形下拉变更即时重排共用同一算法；
// 布置后整体左对齐——集结坪簇贴近区域左缘（朝向左侧原始无人机图标一侧），不横向铺满全区
function layoutRallyPointSpots(
  rect: { left: number; top: number; width: number; height: number } | null,
  formation: RallyPointFormation,
  count: number,
): { x: number; y: number }[] {
  if (!rect) return []
  const { left, top, width, height } = rect
  const n = count
  if (n <= 0) return []
  let spots: { x: number; y: number }[]
  if (formation === '三角型') {
    // 行容量 1、2、3…：第 k 行放 k 个（末行可不满），纵向等距、行内水平等距
    const rows: number[] = []
    let remain = n
    while (remain > 0) {
      const size = rows.length + 1
      rows.push(Math.min(size, remain))
      remain -= size
    }
    const gapY = height / (rows.length + 1)
    spots = []
    rows.forEach((countInRow, k) => {
      const y = top + gapY * (k + 1)
      // 行内间距优先固定 100px（区域过窄时区内自适应），配合整体左对齐使集结坪聚拢左侧
      const gapX = Math.min(width / (countInRow + 1), 100)
      for (let j = 0; j < countInRow; j++) spots.push({ x: left + gapX * (j + 1), y })
    })
  } else if (formation === '一字型') {
    // 水平一行等距分布：间距优先固定 100px（区域过窄时区内自适应），不横向铺满全区
    const gap = Math.min(width / (n + 1), 100)
    spots = Array.from({ length: n }, (_, i) => ({ x: left + gap * (i + 1), y: top + height / 2 }))
  } else {
    // 人字形（默认）：V 形两翼交替排布——首机居区域上中（人字顶点），之后奇数号位
    // 左翼、偶数号位右翼，两翼沿斜线逐个向左下/右下外推
    const cx = left + width / 2
    const apexY = top + height * 0.25
    const spanX = (width / 2) * 0.9
    const spanY = height * 0.7
    const wingCount = Math.floor((n - 1) / 2) + 1
    const gapX = Math.min(spanX / wingCount, 100)
    const gapY = spanY / wingCount
    spots = Array.from({ length: n }, (_, i) => {
      if (i === 0) return { x: cx, y: apexY }
      const wing = Math.ceil(i / 2)
      const side = i % 2 === 1 ? -1 : 1
      return { x: cx + side * wing * gapX, y: apexY + wing * gapY }
    })
  }
  // 整体左对齐：让最左集结坪落在区域左缘（距边 40px，朝向左侧原始无人机图标一侧），
  // 队形形状不变、仅整体平移；单点亦直接落于左缘
  const minSpotX = Math.min(...spots.map((s) => s.x))
  const shiftX = left + 40 - minSpotX
  spots.forEach((s) => {
    s.x += shiftX
  })
  return spots
}

// 编队飞行降落点布局纯函数：以锚点（最左选中飞机图标正上方一定距离处）为队形顶点，
// 按编队队形布置 count 个降落点（视口坐标）——人字形：V 形两翼自顶点交替向左下/右下
// 展开；一字型：水平一行等距；三角型：行容量 1、2、3…（末行可不满）。
// 航线渲染（绿色实线 + 降落点图标）与模拟飞行共用同一算法
function layoutFormationFlightSpots(
  anchor: { x: number; y: number },
  formation: FormationFlightFormation,
  count: number,
): { x: number; y: number }[] {
  const n = count
  if (n <= 0) return []
  if (n === 1) return [{ x: anchor.x, y: anchor.y }]
  const gapX = 100
  const gapY = 70
  if (formation === '三角型') {
    // 行容量 1、2、3…：第 k 行放 k 个（末行可不满），行内水平等距、纵向等距
    const rows: number[] = []
    let remain = n
    while (remain > 0) {
      const size = rows.length + 1
      rows.push(Math.min(size, remain))
      remain -= size
    }
    const spots: { x: number; y: number }[] = []
    rows.forEach((countInRow, k) => {
      const y = anchor.y + k * gapY
      for (let j = 0; j < countInRow; j++) {
        spots.push({ x: anchor.x + (j - (countInRow - 1) / 2) * gapX, y })
      }
    })
    return spots
  }
  if (formation === '一字型') {
    // 水平一行等距分布
    return Array.from(
      { length: n },
      (_, i): { x: number; y: number } => ({
        x: anchor.x + (i - (n - 1) / 2) * gapX,
        y: anchor.y,
      }),
    )
  }
  // 人字形（默认）：首机居顶点，奇数号位左翼、偶数号位右翼沿斜线逐个外推
  return Array.from({ length: n }, (_, i) => {
    if (i === 0) return { x: anchor.x, y: anchor.y }
    const wing = Math.ceil(i / 2)
    const side = i % 2 === 1 ? -1 : 1
    return { x: anchor.x + side * wing * gapX, y: anchor.y + wing * gapY * 0.85 }
  })
}

export function HomePage() {
  const [activeAlarm, setActiveAlarm] = useState<number | null>(null)


  // 告警信息面板色调：当前激活徽标（红/橙/蓝）映射为面板边框色调
  const currentAlarmColor = activeAlarm !== null ? ALARM_COLORS[activeAlarm] : undefined

  // 聚焦视图：双击无人机图标后显示设备详情面板（存储聚焦的飞机索引）
  const [focusedAircraft, setFocusedAircraft] = useState<number | null>(null)

  // 功能面板（起飞/降落/返航/指点返航/区域降落/悬停/航点飞行）：点击底部按钮后按钮保持弹出状态，面板展开于右上角；
  // 各面板互斥——打开一个会关闭其他（底部按钮条同一时刻只有一个功能处于激活态）
  const [takeoffOpen, setTakeoffOpen] = useState(false)
  const [landingOpen, setLandingOpen] = useState(false)
  const [returnHomeOpen, setReturnHomeOpen] = useState(false)
  // 返航航线连线（视口屏幕坐标，SVG 绘制）：点击返航面板「航线生成」后，
  // 每架选中飞机一条航线（图标中心 → 各自 H 返航标记底部，3px #00FF95 绿色实线）；
  // 再次点击整体重画，面板关闭（取消/互斥切换）时自动清除；null = 未生成
  const [returnHomeLines, setReturnHomeLines] = useState<
    { x1: number; y1: number; x2: number; y2: number }[] | null
  >(null)
  // 返航模拟飞行状态：确认返航后，无人机图标沿航线连线循环飞向 H 返航标记
  // （视口屏幕坐标 + 航向角 + 图标），rAF 驱动，面板关闭（取消/互斥切换）时终止
  const [returnHomeFlights, setReturnHomeFlights] = useState<
    { x: number; y: number; angle: number; icon: string }[]
  >([])
  const returnHomeFlightRaf = useRef<number | null>(null)
  const [tapReturnOpen, setTapReturnOpen] = useState(false)
// 指点返航地图取点：面板打开期间点击地图记录落点（视口坐标 + WGS84 经纬度），
// 用于渲染图钉标记并回填面板「航点信息」坐标；确认后保留，取消面板时清除
const [tapReturnPoint, setTapReturnPoint] = useState<{
  x: number
  y: number
  lat: number
  lng: number
} | null>(null)
// 指点返航落点确认状态：落点定格后显示「确定 | 取消」按钮条——确定保留落点并隐藏
// 按钮条；取消清除落点恢复取点（光标变标记继续点选新落点）；重新点选/重开面板时复位
const [tapReturnPointConfirmed, setTapReturnPointConfirmed] = useState(false)
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
  // 区域降落航线已生成：点击「航线生成」后按所选降落编队在已确认区域内布置降落坪
  // 图标（数量=选中飞机数）并与各飞机画绿色实线；重绘区域/取消时复位
  const [areaLandingRouteGenerated, setAreaLandingRouteGenerated] = useState(false)
  // 区域降落模拟飞行状态：确认区域降落后，各选中无人机图标沿各自航线（图标中心 →
  // 对应降落坪）同步循环飞行（视口坐标 + 航向角 + 图标数组），rAF 驱动，
  // 面板关闭/删除重绘时终止
  const [areaLandingFlights, setAreaLandingFlights] = useState<
    { x: number; y: number; angle: number; icon: string }[]
  >([])
  const areaLandingFlightRaf = useRef<number | null>(null)
  // 区域降落/集结点框选模式：由区域降落/集结点面板内「航线生成」进入——首页全屏遮罩 + 拖拽自定义大小紫色虚线框；
  // 光标为停机坪图标图片跟随鼠标；按住左键时框实时跟随光标
  // （光标锚定框右下角），松开定格，Esc/右键退出；areaSelectSource 标记选区归属面板
  const [areaSelectMode, setAreaSelectMode] = useState(false)
  // 框选起点（视口坐标 clientX/clientY），null = 尚未开始框选
  const [areaSelectAnchor, setAreaSelectAnchor] = useState<{ x: number; y: number } | null>(null)
  // 框选当前终点（拖动中的视口坐标），与起点共同确定选区矩形
  const [areaSelectEnd, setAreaSelectEnd] = useState<{ x: number; y: number } | null>(null)
  // 是否处于按住左键拖动状态（拖动期间矩形实时拉伸）
  const [areaSelectDragging, setAreaSelectDragging] = useState(false)
  // 框选跟随光标点：绘制阶段鼠标在遮罩上的实时位置（视口坐标）。
  // area-landing-cursor 切图 54×54 超出浏览器 32×32 光标上限，cursor:url() 会回退成
  // 十字准线，故 cursor:none + DOM 图片跟随鼠标（与指点返航/环绕飞行取点同方案），
  // 图片中心（27,27）对准鼠标；框选模式全程保持（含选区定格后点「确认/取消」）
  const [areaSelectHover, setAreaSelectHover] = useState<{ x: number; y: number } | null>(null)
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
      setAreaSelectHover(null)
    }
  }, [areaSelectMode])
  const [hoverOpen, setHoverOpen] = useState(false)
  const [waypointFlightOpen, setWaypointFlightOpen] = useState(false)
  // 航点飞行二次确认：面板「确认」先暂存飞行高度并弹出滑动确认弹窗，滑到最右才真正执行
  const [waypointSlide, setWaypointSlide] = useState<{ open: boolean; height: number }>({
    open: false,
    height: 10,
  })
  // 航点飞行模拟飞行状态：确认航点飞行后，无人机图标沿已生成实线航线循环飞向航点
  // 图钉（视口屏幕坐标 + 航向角 + 图标），rAF 驱动，面板关闭/重新取点时终止
  const [waypointFlight, setWaypointFlight] = useState<{
    x: number
    y: number
    angle: number
    icon: string
  } | null>(null)
  const waypointFlightRaf = useRef<number | null>(null)
  // 起飞二次确认：面板「确认」先暂存起飞高度并弹出滑动确认弹窗，滑到最右才真正执行
  const [takeoffSlide, setTakeoffSlide] = useState<{ open: boolean; height?: number }>({
    open: false,
  })
  // 降落二次确认：面板「确认」直接弹出滑动确认弹窗，滑到最右才真正执行
  const [landingSlide, setLandingSlide] = useState<{ open: boolean }>({ open: false })
  // 返航二次确认：面板「确认」先暂存返航高度并弹出滑动确认弹窗，滑到最右才真正执行
  const [returnHomeSlide, setReturnHomeSlide] = useState<{ open: boolean; height?: number }>({
    open: false,
  })
  // 指点返航二次确认：面板「确认」先暂存返航高度并弹出滑动确认弹窗，滑到最右才真正执行
  const [tapReturnSlide, setTapReturnSlide] = useState<{ open: boolean; height?: number }>({
    open: false,
  })
  // 区域降落二次确认：面板「确认」先暂存速度/编队并弹出滑动确认弹窗，滑到最右才真正执行
  const [areaLandingSlide, setAreaLandingSlide] = useState<{
    open: boolean
    speed?: number
    formation?: AreaLandingFormation
  }>({ open: false })
  // 悬停二次确认：面板「确认」直接弹出滑动确认弹窗，滑到最右才真正执行
  const [hoverSlide, setHoverSlide] = useState<{ open: boolean }>({ open: false })
  // 航线飞行二次确认：面板「确认」先暂存飞行高度并弹出滑动确认弹窗，滑到最右才真正执行
  const [routeSlide, setRouteSlide] = useState<{ open: boolean; height: number }>({
    open: false,
    height: 10,
  })
  // 航线飞行模拟飞行状态：确认航线飞行后，无人机图标沿已生成实线折线航线
  // 依次飞过各编号航点（视口屏幕坐标 + 航向角 + 图标），rAF 驱动，
  // 面板关闭/重新取点/删除航点时终止
  const [routeFlightFlight, setRouteFlightFlight] = useState<{
    x: number
    y: number
    angle: number
    icon: string
  } | null>(null)
  const routeFlightFlightRaf = useRef<number | null>(null)
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
  // 环绕飞行已标记态：hover/点击定格图钉显示「取消重绘」按钮，点击按钮清除环绕中心
  // 与实线回到取点模式（跟随 tap-return-marker 图钉 + 隐藏原生光标，可继续标记）
  const [orbitPinMenuOpen, setOrbitPinMenuOpen] = useState(false)
  // 环绕飞行二次确认：面板「确认」先暂存盘旋高度/半径并弹出滑动确认弹窗，滑到最右才真正执行
  const [orbitSlide, setOrbitSlide] = useState<{ open: boolean; height: number; radius?: number }>({
    open: false,
    height: 10,
    radius: 50,
  })
  // 环绕飞行模拟飞行状态：确认环绕飞行后，无人机先沿直线切入盘旋圆，再绕圆持续盘旋
  // （视口坐标 + 航向角 + 图标），rAF 驱动，面板关闭/重新取点/取消重绘时终止
  const [orbitFlight, setOrbitFlight] = useState<{
    x: number
    y: number
    angle: number
    icon: string
  } | null>(null)
  const orbitFlightRaf = useRef<number | null>(null)
  const [rallyPointOpen, setRallyPointOpen] = useState(false)
  const [formationFlightOpen, setFormationFlightOpen] = useState(false)
  // 集结点二次确认：面板「确认」先暂存高度/速度/队形并弹出滑动确认弹窗，滑到最右才真正执行
  const [rallyPointSlide, setRallyPointSlide] = useState<{
    open: boolean
    height?: number
    speed?: number
    formation?: RallyPointFormation
  }>({ open: false })
  // 集结点航线已生成态：「航线生成」后置 true——在已确认集结区域内按当前队形布置
  // 集结坪（area-landing-spot）图标并绘制飞机中心→集结坪 1px #00FF95 绿色实线，
  // 同时解除「确认」置灰；重绘区域/取消/删除重绘时清除
  const [rallyPointRouteGenerated, setRallyPointRouteGenerated] = useState(false)
  // 集结队形（受控状态，面板下拉与地图集结坪布置联动）：变化时即时重排集结坪布局
  const [rallyPointFormation, setRallyPointFormation] = useState<RallyPointFormation>('人字形')
  // 集结点模拟飞行状态：滑窗确认后各机沿绿色航线循环飞向对应集结坪
  // （视口坐标 + 航向角 + 图标），rAF 驱动，取消/关闭/删除重绘/重新生成时终止
  const [rallyPointFlights, setRallyPointFlights] = useState<
    { x: number; y: number; angle: number; icon: string }[]
  >([])
  const rallyPointFlightRaf = useRef<number | null>(null)
  // 集结点模拟飞行进行中标记：队形变更时判断是否需要以新布局重启动画
  const rallyPointFlyingRef = useRef(false)
  // 编队飞行二次确认：面板「确认」先暂存高度/队形并弹出滑动确认弹窗，滑到最右才真正执行
  const [formationFlightSlide, setFormationFlightSlide] = useState<{
    open: boolean
    height?: number
    formation?: FormationFlightFormation
  }>({ open: false })
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
  // 编队飞行航线已生成态：「航线生成」后置 true——在最左选中飞机图标上方按当前队形
  // 布置降落点（area-landing-spot）图标并绘制飞机中心→降落点 1px #00FF95 绿色实线，
  // 同时解除「确认」置灰；取消/关闭面板时清除
  const [formationFlightRouteGenerated, setFormationFlightRouteGenerated] = useState(false)
  // 编队队形（受控状态，面板下拉与地图降落点布置联动）：变化时即时重排降落点布局，
  // 模拟飞行进行中则以新队形重启动画
  const [formationFlightFormation, setFormationFlightFormation] =
    useState<FormationFlightFormation>('人字形')
  // 编队飞行模拟飞行状态：滑窗确认后各机沿绿色航线同步循环飞向队形中对应降落点
  // （视口坐标 + 航向角 + 图标），rAF 驱动，取消/关闭/重新生成时终止
  const [formationFlightFlights, setFormationFlightFlights] = useState<
    { x: number; y: number; angle: number; icon: string }[]
  >([])
  const formationFlightRaf = useRef<number | null>(null)
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
    setTapReturnPointConfirmed(false)
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
    // 面板弹出 + 首次（未绘制区域）同时进入绘制态：光标变停机坪图标，
    // 按住左键拖拽绘制降落区域，松开定格后「确定/取消」（光标恢复常态）；
    // 已绘制区域则仅弹出面板（「航线生成」已解禁，无需再次绘制）
    if (!areaLandingOpen) {
      setAreaLandingOpen(true)
      if (!areaLandingRect) {
        setAreaSelectSource('area-landing')
        setAreaSelectMode(true)
      }
      return
    }
    // 面板已开：再点按钮收起面板，并退出可能进行中的绘制
    setAreaLandingOpen(false)
    setAreaSelectMode(false)
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
    setOrbitPinMenuOpen(false)
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
    // 面板弹出 + 首次（未绘制区域）同时进入绘制态（与区域降落同款交互）
    if (!rallyPointOpen) {
      setRallyPointOpen(true)
      if (!rallyPointRect) {
        setAreaSelectSource('rally-point')
        setAreaSelectMode(true)
      }
      return
    }
    // 面板已开：再点按钮收起面板，并退出可能进行中的绘制
    setRallyPointOpen(false)
    setAreaSelectMode(false)
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
  // 替代逐面板的 && 长链（第 2~12 段功能按钮均提供激活态背景切图）；
  // 区域降落/集结点在框选绘制期间（面板收起、光标为标记）按钮同样保持
  // 弹出激活态——按钮选中态与标记光标态同步出现/消失
  const panelOpenState: Record<BottomBarPanel, boolean> = {
    takeoff: takeoffOpen,
    landing: landingOpen,
    'return-home': returnHomeOpen,
    'tap-return': tapReturnOpen,
    'area-landing': areaLandingOpen || (areaSelectMode && areaSelectSource === 'area-landing'),
    hover: hoverOpen,
    'waypoint-flight': waypointFlightOpen,
    'route-flight': routeFlightOpen,
    'orbit-flight': orbitFlightOpen,
    'rally-point': rallyPointOpen || (areaSelectMode && areaSelectSource === 'rally-point'),
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
  // 航点飞行模拟飞行：无人机沿「飞机图标中心 → 航点图钉」航线循环飞行（单程约 4s），
  // 到达航点停留 600ms 后回到起点重飞——无限循环，直至面板关闭/重新取点终止；
  // 仅前端演示，待接入真实指令链路后由实时遥测驱动
  const startWaypointFlight = (
    line: { x1: number; y1: number; x2: number; y2: number },
    icon: string,
  ) => {
    if (waypointFlightRaf.current !== null) cancelAnimationFrame(waypointFlightRaf.current)
    const duration = 4000
    const holdAtEnd = 600
    const cycle = duration + holdAtEnd
    const startTime = performance.now()
    const angle = (Math.atan2(line.y2 - line.y1, line.x2 - line.x1) * 180) / Math.PI + 90
    const step = (now: number) => {
      // 周期取模实现无限循环：0~4s 飞行 → 停留航点 600ms → 回到起点重飞
      const t = Math.min(1, ((now - startTime) % cycle) / duration)
      setWaypointFlight({
        x: line.x1 + (line.x2 - line.x1) * t,
        y: line.y1 + (line.y2 - line.y1) * t,
        angle,
        icon,
      })
      waypointFlightRaf.current = requestAnimationFrame(step)
    }
    waypointFlightRaf.current = requestAnimationFrame(step)
  }
  // 停止航点飞行循环：取消动画帧并清除飞行无人机（面板关闭/重新取点时调用）
  const stopWaypointFlight = () => {
    if (waypointFlightRaf.current !== null) {
      cancelAnimationFrame(waypointFlightRaf.current)
      waypointFlightRaf.current = null
    }
    setWaypointFlight(null)
  }
  // 航线飞行模拟飞行：无人机沿「航点1 → 航点2 → …」折线航线循环飞行（恒速约 120px/s），
  // 按累计长度线性插值依次经过各编号航点，到达末航点停留 600ms 后回到首航点重飞——
  // 无限循环，直至面板关闭/重新取点/删除航点终止；仅前端演示，待接入真实指令链路后
  // 由实时遥测驱动
  const startRouteFlightAnimation = (points: { x: number; y: number }[], icon: string) => {
    if (routeFlightFlightRaf.current !== null)
      cancelAnimationFrame(routeFlightFlightRaf.current)
    if (points.length === 0) return
    // 预计算折线分段长度：segLens[i] 为航点 i → i+1 段长，total 为全程总长
    const segLens: number[] = []
    let total = 0
    for (let i = 0; i < points.length - 1; i++) {
      const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)
      segLens.push(len)
      total += len
    }
    const speed = 0.12 // px/ms（约 120px/s，降低移动速度使预览更平缓）
    const duration = Math.max(1200, total / speed)
    const holdAtEnd = 600
    const cycle = duration + holdAtEnd
    const startTime = performance.now()
    const step = (now: number) => {
      // 周期取模实现无限循环：0~duration 飞行 → 停留末航点 600ms → 回到首航点重飞
      const elapsed = (now - startTime) % cycle
      const dist = Math.min(total, (elapsed / duration) * total)
      // 沿折线按累计距离定位：找到所在线段并线性插值（航向角随所在段实时更新）
      let acc = 0
      let x = points[0].x
      let y = points[0].y
      let angle = 0
      for (let i = 0; i < segLens.length; i++) {
        if (dist <= acc + segLens[i] || i === segLens.length - 1) {
          const t = segLens[i] > 1e-6 ? (dist - acc) / segLens[i] : 0
          x = points[i].x + (points[i + 1].x - points[i].x) * t
          y = points[i].y + (points[i + 1].y - points[i].y) * t
          angle =
            (Math.atan2(points[i + 1].y - points[i].y, points[i + 1].x - points[i].x) * 180) /
              Math.PI +
            90
          break
        }
        acc += segLens[i]
      }
      setRouteFlightFlight({ x, y, angle, icon })
      routeFlightFlightRaf.current = requestAnimationFrame(step)
    }
    routeFlightFlightRaf.current = requestAnimationFrame(step)
  }
  // 停止航线飞行循环：取消动画帧并清除飞行无人机（面板关闭/重新取点/删除航点时调用）
  const stopRouteFlightAnimation = () => {
    if (routeFlightFlightRaf.current !== null) {
      cancelAnimationFrame(routeFlightFlightRaf.current)
      routeFlightFlightRaf.current = null
    }
    setRouteFlightFlight(null)
  }
  // 返航模拟飞行：无人机沿「飞机图标中心 → H 返航标记」航线循环飞行（单程约 4s），
  // 到达 H 标记停留 600ms 后回到起点重飞——无限循环，直至面板关闭（取消）终止；
  // 仅前端演示，待接入真实指令链路后由实时遥测驱动
  const startReturnHomeFlights = (
    routes: { x1: number; y1: number; x2: number; y2: number }[],
    icons: string[],
  ) => {
    if (returnHomeFlightRaf.current !== null) cancelAnimationFrame(returnHomeFlightRaf.current)
    if (routes.length === 0) return
    const duration = 4000
    const holdAtEnd = 600
    const cycle = duration + holdAtEnd
    const startTime = performance.now()
    // 各航线航向角（切图机头默认朝上，rotate = atan2 屏幕角 + 90°）
    const angles = routes.map(
      (r) => (Math.atan2(r.y2 - r.y1, r.x2 - r.x1) * 180) / Math.PI + 90,
    )
    const step = (now: number) => {
      // 周期取模实现无限循环：0~4s 飞行 → 停留 H 标记 600ms → 回到起点重飞（多机同步）
      const t = Math.min(1, ((now - startTime) % cycle) / duration)
      setReturnHomeFlights(
        routes.map((r, i) => ({
          x: r.x1 + (r.x2 - r.x1) * t,
          y: r.y1 + (r.y2 - r.y1) * t,
          angle: angles[i],
          icon: icons[i],
        })),
      )
      returnHomeFlightRaf.current = requestAnimationFrame(step)
    }
    returnHomeFlightRaf.current = requestAnimationFrame(step)
  }
  // 停止返航循环飞行：取消动画帧并清除飞行无人机（面板关闭时调用）
  const stopReturnHomeFlights = () => {
    if (returnHomeFlightRaf.current !== null) {
      cancelAnimationFrame(returnHomeFlightRaf.current)
      returnHomeFlightRaf.current = null
    }
    setReturnHomeFlights((prev) => (prev.length > 0 ? [] : prev))
  }
  // 区域降落模拟飞行：各选中无人机沿「飞机图标中心 → 对应降落坪」航线同步循环飞行
  // （单程约 4s，多机并行），到达降落坪停留 600ms 后回到起点重飞——无限循环，
  // 直至面板关闭/删除重绘终止；仅前端演示，待接入真实指令链路后由实时遥测驱动
  const startAreaLandingFlights = (
    routes: { x1: number; y1: number; x2: number; y2: number }[],
    icons: string[],
  ) => {
    if (areaLandingFlightRaf.current !== null) cancelAnimationFrame(areaLandingFlightRaf.current)
    if (routes.length === 0) return
    const duration = 4000
    const holdAtEnd = 600
    const cycle = duration + holdAtEnd
    const startTime = performance.now()
    // 各航线航向角（切图机头默认朝上，rotate = atan2 屏幕角 + 90°）
    const angles = routes.map(
      (r) => (Math.atan2(r.y2 - r.y1, r.x2 - r.x1) * 180) / Math.PI + 90,
    )
    const step = (now: number) => {
      // 周期取模实现无限循环：0~4s 飞行 → 停留降落坪 600ms → 回到起点重飞
      const t = Math.min(1, ((now - startTime) % cycle) / duration)
      setAreaLandingFlights(
        routes.map((r, i) => ({
          x: r.x1 + (r.x2 - r.x1) * t,
          y: r.y1 + (r.y2 - r.y1) * t,
          angle: angles[i],
          icon: icons[i],
        })),
      )
      areaLandingFlightRaf.current = requestAnimationFrame(step)
    }
    areaLandingFlightRaf.current = requestAnimationFrame(step)
  }
  // 停止区域降落循环飞行：取消动画帧并清除全部飞行无人机
  const stopAreaLandingFlights = () => {
    if (areaLandingFlightRaf.current !== null) {
      cancelAnimationFrame(areaLandingFlightRaf.current)
      areaLandingFlightRaf.current = null
    }
    setAreaLandingFlights([])
  }
  // 停止集结点循环飞行：取消动画帧并清除全部飞行无人机（无动画时为无操作）
  const stopRallyPointFlights = () => {
    rallyPointFlyingRef.current = false
    if (rallyPointFlightRaf.current !== null) {
      cancelAnimationFrame(rallyPointFlightRaf.current)
      rallyPointFlightRaf.current = null
    }
    setRallyPointFlights((prev) => (prev.length > 0 ? [] : prev))
  }
  // 集结点模拟飞行：各选中无人机沿「飞机图标中心 → 对应集结坪」航线同步循环飞行
  // （单程约 4s + 集结坪停留 600ms 为一个周期，多机并行），到达后回到起点重飞——
  // 无限循环，直至取消面板/删除重绘/重新生成终止；仅前端演示，待接入真实指令链路后由实时遥测驱动
  const startRallyPointFlights = (
    flights: { x1: number; y1: number; x2: number; y2: number; icon: string }[],
  ) => {
    stopRallyPointFlights()
    if (flights.length === 0) return
    const duration = 4000
    const holdAtEnd = 600
    const cycle = duration + holdAtEnd
    const startTime = performance.now()
    // 各航线航向角（切图机头默认朝上，rotate = atan2 屏幕角 + 90°）
    const angles = flights.map((f) => (Math.atan2(f.y2 - f.y1, f.x2 - f.x1) * 180) / Math.PI + 90)
    const step = (now: number) => {
      // 周期取模实现无限循环：0~4s 飞行 → 集结坪停留 600ms → 回到起点重飞
      const t = Math.min(1, ((now - startTime) % cycle) / duration)
      setRallyPointFlights(
        flights.map((f, i) => ({
          x: f.x1 + (f.x2 - f.x1) * t,
          y: f.y1 + (f.y2 - f.y1) * t,
          angle: angles[i],
          icon: f.icon,
        })),
      )
      rallyPointFlightRaf.current = requestAnimationFrame(step)
    }
    rallyPointFlyingRef.current = true
    rallyPointFlightRaf.current = requestAnimationFrame(step)
  }
  // 停止编队飞行循环动画：取消动画帧并清除全部飞行无人机（无动画时为无操作）
  const stopFormationFlightFlights = () => {
    if (formationFlightRaf.current !== null) {
      cancelAnimationFrame(formationFlightRaf.current)
      formationFlightRaf.current = null
    }
    setFormationFlightFlights((prev) => (prev.length > 0 ? [] : prev))
  }
  // 编队飞行模拟飞行：各选中无人机沿「飞机图标中心 → 队形中对应降落点」航线同步循环
  // 飞行（单程 4s + 降落点停留 600ms 为一个周期，多机并行、同步推进保持队形），
  // 到达后回到起点重飞——无限循环，直至取消面板/重新生成终止；
  // 仅前端演示，待接入真实指令链路后由实时遥测驱动
  const startFormationFlightFlights = (
    flights: { x1: number; y1: number; x2: number; y2: number; icon: string }[],
  ) => {
    stopFormationFlightFlights()
    if (flights.length === 0) return
    const duration = 4000
    const holdAtEnd = 600
    const cycle = duration + holdAtEnd
    const startTime = performance.now()
    // 各航线航向角（切图机头默认朝上，rotate = atan2 屏幕角 + 90°）
    const angles = flights.map((f) => (Math.atan2(f.y2 - f.y1, f.x2 - f.x1) * 180) / Math.PI + 90)
    const step = (now: number) => {
      // 周期取模实现无限循环：0~4s 飞行 → 降落点停留 600ms → 回到起点重飞
      const t = Math.min(1, ((now - startTime) % cycle) / duration)
      setFormationFlightFlights(
        flights.map((f, i) => ({
          x: f.x1 + (f.x2 - f.x1) * t,
          y: f.y1 + (f.y2 - f.y1) * t,
          angle: angles[i],
          icon: f.icon,
        })),
      )
      formationFlightRaf.current = requestAnimationFrame(step)
    }
    formationFlightRaf.current = requestAnimationFrame(step)
  }
  // 环绕飞行模拟飞行：无人机先沿「飞机图标中心 → 圆周最近点」直线匀速切入盘旋圆
  // （约 120px/s），到达圆周后按恒定角速度绕圆无限盘旋（不再返回起点）；
  // 航向角实时对齐运动方向（切图机头默认朝上，rotate = atan2 屏幕角 + 90°）；
  // 直至面板关闭/重新取点/取消重绘终止；仅前端演示，待接入真实指令链路后由实时遥测驱动
  const startOrbitFlight = (
    plane: { x: number; y: number },
    center: { x: number; y: number },
    radius: number,
    icon: string,
  ) => {
    if (orbitFlightRaf.current !== null) cancelAnimationFrame(orbitFlightRaf.current)
    // 切入段终点：圆周最近点（沿飞机→圆心方向自圆心回退半径）
    const dx = center.x - plane.x
    const dy = center.y - plane.y
    const dist = Math.hypot(dx, dy)
    const ux = dist > 1e-6 ? dx / dist : 1
    const uy = dist > 1e-6 ? dy / dist : 0
    const entry = { x: center.x - ux * radius, y: center.y - uy * radius }
    const speed = 0.12 // px/ms（约 120px/s，与航线飞行一致）
    const entryDuration = Math.max(800, dist / speed)
    // 盘旋段：同线速度换算角速度（整圈时长夹在 3~12s，避免小圆过快/大圆过慢）
    const orbitPeriod = Math.min(12000, Math.max(3000, (2 * Math.PI * radius) / speed))
    const omega = (2 * Math.PI) / orbitPeriod // rad/ms
    const entryAngle = Math.atan2(entry.y - center.y, entry.x - center.x)
    const startTime = performance.now()
    const step = (now: number) => {
      const elapsed = now - startTime
      if (elapsed < entryDuration) {
        // 直线切入：飞机中心 → 圆周最近点 匀速飞行（航向固定为切入方向）
        const t = elapsed / entryDuration
        setOrbitFlight({
          x: plane.x + (entry.x - plane.x) * t,
          y: plane.y + (entry.y - plane.y) * t,
          angle: (Math.atan2(uy, ux) * 180) / Math.PI + 90,
          icon,
        })
      } else {
        // 圆周盘旋：自切入点起持续绕行（屏幕坐标下 θ 递增为顺时针），无限循环
        const theta = entryAngle + omega * (elapsed - entryDuration)
        setOrbitFlight({
          x: center.x + radius * Math.cos(theta),
          y: center.y + radius * Math.sin(theta),
          // 运动方向 = 位置角 θ 的切向 (-sinθ, cosθ)
          angle: (Math.atan2(Math.cos(theta), -Math.sin(theta)) * 180) / Math.PI + 90,
          icon,
        })
      }
      orbitFlightRaf.current = requestAnimationFrame(step)
    }
    orbitFlightRaf.current = requestAnimationFrame(step)
  }
  // 停止环绕飞行：取消动画帧并清除飞行无人机（面板关闭/重新取点/取消重绘时调用）
  const stopOrbitFlight = () => {
    if (orbitFlightRaf.current !== null) {
      cancelAnimationFrame(orbitFlightRaf.current)
      orbitFlightRaf.current = null
    }
    setOrbitFlight(null)
  }
  // 返航面板关闭（取消/互斥切换）时清除返航航线连线并终止循环飞行动画；
  // 「确认」不再收起面板，因此确认后循环持续播放，仅手动取消可终止
  useEffect(() => {
    if (!returnHomeOpen) {
      setReturnHomeLines(null)
      stopReturnHomeFlights()
    }
  }, [returnHomeOpen])
  // 区域降落面板关闭（取消/互斥切换）或航线失效（删除重绘/区域清除）时终止循环飞行；
  // 「确认」不再收起面板，因此确认后循环持续播放，仅手动取消可终止
  useEffect(() => {
    if (!areaLandingOpen || !areaLandingRect || !areaLandingRouteGenerated) {
      stopAreaLandingFlights()
    }
  }, [areaLandingOpen, areaLandingRect, areaLandingRouteGenerated])
  // 集结点面板关闭（取消/互斥切换）或航线失效（删除重绘/区域清除/重新生成）时终止循环飞行；
  // 「确认」不再收起面板，因此确认后循环持续播放，仅手动取消可终止
  useEffect(() => {
    if (!rallyPointOpen || !rallyPointRect || !rallyPointRouteGenerated) {
      stopRallyPointFlights()
    }
  }, [rallyPointOpen, rallyPointRect, rallyPointRouteGenerated])
  // 编队飞行面板关闭（取消/互斥切换）或航线失效时终止循环飞行；「确认」不收起面板，
  // 因此确认后循环持续播放，仅手动取消面板才终止
  useEffect(() => {
    if (!formationFlightOpen || !formationFlightRouteGenerated) {
      stopFormationFlightFlights()
    }
  }, [formationFlightOpen, formationFlightRouteGenerated])
  // 环绕飞行面板关闭（取消/互斥切换）或航线失效（重新取点/取消重绘）时终止盘旋飞行；
  // 「确认」不再收起面板，因此确认后盘旋持续播放，仅手动取消可终止
  useEffect(() => {
    if (!orbitFlightOpen || !orbitPoint || !orbitRouteGenerated) {
      stopOrbitFlight()
    }
  }, [orbitFlightOpen, orbitPoint, orbitRouteGenerated])
  // 组件卸载时终止进行中的模拟飞行动画
  useEffect(() => {
    return () => {
      if (returnHomeFlightRaf.current !== null) cancelAnimationFrame(returnHomeFlightRaf.current)
      if (areaLandingFlightRaf.current !== null) cancelAnimationFrame(areaLandingFlightRaf.current)
      if (tapReturnFlightRaf.current !== null) cancelAnimationFrame(tapReturnFlightRaf.current)
      if (waypointFlightRaf.current !== null) cancelAnimationFrame(waypointFlightRaf.current)
      if (routeFlightFlightRaf.current !== null)
        cancelAnimationFrame(routeFlightFlightRaf.current)
      if (orbitFlightRaf.current !== null) cancelAnimationFrame(orbitFlightRaf.current)
      if (rallyPointFlightRaf.current !== null) cancelAnimationFrame(rallyPointFlightRaf.current)
      if (formationFlightRaf.current !== null) cancelAnimationFrame(formationFlightRaf.current)
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
      // 新落点未确认：重置确认标记，按钮条随之显示
      setTapReturnPointConfirmed(false)
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
      // 点击定格图钉/「取消重绘」按钮：交由图钉交互处理（显示菜单），不重新取点
      if (e.target instanceof Element && e.target.closest('.tap-return-marker--pin')) return
      const bounds = container.getBoundingClientRect()
      const ll = adapter.unproject({ x: e.clientX - bounds.left, y: e.clientY - bounds.top })
      // 重新取点：已生成实线航线时回到虚线待生成状态（「确认」随之重新置灰）
      setOrbitRouteGenerated(false)
      setOrbitPinMenuOpen(false)
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

  // 编队飞行取点：面板打开且尚未定格航点期间，鼠标在地图容器内移动时图钉实时跟随
  // （钉尖对准鼠标，替代原生光标）；左键点击地图定格航点（携带经纬度回填面板坐标
  // 输入框）后光标恢复正常样式并停止跟随（再次左键点击可重新取点）；右键点击地图
  // 取消已定格的标记（面板保持打开、编队飞行按钮仍为点击态），随即恢复标记态
  // 光标继续取点；点击 UI（面板/底栏）不取点也不取消
  useEffect(() => {
    if (!formationFlightOpen) return
    const handleFormationMouseMove = (e: MouseEvent) => {
      if (!adapter) return
      // 已定格航点：光标已恢复正常样式，无需跟随图钉（也避免逐帧无谓重渲染）
      if (formationFlightPoint) return
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
    // 右键取消定格标记：清除航点（面板保持打开），光标恢复标记态；仅在地图上生效
    const handleFormationContextMenu = (e: MouseEvent) => {
      if (!adapter || !formationFlightPoint) return
      const container = adapter.getContainer()
      if (!container || !(e.target instanceof Node) || !container.contains(e.target)) return
      e.preventDefault()
      setFormationFlightPoint(null)
    }
    document.addEventListener('mousemove', handleFormationMouseMove)
    document.addEventListener('click', handleFormationMapClick, true)
    document.addEventListener('contextmenu', handleFormationContextMenu)
    return () => {
      document.removeEventListener('mousemove', handleFormationMouseMove)
      document.removeEventListener('click', handleFormationMapClick, true)
      document.removeEventListener('contextmenu', handleFormationContextMenu)
      setFormationFlightHover(null)
    }
  }, [formationFlightOpen, formationFlightPoint, adapter])

  // 编队飞行面板关闭（取消/互斥切换）时：清除跟随点、定格航点与航线生成态
  useEffect(() => {
    if (!formationFlightOpen) {
      setFormationFlightHover(null)
      setFormationFlightPoint(null)
      setFormationFlightRouteGenerated(false)
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
      stopWaypointFlight()
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


  // 航线飞行面板关闭（取消/确认/互斥切换）时：终止循环飞行并清除取点状态与已画航线
  useEffect(() => {
    if (!routeFlightOpen) {
      stopRouteFlightAnimation()
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
    // 航点删除导致航线变化：终止进行中的循环飞行（动画点位即将与航线错位）
    stopRouteFlightAnimation()
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

  // 默认城市：每次会话首次加载完成后，无条件确保「苏州」离线包可用并激活（最新优先）。
  // ensureCityPackage 内置版本检测（HEAD Last-Modified 对比 importedAt）：
  // public/maps/suzhou.mbtiles 有更新 → 自动删旧导新升级为最新数据；
  // 未导入 → 从同源静态目录拉取导入；已导入且未过期 → 直接激活。
  // 离线地图面板已隐藏，用户无手动切换入口，故每次启动都回到默认苏州。
  const ensureCityPackage = useOfflineMapStore((s) => s.ensureCityPackage)
  const offlineStatus = useOfflineMapStore((s) => s.status)
  const defaultCityEnsuredRef = useRef(false)
  useEffect(() => {
    if (defaultCityEnsuredRef.current || offlineStatus !== 'ready') return
    defaultCityEnsuredRef.current = true
    void ensureCityPackage('suzhou')
  }, [offlineStatus, ensureCityPackage])

  // 激活包变化时（导入新包 / 切换城市）平滑飞到包中心。
  useEffect(() => {
    if (!adapter || !activePackage) return
    adapter.flyTo(activePackage.center, { zoom: 14, duration: 1500 })
  }, [adapter, activePackage])



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

  // 区域降落降落坪排列（视口坐标）：点击「航线生成」后按所选降落编队在已确认区域内
  // 布置「数量=选中飞机数」的降落坪点位——一字型：水平一行等距；三角型：1+2+3…行容量
  // 三角排列（首行 1 个朝上）；环形：沿内切圆等角分布（单机居中）。
  // 编队/选区/选中飞机数变化时联动重排
  const areaLandingSpots = useMemo<{ x: number; y: number }[]>(() => {
    if (!areaLandingRect) return []
    const { left, top, width, height } = areaLandingRect
    const n = selectedAircraft.length
    if (n <= 0) return []
    if (areaLandingFormation === '环形') {
      if (n === 1) return [{ x: left + width / 2, y: top + height / 2 }]
      const cx = left + width / 2
      const cy = top + height / 2
      const r = (Math.min(width, height) / 2) * 0.62
      return Array.from({ length: n }, (_, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
        return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
      })
    }
    if (areaLandingFormation === '三角型') {
      if (n === 1) return [{ x: left + width / 2, y: top + height / 2 }]
      // 行容量 1、2、3…：第 k 行放 k 个（末行可不满），纵向等距、行内水平等距
      const rows: number[] = []
      let remain = n
      while (remain > 0) {
        const size = rows.length + 1
        rows.push(Math.min(size, remain))
        remain -= size
      }
      const spots: { x: number; y: number }[] = []
      const gapY = height / (rows.length + 1)
      rows.forEach((countInRow, k) => {
        const y = top + gapY * (k + 1)
        const gapX = width / (countInRow + 1)
        for (let j = 0; j < countInRow; j++) spots.push({ x: left + gapX * (j + 1), y })
      })
      return spots
    }
    // 一字型（默认）：水平一行等距分布
    const gap = width / (n + 1)
    return Array.from({ length: n }, (_, i) => ({ x: left + gap * (i + 1), y: top + height / 2 }))
  }, [areaLandingRect, areaLandingFormation, selectedAircraft.length])

  // 集结点集结坪布局（与区域降落同款交互）：按集结队形在已确认集结区域内布置
  // 「数量=选中飞机数」的集结坪；队形/选区/选中飞机数变化时联动重排
  const rallyPointSpots = useMemo<{ x: number; y: number }[]>(
    () => layoutRallyPointSpots(rallyPointRect, rallyPointFormation, selectedAircraft.length),
    [rallyPointRect, rallyPointFormation, selectedAircraft.length],
  )

  // 区分「点击选中」与「拖拽」：mousedown 记录起点，click 时位移小于阈值才触发选中
  const aircraftMouseDownPos = useRef<{ x: number; y: number } | null>(null)

  // 飞机图标拖拽：鼠标左键按住拖动图标+名称至首页任意位置
  const { positions: aircraftPositions, onDragStart: onAircraftDragStart } = useDraggable({
    count: aircraft.length,
    initialPositions: AIRCRAFT_INITIAL_POSITIONS,
    storageKey: 'gcs:aircraft-positions',
  })

  // 编队飞行航线几何（视口坐标）：以最左选中飞机图标正上方（水平对齐其中心、上移
  // 360px 且不越过视口上缘）为锚点，按当前队形布置降落点——目的地尽量贴近左侧
  // 原始无人机图标，并给出各机图标中心起点；航线渲染（绿色实线 + 降落点图标）与
  // 模拟飞行（滑窗确认后启动）共用同一算法；可传入队形覆盖当前状态（队形变更重启动画时使用新队形）
  const getFormationFlightGeometry = (formation?: FormationFlightFormation) => {
    const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
    // 选中飞机按设备序号升序与降落点一一对应（与集结点航线渲染的 picked 完全一致）
    const picked = aircraft
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => selectedDevices.has(item.deviceIndex))
      .sort((a, b) => a.item.deviceIndex - b.item.deviceIndex)
    if (!stage || picked.length === 0) return null
    // 各选中飞机图标中心（视口坐标，48px 图标半宽 +24 与其他航线一致），携带各自切图
    const planes = picked.map(({ item, index }) => ({
      x: stage.left + (aircraftPositions[index].x / 100) * stage.width + 24,
      y: stage.top + (aircraftPositions[index].y / 100) * stage.height + 24,
      icon: item.src,
    }))
    const minX = Math.min(...planes.map((p) => p.x))
    const minY = Math.min(...planes.map((p) => p.y))
    // 锚点贴近左侧原始无人机图标：水平对齐最左选中飞机中心、上移 360px（不越过
    // 视口上缘），目的地整体落在屏幕左侧而非中部
    const anchor = { x: minX, y: Math.max(minY - 360, stage.top + 48) }
    const spots = layoutFormationFlightSpots(
      anchor,
      formation ?? formationFlightFormation,
      planes.length,
    )
    // 左缘防溢出：锚点贴左后宽队形（一字整行/三角末行/人字左翼）可能超出视口左侧，
    // 整体右移补偿（队形形状不变），确保最左降落点完整可见
    const spotsMinX = Math.min(...spots.map((s) => s.x))
    const leftBound = stage.left + 30
    if (spotsMinX < leftBound) {
      const shiftX = leftBound - spotsMinX
      spots.forEach((s) => {
        s.x += shiftX
      })
    }
    // 就近配对：飞机与降落点各自按水平位置升序后同序号配对——左边的飞机连靠左的
    // 降落点、右边的连靠右的，避免航线左右交叉
    planes.sort((a, b) => a.x - b.x)
    spots.sort((a, b) => a.x - b.x)
    return {
      planes: planes.map(({ x, y }) => ({ x, y })),
      spots,
      icons: planes.map((p) => p.icon),
    }
  }

  // 巡检区域拖拽：鼠标左键按住拖动整个巡检区域（含轨迹线）至首页任意位置
  const { positions: inspectionZonePositions, onDragStart: onInspectionZoneDragStart } =
    useDraggable({
      count: 1,
      initialPositions: [INSPECTION_ZONE_INITIAL_POSITION],
      storageKey: 'gcs:inspection-zone-position',
    })

  // 图层显隐（图层控制面板开关联动）：禁飞区/巡检区默认关，设备标签默认开
  const noflyZoneVisible = useLayerStore((s) => s.noflyZoneVisible)
  const inspectionZoneVisible = useLayerStore((s) => s.inspectionZoneVisible)
  const deviceLabelsVisible = useLayerStore((s) => s.deviceLabelsVisible)

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
      noflyZoneVisible,
      inspectionZoneVisible,
      deviceLabelsVisible,
    ],
  })

  return (
    <main
      className={`design-viewport${tapReturnOpen && !tapReturnPoint ? ' tap-return-mode' : ''}${waypointFlightOpen ? ' waypoint-flight-mode' : ''}${waypointFlightOpen && waypointPickingActive && !waypointPoint ? ' waypoint-picking' : ''}${routeFlightOpen && routeFlightPicking ? ' route-flight-picking' : ''}${orbitFlightOpen && !orbitPoint ? ' orbit-flight-mode' : ''}${formationFlightOpen && !formationFlightPoint ? ' formation-flight-mode' : ''}`}
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


          {/* 告警信息面板：右上角常显，色调随顶栏激活的告警徽标切换。
              告警详情面板（AlarmDetailPanel）暂隐藏——点击顶栏告警徽标也不展示，功能就绪后恢复 */}
          <div className="alarm-panels">
            <AlarmInfoPanel alarmColor={currentAlarmColor} />
            {/* {activeAlarm !== null && (
              <AlarmDetailPanel
                alarmColor={currentAlarmColor}
                onClose={() => setActiveAlarm(null)}
              />
            )} */}
          </div>
          {/* 离线地图管理面板（导入 / 城市切换 / 包列表）暂隐藏——默认自动加载最新苏州包，
              需要手动管理时恢复下方注释即可（严格离线，仅读写本地 IndexedDB） */}
          {/* <OfflineMapPanel /> */}

          {/* 严格离线：瓦片缓存命中即渲染；未命中灰显（绝不在线回源）。
              尚未导入地图包时渲染纯色占位底图。导入/切换入口由离线地图管理模块提供（P1+）。 */}
          {/* MissionPanel 暂时隐藏，待后续功能接入时恢复 */}
          {SHOW_PENDING_PANELS && <MissionPanel />}
          {/* 红色禁飞区：左下角倾斜四边形，SVG 绘制边框 + 四角节点。
              显隐由图层控制面板「禁飞区」开关联动（layerStore），默认关 */}
          {noflyZoneVisible && (
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
          )}
          {SHOW_PENDING_PANELS && <div className="restricted-zone restricted-zone--orange" />}

          {/* 巡检区域：包含1条蛇形巡检轨迹线，支持拖拽移动。
              显隐由图层控制面板「巡检区域」开关联动（layerStore），默认关 */}
          {inspectionZoneVisible && (
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
          )}

          {/* 无人机图标：显隐由图层控制面板「设备标签」开关联动（layerStore），默认开 */}
          {deviceLabelsVisible &&
            aircraft.map((item, index) => {
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
                {/* Return-home indicator: ground marker (48x48 white circle with
                    vertical H only, floating above the selected aircraft
                    while the return panel is open; green solid line (SVG) from icon center to
                    marker bottom is drawn on route generate. */}
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
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                setTakeoffSlide({ open: true, height })
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
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                setLandingSlide({ open: true })
              }}
              onCancel={() => setLandingOpen(false)}
            />
          )}

          {/* 返航面板：点击底部「返航」按钮后在右上角展开（与其他功能面板互斥），按钮保持弹出状态；
              参数设置/飞机列表 tab + 返航高度步进（editable 手动键入）；
              交互状态流：打开面板即可点「航线生成」（高度默认 10m 有效）→
              点击「航线生成」为每架选中飞机画出/重画返航线并解禁「确认」（returnHomeLines 联动），
              确认走滑动二次确认弹窗后启动循环模拟飞行（面板保持展开，取消时终止） */}
          {returnHomeOpen && (
            <ReturnHomePanel
              aircraft={selectedAircraft}
              onRemove={handleRemoveAircraft}
              confirmMuted={!returnHomeLines || returnHomeLines.length === 0}
              onGenerateRoute={() => {
                // 航线生成：每架选中飞机均由其图标中心向正上方各自的返航标记画绿色实线；
                // 再次点击整体重画；未选中飞机则忽略（保持「确认」置灰）
                // DOM measured anchors (viewport coords) instead of hard-coded offsets:
                // aircraft icon center -> each selected plane's return marker bottom edge.
                // getBoundingClientRect() matches the fixed full-viewport SVG
                // (.tap-return-route) user space, so the lines always connect the icons
                // regardless of CSS spacing/drag state.
                const aircraftEls = document.querySelectorAll<HTMLElement>('.map-stage .aircraft')
                const lines: { x1: number; y1: number; x2: number; y2: number }[] = []
                aircraft.forEach((item, idx) => {
                  if (!selectedDevices.has(item.deviceIndex)) return
                  const aircraftEl = aircraftEls[idx]
                  const iconEl = aircraftEl?.querySelector('img')
                  const markerEl = aircraftEl?.querySelector('.aircraft-return-indicator__ground')
                  if (!aircraftEl || !iconEl || !markerEl) return
                  const iconRect = iconEl.getBoundingClientRect()
                  const markerRect = markerEl.getBoundingClientRect()
                  lines.push({
                    x1: iconRect.left + iconRect.width / 2,
                    y1: iconRect.top + iconRect.height / 2,
                    x2: markerRect.left + markerRect.width / 2,
                    y2: markerRect.bottom,
                  })
                })
                setReturnHomeLines(lines.length > 0 ? lines : null)
              }}
              onConfirm={(height) => {
                // 置灰守卫：未生成返航航线时不弹确认弹窗（按钮视觉置灰兜底拦截）
                if (!returnHomeLines) return
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                setReturnHomeSlide({ open: true, height })
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
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                setTapReturnSlide({ open: true, height })
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
              routeMuted={!areaLandingRect}
              confirmMuted={!areaLandingRouteGenerated}
              tab={areaLandingTab}
              onTabChange={setAreaLandingTab}
              speed={areaLandingSpeed}
              onSpeedChange={setAreaLandingSpeed}
              formation={areaLandingFormation}
              onFormationChange={setAreaLandingFormation}
              corners={areaLandingCorners}
              onConfirm={(speed, formation) => {
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                setAreaLandingSlide({ open: true, speed, formation })
              }}
              onGenerateRoute={() => {
                // 置灰守卫：未确定降落区域时按钮置灰，点击兜底拦截
                if (!areaLandingRect) return
                // 已生成时再次点击：保持面板展开与已生成航线不变（防止误点收起面板）；
                // 需重新绘制区域时先点「取消」收起面板，再点底部「区域降落」按钮重进框选
                if (areaLandingRouteGenerated) return
                // 首次生成：按所选降落编队在已确认区域内布置降落坪（数量=选中飞机数）
                // 并与各飞机绘制绿色实线航线；「确认」按钮随生成成功解除置灰
                setAreaLandingRouteGenerated(true)
              }}
              onCancel={() => {
                setAreaLandingRect(null)
                setAreaLandingCorners(null)
                setAreaLandingRouteGenerated(false)
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
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                setHoverSlide({ open: true })
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
              confirmMuted={!waypointRouteGenerated}
              onConfirm={(height) => {
                // 置灰守卫：未生成实线航线时不弹确认弹窗（按钮视觉置灰兜底拦截）
                if (!waypointRouteGenerated) return
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                setWaypointSlide({ open: true, height })
              }}
              onGenerateRoute={() => {
                // 航线生成：已定格航点（虚线）→ 虚线定格为实线；已生成实线 → 清除旧航点重新取点；
                // 左键定格航点后退出取点，面板保留可继续确认/取消
                if (waypointRouteGenerated) {
                  // 已生成实线时点击：终止进行中的循环飞行，清除旧航点重新取点
                  stopWaypointFlight()
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

          {/* 起飞滑动二次确认弹窗（复用 SlideConfirmDialog）：滑到最右松手执行确认并收起面板，
              点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={takeoffSlide.open}
            title="起飞"
            message="执行起飞指令"
            onConfirm={() => {
              console.info(`[takeoff] 确认起飞，高度 ${takeoffSlide.height}m`)
              setTakeoffSlide((s) => ({ ...s, open: false }))
              setTakeoffOpen(false)
            }}
            onCancel={() => setTakeoffSlide((s) => ({ ...s, open: false }))}
          />

          {/* 降落滑动二次确认弹窗（复用 SlideConfirmDialog）：滑到最右松手执行确认并收起面板，
              点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={landingSlide.open}
            title="降落"
            message="执行降落指令"
            onConfirm={() => {
              console.info('[landing] 确认降落')
              setLandingSlide({ open: false })
              setLandingOpen(false)
            }}
            onCancel={() => setLandingSlide({ open: false })}
          />

          {/* 返航滑动二次确认弹窗（复用 SlideConfirmDialog）：滑到最右松手执行确认并启动循环模拟飞行
              （面板保持展开），点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={returnHomeSlide.open}
            title="返航"
            message="执行返航指令"
            onConfirm={() => {
              console.info(`[return-home] 确认返航，高度 ${returnHomeSlide.height}m`)
              // 确认后启动循环模拟飞行：各选中无人机沿已生成航线飞向对应 H 返航标记
              // 并无限循环（多机并行）；面板保持展开，「取消」按钮可随时手动终止循环。
              // 航线与飞行图标同源配对：均按 aircraft 数组顺序过滤选中设备
              if (returnHomeLines && returnHomeLines.length > 0) {
                const icons = aircraft
                  .filter((item) => selectedDevices.has(item.deviceIndex))
                  .map((item) => item.src)
                startReturnHomeFlights(returnHomeLines, icons)
              }
              setReturnHomeSlide((s) => ({ ...s, open: false }))
            }}
            onCancel={() => setReturnHomeSlide((s) => ({ ...s, open: false }))}
          />

          {/* 指点返航滑动二次确认弹窗（复用 SlideConfirmDialog）：滑到最右松手执行确认并启动循环模拟飞行
              （面板保持展开），点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={tapReturnSlide.open}
            title="指点返航"
            message="执行指点返航指令"
            onConfirm={() => {
              console.info(`[tap-return] 确认指点返航，高度 ${tapReturnSlide.height}m`)
              // 确认后启动循环模拟飞行：无人机沿已生成航线飞向落点图钉并无限循环；
              // 面板保持展开，「取消」按钮可随时手动终止循环
              if (tapReturnLine) {
                const flyIdx = aircraft.findIndex((a) => selectedDevices.has(a.deviceIndex))
                startTapReturnFlight(
                  tapReturnLine,
                  flyIdx !== -1 ? aircraft[flyIdx].src : homeImages.aircraftRed,
                )
              }
              setTapReturnSlide((s) => ({ ...s, open: false }))
            }}
            onCancel={() => setTapReturnSlide((s) => ({ ...s, open: false }))}
          />

          {/* 区域降落滑动二次确认弹窗（复用 SlideConfirmDialog）：滑到最右松手执行确认并启动循环模拟飞行
              （面板保持展开），点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={areaLandingSlide.open}
            title="区域降落"
            message="执行区域降落指令"
            onConfirm={() => {
              console.info(
                '[area-landing] 确认区域降落，速度 ' +
                  areaLandingSlide.speed +
                  'm/s，编队 ' +
                  areaLandingSlide.formation +
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
              // 确认后启动循环模拟飞行：各选中无人机沿已生成航线飞向对应降落坪并无限循环；
              // 面板保持展开，「取消」按钮/删除重绘可随时手动终止循环。
              // 航线端点与降落坪连线渲染同源：飞机图标中心（+24）→ 第 i 个降落坪
              if (areaLandingRouteGenerated && areaLandingSpots.length > 0) {
                const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
                if (stage) {
                  // 选中飞机按设备序号升序与降落坪一一对应（与航线渲染的 picked 完全一致）
                  const pickedFlights = aircraft
                    .map((item, index) => ({ item, index }))
                    .filter(({ item }) => selectedDevices.has(item.deviceIndex))
                    .sort((a, b) => a.item.deviceIndex - b.item.deviceIndex)
                  const routes = pickedFlights
                    .map(({ index }, i) =>
                      areaLandingSpots[i]
                        ? {
                            x1: stage.left + (aircraftPositions[index].x / 100) * stage.width + 24,
                            y1: stage.top + (aircraftPositions[index].y / 100) * stage.height + 24,
                            x2: areaLandingSpots[i].x,
                            y2: areaLandingSpots[i].y,
                          }
                        : null,
                    )
                    .filter(
                      (r): r is { x1: number; y1: number; x2: number; y2: number } => r !== null,
                    )
                  startAreaLandingFlights(routes, pickedFlights.map(({ item }) => item.src))
                }
              }
              setAreaLandingSlide((s) => ({ ...s, open: false }))
            }}
            onCancel={() => setAreaLandingSlide((s) => ({ ...s, open: false }))}
          />

          {/* 悬停滑动二次确认弹窗（复用 SlideConfirmDialog）：滑到最右松手执行确认并收起面板，
              点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={hoverSlide.open}
            title="悬停"
            message="执行悬停指令"
            onConfirm={() => {
              console.info('[hover] 确认悬停')
              setHoverSlide({ open: false })
              setHoverOpen(false)
            }}
            onCancel={() => setHoverSlide({ open: false })}
          />

          {/* 航点飞行滑动二次确认弹窗（可复用 SlideConfirmDialog）：滑到最右松手执行确认并收起面板，
              点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={waypointSlide.open}
            title="航点飞行"
            message="执行航点飞行指令"
            onConfirm={() => {
              console.info(`[waypoint-flight] 确认航点飞行，高度 ${waypointSlide.height}m`)
              // 确认后启动循环模拟飞行：无人机沿已生成实线航线飞向航点图钉并无限循环；
              // 面板保持展开，「取消」或重新「航线生成」取点可随时终止
              if (waypointPoint) {
                const flyIdx = aircraft.findIndex((a) => selectedDevices.has(a.deviceIndex))
                const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
                if (flyIdx !== -1 && stage) {
                  startWaypointFlight(
                    {
                      x1: stage.left + (aircraftPositions[flyIdx].x / 100) * stage.width + 24,
                      y1: stage.top + (aircraftPositions[flyIdx].y / 100) * stage.height + 24,
                      x2: waypointPoint.x,
                      y2: waypointPoint.y,
                    },
                    aircraft[flyIdx].src,
                  )
                }
              }
              setWaypointSlide((s) => ({ ...s, open: false }))
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
              // 确认后启动循环模拟飞行：无人机沿已生成实线航线依次飞过各航点并无限循环；
              // 面板保持展开，「取消」或重新「航线生成」取点/删除航点可随时终止
              if (routeFlightPoints.length > 0) {
                const flyIdx = aircraft.findIndex((a) => selectedDevices.has(a.deviceIndex))
                if (flyIdx !== -1) {
                  startRouteFlightAnimation(
                    routeFlightPoints.map((pt) => ({ x: pt.x, y: pt.y })),
                    aircraft[flyIdx].src,
                  )
                }
              }
              setRouteSlide((s) => ({ ...s, open: false }))
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
                  // 已生成实线时点击：终止进行中的循环飞行，清除旧航线重新取点
                  stopRouteFlightAnimation()
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
              点击「航线生成」后虚线定格为实线并解除确认置灰，确认走滑动二次确认弹窗并启动循环模拟飞行
              （先沿直线切入盘旋圆再绕圆持续盘旋，面板保持展开，取消/重新取点时终止）；取消收起面板并清除图钉连线 */}
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

          {/* 环绕飞行滑动二次确认弹窗（复用 SlideConfirmDialog）：滑到最右松手执行确认并启动循环模拟飞行
              （先沿直线切入盘旋圆再绕圆持续盘旋，面板保持展开），点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={orbitSlide.open}
            title="环绕飞行"
            message="执行环绕飞行指令"
            onConfirm={() => {
              console.info(
                `[orbit-flight] 确认环绕飞行，高度 ${orbitSlide.height}m，半径 ${orbitSlide.radius}m`,
              )
              // 确认后启动循环模拟飞行：无人机先沿绿色直线（飞机中心 → 圆周最近点）切入，
              // 再绕绿色盘旋圆无限盘旋；切入段约 120px/s，整圈时长按半径自适应（3~12s）。
              // 几何与盘旋圆渲染完全同源（orbitRadius/mpp 换算），动画路径与绿色轨迹精确重合；
              // 面板保持展开，「取消」/重新取点/取消重绘可随时手动终止
              if (orbitPoint && adapter) {
                const idx = aircraft.findIndex((a) => selectedDevices.has(a.deviceIndex))
                const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
                if (idx !== -1 && stage) {
                  const mpp = adapter.getMetersPerPixel()
                  const rPx = Math.max(2, orbitRadius / mpp)
                  startOrbitFlight(
                    {
                      x: stage.left + (aircraftPositions[idx].x / 100) * stage.width + 24,
                      y: stage.top + (aircraftPositions[idx].y / 100) * stage.height + 24,
                    },
                    { x: orbitPoint.x, y: orbitPoint.y },
                    rPx,
                    aircraft[idx].src,
                  )
                }
              }
              setOrbitSlide((s) => ({ ...s, open: false }))
            }}
            onCancel={() => setOrbitSlide((s) => ({ ...s, open: false }))}
          />

          {/* 集结点滑动二次确认弹窗（复用 SlideConfirmDialog）：滑到最右松手执行确认并收起面板，
              点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={rallyPointSlide.open}
            title="集结点"
            message="执行集结指令"
            onConfirm={() => {
              console.info(
                `[rally-point] 确认集结，高度 ${rallyPointSlide.height}m，速度 ${rallyPointSlide.speed}m/s，队形 ${rallyPointSlide.formation}` +
                  (rallyPointRect
                    ? `，区域 @(${rallyPointRect.left},${rallyPointRect.top}) ${rallyPointRect.width}x${rallyPointRect.height}`
                    : '，未框选区域'),
              )
              setRallyPointSlide((s) => ({ ...s, open: false }))
              // 面板保持展开：启动多机循环模拟飞行——各选中无人机沿已生成航线飞向
              // 对应集结坪并无限循环，直至取消面板/删除重绘/重新生成终止
              const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
              if (rallyPointRouteGenerated && rallyPointSpots.length > 0 && stage) {
                // 选中飞机按设备序号升序与集结坪一一对应（与航线渲染的 picked 完全一致）
                const pickedFlights = aircraft
                  .map((item, index) => ({ item, index }))
                  .filter(({ item }) => selectedDevices.has(item.deviceIndex))
                  .sort((a, b) => a.item.deviceIndex - b.item.deviceIndex)
                startRallyPointFlights(
                  pickedFlights.flatMap(({ item, index }, i) =>
                    rallyPointSpots[i]
                      ? [
                          {
                            x1: stage.left + (aircraftPositions[index].x / 100) * stage.width + 24,
                            y1: stage.top + (aircraftPositions[index].y / 100) * stage.height + 24,
                            x2: rallyPointSpots[i].x,
                            y2: rallyPointSpots[i].y,
                            icon: item.src,
                          },
                        ]
                      : [],
                  ),
                )
              }
            }}
            onCancel={() => setRallyPointSlide((s) => ({ ...s, open: false }))}
          />

          {/* 编队飞行滑动二次确认弹窗（复用 SlideConfirmDialog）：滑到最右松手执行确认并收起面板，
              点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={formationFlightSlide.open}
            title="编队飞行"
            message="执行编队飞行指令"
            onConfirm={() => {
              console.info(
                `[formation-flight] 确认编队飞行，高度 ${formationFlightSlide.height}m，队形 ${formationFlightSlide.formation}`,
              )
              setFormationFlightSlide((s) => ({ ...s, open: false }))
              // 面板保持展开：启动多机循环模拟飞行——各选中无人机沿已生成航线飞向队形中
              // 对应降落点并无限循环，直至取消面板/重新生成终止
              const geo = getFormationFlightGeometry()
              if (formationFlightRouteGenerated && geo) {
                startFormationFlightFlights(
                  geo.planes.flatMap((p, i) =>
                    geo.spots[i]
                      ? [
                          {
                            x1: p.x,
                            y1: p.y,
                            x2: geo.spots[i].x,
                            y2: geo.spots[i].y,
                            icon: geo.icons[i],
                          },
                        ]
                      : [],
                  ),
                )
              }
            }}
            onCancel={() => setFormationFlightSlide((s) => ({ ...s, open: false }))}
          />

          {/* 集结点面板（与其他功能面板互斥）：参数设置 tab（起飞高度/集结速度步进 + 集结队形下拉）/ 飞机列表 tab，
              确认（生成航线前置灰）/航线生成/取消三按钮；「航线生成」在已确认集结区域内按当前队形布置集结坪
              并绘制绿色实线航线；「确认」弹滑窗并启动循环模拟飞行（面板保持展开）；「取消」终止动画并收起面板 */}
          {rallyPointOpen && (
            <RallyPointPanel
              aircraft={selectedAircraft}
              onRemove={handleRemoveAircraft}
              routeMuted={!rallyPointRect}
              confirmMuted={!rallyPointRouteGenerated}
              formation={rallyPointFormation}
              onFormationChange={(f) => {
                setRallyPointFormation(f)
                // 队形变更即时重排集结坪；若模拟飞行进行中，以新布局重启动画
                if (!rallyPointFlyingRef.current) return
                const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
                if (!stage) return
                const picked = aircraft
                  .map((item, index) => ({ item, index }))
                  .filter(({ item }) => selectedDevices.has(item.deviceIndex))
                  .sort((a, b) => a.item.deviceIndex - b.item.deviceIndex)
                const spots = layoutRallyPointSpots(rallyPointRect, f, picked.length)
                startRallyPointFlights(
                  picked.flatMap(({ item, index }, i) =>
                    spots[i]
                      ? [
                          {
                            x1: stage.left + (aircraftPositions[index].x / 100) * stage.width + 24,
                            y1: stage.top + (aircraftPositions[index].y / 100) * stage.height + 24,
                            x2: spots[i].x,
                            y2: spots[i].y,
                            icon: item.src,
                          },
                        ]
                      : [],
                  ),
                )
              }}
              onConfirm={(height, speed, formation) => {
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                setRallyPointSlide({ open: true, height, speed, formation })
              }}
              onGenerateRoute={() => {
                // 未确认集结区域：进入截图框选模式（兜底，正常流程打开面板时已自动进入）
                if (!rallyPointRect) {
                  setAreaSelectSource('rally-point')
                  setAreaSelectMode(true)
                  return
                }
                // 已生成时再次点击：保持面板展开与已生成航线不变（与区域降落一致，防误点）
                if (rallyPointRouteGenerated) return
                // 区域已确认：按当前集结队形布置集结坪并绘制绿色实线，解除「确认」置灰
                stopRallyPointFlights()
                setRallyPointRouteGenerated(true)
              }}
              onCancel={() => {
                // 取消面板：终止循环动画并清理全部集结点状态（含已确认区域）
                stopRallyPointFlights()
                setRallyPointRouteGenerated(false)
                setRallyPointRect(null)
                setRallyPointOpen(false)
              }}
            />
          )}

          {/* 编队飞行面板（与其他功能面板互斥）：参数设置区块头 + 飞行高度步进 + 编队队形下拉 + 航点信息坐标，
              确认（置灰，航线生成后解除）/航线生成/取消三按钮；「航线生成」在最左选中飞机图标上方按当前
              队形布置降落点并绘制绿色实线航线；「确认」弹滑窗并启动循环模拟飞行（面板保持展开）；
              「取消」终止动画并收起面板 */}
          {formationFlightOpen && (
            <FormationFlightPanel
              waypoint={formationFlightPoint}
              confirmMuted={!formationFlightRouteGenerated}
              formation={formationFlightFormation}
              onFormationChange={(f) => {
                setFormationFlightFormation(f)
                // 队形变更即时重排降落点；若模拟飞行进行中，则以新队形重启动画
                if (formationFlightRaf.current === null) return
                const geo = getFormationFlightGeometry(f)
                if (!geo) return
                startFormationFlightFlights(
                  geo.planes.flatMap((p, i) =>
                    geo.spots[i]
                      ? [
                          {
                            x1: p.x,
                            y1: p.y,
                            x2: geo.spots[i].x,
                            y2: geo.spots[i].y,
                            icon: geo.icons[i],
                          },
                        ]
                      : [],
                  ),
                )
              }}
              onConfirm={(height, formation) => {
                // 置灰守卫：未生成航线时不弹确认滑窗（按钮仅视觉置灰，此处兜底拦截）
                if (!formationFlightRouteGenerated) return
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                setFormationFlightSlide({ open: true, height, formation })
              }}
              onGenerateRoute={() => {
                // 已生成时再次点击：保持面板展开与已生成航线不变（与区域降落/集结点一致，防误点）
                if (formationFlightRouteGenerated) return
                // 未选中飞机：无可布置降落点，忽略（与返航线生成的守卫一致）
                if (!getFormationFlightGeometry()) return
                // 航线生成：在最左选中飞机图标上方按当前队形布置降落点并绘制绿色实线航线，
                // 解除「确认」置灰
                stopFormationFlightFlights()
                setFormationFlightRouteGenerated(true)
              }}
              onCancel={() => {
                // 取消面板：终止循环动画并清理航线生成态（关闭 effect 统一处理）
                setFormationFlightOpen(false)
              }}
            />
          )}

          {/* 已确认的区域降落范围：半透明紫色填充（rgba(113,96,242,0.3)）、直角，
              正中心圆形徽章（100×100、rgba(113,96,242,0.1) 填充、8px 白 0.2 描边）内含设计稿降落坪图标（iconAreaLandingCenter 44×52）；
              再次进入框选（重绘）、面板取消或点击左上角「删除重绘」按钮时清除 */}
          {/* 返航航线连线：各选中飞机图标中心 → 各自正上方 H 返航标记底部（3px #00FF95 实线）；
              点击「航线生成」绘制/清除，面板关闭时清除；「确认」随连线生成解除置灰 */}
          {returnHomeLines && returnHomeLines.length > 0 && (
            <svg className="tap-return-route" aria-hidden="true">
              {returnHomeLines.map((line, i) => (
                <line
                  key={i}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke="#00FF95"
                  strokeWidth={3}
                />
              ))}
            </svg>
          )}
          {/* 返航模拟飞行无人机：确认后各机沿各自航线连线循环飞向对应 H 返航标记
              （fixed 视口定位 + 航向旋转，多机并行无限循环播放，面板取消/切换后消失） */}
          {returnHomeFlights.map((flight, i) => (
            <img
              key={i}
              className="tap-return-drone"
              src={flight.icon}
              alt=""
              draggable={false}
              style={{
                left: flight.x,
                top: flight.y,
                transform: `translate(-50%, -50%) rotate(${flight.angle}deg)`,
              }}
            />
          ))}

          {/* 指点返航连线：飞机图标中心 → 落点图钉（SVG 视口屏幕空间，3px #00FF95）；
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
                strokeWidth={3}
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
              {/* 落点「确定 | 取消」按钮条（未确认时显示于圆圈正下方）：
                  确定保留落点并隐藏按钮条；取消清除落点恢复取点——光标变标记
                  （tap-return-mode 隐藏原生光标 + 跟随图钉），可继续点选新落点。
                  按钮条位于 .map-base 之外，点击不会被地图取点监听误捕为重新取点 */}
              {!tapReturnPointConfirmed && !tapReturnFlight && (
                <div
                  className="tap-return-confirm-bar"
                  style={{ left: tapReturnPoint.x, top: tapReturnPoint.y + 92 }}
                >
                  <span
                    className="area-select-confirm-bar__label"
                    onClick={() => setTapReturnPointConfirmed(true)}
                  >
                    确定
                  </span>
                  <div className="area-select-confirm-bar__divider" />
                  <span
                    className="area-select-confirm-bar__label area-select-confirm-bar__label--cancel"
                    onClick={() => {
                      setTapReturnPoint(null)
                      setTapReturnPointConfirmed(false)
                    }}
                  >
                    取消
                  </span>
                </div>
              )}
            </>
          )}

          {/* 指点返航取点图钉（跟随鼠标）：仅取点阶段（面板打开且尚未定格落点）替代原生
              取点光标——原 54×54 切图超出浏览器 32×32 光标上限会回退成十字准线，改为隐藏
              光标 + 图钉钉尖对准鼠标；落点定格后鼠标恢复正常样式（便于点「确定/取消」），
              点「取消」删点恢复取点后标记光标随之回来；鼠标移出地图（UI 上）时隐藏 */}
          {tapReturnOpen && !tapReturnPoint && tapReturnHover && (
            <img
              className="tap-return-marker"
              src={homeImages.tapReturnMarker}
              style={{ left: tapReturnHover.x, top: tapReturnHover.y }}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          )}

          {/* 环绕飞行取点图钉（跟随鼠标）：取点期间（未定格环绕中心）替代原生取点光标——
              与指点返航同方案（tap-return-marker 切图 32×56 超 32×32 光标上限），
              钉尖对准鼠标；鼠标移出地图（UI 上）时隐藏跟随图钉 */}
          {orbitFlightOpen && !orbitPoint && orbitFlightHover && (
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
              钉尖对准鼠标；仅在未定格航点时跟随（定格后光标恢复正常样式，
              右键取消标记后恢复跟随），鼠标移出地图（UI 上）时隐藏跟随图钉 */}
          {formationFlightOpen && !formationFlightPoint && formationFlightHover && (
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

          {/* 编队飞行降落点编队 + 航线（点击「航线生成」后）：在最左选中飞机图标上方按所选
              编队队形布置「数量=选中飞机数」的降落点图标（area-landing-spot），并用
              1px #00FF95 绿色实线连接各选中飞机中心与其对应降落点；队形/选中飞机数/拖拽
              位置变化时联动重排，取消/关闭面板时随状态清除 */}
          {formationFlightOpen &&
            formationFlightRouteGenerated &&
            (() => {
              const geo = getFormationFlightGeometry()
              if (!geo) return null
              return (
                <>
                  <svg className="area-landing-route" aria-hidden="true">
                    {geo.planes.map((p, i) =>
                      geo.spots[i] ? (
                        <line
                          key={i}
                          x1={p.x}
                          y1={p.y}
                          x2={geo.spots[i].x}
                          y2={geo.spots[i].y}
                          stroke="#00FF95"
                          strokeWidth={1}
                        />
                      ) : null,
                    )}
                  </svg>
                  {geo.spots.map((spot, i) => (
                    <img
                      key={i}
                      className="area-landing-spot"
                      src={homeImages.areaLandingSpot}
                      style={{ left: spot.x, top: spot.y }}
                      alt="编队飞行降落点"
                      draggable={false}
                    />
                  ))}
                </>
              )
            })()}

          {/* 编队飞行模拟飞行无人机：滑窗确认后各机沿航线连线同步循环飞向队形中对应
              降落点（fixed 视口定位 + 航向旋转，多机并行无限循环播放，
              直至取消面板/重新生成后消失） */}
          {formationFlightFlights.map((flight, i) => (
            <img
              key={i}
              className="tap-return-drone"
              src={flight.icon}
              alt=""
              draggable={false}
              style={{
                left: flight.x,
                top: flight.y,
                transform: `translate(-50%, -50%) rotate(${flight.angle}deg)`,
              }}
            />
          ))}

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
                  <span
                    className="tap-return-marker tap-return-marker--pin"
                    style={{ left: orbitPoint.x, top: orbitPoint.y }}
                    onMouseEnter={() => setOrbitPinMenuOpen(true)}
                    onMouseLeave={() => setOrbitPinMenuOpen(false)}
                    onClick={(e) => {
                      // 阻止冒泡触发地图点击；点击图钉同样展示「取消重绘」
                      e.stopPropagation()
                      setOrbitPinMenuOpen(true)
                    }}
                  >
                    <img src={homeImages.tapReturnMarker} alt="环绕中心" draggable={false} />
                    {orbitPinMenuOpen && (
                      <button
                        type="button"
                        className="route-flight-marker__delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          // 取消重绘：清除环绕中心与实线，恢复取点跟随图钉继续标记
                          setOrbitPinMenuOpen(false)
                          setOrbitPoint(null)
                          setOrbitRouteGenerated(false)
                        }}
                      >
                        取消重绘
                      </button>
                    )}
                  </span>
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
                      strokeWidth={2}
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

          {/* 环绕飞行模拟飞行无人机：确认后先沿直线切入盘旋圆，再绕圆持续盘旋
              （fixed 视口定位 + 航向旋转，无限循环播放，面板取消/重新取点后消失） */}
          {orbitFlight && (
            <img
              className="tap-return-drone"
              src={orbitFlight.icon}
              alt=""
              draggable={false}
              style={{
                left: orbitFlight.x,
                top: orbitFlight.y,
                transform: `translate(-50%, -50%) rotate(${orbitFlight.angle}deg)`,
              }}
            />
          )}

          {/* 航点飞行模拟飞行无人机：确认后沿已生成航线循环飞向航点图钉
              （fixed 视口定位 + 航向旋转，无限循环播放，面板取消/重新取点后消失） */}
          {waypointFlight && (
            <img
              className="tap-return-drone"
              src={waypointFlight.icon}
              alt=""
              draggable={false}
              style={{
                left: waypointFlight.x,
                top: waypointFlight.y,
                transform: `translate(-50%, -50%) rotate(${waypointFlight.angle}deg)`,
              }}
            />
          )}

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
                      strokeWidth={routeFlightGenerated ? 3 : 1}
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

          {/* 航线飞行模拟飞行无人机：确认后沿已生成航线依次飞过各航点图钉
              （fixed 视口定位 + 航向旋转，到达末航点停留后回到首航点无限循环，
              面板取消/重新取点/删除航点后消失） */}
          {routeFlightFlight && (
            <img
              className="tap-return-drone"
              src={routeFlightFlight.icon}
              alt=""
              draggable={false}
              style={{
                left: routeFlightFlight.x,
                top: routeFlightFlight.y,
                transform: `translate(-50%, -50%) rotate(${routeFlightFlight.angle}deg)`,
              }}
            />
          )}

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
                  setAreaLandingRouteGenerated(false)
                }}
              >
                删除重绘
              </div>
            </div>
          )}

          {/* 区域降落降落坪编队（点击「航线生成」后）：在已确认区域内按所选降落编队
              布置「数量=选中飞机数」的降落坪图标，并用 1px #00FF95 绿色实线连接各
              选中飞机中心与其对应降落坪；编队/选区/选中飞机数变化时联动重排，
              再次航线生成（重绘）/取消/删除重绘时随状态清除 */}
          {areaLandingRect &&
            areaLandingRouteGenerated &&
            areaLandingSpots.length > 0 &&
            (() => {
              const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
              if (!stage) return null
              // 选中飞机按设备序号升序与降落坪一一对应（第 i 架 → 第 i 个降落坪）
              const picked = aircraft
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => selectedDevices.has(item.deviceIndex))
                .sort((a, b) => a.item.deviceIndex - b.item.deviceIndex)
              return (
                <>
                  <svg className="area-landing-route" aria-hidden="true">
                    {picked.map(({ index }, i) =>
                      areaLandingSpots[i] ? (
                        <line
                          key={index}
                          x1={stage.left + (aircraftPositions[index].x / 100) * stage.width + 24}
                          y1={stage.top + (aircraftPositions[index].y / 100) * stage.height + 24}
                          x2={areaLandingSpots[i].x}
                          y2={areaLandingSpots[i].y}
                          stroke="#00FF95"
                          strokeWidth={1}
                        />
                      ) : null,
                    )}
                  </svg>
                  {areaLandingSpots.map((spot, i) => (
                    <img
                      key={i}
                      className="area-landing-spot"
                      src={homeImages.areaLandingSpot}
                      style={{ left: spot.x, top: spot.y }}
                      alt="降落坪"
                      draggable={false}
                    />
                  ))}
                </>
              )
            })()}

          {/* 区域降落模拟飞行无人机：确认后各机沿航线连线循环飞向对应降落坪
              （fixed 视口定位 + 航向旋转，多机并行无限循环播放，面板取消/删除重绘后消失） */}
          {areaLandingFlights.map((flight, i) => (
            <img
              key={i}
              className="tap-return-drone"
              src={flight.icon}
              alt=""
              draggable={false}
              style={{
                left: flight.x,
                top: flight.y,
                transform: `translate(-50%, -50%) rotate(${flight.angle}deg)`,
              }}
            />
          ))}

          {/* 集结点集结坪编队 + 航线（点击「航线生成」后）：在已确认集结区域内按所选
              集结队形布置「数量=选中飞机数」的集结坪图标（area-landing-spot），并用
              1px #00FF95 绿色实线连接各选中飞机中心与其对应集结坪；队形/选区/选中
              飞机数变化时联动重排，重绘区域/取消/删除重绘时随状态清除 */}
          {rallyPointRect &&
            rallyPointRouteGenerated &&
            rallyPointSpots.length > 0 &&
            (() => {
              const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
              if (!stage) return null
              // 选中飞机按设备序号升序与集结坪一一对应（第 i 架 → 第 i 个集结坪）
              const picked = aircraft
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => selectedDevices.has(item.deviceIndex))
                .sort((a, b) => a.item.deviceIndex - b.item.deviceIndex)
              return (
                <>
                  <svg className="area-landing-route" aria-hidden="true">
                    {picked.map(({ index }, i) =>
                      rallyPointSpots[i] ? (
                        <line
                          key={index}
                          x1={stage.left + (aircraftPositions[index].x / 100) * stage.width + 24}
                          y1={stage.top + (aircraftPositions[index].y / 100) * stage.height + 24}
                          x2={rallyPointSpots[i].x}
                          y2={rallyPointSpots[i].y}
                          stroke="#00FF95"
                          strokeWidth={1}
                        />
                      ) : null,
                    )}
                  </svg>
                  {rallyPointSpots.map((spot, i) => (
                    <img
                      key={i}
                      className="area-landing-spot"
                      src={homeImages.areaLandingSpot}
                      style={{ left: spot.x, top: spot.y }}
                      alt="集结坪"
                      draggable={false}
                    />
                  ))}
                </>
              )
            })()}

          {/* 集结点模拟飞行无人机：确认后各机沿航线连线循环飞向对应集结坪
              （fixed 视口定位 + 航向旋转，多机并行无限循环播放，取消面板/删除重绘后消失） */}
          {rallyPointFlights.map((flight, i) => (
            <img
              key={i}
              className="tap-return-drone"
              src={flight.icon}
              alt=""
              draggable={false}
              style={{
                left: flight.x,
                top: flight.y,
                transform: `translate(-50%, -50%) rotate(${flight.angle}deg)`,
              }}
            />
          ))}

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
                  // 删除重绘：终止循环动画并清除航线生成态与已确认区域
                  stopRallyPointFlights()
                  setRallyPointRouteGenerated(false)
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
                  // 绘制阶段（未定格）隐藏原生光标：area-landing-cursor 切图 54×54 超出
                  // 浏览器 32×32 光标上限，cursor:url() 会回退成十字准线，改由下方 DOM
                  // 图片跟随鼠标；选区定格（松开左键）后恢复默认光标便于点击
                  // 「确定/取消」，点击「取消」回到绘制态后再次隐藏
                  cursor: areaSelectAnchor && !areaSelectDragging ? 'default' : 'none',
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
                  // 拖动中实时更新选区终点；绘制阶段同步更新跟随光标位置
                  if (areaSelectDragging) setAreaSelectEnd({ x: e.clientX, y: e.clientY })
                  setAreaSelectHover({ x: e.clientX, y: e.clientY })
                }}
                onMouseUp={() => setAreaSelectDragging(false)}
                /* 鼠标离开窗口：隐藏跟随光标（回到窗口内由 mousemove 恢复） */
                onMouseLeave={() => setAreaSelectHover(null)}
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
                {/* 框选模式全程跟随光标：停机坪图标图片（54×54，中心对准鼠标）替代原生
                    光标，选区定格后同样保持（不恢复系统箭头）；pointer-events:none
                    不拦截框选拖拽与「确认/取消」按钮点击 */}
                {areaSelectHover && !(areaSelectAnchor && !areaSelectDragging) && (
                  <img
                    className="area-select-cursor"
                    src={homeImages.areaLandingCursor}
                    style={{ left: areaSelectHover.x, top: areaSelectHover.y }}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                  />
                )}
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
                                  // 重绘新区域后旧航线/集结坪失效，需重新点「航线生成」
                                  setRallyPointRouteGenerated(false)
                                  stopRallyPointFlights()
                                } else {
                                  setAreaLandingRect({ left, top, width, height })
                                  setAreaLandingRouteGenerated(false)
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
                                // 取消本次绘制：仅清除定格选区回到绘制态（光标恢复停机坪
                                // 图标）可重新绘制；框选模式与面板均保持展开，不退出
                                setAreaSelectAnchor(null)
                                setAreaSelectEnd(null)
                                setAreaSelectDragging(false)
                                if (areaSelectSource === 'rally-point') {
                                  setRallyPointRect(null)
                                  setRallyPointRouteGenerated(false)
                                  stopRallyPointFlights()
                                } else {
                                  setAreaLandingRect(null)
                                  setAreaLandingCorners(null)
                                  setAreaLandingRouteGenerated(false)
                                }
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
