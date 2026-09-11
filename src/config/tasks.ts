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