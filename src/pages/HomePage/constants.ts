import type { DragPosition } from '../../hooks/useDraggable'
import { homeImages } from '../../assets/images/home'
import type { AlarmColor } from '../../types'

// 飞机初始位置（百分比），与 HomePage.css 中 .aircraft--xxx 的 left/top 保持一致。
// 拖拽后通过内联 style 覆盖 CSS 定位，实现自由拖动。
export const AIRCRAFT_INITIAL_POSITIONS: DragPosition[] = [
  { x: 10.6, y: 6.8 }, // red (01设备)
  { x: 68.8, y: 22 }, // orange (03设备)
  { x: 44.6, y: 35.4 }, // blue (04设备)
  { x: 56, y: 59 }, // gray (02设备·离线)
  { x: 33.7, y: 71.5 }, // blue2 (05设备)
]

// 巡检区域初始位置（百分比），与 HomePage.css 中 .inspection-zone 的 left/top 保持一致
export const INSPECTION_ZONE_INITIAL_POSITION: DragPosition = { x: 38.75, y: 25.5 }

// 待接入功能的临时显示开关（false = 隐藏）：
// MissionPanel / 橙色禁飞区——功能就绪后置 true 或删除相关代码
export const SHOW_PENDING_PANELS = false

// 告警信息面板色调映射：与顶栏告警徽标（红/橙/蓝，config/alarms.ts ALARM_BADGES 顺序）按下标一一对应
export const ALARM_COLORS: AlarmColor[] = ['red', 'orange', 'blue']

// 底部功能面板类型：起飞（TakeoffPanel）/ 降落（LandingPanel）/ 返航（ReturnHomePanel）/ 指点返航（TapReturnPanel）/ 区域降落（AreaLandingPanel）/ 悬停（HoverPanel）/ 航点飞行（WaypointFlightPanel）/ 航线飞行（RouteFlightPanel）/ 环绕飞行（OrbitFlightPanel）/ 集结点（RallyPointPanel）/ 编队飞行（FormationFlightPanel）
export type BottomBarPanel =
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

export interface BottomBarItem {
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
}

// 底部水平居中按钮条：13 段背景切图按显示顺序（从左到右）编号拼接（高度统一 60px）。
// width 为各切图原始宽度，经 aspect-ratio 与高度联动保持每段比例，整体随视口等比缩放。
// 各段切缝的水平间距补偿见 HomePage.css 中 .bottom-bar__item:nth-child 逐缝 margin 规则。
// 第 2~12 段为功能按钮：icon 为叠加在背景框体中心的功能图标（64×64 切图），
// tooltip 为悬停时显示于按钮上方的中文名称。
export const BOTTOM_BAR_ITEMS: BottomBarItem[] = [
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