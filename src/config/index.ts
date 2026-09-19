import { homeImages } from '../assets/images/home/index'
import { deviceImages } from '../assets/images/device/index'


// 告警颜色（原 src/types.ts，合并至告警相关公共配置）
export type AlarmColor = 'orange' | 'blue' | 'red'

// 顶栏右上角告警徽章图标（按显示顺序：红、橙、蓝）
export const ALARM_BADGES: string[] = [
  homeImages.alarmBadgeRed,
  homeImages.alarmBadgeOrange,
  homeImages.alarmBadgeBlue,
]


export interface Aircraft {
  src: string
  className: string
  label: string
  /** 对应设备管理面板 deviceList 的下标，用于 hover/选中双向联动 */
  deviceIndex: number
}

export const aircraft: Aircraft[] = [
  { src: homeImages.aircraftRed, className: 'aircraft aircraft--red', label: '01设备', deviceIndex: 0 },
  { src: homeImages.aircraftOrange, className: 'aircraft aircraft--orange', label: '03设备', deviceIndex: 2 },
  { src: homeImages.aircraftBlue, className: 'aircraft aircraft--blue', label: '04设备', deviceIndex: 3 },
  { src: homeImages.aircraftGray, className: 'aircraft aircraft--gray', label: '02设备', deviceIndex: 1 },
  { src: homeImages.aircraftBlue, className: 'aircraft aircraft--blue2', label: '05设备', deviceIndex: 4 },
]

/**
 * MapLibre 地图配置。
 *
 * 集中管理 MapLibre GL JS 的默认样式、中心点（WGS84）、缩放级别与交互选项，
 * 便于在多组件间共享与统一调整。
 */

/**
 * 默认中心点（WGS84）。
 *
 * 通过环境变量 VITE_MAPLIBRE_CENTER_LNG / VITE_MAPLIBRE_CENTER_LAT 配置。
 * 默认苏州市中心（120.6, 31.3），与本地瓦片数据覆盖范围匹配。
 * 深圳/其他区域部署时，在 .env.local 中覆盖即可。
 */
export const MAPLIBRE_DEFAULT_CENTER = {
  lng: Number(import.meta.env.VITE_MAPLIBRE_CENTER_LNG ?? 120.6),
  lat: Number(import.meta.env.VITE_MAPLIBRE_CENTER_LAT ?? 31.3),
}

/** 默认缩放级别（可通过 VITE_MAPLIBRE_DEFAULT_ZOOM 覆盖） */
export const MAPLIBRE_DEFAULT_ZOOM = Number(
  import.meta.env.VITE_MAPLIBRE_DEFAULT_ZOOM ?? 12,
)

/**
 * 地图样式与底图来源。
 *
 * 离线地图包方案下，地图样式由「离线地图包」驱动（见 src/features/offline-map，P1+ 实现）：
 * 运行时 MapLibre 通过 gcs-pkg:// 自定义协议从 IndexedDB 读取已导入的 MBTiles 包渲染；
 * 尚未导入任何包时，MapLibreContainer 渲染纯色占位底图。本文件只保留与样式无关的
 * 地图初始化常量（中心点 / 缩放 / 交互选项），不再持有任何瓦片服务器或样式 URL 配置。
 */

/**
 * MapLibre 地图初始化选项。
 */
export const MAPLIBRE_MAP_OPTIONS = {
  /** 最大缩放级别（写死，与苏州离线包 z9-18 数据层级对齐） */
  maxZoom: 18,
  /** 最小缩放级别（写死，与苏州离线包 z9-18 数据层级对齐，z9 以下无瓦片数据） */
  minZoom: 9,
  /**
   * 关闭右下角版权归属控件。
   *
   * 默认 MapLibre 会渲染 AttributionControl，显示数据来源信息，
   * 项目 UI 规范不需要这些控件，故全局关闭。
   */
  attributionControl: false,
} as const


export interface ToolbarItem {
  label: string
  icon: string
  background: {
    normal: string
    hover: string
    active: string
  }
}

/** 所有按钮共用的新背景图（来自 device 目录） */
const BTN_BG = {
  normal: deviceImages.menuBtnNormal,
  hover: deviceImages.menuBtnHover,
  active: deviceImages.menuBtnActive,
}

export const toolbarItems: ToolbarItem[] = [
  {
    label: '设备管理',
    icon: homeImages.iconFormation,
    background: BTN_BG,
  },
  {
    label: '区域规划',
    icon: homeImages.iconAreaPlanning,
    background: BTN_BG,
  },
  {
    label: '历史轨迹',
    icon: homeImages.iconHistory,
    background: BTN_BG,
  },
  {
    label: '任务列表',
    icon: homeImages.iconTask,
    background: BTN_BG,
  },
  {
    label: '目标列表',
    icon: deviceImages.target,
    background: BTN_BG,
  },
]


export interface DeviceTelemetry {
  longitude: string
  velocityY: string
  latitude: string
  yaw: string
  elevation: string
  roll: string
  altitude: string
  voltage: string
  delay: string
  pitch: string
  battery: string
  gps: string
  time: string
}

// 设备状态类型
export type DeviceStatus = 'tasking' | 'standby' | 'offline' | 'charging'
// 电池等级
export type BatteryLevel = 'full' | 'mid' | 'low'

export interface Device {
  name: string
  telemetry?: DeviceTelemetry
  // 新设计稿字段
  status: DeviceStatus
  statusText: string
  altitudeValue: string
  batteryLevel: BatteryLevel
  batteryValue: string
  /** 设备类型图标颜色：blue(在线蓝标) / gray(离线灰标) */
  deviceType: 'blue' | 'gray'
  /** 是否充电中（影响电量图标的显示方式） */
  isCharging?: boolean
}

const firstTelemetry: DeviceTelemetry = {
  longitude: '109.10',
  velocityY: '40.06',
  latitude: '32.21',
  yaw: '103.10',
  elevation: '90.47',
  roll: '0.57',
  altitude: '40.90',
  voltage: '17.05KV',
  delay: '20ms',
  pitch: '-7.16',
  battery: '40%',
  gps: '信号中',
  time: '2026/07/28  14:24:56',
}

export const deviceList: Device[] = [
  {
    name: '01中科晶锐',
    telemetry: firstTelemetry,
    status: 'tasking',
    statusText: '任务中',
    altitudeValue: '40m',
    batteryLevel: 'full',
    batteryValue: '100%',
    deviceType: 'gray',
  },
  {
    name: '02中科晶锐',
    status: 'offline',
    statusText: '离线',
    altitudeValue: '40m',
    batteryLevel: 'low',
    batteryValue: '12%',
    deviceType: 'gray',
  },
  {
    name: '03中科晶锐',
    status: 'standby',
    statusText: '待命',
    altitudeValue: '400m',
    batteryLevel: 'mid',
    batteryValue: '40%',
    deviceType: 'blue',
  },
  {
    name: '04中科晶锐',
    status: 'tasking',
    statusText: '任务中',
    altitudeValue: '40m',
    batteryLevel: 'low',
    batteryValue: '12%',
    deviceType: 'gray',
  },
  {
    name: '05中科晶锐',
    status: 'tasking',
    statusText: '任务中',
    altitudeValue: '40m',
    batteryLevel: 'mid',
    batteryValue: '40%',
    deviceType: 'gray',
    isCharging: true,
  },
]

// 根据电池等级获取对应图标
export function getBatteryIcon(level: BatteryLevel): string {
  switch (level) {
    case 'full':
      return deviceImages.batteryFull
    case 'mid':
      return deviceImages.batteryMid
    case 'low':
      return deviceImages.batteryLow
  }
}

// 根据状态获取状态文字颜色
export function getStatusColor(status: DeviceStatus): string {
  switch (status) {
    case 'tasking':
      return '#7BFF00'
    case 'standby':
      return '#7BFF00'
    case 'offline':
      return '#BD1010'
    case 'charging':
      return '#7BFF00'
  }
}

/**
 * 目标列表 mock 数据
 *
 * 与 devices.ts 同构：静态列表数据 + 筛选选项，
 * 后续接入后端时替换为接口数据即可。
 */

export type TargetType = '车辆' | '人员'

export interface TargetItem {
  /** 目标编号 */
  id: string
  /** 目标名称（如「01目标车辆」「04目标人」） */
  name: string
  /** 目标类型：车辆 → tank.png / 人员 → people.png */
  type: TargetType
  /** 目标型号（如「99式坦克」「武装人员」） */
  model?: string
  /** 状态文字（如「移动」「静止」） */
  status: string
  /** 目标价值（如「高价值」「低价值」） */
  value: string
  /** 发现源（首次侦测到该目标的平台，如「无人机02」） */
  source: string
  /** 威胁半径（如「150m」，三位占位格式与接口 fmtMeters 一致） */
  threatRadius?: string
  /** 目标高度（如「020m」，三位占位格式与接口 fmtMeters 一致） */
  altitude?: string
  /** 打击方式（如「单向序贯」「同时齐射」） */
  strikeMode: string
  /** 目标位置经纬度（如「经度:120.456°, 纬度:30.123°」） */
  position: string
  /** 直角坐标系（如「X:120m, Y:200m」） */
  coordinates?: string
  /** 首次发现时间（YYYY/MM/DD HH:mm:ss） */
  firstSeenAt: string
  /** 最后更新时间（YYYY/MM/DD HH:mm:ss） */
  lastUpdatedAt: string
}

/** 目标类型筛选选项 */
export const targetTypeOptions = ['车辆', '人员'] as const

/** 初始目标列表：车辆与人员交错（车辆 01/03/05 + 人员 02/04），
 *  图标随 type 切换（车辆 → tank / 人员 → people），
 *  型号/价值/状态按设计稿行格式（如「99式坦克」「高价值」「移动」），
 *  详情字段（发现源/威胁半径/目标高度/打击方式/位置/直角坐标/时间）全部给 mock 值，
 *  行内详情展开后无任何属性为空 */
export const targetList: TargetItem[] = [
  {
    id: '01',
    name: '01目标车辆',
    type: '车辆',
    model: '99式坦克',
    status: '移动',
    value: '高价值',
    source: '无人机02',
    threatRadius: '150m',
    altitude: '020m',
    strikeMode: '单向序贯',
    position: '经度:120.456°, 纬度:30.123°',
    coordinates: 'X:120m, Y:200m',
    firstSeenAt: '2026/07/28 14:24:56',
    lastUpdatedAt: '2026/07/28 14:24:56',
  },
  {
    id: '02',
    name: '02目标人',
    type: '人员',
    model: '武装人员',
    status: '静止',
    value: '高价值',
    source: '光电吊舱',
    threatRadius: '050m',
    altitude: '002m',
    strikeMode: '同时齐射',
    position: '经度:120.512°, 纬度:30.223°',
    coordinates: 'X:080m, Y:150m',
    firstSeenAt: '2026/07/28 14:25:10',
    lastUpdatedAt: '2026/07/28 14:25:10',
  },
  {
    id: '03',
    name: '03目标车辆',
    type: '车辆',
    model: '96A式坦克',
    status: '移动',
    value: '高价值',
    source: '雷达站A',
    threatRadius: '200m',
    altitude: '018m',
    strikeMode: '二次打击',
    position: '经度:120.601°, 纬度:30.310°',
    coordinates: 'X:200m, Y:320m',
    firstSeenAt: '2026/07/28 14:26:32',
    lastUpdatedAt: '2026/07/28 14:26:32',
  },
  {
    id: '04',
    name: '04目标人',
    type: '人员',
    model: '侦察人员',
    status: '静止',
    value: '低价值',
    source: '无人机05',
    threatRadius: '030m',
    altitude: '001m',
    strikeMode: '单向序贯',
    position: '经度:120.703°, 纬度:30.405°',
    coordinates: 'X:050m, Y:090m',
    firstSeenAt: '2026/07/28 14:27:48',
    lastUpdatedAt: '2026/07/28 14:27:48',
  },
  {
    id: '05',
    name: '05目标车辆',
    type: '车辆',
    model: '04A步战车',
    status: '移动',
    value: '高价值',
    source: '卫星侦察',
    threatRadius: '260m',
    altitude: '025m',
    strikeMode: '同时齐射',
    position: '经度:120.812°, 纬度:30.512°',
    coordinates: 'X:260m, Y:410m',
    firstSeenAt: '2026/07/28 14:28:15',
    lastUpdatedAt: '2026/07/28 14:28:15',
  },
]

/**
 * 任务列表面板 mock 数据
 *
 * 与 devices.ts / targets.ts 同构：静态列表数据 + 筛选选项，
 * 后续接入后端时替换为接口数据即可。
 */

export type TaskType = '巡检任务' | '打击任务'
export type TaskStatus = '已下发' | '未下发'

/** 任务详情内单个执行设备卡片 */
export interface TaskDevice {
  id: string
  /** 设备名称（如「01中科晶锐」） */
  name: string
  /** 卡片徽标类型：
   *  online  绿色圆底 + 无人机图标 drone-white.png（代表该行已下发成功）
   *  locate  蓝色圆底 + 定位图标（未下发成功的设备行） */
  badge: 'online' | 'locate'
}

export interface TaskItem {
  id: string
  /** 任务名称（如「01巡检任务」） */
  name: string
  /** 任务类型：巡检任务 / 打击任务（行首图标不同） */
  type: TaskType
  /** 下发状态：已下发（绿点）/ 未下发（蓝点） */
  status: TaskStatus
  /** 创建时间（YYYY/MM/DD HH:mm:ss） */
  createdAt: string
  /** 详情展开后显示的执行设备卡片列表
   *  （左侧全部渲染，视口最多显示 4 行，超出下拉滚动查看；
   *   右侧「下发进程」= 全部设备中 online 行数 / 设备总数，以 x/x 形式展示） */
  devices: TaskDevice[]
}

/** 任务类型筛选选项 */
export const taskTypeOptions = ['巡检任务', '打击任务'] as const

/* ====== 执行监控 tab ====== */

/** 执行监控：任务执行状态——列表仅存在「执行中」状态 */
export type MonitorTaskStatus = '执行中'

/** 执行监控：任务内单个执行对象（无人机）的执行情况 */
export interface MonitorDevice {
  id: string
  /** 执行对象名称（如「01中科晶锐」） */
  name: string
  /** 执行状态（如「执行中」） */
  status: string
  /** 已执行时长（如「123min」） */
  duration: string
  /** 执行详情（如「航线 3/8」） */
  detail: string
  /** 当前执行对象（行高亮，对应设计稿 box_5 半透明白底） */
  active?: boolean
}

/** 执行监控 tab 的任务行数据 */
export interface MonitorTaskItem {
  id: string
  /** 任务名称（如「01巡检任务」） */
  name: string
  /** 任务类型：巡检任务 / 打击任务（行首图标不同） */
  type: TaskType
  /** 执行状态 */
  status: MonitorTaskStatus
  /** 执行开始时间（YYYY/MM/DD HH:mm:ss） */
  startedAt: string
  /** 执行进度百分比 0-100（行内小圆环） */
  progress: number
  /** 执行对象列表（展开后时间轴节点） */
  devices: MonitorDevice[]
}

/** 执行监控初始列表：首个任务默认展开（对应设计稿 box_2 展开态），
 *  下方两个为收起态任务行（box_13 / box_16） */
export const monitorTaskList: MonitorTaskItem[] = [
  {
    id: 'm1',
    name: '01巡检任务',
    type: '巡检任务',
    status: '执行中',
    startedAt: '2026/07/28 14:24:56',
    progress: 45,
    devices: [
      { id: 'd1', name: '01中科晶锐', status: '执行中', duration: '123min', detail: '执行详情' },
      {
        id: 'd2',
        name: '01中科晶锐',
        status: '执行中',
        duration: '123min',
        detail: '执行详情',
        active: true,
      },
      { id: 'd3', name: '01中科晶锐', status: '执行中', duration: '123min', detail: '执行详情' },
      { id: 'd4', name: '01中科晶锐', status: '执行中', duration: '123min', detail: '执行详情' },
    ],
  },
  {
    id: 'm2',
    name: '02巡检任务',
    type: '巡检任务',
    status: '执行中',
    startedAt: '2026/07/28 14:24:56',
    progress: 72,
    devices: [{ id: 'd1', name: '01中科晶锐', status: '执行中', duration: '123min', detail: '执行详情' }],
  },
  {
    id: 'm3',
    name: '01打击任务',
    type: '打击任务',
    status: '执行中',
    startedAt: '2026/07/28 14:24:56',
    progress: 8,
    devices: [{ id: 'd1', name: '01中科晶锐', status: '执行中', duration: '123min', detail: '执行详情' }],
  },
  {
    id: 'm4',
    name: '02打击任务',
    type: '打击任务',
    status: '执行中',
    startedAt: '2026/07/28 15:37:22',
    progress: 15,
    devices: [
      { id: 'd1', name: '01中科晶锐', status: '执行中', duration: '12min', detail: '目标 1/4', active: true },
      { id: 'd2', name: '01中科晶锐', status: '执行中', duration: '12min', detail: '目标 0/4' },
    ],
  },
]

/** 初始任务列表：首个任务默认展开（设计稿 group_10 展开态）。
 *  下发进程实时计算：全部设备中 online 行数（drone-white 图标）/ 设备总数，
 *  以 x/x 形式展示 */
export const taskList: TaskItem[] = [
  {
    id: '01',
    name: '01巡检任务',
    type: '巡检任务',
    status: '已下发',
    createdAt: '2026/07/28 14:24:56',
    // 6 行设备：视口最多显示 4 行，d5/d6 下拉滚动查看，下发进程按全部 6 行计算
    devices: [
      { id: 'd1', name: '01中科晶锐', badge: 'online' },
      { id: 'd2', name: '02中科晶锐', badge: 'online' },
      { id: 'd3', name: '03中科晶锐', badge: 'online' },
      { id: 'd4', name: '04中科晶锐', badge: 'online' },
      { id: 'd5', name: '05中科晶锐', badge: 'locate' },
      { id: 'd6', name: '06中科晶锐', badge: 'locate' },
    ],
  },
  {
    id: '02',
    name: '01打击任务',
    type: '打击任务',
    status: '未下发',
    createdAt: '2026/07/28 14:24:56',
    devices: [
      { id: 'd1', name: '01中科晶锐', badge: 'locate' },
      { id: 'd2', name: '02中科晶锐', badge: 'locate' },
      { id: 'd3', name: '03中科晶锐', badge: 'locate' },
      { id: 'd4', name: '04中科晶锐', badge: 'locate' },
      { id: 'd5', name: '05中科晶锐', badge: 'locate' },
      { id: 'd6', name: '06中科晶锐', badge: 'locate' },
    ],
  },
  {
    id: '03',
    name: '02打击任务',
    type: '打击任务',
    status: '已下发',
    createdAt: '2026/07/28 14:24:56',
    devices: [
      { id: 'd1', name: '01中科晶锐', badge: 'online' },
      { id: 'd2', name: '02中科晶锐', badge: 'online' },
      { id: 'd3', name: '03中科晶锐', badge: 'online' },
      { id: 'd4', name: '04中科晶锐', badge: 'online' },
      { id: 'd5', name: '05中科晶锐', badge: 'online' },
      { id: 'd6', name: '06中科晶锐', badge: 'online' },
    ],
  },
  {
    id: '04',
    name: '01打击任务',
    type: '打击任务',
    status: '未下发',
    createdAt: '2026/07/28 14:24:56',
    devices: [
      { id: 'd1', name: '01中科晶锐', badge: 'locate' },
      { id: 'd2', name: '02中科晶锐', badge: 'locate' },
      { id: 'd3', name: '03中科晶锐', badge: 'locate' },
      { id: 'd4', name: '04中科晶锐', badge: 'locate' },
      { id: 'd5', name: '05中科晶锐', badge: 'locate' },
      { id: 'd6', name: '06中科晶锐', badge: 'locate' },
    ],
  },
]
