/**
 * @file ProModel.ts
 * @description ProModel —— 专业模式面板的数据模型（类型 / 默认值 / 选项 / 校验规则 / mock 数据）。 从 TaskProPanel.tsx 抽离（单一职责：纯数据与校验，无 UI 依赖），供各步骤组件共用。
 * @author 4everyy
 * @date 2026-10-07
 */

/** 任务区 mock 数据（01-07 共 7 行：名称/类型/面积；专业模式步骤 4 航线生成页任务区下拉选项） */
export const AREAS = [
  { id: 'a1', name: '厂区北侧', type: '巡检区', area: '2.4km²' },
  { id: 'a2', name: '厂区南侧', type: '巡检区', area: '1.8km²' },
  { id: 'a3', name: '仓库区', type: '打击区', area: '0.9km²' },
  { id: 'a4', name: '办公区', type: '巡检区', area: '1.2km²' },
  { id: 'a5', name: '河堤段', type: '巡检区', area: '3.6km²' },
  { id: 'a6', name: '高压线', type: '巡检区', area: '4.1km²' },
  { id: 'a7', name: '围栏区', type: '打击区', area: '0.6km²' },
]

/** 无人机编成条目（专业模式步骤 2：名称/状态/高度/电量/经纬度，遥测字段为演示数据） */
export interface ForceDrone {
  id: string
  name: string
  /** 状态：待命=蓝点（默认编入）/ 任务中=绿点（不默认编入，仍可手动勾选）/ 离线=灰点… */
  status: '待命' | '任务中' | '离线'
  /** 相对高度 m */
  altitude: number
  /** 电量 %（低于 20 视为少电：图标电量条转红警示） */
  battery: number
  lon: number
  lat: number
  /** 置灰不可选（离线/故障） */
  disabled: boolean
}

/** 无人机编成 mock 数据（专业模式步骤 2：12 条演示数据验证列表滚动——空闲机可勾选，执行中=绿点不默认编入仍可手动勾选 */
export const FORCE_DRONES: ForceDrone[] = [
  { id: 'd1', name: '01中科晶锐', status: '待命', altitude: 40, battery: 88, lon: 109, lat: 32, disabled: false },
  { id: 'd2', name: '02中科晶锐', status: '待命', altitude: 60, battery: 12, lon: 109.01, lat: 32.01, disabled: false },
  { id: 'd3', name: '03中科晶锐', status: '待命', altitude: 80, battery: 45, lon: 109.02, lat: 32.02, disabled: false },
  { id: 'd4', name: '04中科晶锐', status: '待命', altitude: 100, battery: 67, lon: 109.03, lat: 32.03, disabled: false },
  { id: 'd5', name: '05中科晶锐', status: '待命', altitude: 120, battery: 12, lon: 109.04, lat: 32.04, disabled: false },
  { id: 'd6', name: '06中科晶锐', status: '任务中', altitude: 40, battery: 12, lon: 109.05, lat: 32.05, disabled: false },
  { id: 'd7', name: '07中科晶锐', status: '待命', altitude: 50, battery: 95, lon: 109.06, lat: 32.06, disabled: false },
  { id: 'd8', name: '08中科晶锐', status: '待命', altitude: 70, battery: 30, lon: 109.07, lat: 32.07, disabled: false },
  { id: 'd9', name: '09中科晶锐', status: '待命', altitude: 90, battery: 55, lon: 109.08, lat: 32.08, disabled: false },
  { id: 'd10', name: '10中科晶锐', status: '任务中', altitude: 110, battery: 42, lon: 109.09, lat: 32.09, disabled: false },
  { id: 'd11', name: '11中科晶锐', status: '待命', altitude: 130, battery: 76, lon: 109.1, lat: 32.1, disabled: false },
  { id: 'd12', name: '12中科晶锐', status: '离线', altitude: 40, battery: 8, lon: 109.11, lat: 32.11, disabled: true },
]

/** 状态列修饰类：任务中=绿点 / 离线=灰点+文字弱化 / 待命=默认蓝点 */
export const forceStatusMod = (status: ForceDrone['status']) =>
  status === '任务中'
    ? ' task-pro__force-status--busy'
    : status === '离线'
      ? ' task-pro__force-status--offline'
      : ''

/** 步骤元信息 */
export const PRO_STEPS = [
  { n: 1, label: '策略适配' },
  { n: 2, label: '力量编成' },
  { n: 3, label: '任务分配' },
  { n: 4, label: '航线生成' },
  { n: 5, label: '总览' },
] as const

/** 策略适配参数（步骤 1·区域巡检，设计稿 group_1555 全部字段） */
export interface ProStrategy {
  /** 打击方式 */
  strikeMode: string
  /** 规划方式 */
  planMode: string
  /** 区域进入位置 */
  entryMode: string
  /** 分配方式 */
  assignMode: string
  /** 避让方式 */
  avoidMode: string
  /** 避让距离（m，避让方式=无时隐藏） */
  avoidDist: number
  /** 障碍区准入 */
  obstacleAccess: string
  /** 突防飞行高度（m） */
  penHeight: number
  /** 突防飞行速度（m/s） */
  penSpeed: number
  /** 突防终点距离目标距离（m） */
  penDist: number
  /** 识别开关（开/关） */
  senseSwitch: string
}

/** 策略参数默认值… */
export const DEFAULT_STRATEGY: ProStrategy = {
  strikeMode: '单项序贯',
  planMode: '集中式',
  entryMode: '自动选择',
  assignMode: '风险最低',
  avoidMode: '绕飞',
  avoidDist: 10,
  obstacleAccess: '禁止进入障碍区',
  penHeight: 100,
  penSpeed: 5,
  penDist: 0,
  senseSwitch: '关',
}

/** 分段控件选项（首项为默认值） */
export const PRO_OPTIONS = {
  strikeMode: ['单项序贯', '待定'],
  planMode: ['集中式', '协商式'],
  entryMode: ['自动选择', '指定航线'],
  assignMode: ['风险最低', '效率最高', '时间优先'],
  avoidMode: ['绕飞', '爬高', '无'],
  obstacleAccess: ['禁止进入障碍区', '临时进入障碍区'],
} as const

/** 数值字段合法区间：越界实时标红并禁用「保存下一步」「快速创建」（PRD 验收 3） */
export const NUMERIC_RULES: Partial<Record<keyof ProStrategy, { min: number; max: number }>> = {
  avoidDist: { min: 0, max: 1000 },
  penHeight: { min: 0, max: 500 },
  penSpeed: { min: 0, max: 50 },
  penDist: { min: 0, max: 1000 },
}

/** 派生数值字段的越界标记（仅数值字段有键，两类策略表单共用） */
export function numericErrors<T extends object>(
  s: T,
  rules: Partial<Record<keyof T, { min: number; max: number }>>,
): Record<string, boolean | undefined> {
  const errs: Record<string, boolean | undefined> = {}
  for (const key of Object.keys(rules) as (keyof T & string)[]) {
    const rule = rules[key]!
    const v = s[key] as number
    errs[key] = Number.isNaN(v) || v < rule.min || v > rule.max
  }
  return errs
}

/** 策略适配参数（步骤 1·目标打击，设计稿步骤一全部字段） */
export interface StrikeStrategy {
  /** 巡检对象（可选项：人/车；船/装备设计稿置灰不可选） */
  inspectTargets: string[]
  /** 仿地高度（m） */
  terrainHeight: number
  /** 巡航速度（m/s） */
  cruiseSpeed: number
  /** 航线间隔（m） */
  routeGap: number
  /** 旁向重叠率（%） */
  sideOverlap: number
  /** 巡检转动作 */
  inspectAction: string
  /** 白夜模式 */
  dayNight: string
  /** 规划方式 */
  planMode: string
  /** 区域进入位置 */
  entryMode: string
  /** 分割方式 */
  splitMode: string
  /** 区域个数（个） */
  areaCount: number
  /** 切分方向 */
  splitDir: string
  /** 分配方式 */
  assignMode: string
  /** 避让方式 */
  avoidMode: string
  /** 避让距离（m，避让方式=无时隐藏） */
  avoidDist: number
  /** 集结方式 */
  rallyMode: string
  /** 障碍区准入 */
  obstacleAccess: string
  /** 突防飞行高度（m） */
  penHeight: number
  /** 突防飞行速度（m/s） */
  penSpeed: number
  /** 突防终点距离目标距离（m） */
  penDist: number
  /** 编队方式 */
  formationMode: string
  /** 补位方式 */
  fillMode: string
  /** 编队队形 */
  formationShape: string
  /** 是否启用编队（开/关） */
  formationEnabled: boolean
  /** 识别开关（开/关） */
  senseSwitch: boolean
}

/** 目标打击策略默认值（设计稿标注：巡检对象默认选中「车」；仿地高度/巡航速度/航线间隔/区域个数/突防飞行高度·速度=100 */
export const DEFAULT_STRIKE: StrikeStrategy = {
  inspectTargets: ['车'],
  terrainHeight: 100,
  cruiseSpeed: 100,
  routeGap: 100,
  sideOverlap: 0.5,
  inspectAction: '无',
  dayNight: '白天',
  planMode: '集中式',
  entryMode: '自动选择',
  splitMode: '指定个数',
  areaCount: 100,
  splitDir: '长边',
  assignMode: '风险最低',
  avoidMode: '默认绕飞',
  avoidDist: 1,
  rallyMode: '无',
  obstacleAccess: '禁止进入障碍区',
  penHeight: 100,
  penSpeed: 100,
  penDist: 0,
  formationMode: '长机跟随',
  fillMode: '自动补位',
  formationShape: '人字形',
  formationEnabled: true,
  senseSwitch: true,
}

/** 目标打击·分段控件选项（首项为默认值） */
export const STRIKE_OPTIONS = {
  inspectAction: ['无', '盘旋', '打击'],
  dayNight: ['白天', '夜晚'],
  planMode: ['集中式', '协商式'],
  entryMode: ['自动选择', '指定航线'],
  splitMode: ['指定个数', '标准区域大小', '按完成时'],
  splitDir: ['长边', '短边'],
  assignMode: ['风险最低', '效率最高', '时间优先'],
  avoidMode: ['默认绕飞', '爬高', '无'],
  rallyMode: ['无', '指定区域集结'],
  obstacleAccess: ['禁止进入障碍区', '临时进入障碍区'],
  formationMode: ['长机跟随', '宫正方阵'],
  fillMode: ['自动补位', '内容待定'],
  formationShape: ['人字形', '宫正方阵', '一字形', '水平一字'],
} as const

/** 目标打击·数值字段合法区间：越界实时标红并禁用「保存下一步」「快速创建」 */
export const STRIKE_NUMERIC_RULES: Partial<Record<keyof StrikeStrategy, { min: number; max: number }>> = {
  terrainHeight: { min: 0, max: 1000 },
  cruiseSpeed: { min: 0, max: 200 },
  routeGap: { min: 0, max: 1000 },
  sideOverlap: { min: 0, max: 100 },
  areaCount: { min: 1, max: 999 },
  avoidDist: { min: 0, max: 1000 },
  penHeight: { min: 0, max: 1000 },
  penSpeed: { min: 0, max: 200 },
  penDist: { min: 0, max: 1000 },
}

/** 巡检对象选项：人/车 可选，船/装备 置灰不可选（设计稿默认态） */
export const INSPECT_TARGET_OPTIONS = [
  { key: '人', disabled: false },
  { key: '车', disabled: false },
  { key: '船', disabled: true },
  { key: '装备', disabled: true },
] as const

/** 数值越界标记表（两类策略表单共用 numericErrors 的输出类型） */
export type NumericErrorMap = Record<string, boolean | undefined>