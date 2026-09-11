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
  /** 目标型号（如「99式坦克」「武装人员」） */
  model?: string
  /** 状态文字（如「移动」「静止」） */
  status: string
  /** 目标价值（如「高价值」「低价值」） */
  value: string
  /** 发现源（首次侦测到该目标的平台，如「无人机02」） */
  source: string
  /** 威胁半径（接口目标字段，如「050m」；mock 数据无此字段） */
  threatRadius?: string
  /** 目标高度（接口目标字段，如「120m」；mock 数据无此字段） */
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

/** 初始目标列表：车辆/人员随机交替，图标随 type 切换，
 *  型号/价值/状态按设计稿行格式（如「99式坦克」「高价值」「移动」），
 *  详情字段（发现源/打击方式/位置/直角坐标/时间）为 mock 占位值 */
export const targetList: TargetItem[] = [
  {
    id: '01',
    name: '01目标车辆',
    type: '车辆',
    model: '99式坦克',
    status: '移动',
    value: '高价值',
    source: '无人机02',
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
    strikeMode: '同时齐射',
    position: '经度:120.812°, 纬度:30.512°',
    coordinates: 'X:260m, Y:410m',
    firstSeenAt: '2026/07/28 14:28:15',
    lastUpdatedAt: '2026/07/28 14:28:15',
  },
]