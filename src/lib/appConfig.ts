/**
 * @file appConfig.ts
 * @description appConfig.ts（自 formationLayout.ts 拆出）—— 应用静态配置常量：飞机初始位置 / 地理锚点偏移 / 告警配色 / 底栏功能项 / 地图聚焦参数。纯数据，与布局算法独立变化（单一职责）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { type DragPosition } from '../hooks/index'
import { homeImages } from '../assets/home/index'
import { type AlarmColor } from '../config'
import { type LngLat } from '../map-engines/types'

export const AIRCRAFT_INITIAL_POSITIONS: DragPosition[] = [
  { x: 33, y: 22 }, // red (01设备)：左上
  { x: 56, y: 18 }, // orange (03设备)：中上偏右
  { x: 26, y: 48 }, // blue (04设备)：左中
  { x: 48, y: 58 }, // gray (02设备·离线)：中下
  { x: 38, y: 36 }, // blue2 (05设备)：中部
  // 06-09 号机（queryPlaneStatus 实测 9 架扩容）：右下侧空白带网格铺开
  { x: 64, y: 42 }, // 06设备：中部偏右
  { x: 72, y: 30 }, // 07设备：右上
  { x: 80, y: 46 }, // 08设备：右中
  { x: 68, y: 58 }, // 09设备：中下偏右
]

/** 飞机初始地理锚点相对「当前离线地图包中心」的偏移（度）。 */
export const AIRCRAFT_ANCHOR_OFFSETS: LngLat[] = [
  { lng: -0.0077, lat: 0.0098 }, // red (01设备)：左上
  { lng: 0.0027, lat: 0.0112 }, // orange (03设备)：中上偏右
  { lng: -0.0108, lat: 0.0007 }, // blue (04设备)：左中
  { lng: -0.0009, lat: -0.0028 }, // gray (02设备·离线)：中下
  { lng: -0.0054, lat: 0.0049 }, // blue2 (05设备)：中部
  // 06-09 号机：与百分比布局同源换算（1% 宽 ≈ 0.00045° lng、1% 高 ≈ 0.00035° lat
  { lng: 0.0014, lat: -0.0032 }, // 06设备：中部偏右
  { lng: 0.005, lat: 0.001 }, // 07设备：右上
  { lng: 0.0086, lat: -0.0046 }, // 08设备：右中
  { lng: 0.0023, lat: -0.0102 }, // 09设备：中下偏右
]

/** 接口目标回退布局：无人机图标簇附近空白带的偏移池（相对当前离线地图包中心）。 */
export const TARGET_NEAR_AIRCRAFT_OFFSETS: LngLat[] = [
  { lng: 0.0021, lat: 0.004 },
  { lng: 0.0051, lat: 0.004 },
  { lng: 0.0081, lat: 0.004 },
  { lng: 0.0021, lat: 0 },
  { lng: 0.0051, lat: 0 },
  { lng: 0.0081, lat: 0 },
  { lng: 0.0021, lat: -0.004 },
  { lng: 0.0051, lat: -0.004 },
  { lng: 0.0081, lat: -0.004 },
  { lng: 0.0021, lat: -0.008 },
  { lng: 0.0051, lat: -0.008 },
  { lng: 0.0081, lat: -0.008 },
  { lng: 0.0021, lat: -0.012 },
  { lng: 0.0051, lat: -0.012 },
  { lng: 0.0081, lat: -0.012 },
]

/** 接口目标真实经纬度视为「当前视口可见」的最大偏移（相对包中心，度）。 */
export const TARGET_REAL_LNGLAT_MAX_OFFSET = { lng: 0.02, lat: 0.015 }

// 待接入功能的临时显示开关（false = 隐藏）：MissionPanel / 橙色禁飞区——功能就绪后置 true 或删除相关代码
export const SHOW_PENDING_PANELS = false

// 告警信息面板色调映射：与顶栏告警徽标…
export const ALARM_COLORS: AlarmColor[] = ['red', 'orange', 'blue']

// 告警详情面板收起动画时长（ms）：须与 AlarmPanels.css 中收起过渡时长（0.35s）一致。
export const ALARM_COLLAPSE_MS = 350

// 底部功能面板类型：起飞（TakeoffPanel）/ 降落（LandingPanel）/ 返…
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
  /** 选中设备数量要求：single = 恰好 1 台（单机功能） */
  mode?: 'single' | 'multi'
  width: number
  icon?: string
  tooltip?: string
  panel?: BottomBarPanel
}

// 底部水平居中按钮条：13 段背景切图按显示顺序（从左到右）编号拼接（高度统一 60px）。
export const BOTTOM_BAR_ITEMS: BottomBarItem[] = [
  {
    background: homeImages.bottomBarSeg1,
    // 未选中设备、全部…
    disabledBackground: homeImages.bottomBarSeg1Disabled,
    width: 119,
  },
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
  {
    background: homeImages.bottomBarSeg13,
    // 未选中设备、全部…
    disabledBackground: homeImages.bottomBarSeg13Disabled,
    width: 119,
  },
]
/** 面板单选聚焦：设备/目标面板单行勾上时地图 flyTo 的最低层级（当前更低时放大） */
export const MAP_FOCUS_ZOOM = 16
/** 面板单选聚焦飞转动画时长（ms） */
export const MAP_FOCUS_FLY_DURATION_MS = 1200
/** 区域列表行 hover 聚焦（fitBounds）视口边距：左 = 地图工具栏(64) +区域列表面板(466) + 间隙 */
export const AREA_FOCUS_PADDING = {
  left: 560,
  right: 510,
  top: 80,
  bottom: 80,
} as const
/** 区域聚焦 zoom 上限（小区域避免过度放大，fitBounds 自动钳制） */
export const AREA_FOCUS_MAX_ZOOM = 16
