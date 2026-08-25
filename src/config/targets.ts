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
  /** 目标名称（如「01目标车辆」「01目标人」） */
  name: string
  /** 目标类型：车辆 → tank.png / 人员 → people.png */
  type: TargetType
  /** 状态文字（如「默认侦查」） */
  status: string
  /** 发现源（首次侦测到该目标的平台，如「无人机02」） */
  source: string
  /** 威胁半径（如「050m」） */
  threatRadius: string
  /** 目标高度（如「120m」） */
  altitude: string
  /** 打击方式（如「单向序贯」「同时齐射」） */
  strikeMode: string
  /** 目标位置经纬度文字（如「Lat:30.123, Lon:120.456」） */
  position: string
  /** 首次发现时间（YYYY/MM/DD HH:mm:ss） */
  firstSeenAt: string
  /** 最后更新时间（YYYY/MM/DD HH:mm:ss） */
  lastUpdatedAt: string
}

/** 目标类型筛选选项 */
export const targetTypeOptions = ['车辆', '人员'] as const

/** 初始目标列表：车辆/人员随机交替，图标随 type 切换，
 *  详情字段（发现源/威胁半径/高度/打击方式/位置/时间）为 mock 占位值 */
export const targetList: TargetItem[] = [
  {
    id: '01',
    name: '01目标车辆',
    type: '车辆',
    status: '默认侦查',
    source: '无人机02',
    threatRadius: '050m',
    altitude: '120m',
    strikeMode: '单向序贯',
    position: 'Lat:30.123, Lon:120.456',
    firstSeenAt: '2026/07/28 14:24:56',
    lastUpdatedAt: '2026/07/28 14:24:56',
  },
  {
    id: '02',
    name: '02目标人',
    type: '人员',
    status: '默认侦查',
    source: '光电吊舱',
    threatRadius: '030m',
    altitude: '000m',
    strikeMode: '同时齐射',
    position: 'Lat:30.223, Lon:120.512',
    firstSeenAt: '2026/07/28 14:25:10',
    lastUpdatedAt: '2026/07/28 14:25:10',
  },
  {
    id: '03',
    name: '03目标车辆',
    type: '车辆',
    status: '默认侦查',
    source: '雷达站A',
    threatRadius: '080m',
    altitude: '200m',
    strikeMode: '二次打击',
    position: 'Lat:30.310, Lon:120.601',
    firstSeenAt: '2026/07/28 14:26:32',
    lastUpdatedAt: '2026/07/28 14:26:32',
  },
  {
    id: '04',
    name: '04目标人',
    type: '人员',
    status: '默认侦查',
    source: '无人机05',
    threatRadius: '020m',
    altitude: '000m',
    strikeMode: '单向序贯',
    position: 'Lat:30.405, Lon:120.703',
    firstSeenAt: '2026/07/28 14:27:48',
    lastUpdatedAt: '2026/07/28 14:27:48',
  },
  {
    id: '05',
    name: '05目标车辆',
    type: '车辆',
    status: '默认侦查',
    source: '卫星侦察',
    threatRadius: '100m',
    altitude: '350m',
    strikeMode: '同时齐射',
    position: 'Lat:30.512, Lon:120.812',
    firstSeenAt: '2026/07/28 14:28:15',
    lastUpdatedAt: '2026/07/28 14:28:15',
  },
  {
    id: '06',
    name: '06目标人',
    type: '人员',
    status: '默认侦查',
    source: '光电吊舱',
    threatRadius: '025m',
    altitude: '000m',
    strikeMode: '二次打击',
    position: 'Lat:30.623, Lon:120.921',
    firstSeenAt: '2026/07/28 14:29:03',
    lastUpdatedAt: '2026/07/28 14:29:03',
  },
  {
    id: '07',
    name: '07目标车辆',
    type: '车辆',
    status: '默认侦查',
    source: '雷达站A',
    threatRadius: '060m',
    altitude: '150m',
    strikeMode: '单向序贯',
    position: 'Lat:30.715, Lon:121.014',
    firstSeenAt: '2026/07/28 14:30:27',
    lastUpdatedAt: '2026/07/28 14:30:27',
  },
]
