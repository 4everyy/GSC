import { useState, type CSSProperties } from 'react'
import { type TaskType } from '../../config/index'
import { taskPanelImages } from '../../assets/images/task-panel'
import iconFormation from '../../assets/images/home/icon-formation-crop.png'
import { deviceImages } from '../../assets/images/device'
import './TaskCreatePanel.css'
import './TaskProPanel.css'

/**
 * TaskPanels —— 任务创建流程面板合集（均内嵌于任务管理面板内容区展示）。
 * TaskCreatePanel：创建任务基础信息表单（名称/数量/方式/策略/类型 + 任务区选择）；
 * TaskProPanel：专业模式策略配置（PRD TSK-P0-03：步骤条 + 步骤 1 策略适配 / 2 力量编成 /
 * 3 任务分配（设备+区域/目标合并卡片）/ 4 航线生成（占位）/ 5 总览向导）。
 * 样式分属两个 .css，均为「透底内嵌」策略：背景/边框由任务面板外壳（.task-panel）提供。
 */

// ==================== 「创建任务」基础表单（设计稿 group_23）====================
// 表单字段与任务列表联动：任务名称 / 执行对象数量（步进器）/ 执行方式 / 失联执行策略 / 任务类型；
// 任务区选择：全选 + 任务区列表（01 区域名称/区域类型/区域面积），支持勾选与添加；底部：一键创建 / 专业模式。
export interface TaskCreateFormValue {
  name: string
  targetCount: number
  execMode: ExecMode
  lostPolicy: LostPolicy
  taskType: TaskCreateType
  selectedAreaIds: string[]
}

export type ExecMode = '单次执行' | '周期执行'
export type LostPolicy = '继续执行' | '返航'
export type TaskCreateType = Extract<TaskType, '巡检任务' | '打击任务'>

/** 设计稿切图资源（src/assets/images/task-panel/，经 Vite 构建哈希化） */
const CreateIMAGES = {
  addAreaIcon: taskPanelImages.addAreaIcon,
  backArrow: taskPanelImages.backArrow,
  inputBg: taskPanelImages.createInputBg,
  stepperMinus: taskPanelImages.stepperMinus,
  stepperPlus: taskPanelImages.stepperPlus,
  infoIcon: taskPanelImages.infoIcon,
  infoIconDot: taskPanelImages.infoIconDot,
  checkboxUnchecked: taskPanelImages.checkboxUnchecked,
  areaIndexIcon: taskPanelImages.areaIndexIcon,
  targetRightIcon: taskPanelImages.targetRightIcon,
} as const

/** 任务区 mock 数据（01-07 共 7 行：名称/类型/面积） */
const AREAS = [
  { id: 'a1', name: '厂区北侧', type: '巡检区', area: '2.4km²' },
  { id: 'a2', name: '厂区南侧', type: '巡检区', area: '1.8km²' },
  { id: 'a3', name: '仓库区', type: '打击区', area: '0.9km²' },
  { id: 'a4', name: '办公区', type: '巡检区', area: '1.2km²' },
  { id: 'a5', name: '河堤段', type: '巡检区', area: '3.6km²' },
  { id: 'a6', name: '高压线', type: '巡检区', area: '4.1km²' },
  { id: 'a7', name: '围栏区', type: '打击区', area: '0.6km²' },
]

/** 目标选择 mock 数据（任务类型=目标打击时展示：编号/类型） */
const TARGETS = [
  { id: 't1', code: 'T001', type: '车辆' },
  { id: 't2', code: 'T002', type: '人员' },
  { id: 't3', code: 'T003', type: '建筑' },
  { id: 't4', code: 'T004', type: '车辆' },
  { id: 't5', code: 'T005', type: '人员' },
  { id: 't6', code: 'T006', type: '建筑' },
  { id: 't7', code: 'T007', type: '车辆' },
]

/** 无人机编成条目（专业模式步骤 2：名称/状态/高度/电量/经纬度，遥测字段为演示数据） */
interface ForceDrone {
  id: string
  name: string
  /** 状态：待命=蓝点（默认编入）/ 任务中=绿点（不默认编入，仍可手动勾选）/ 离线=灰点（整行置灰不可选） */
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

/** 无人机编成 mock 数据（专业模式步骤 2：12 条演示数据验证列表滚动——空闲机可勾选，
 *  执行中=绿点不默认编入仍可手动勾选，离线=置灰不可选；遥测字段各不相同便于核对列对齐） */
const FORCE_DRONES: ForceDrone[] = [
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
const forceStatusMod = (status: ForceDrone['status']) =>
  status === '任务中'
    ? ' task-pro__force-status--busy'
    : status === '离线'
      ? ' task-pro__force-status--offline'
      : ''

interface TaskCreatePanelProps {
  visible: boolean
  onClose: () => void
  /** 一键创建：携带表单值提交，由父组件追加任务 */
  onSubmit: (value: TaskCreateFormValue) => void
  /** 专业模式：携带当前任务类型切换到内嵌的专业模式策略配置子视图（决定步骤一表单变体） */
  onProMode: (taskType: TaskCreateType) => void
}

export function TaskCreatePanel({ visible, onClose, onSubmit, onProMode }: TaskCreatePanelProps) {
  const [name, setName] = useState('')
  /** 任务名称必填校验：为空时在输入框下方显示提示 */
  const [nameError, setNameError] = useState('')
  const [targetCount, setTargetCount] = useState(10)
  const [execMode, setExecMode] = useState<ExecMode>('单次执行')
  const [lostPolicy, setLostPolicy] = useState<LostPolicy>('继续执行')
  const [taskType, setTaskType] = useState<TaskCreateType>('巡检任务')
  /** 按任务类型分开保存选中集合：切换类型互不覆盖，切回时恢复原勾选 */
  const [selectedByType, setSelectedByType] = useState<Record<TaskCreateType, string[]>>({
    巡检任务: [],
    打击任务: [],
  })

  /* 挂载即默认值：父组件按 createOpen 条件挂载/卸载本面板，重新打开自然回到崭新表单；
   * 进入专业模式期间本面板保持挂载仅隐藏（visible=false），返回上一步时已填数据保留（PRD TSK-P0-03 验收 7） */

  if (!visible) return null

  /** 任务类型=目标打击时，列表切换为目标数据源 */
  const isStrike = taskType === '打击任务'
  const listItems = isStrike ? TARGETS : AREAS

  /** 当前类型的选中集合（派生），仅更新当前类型对应数组 */
  const selectedAreaIds = selectedByType[taskType]
  const setSelectedAreaIds = (updater: (prev: string[]) => string[]) => {
    setSelectedByType((prev) => ({
      ...prev,
      [taskType]: updater(prev[taskType]),
    }))
  }

  /** 全选态由选中集合派生，保证与各行复选框始终一致 */
  const allChecked = selectedAreaIds.length === listItems.length
  /** 部分选中（indeterminate）：全选框显示蓝底白横线 */
  const someChecked = selectedAreaIds.length > 0 && !allChecked

  const toggleArea = (id: string) => {
    setSelectedAreaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const toggleAll = () => {
    setSelectedAreaIds(() => (allChecked ? [] : listItems.map((a) => a.id)))
  }

  const handleSubmit = () => {
    // 必填校验：未填写时在输入框下方显示提示并中止提交
    if (!name.trim()) {
      setNameError('请输入任务名称')
      return
    }
    onSubmit({
      name: name.trim(),
      targetCount,
      execMode,
      lostPolicy,
      taskType,
      selectedAreaIds,
    })
  }

  return (
    <section className={`task-create${visible ? ' task-create--visible' : ''}`} aria-label="创建任务面板">
      {/* ====== 标题栏 ====== */}
      <header className="task-create__header">
        {/* 返回箭头：点击返回任务列表视图（沿用原关闭行为） */}
        <button
          type="button"
          className="task-create__back"
          onClick={onClose}
          aria-label="返回任务列表"
        >
          <img src={CreateIMAGES.backArrow} alt="" />
        </button>
        <span className="task-create__heading">
          <span className="task-create__title">创建任务</span>
        </span>
      </header>


      {/* ====== 可滚动内容区（超出面板高度时竖向滚动，标题栏/底栏固定） ====== */}
      <div className="task-create__body">
      {/* ====== 任务名称 + 执行对象数量（左：表单；右：装饰竖线 image_9）====== */}
      <div className="task-create__row-top">
        <div className="task-create__fields">
          <label className="task-create__label" htmlFor="task-create-name">
            <span className="task-create__required-mark">*</span>任务名称
          </label>
          <input
            id="task-create-name"
            className={`task-create__input${nameError ? ' task-create__input--error' : ''}`}
            value={name}
            placeholder="请输入任务名称"
            onChange={(e) => {
              setName(e.target.value)
              if (nameError) setNameError('')
            }}
          />

          {nameError && <span className="task-create__input-error">{nameError}</span>}

          <label className="task-create__label" htmlFor="task-create-count">
            执行对象数量
          </label>
          <div className="task-create__stepper">
            <button
              type="button"
              className="task-create__stepper-btn"
              aria-label="减少执行对象数量"
              onClick={() => setTargetCount((n) => Math.max(1, n - 1))}
            >
              <img src={CreateIMAGES.stepperMinus} alt="" />
            </button>
            <div className="task-create__stepper-value">
              <input
                id="task-create-count"
                value={targetCount}
                onChange={(e) => {
                  const v = Number(e.target.value.replace(/\D/g, ''))
                  setTargetCount(Number.isNaN(v) ? 0 : v)
                }}
              />
            </div>
            <button
              type="button"
              className="task-create__stepper-btn"
              aria-label="增加执行对象数量"
              onClick={() => setTargetCount((n) => Math.min(9999, n + 1))}
            >
              <img src={CreateIMAGES.stepperPlus} alt="" />
            </button>
          </div>
        </div>
      </div>

      {/* ====== 执行方式 ====== */}
      <span className="task-create__label">执行方式</span>
      <CreateSegmentedControl
        value={execMode}
        options={['单次执行', '周期执行']}
        onChange={setExecMode}
      />

      {/* ====== 失联执行策略 ====== */}
      <span className="task-create__label">失联执行策略</span>
      <CreateSegmentedControl
        value={lostPolicy}
        options={['继续执行', '返航']}
        onChange={setLostPolicy}
      />

      {/* ====== 任务类型 ====== */}
      <span className="task-create__label">任务类型</span>
      <CreateSegmentedControl
        value={taskType === '打击任务' ? '目标打击' : '区域巡检'}
        options={['区域巡检', '目标打击']}
        onChange={(v) => setTaskType(v === '区域巡检' ? '巡检任务' : '打击任务')}
      />

      {/* ====== 任务区选择 ====== */}
      <div className="task-create__area-head">
        <span className="task-create__label">{isStrike ? '目标选择' : '任务区选择'}</span>
        <span className="task-create__info-icon">
          <img src={CreateIMAGES.infoIcon} alt="" />
          <img className="task-create__info-dot" src={CreateIMAGES.infoIconDot} alt="" />
        </span>
      </div>

      <div className="task-create__area-toolbar">
        <button type="button" className="task-create__select-all" onClick={toggleAll}>
          <span
            className={[
              'task-create__tri-state',
              allChecked ? 'task-create__tri-state--checked' : '',
              someChecked ? 'task-create__tri-state--indeterminate' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <img
              className={
                allChecked
                  ? 'task-create__area-checkbox task-create__area-checkbox--checked'
                  : 'task-create__area-checkbox'
              }
              src={allChecked ? CreateIMAGES.areaIndexIcon : CreateIMAGES.checkboxUnchecked}
              alt=""
            />
          </span>
          <span>全选</span>
        </button>
        {!isStrike && (
          <button type="button" className="task-create__add-area">
            <span className="task-create__add-area-inner">
              <img src={CreateIMAGES.addAreaIcon} alt="" />
              <span>添加任务区</span>
            </span>
          </button>
        )}
      </div>


      {/* 选择列表：任务类型=区域巡检时为任务区列表，目标打击时为目标列表 */}
      <div className="task-create__area-list">
        {listItems.map((a, idx) => {
          const checked = selectedAreaIds.includes(a.id)
          return (
            <button
              type="button"
              role="checkbox"
              aria-checked={checked}
              className="task-create__area-item"
              key={a.id}
              onClick={() => toggleArea(a.id)}
            >
              <span className="task-create__area-col task-create__area-col--index">
                <img
                  className={
                    checked
                      ? 'task-create__area-checkbox task-create__area-checkbox--checked'
                      : 'task-create__area-checkbox'
                  }
                  src={checked ? CreateIMAGES.areaIndexIcon : CreateIMAGES.checkboxUnchecked}
                  alt=""
                />
                {String(idx + 1).padStart(2, '0')}
              </span>
              {isStrike ? (
                <>
                  <span className="task-create__area-col task-create__area-col--code">
                    {(a as (typeof TARGETS)[number]).code}
                  </span>
                  <span className="task-create__area-col task-create__area-col--type">
                    {a.type}
                  </span>
                  <img className="task-create__target-icon" src={CreateIMAGES.targetRightIcon} alt="" />
                </>
              ) : (
                <>
                  <span className="task-create__area-col task-create__area-col--name">
                    {(a as (typeof AREAS)[number]).name}
                  </span>
                  <span className="task-create__area-col task-create__area-col--type">{a.type}</span>
                  <span className="task-create__area-col task-create__area-col--area">
                    {(a as (typeof AREAS)[number]).area}
                  </span>
                </>
              )}
            </button>
          )
        })}
      </div>


      </div>

      {/* ====== 底部操作 ====== */}
      <footer className="task-create__footer">
        <button type="button" className="task-create__btn task-create__btn--primary" onClick={handleSubmit}>
          一键创建
        </button>
        <button
          type="button"
          className="task-create__btn task-create__btn--outline"
          onClick={() => onProMode(taskType)}
        >
          专业模式
        </button>
      </footer>
    </section>
  )
}

/** 分段选择器：与设计稿 group_28/29/31 同构（滑块切图高亮） */
function CreateSegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: [T, T] | readonly T[]
  onChange: (v: T) => void
}) {
  const activeIndex = Math.max(0, options.indexOf(value))
  return (
    <div className="task-create__segment" role="radiogroup">
      <span
        className="task-create__segment-indicator"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
        aria-hidden="true"
      />
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          role="radio"
          aria-checked={value === opt}
          className={`task-create__segment-item${value === opt ? ' task-create__segment-item--active' : ''}`}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

// ==================== 「专业模式」策略配置面板（PRD TSK-P0-03，内嵌于任务管理面板）====================
// 进入路径：任务管理 → 创建任务 → 专业模式（携带创建表单当前任务类型）；任务面板保持展开，本面板内嵌替换基础信息表单。
// 顶部 1-5 步骤指示器（当前步蓝渐变高亮、已完成淡青、其余置灰）；步骤 1「策略适配」按任务类型二选一：
// · 区域巡检（设计稿 group_1555）：打击方式/规划方式/区域进入位置/分配方式/避让方式+避让距离/障碍区准入/
//   突防飞行高度·速度·终点距离/识别开关，避让方式选「无」时避让距离行隐去；
// · 目标打击（设计稿步骤一）：巡检对象（人/车可选，船/装备置灰）/仿地高度/巡航速度/航线间隔/旁向重叠率/
//   巡检转动作/白夜模式/规划方式/区域进入位置/分割方式+区域个数/切分方向/分配方式/避让方式+避让距离/
//   集结方式/障碍区准入/突防飞行高度·速度·终点距离/编队方式/补位方式/编队队形/是否启用编队/识别开关；
// 步骤 2「力量编成」勾选无人机（空闲可选/忙碌置灰）；步骤 3「任务分配」按步骤 2 所选设备逐卡展示
// （行 1 设备遥测 + 行 2 任务区/目标勾选栏：标签横滑 + 下拉多选；未勾选任何项禁用保存下一步，自动规划轮转分配）；
// 步骤 4「航线生成」按编成无人机逐行展示航线摘要；步骤 5「总览」顶部统计预计总完成时间/飞行总长
// （与步骤 4 演示数据联动），并按任务类型汇总步骤 1-3 参数，底部「完成」生成任务；
// 底部按钮：保存下一步 / 快速创建 / 返回上一步。

/** 步骤元信息 */
const PRO_STEPS = [
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

/** 策略参数默认值（设计稿标注：避让距离 10m / 突防高度 100m / 速度 5m/s / 终点距离 0m / 识别开关关） */
const DEFAULT_STRATEGY: ProStrategy = {
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
const PRO_OPTIONS = {
  strikeMode: ['单项序贯', '待定'],
  planMode: ['集中式', '协商式'],
  entryMode: ['自动选择', '指定航线'],
  assignMode: ['风险最低', '效率最高', '时间优先'],
  avoidMode: ['绕飞', '爬高', '无'],
  obstacleAccess: ['禁止进入障碍区', '临时进入障碍区'],
} as const

/** 数值字段合法区间：越界实时标红并禁用「保存下一步」「快速创建」（PRD 验收 3） */
const NUMERIC_RULES: Partial<Record<keyof ProStrategy, { min: number; max: number }>> = {
  avoidDist: { min: 0, max: 1000 },
  penHeight: { min: 0, max: 500 },
  penSpeed: { min: 0, max: 50 },
  penDist: { min: 0, max: 1000 },
}

/** 派生数值字段的越界标记（仅数值字段有键，两类策略表单共用） */
function numericErrors<T extends object>(
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

/** 目标打击策略默认值（设计稿标注：巡检对象默认选中「车」；仿地高度/巡航速度/航线间隔/区域个数/
 *  突防飞行高度·速度=100，旁向重叠率 0.5，避让距离 1，突防终点距离 0，双开关默认开） */
const DEFAULT_STRIKE: StrikeStrategy = {
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
const STRIKE_OPTIONS = {
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
const STRIKE_NUMERIC_RULES: Partial<Record<keyof StrikeStrategy, { min: number; max: number }>> = {
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
const INSPECT_TARGET_OPTIONS = [
  { key: '人', disabled: false },
  { key: '车', disabled: false },
  { key: '船', disabled: true },
  { key: '装备', disabled: true },
] as const

/** 设计稿切图资源（src/assets/images/task-panel/） */
const ProIMAGES = {
  backArrow: taskPanelImages.backArrow,
  check: taskPanelImages.checkIcon,
} as const

/** 数值输入：过滤非数字，NaN 归 0 */
const toNumber = (v: string) => {
  const n = Number(v.replace(/[^\d.-]/g, ''))
  return Number.isNaN(n) ? 0 : n
}

interface TaskProPanelProps {
  visible: boolean
  /** 进入专业模式时的任务类型：决定步骤 1「策略适配」表单变体（区域巡检 / 目标打击） */
  taskType: TaskCreateType
  /** 返回上一步（步骤 1 时触发 / 标题栏返回箭头）：回到创建任务基础信息页，已填数据保留 */
  onBack: () => void
  /** 生成任务（步骤 5 总览确认 / 步骤 1 快速创建）：提交后由父组件按任务类型追加任务 */
  onSubmit: () => void
}

export function TaskProPanel({ visible, taskType, onBack, onSubmit }: TaskProPanelProps) {
  const [step, setStep] = useState(1)
  /** 区域巡检策略参数（进入专业模式期间保留，与目标打击参数互不覆盖） */
  const [strategy, setStrategy] = useState<ProStrategy>(DEFAULT_STRATEGY)
  /** 目标打击策略参数（进入专业模式期间保留，与区域巡检参数互不覆盖） */
  const [strike, setStrike] = useState<StrikeStrategy>(DEFAULT_STRIKE)
  /** 步骤 2 力量编成：勾选的无人机 id 集合（默认编入全部待命机；任务中机不默认编入，仍可手动勾选） */
  const [forceDrones, setForceDrones] = useState<string[]>(() =>
    FORCE_DRONES.filter((d) => !d.disabled && d.status === '待命').map((d) => d.id),
  )
  /** 步骤 3 任务分配：无人机 id → 已勾选目标/任务区 id 列表（未编辑时默认勾选第一项，PRD TSK-P0-05/10） */
  const [assignMap, setAssignMap] = useState<Record<string, string[]>>({})
  /** 步骤 3 当前展开分配下拉的设备卡片 id（同一时间仅一张卡片的选项层展开） */
  const [openAssign, setOpenAssign] = useState<string | null>(null)

  /** 步骤 1 表单按任务类型二选一展示 */
  const isStrike = taskType === '打击任务'

  /** 数值越界实时派生（负数/超限标红并禁用保存下一步/快速创建） */
  const errors = isStrike
    ? numericErrors(strike, STRIKE_NUMERIC_RULES)
    : numericErrors(strategy, NUMERIC_RULES)
  const hasError = Object.values(errors).some(Boolean)

  const update = <K extends keyof ProStrategy>(key: K, value: ProStrategy[K]) => {
    setStrategy((prev) => ({ ...prev, [key]: value }))
  }

  const updateStrike = <K extends keyof StrikeStrategy>(key: K, value: StrikeStrategy[K]) => {
    setStrike((prev) => ({ ...prev, [key]: value }))
  }

  /** 巡检对象总选三态：按可选项（人/车）派生，点击在全选/清空间切换 */
  const enabledTargets = INSPECT_TARGET_OPTIONS.filter((o) => !o.disabled).map((o) => o.key)
  const checkedTargetCount = enabledTargets.filter((k) => strike.inspectTargets.includes(k)).length
  const allTargets = checkedTargetCount === enabledTargets.length
  const someTargets = checkedTargetCount > 0 && !allTargets
  const toggleAllTargets = () =>
    updateStrike('inspectTargets', allTargets ? [] : [...enabledTargets])

  /** 步骤 2 力量编成：无人机总选三态与单机切换（置灰机不参与勾选） */
  const enabledDrones = FORCE_DRONES.filter((d) => !d.disabled).map((d) => d.id)
  const allDrones = forceDrones.length > 0 && forceDrones.length === enabledDrones.length
  const someDrones = forceDrones.length > 0 && !allDrones
  const toggleAllDrones = () => setForceDrones(allDrones ? [] : [...enabledDrones])
  const toggleDrone = (id: string) =>
    setForceDrones((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  /** 步骤 3 任务分配：待分配选项（目标打击=目标列表 / 区域巡检=任务区列表），tag 为卡片第二行标签文案 */
  const assignOptions: { id: string; tag: string }[] = isStrike
    ? TARGETS.map((t) => ({ id: t.id, tag: `${t.code}·${t.type}` }))
    : AREAS.map((a, i) => ({ id: a.id, tag: `${String(i + 1).padStart(2, '0')} ${a.name}` }))
  const optionIds = assignOptions.map((o) => o.id)
  const selectedForceDrones = FORCE_DRONES.filter((d) => forceDrones.includes(d.id))

  /** 展示用分配表：无人机 id → 已勾选选项 id 列表；未编辑过（或含失效 id）时默认勾选第一项（设计稿 01区域名称） */
  const effectiveAssignMap: Record<string, string[]> = {}
  selectedForceDrones.forEach((d) => {
    const cur = (assignMap[d.id] ?? []).filter((id) => optionIds.includes(id))
    effectiveAssignMap[d.id] =
      cur.length > 0 ? cur : optionIds.length > 0 ? [optionIds[0]!] : []
  })

  /** 勾选/取消某台设备的目标（打击）/任务区（巡检）分配 */
  const toggleAssign = (droneId: string, itemId: string) => {
    const cur = effectiveAssignMap[droneId] ?? []
    setAssignMap((prev) => ({
      ...prev,
      [droneId]: cur.includes(itemId) ? cur.filter((x) => x !== itemId) : [...cur, itemId],
    }))
  }

  /** 自动规划：按设备顺序轮转分配，保证每个目标/任务区仅归属一台设备（模拟按设备类型/状态自动匹配） */
  const handleAutoPlan = () => {
    const n = selectedForceDrones.length
    if (n === 0 || assignOptions.length === 0) return
    const next: Record<string, string[]> = {}
    selectedForceDrones.forEach((d, i) => {
      next[d.id] = assignOptions.filter((_, idx) => idx % n === i).map((o) => o.id)
    })
    setAssignMap(next)
  }

  /** 步骤 2/3 前置校验：未选择无人机时禁用「保存下一步」；步骤 3 未勾选任何目标/任务区同样禁用（PRD 验收 6） */
  const stepInvalid =
    ((step === 2 || step === 3) && forceDrones.length === 0) ||
    (step === 3 && selectedForceDrones.every((d) => (effectiveAssignMap[d.id] ?? []).length === 0))

  /** 保存下一步：参数非法/前置条件不满足时点击无效（PRD 验收 6）；离开当前步骤时收起分配下拉 */
  const handleNext = () => {
    if (hasError || stepInvalid) return
    setOpenAssign(null)
    setStep((s) => Math.min(PRO_STEPS.length, s + 1))
  }

  /** 返回上一步：步骤 1 返回基础信息页（本面板卸载即参数清空）；离开步骤 3 时清空本步分配（PRD TSK-P0-05 验收 8） */
  const handlePrev = () => {
    if (step <= 1) onBack()
    else {
      if (step === 3) setAssignMap({})
      setOpenAssign(null)
      setStep((s) => s - 1)
    }
  }

  if (!visible) return null

  return (
    <section className={`task-pro${visible ? ' task-pro--visible' : ''}`} aria-label="创建任务-专业模式面板">
      {/* ====== 子标题栏：与常规模式创建任务同款（返回箭头 + 标题） ====== */}
      <header className="task-pro__header">
        {/* 返回箭头：点击返回创建任务基础信息页（已填数据保留） */}
        <button
          type="button"
          className="task-pro__back"
          onClick={onBack}
          aria-label="返回创建任务"
        >
          <img src={ProIMAGES.backArrow} alt="" />
        </button>
        <span className="task-pro__title">创建任务</span>
      </header>

      {/* ====== 步骤指示器（1-5：大号圆点+下方标签；4px 进度条亮蓝至当前步圆心、其后置灰） ====== */}
      <div
        className="task-pro__steps"
        aria-label="配置步骤"
        style={
          {
            /* 首末球边距面板 37px → 圆心 53px；节点间距 (100% - 106px)/4，见 TaskProPanel.css 进度条注释 */
            '--pro-step-pct': `calc(53px + (100% - 106px) * ${(step - 1) * 0.25})`,
          } as CSSProperties
        }
      >
        <span className="task-pro__steps-bar" aria-hidden="true" />
        {PRO_STEPS.map((s) => (
          <span
            key={s.n}
            className={`task-pro__step${step === s.n ? ' task-pro__step--active' : ''}${
              s.n < step ? ' task-pro__step--done' : ''
            }`}
            aria-current={step === s.n ? 'step' : undefined}
          >
            {/* 已完成步骤（当前步之前）：圆点内换白色对勾图标（step-check.svg）替代序号 */}
            <span className="task-pro__step-num">
              {s.n < step ? <img className="task-pro__step-check" src={ProIMAGES.check} alt="" /> : s.n}
            </span>
            <span className="task-pro__step-label">{s.label}</span>
          </span>
        ))}
      </div>

      {/* ====== 可滚动内容区（步骤 1 参数配置 / 2 编成 / 3 分配 / 4 占位 / 5 总览） ====== */}
      <div className="task-pro__body">
        {step === 1 && !isStrike && (
          <div className="task-pro__form">
            {/* 打击方式 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">打击方式</span>
              <ProSegmented
                value={strategy.strikeMode}
                options={PRO_OPTIONS.strikeMode}
                onChange={(v) => update('strikeMode', v)}
              />
            </div>

            {/* 规划方式 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">规划方式</span>
              <ProSegmented
                value={strategy.planMode}
                options={PRO_OPTIONS.planMode}
                onChange={(v) => update('planMode', v)}
              />
            </div>

            {/* 区域进入位置 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">区域进入位置</span>
              <ProSegmented
                value={strategy.entryMode}
                options={PRO_OPTIONS.entryMode}
                onChange={(v) => update('entryMode', v)}
              />
            </div>

            {/* 分配方式 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">分配方式</span>
              <ProSegmented
                value={strategy.assignMode}
                options={PRO_OPTIONS.assignMode}
                onChange={(v) => update('assignMode', v)}
              />
            </div>

            {/* 避让方式 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">避让方式</span>
              <ProSegmented
                value={strategy.avoidMode}
                options={PRO_OPTIONS.avoidMode}
                onChange={(v) => update('avoidMode', v)}
              />
            </div>

            {/* 避让距离：避让方式=无时隐去（设计稿红字标注） */}
            {strategy.avoidMode !== '无' && (
              <div className="task-pro__row">
                <span className="task-pro__row-label">避让距离</span>
                <ProStepper
                  value={strategy.avoidDist}
                  min={0}
                  max={1000}
                  unit="m"
                  invalid={errors.avoidDist}
                  ariaLabel="避让距离"
                  onChange={(v) => update('avoidDist', v)}
                />
              </div>
            )}

            {/* 障碍区准入 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">障碍区准入</span>
              <ProSegmented
                value={strategy.obstacleAccess}
                options={PRO_OPTIONS.obstacleAccess}
                onChange={(v) => update('obstacleAccess', v)}
              />
            </div>

            {/* 突防飞行高度 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">突防飞行高度</span>
              <ProStepper
                value={strategy.penHeight}
                min={0}
                max={500}
                unit="m"
                invalid={errors.penHeight}
                ariaLabel="突防飞行高度"
                onChange={(v) => update('penHeight', v)}
              />
            </div>

            {/* 突防飞行速度 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">突防飞行速度</span>
              <ProStepper
                value={strategy.penSpeed}
                min={0}
                max={50}
                unit="m/s"
                invalid={errors.penSpeed}
                ariaLabel="突防飞行速度"
                onChange={(v) => update('penSpeed', v)}
              />
            </div>

            {/* 突防终点距离目标距离 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">突防终点距离目标距离</span>
              <ProStepper
                value={strategy.penDist}
                min={0}
                max={1000}
                unit="m"
                invalid={errors.penDist}
                ariaLabel="突防终点距离目标距离"
                onChange={(v) => update('penDist', v)}
              />
            </div>

            {/* 识别开关 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">识别开关</span>
              <ProSwitch
                checked={strategy.senseSwitch === '开'}
                onChange={(on) => update('senseSwitch', on ? '开' : '关')}
                ariaLabel="识别开关"
              />
            </div>
          </div>
        )}

        {step === 1 && isStrike && (
          <div className="task-pro__form">
            {/* 巡检对象：总选三态 + 人/车可选、船/装备置灰（设计稿默认态） */}
            <div className="task-pro__row">
              <span className="task-pro__row-label task-pro__row-label--inline">
                巡检对象
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={allTargets ? true : someTargets ? 'mixed' : false}
                  aria-label="全选巡检对象"
                  className={[
                    'task-pro__tri',
                    allTargets ? 'task-pro__tri--checked' : '',
                    someTargets ? 'task-pro__tri--mixed' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={toggleAllTargets}
                >
                  <span className="task-pro__tri-mark" aria-hidden="true" />
                </button>
              </span>
              <div className="task-pro__chips">
                {INSPECT_TARGET_OPTIONS.map((opt) => {
                  const checked = strike.inspectTargets.includes(opt.key)
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      disabled={opt.disabled}
                      className={`task-pro__chip${checked ? ' task-pro__chip--checked' : ''}`}
                      onClick={() =>
                        updateStrike(
                          'inspectTargets',
                          checked
                            ? strike.inspectTargets.filter((x) => x !== opt.key)
                            : [...strike.inspectTargets, opt.key],
                        )
                      }
                    >
                      <span className="task-pro__chip-box" aria-hidden="true" />
                      <span className="task-pro__chip-text">{opt.key}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 仿地高度 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">仿地高度</span>
              <ProStepper
                value={strike.terrainHeight}
                min={0}
                max={1000}
                unit="m"
                invalid={errors.terrainHeight}
                ariaLabel="仿地高度"
                onChange={(v) => updateStrike('terrainHeight', v)}
              />
            </div>

            {/* 巡航速度 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">巡航速度</span>
              <ProStepper
                value={strike.cruiseSpeed}
                min={0}
                max={200}
                unit="m/s"
                invalid={errors.cruiseSpeed}
                ariaLabel="巡航速度"
                onChange={(v) => updateStrike('cruiseSpeed', v)}
              />
            </div>

            {/* 航线间隔 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">航线间隔</span>
              <ProStepper
                value={strike.routeGap}
                min={0}
                max={1000}
                unit="m"
                invalid={errors.routeGap}
                ariaLabel="航线间隔"
                onChange={(v) => updateStrike('routeGap', v)}
              />
            </div>

            {/* 旁向重叠率 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">旁向重叠率</span>
              <ProStepper
                value={strike.sideOverlap}
                min={0}
                max={100}
                unit="%"
                invalid={errors.sideOverlap}
                ariaLabel="旁向重叠率"
                onChange={(v) => updateStrike('sideOverlap', v)}
              />
            </div>

            {/* 巡检转动作 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">巡检转动作</span>
              <ProSegmented
                value={strike.inspectAction}
                options={STRIKE_OPTIONS.inspectAction}
                onChange={(v) => updateStrike('inspectAction', v)}
              />
            </div>

            {/* 白夜模式 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">白夜模式</span>
              <ProSegmented
                value={strike.dayNight}
                options={STRIKE_OPTIONS.dayNight}
                onChange={(v) => updateStrike('dayNight', v)}
              />
            </div>

            {/* 规划方式 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">规划方式</span>
              <ProSegmented
                value={strike.planMode}
                options={STRIKE_OPTIONS.planMode}
                onChange={(v) => updateStrike('planMode', v)}
              />
            </div>

            {/* 区域进入位置 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">区域进入位置</span>
              <ProSegmented
                value={strike.entryMode}
                options={STRIKE_OPTIONS.entryMode}
                onChange={(v) => updateStrike('entryMode', v)}
              />
            </div>

            {/* 分割方式 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">分割方式</span>
              <ProSegmented
                value={strike.splitMode}
                options={STRIKE_OPTIONS.splitMode}
                onChange={(v) => updateStrike('splitMode', v)}
              />
            </div>

            {/* 区域个数 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">区域个数</span>
              <ProStepper
                value={strike.areaCount}
                min={1}
                max={999}
                unit="个"
                invalid={errors.areaCount}
                ariaLabel="区域个数"
                onChange={(v) => updateStrike('areaCount', v)}
              />
            </div>

            {/* 切分方向 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">切分方向</span>
              <ProSegmented
                value={strike.splitDir}
                options={STRIKE_OPTIONS.splitDir}
                onChange={(v) => updateStrike('splitDir', v)}
              />
            </div>

            {/* 分配方式 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">分配方式</span>
              <ProSegmented
                value={strike.assignMode}
                options={STRIKE_OPTIONS.assignMode}
                onChange={(v) => updateStrike('assignMode', v)}
              />
            </div>

            {/* 避让方式 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">避让方式</span>
              <ProSegmented
                value={strike.avoidMode}
                options={STRIKE_OPTIONS.avoidMode}
                onChange={(v) => updateStrike('avoidMode', v)}
              />
            </div>

            {/* 避让距离：避让方式=无时隐去（与区域巡检表单一致） */}
            {strike.avoidMode !== '无' && (
              <div className="task-pro__row">
                <span className="task-pro__row-label">避让距离</span>
                <ProStepper
                  value={strike.avoidDist}
                  min={0}
                  max={1000}
                  unit="m"
                  invalid={errors.avoidDist}
                  ariaLabel="避让距离"
                  onChange={(v) => updateStrike('avoidDist', v)}
                />
              </div>
            )}

            {/* 集结方式 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">集结方式</span>
              <ProSegmented
                value={strike.rallyMode}
                options={STRIKE_OPTIONS.rallyMode}
                onChange={(v) => updateStrike('rallyMode', v)}
              />
            </div>

            {/* 障碍区准入 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">障碍区准入</span>
              <ProSegmented
                value={strike.obstacleAccess}
                options={STRIKE_OPTIONS.obstacleAccess}
                onChange={(v) => updateStrike('obstacleAccess', v)}
              />
            </div>

            {/* 突防飞行高度 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">突防飞行高度</span>
              <ProStepper
                value={strike.penHeight}
                min={0}
                max={1000}
                unit="m"
                invalid={errors.penHeight}
                ariaLabel="突防飞行高度"
                onChange={(v) => updateStrike('penHeight', v)}
              />
            </div>

            {/* 突防飞行速度 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">突防飞行速度</span>
              <ProStepper
                value={strike.penSpeed}
                min={0}
                max={200}
                unit="m/s"
                invalid={errors.penSpeed}
                ariaLabel="突防飞行速度"
                onChange={(v) => updateStrike('penSpeed', v)}
              />
            </div>

            {/* 突防终点距离目标距离 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">突防终点距离目标距离</span>
              <ProStepper
                value={strike.penDist}
                min={0}
                max={1000}
                unit="m"
                invalid={errors.penDist}
                ariaLabel="突防终点距离目标距离"
                onChange={(v) => updateStrike('penDist', v)}
              />
            </div>

            {/* 编队方式 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">编队方式</span>
              <ProSegmented
                value={strike.formationMode}
                options={STRIKE_OPTIONS.formationMode}
                onChange={(v) => updateStrike('formationMode', v)}
              />
            </div>

            {/* 补位方式 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">补位方式</span>
              <ProSegmented
                value={strike.fillMode}
                options={STRIKE_OPTIONS.fillMode}
                onChange={(v) => updateStrike('fillMode', v)}
              />
            </div>

            {/* 编队队形（4 项分段） */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">编队队形</span>
              <ProSegmented
                value={strike.formationShape}
                options={STRIKE_OPTIONS.formationShape}
                onChange={(v) => updateStrike('formationShape', v)}
              />
            </div>

            {/* 是否启用编队 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">是否启用编队</span>
              <ProSwitch
                checked={strike.formationEnabled}
                onChange={(on) => updateStrike('formationEnabled', on)}
                ariaLabel="是否启用编队"
              />
            </div>

            {/* 识别开关 */}
            <div className="task-pro__row">
              <span className="task-pro__row-label">识别开关</span>
              <ProSwitch
                checked={strike.senseSwitch}
                onChange={(on) => updateStrike('senseSwitch', on)}
                ariaLabel="识别开关"
              />
            </div>
          </div>
        )}

        {/* ====== 步骤 2 力量编成：无人机遥测列表勾选编成（设计稿：全选栏 + 逐行状态/高度/电量/经纬度） ====== */}
        {step === 2 && (
          <div className="task-pro__force">
            {/* 全选栏：三态复选框 + 文案 */}
            <div className="task-pro__force-all">
              <button
                type="button"
                role="checkbox"
                aria-checked={allDrones ? true : someDrones ? 'mixed' : false}
                aria-label="全选无人机"
                className={[
                  'task-pro__tri',
                  allDrones ? 'task-pro__tri--checked' : '',
                  someDrones ? 'task-pro__tri--mixed' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={toggleAllDrones}
              >
                <span className="task-pro__tri-mark" aria-hidden="true" />
              </button>
              <span className="task-pro__force-all-label">全选</span>
            </div>

            {/* 无人机行：复选框 + 机图标 + 名称 + 状态点文案 + 高度 + 电量 + 经纬度 */}
            <ul className="task-pro__force-list">
              {FORCE_DRONES.map((d) => {
                const checked = forceDrones.includes(d.id)
                const lowBatt = d.battery < 20
                return (
                  <li key={d.id} className="task-pro__force-item">
                    {/* 复合首列：复选框(16) + 间距(8) + 机图标(24) = 48px，列内 flex gap 显式控制
                        「复选框→图标」间距精确 8px，与网格 gap 求解/图片透明边无关 */}
                    <span className="task-pro__force-lead">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        aria-label={`编入 ${d.name}`}
                        disabled={d.disabled}
                        className={`task-pro__force-check${checked ? ' task-pro__force-check--checked' : ''}`}
                        onClick={() => toggleDrone(d.id)}
                      >
                        <span className="task-pro__force-check-mark" aria-hidden="true" />
                      </button>
                      <ForceDroneIcon />
                    </span>
                    <span className="task-pro__force-name">{d.name}</span>
                    <span className={`task-pro__force-status${forceStatusMod(d.status)}`}>
                      <i className="task-pro__force-status-dot" aria-hidden="true" />
                      {d.status}
                    </span>
                    <span className="task-pro__force-alt">
                      <ForceAltitudeIcon />
                      {d.altitude}m
                    </span>
                    <span className={`task-pro__force-batt${lowBatt ? ' task-pro__force-batt--low' : ''}`}>
                      <ForceBatteryIcon level={d.battery} low={lowBatt} />
                      {d.battery}%
                    </span>
                    <span className="task-pro__force-geo">
                      <span>经度:{d.lon}</span>
                      <span>纬度:{d.lat}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
            {forceDrones.length === 0 && (
              <p className="task-pro__hint">请至少选择一架无人机后再进入下一步</p>
            )}
          </div>
        )}

        {/* ====== 步骤 3 任务分配：设备信息 + 任务区/目标合并卡片（设计稿 434×108 卡片，卡片数=步骤 2 所选设备数） ====== */}
        {step === 3 && (
          <div className="task-pro__assign">
            {selectedForceDrones.map((d) => {
              const assigned = effectiveAssignMap[d.id] ?? []
              const lowBatt = d.battery < 20
              const open = openAssign === d.id
              return (
                <article className="task-pro__assign-card" key={d.id} aria-label={`${d.name} 分配卡片`}>
                  {/* 行 1：设备遥测（图标/名称/状态/高度/电量/经纬度，复用步骤 2 行内元素样式） */}
                  <div className="task-pro__assign-head">
                    <ForceDroneIcon />
                    <span className="task-pro__force-name">{d.name}</span>
                    <span className={`task-pro__force-status${forceStatusMod(d.status)}`}>
                      <i className="task-pro__force-status-dot" aria-hidden="true" />
                      {d.status}
                    </span>
                    <span className="task-pro__force-alt">
                      <ForceAltitudeIcon />
                      {d.altitude}m
                    </span>
                    <span className={`task-pro__force-batt${lowBatt ? ' task-pro__force-batt--low' : ''}`}>
                      <ForceBatteryIcon level={d.battery} low={lowBatt} />
                      {d.battery}%
                    </span>
                    <span className="task-pro__force-geo">
                      <span>经度:{d.lon}</span>
                      <span>纬度:{d.lat}</span>
                    </span>
                  </div>

                  {/* 行 2：分配勾选栏（已选标签横向滑动 + 右侧箭头展开下拉多选） */}
                  <div className="task-pro__assign-barwrap">
                    <div className="task-pro__assign-bar">
                      <div className="task-pro__assign-tags">
                        {assigned.length === 0 && <span className="task-pro__assign-empty">未分配</span>}
                        {assigned.map((id) => {
                          const opt = assignOptions.find((o) => o.id === id)
                          if (!opt) return null
                          return (
                            <button
                              type="button"
                              key={id}
                              className="task-pro__assign-tag"
                              aria-label={`取消分配 ${opt.tag}`}
                              title={`点击取消 ${opt.tag}`}
                              onClick={() => toggleAssign(d.id, id)}
                            >
                              <span className="task-pro__tri task-pro__tri--checked" aria-hidden="true">
                                <span className="task-pro__tri-mark" />
                              </span>
                              <span className="task-pro__assign-tag-text">{opt.tag}</span>
                            </button>
                          )
                        })}
                      </div>
                      <button
                        type="button"
                        className={`task-pro__assign-arrow${open ? ' task-pro__assign-arrow--open' : ''}`}
                        aria-expanded={open}
                        aria-label={`${d.name} 展开${isStrike ? '目标' : '任务区'}选项`}
                        onClick={() => setOpenAssign(open ? null : d.id)}
                      >
                        <AssignChevronIcon />
                      </button>
                    </div>

                    {/* 下拉选项：复选框 + 编号名称胶囊，过多自动换行（PRD 验收 4） */}
                    {open && (
                      <div className="task-pro__assign-drop" role="group" aria-label="分配选项列表">
                        {assignOptions.map((o) => {
                          const checked = assigned.includes(o.id)
                          return (
                            <button
                              type="button"
                              key={o.id}
                              role="checkbox"
                              aria-checked={checked}
                              className={`task-pro__assign-opt${checked ? ' task-pro__assign-opt--checked' : ''}`}
                              onClick={() => toggleAssign(d.id, o.id)}
                            >
                              <span
                                className={`task-pro__tri${checked ? ' task-pro__tri--checked' : ''}`}
                                aria-hidden="true"
                              >
                                <span className="task-pro__tri-mark" />
                              </span>
                              <span className="task-pro__assign-tag-text">{o.tag}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
            {forceDrones.length === 0 && (
              <p className="task-pro__hint">请返回步骤二选择无人机后再进行任务分配</p>
            )}
          </div>
        )}

        {/* ====== 步骤 4 航线生成：按步骤 2 编成无人机逐行展示航线摘要（设计稿 434×48 白透底行 + 右侧打击橙/侦查青类型胶囊） ====== */}
        {step === 4 && (
          <ul className="task-pro__routes">
            {selectedForceDrones.map((d, i) => (
              <li className="task-pro__route" key={d.id} aria-label={`${d.name} 航线摘要`}>
                <ForceDroneIcon />
                <span className="task-pro__route-name">{d.name}</span>
                <span className="task-pro__route-line">
                  {String(i + 1).padStart(2, '0')}
                  {isStrike ? '打击航线' : '侦查航线'}
                </span>
                <span className="task-pro__route-meta">时间:12min</span>
                <span className="task-pro__route-meta">长度:12km</span>
                <span className={`task-pro__route-tag${isStrike ? ' task-pro__route-tag--strike' : ''}`}>
                  {isStrike ? '打击' : '侦查'}
                </span>
              </li>
            ))}
            {forceDrones.length === 0 && (
              <p className="task-pro__hint">请返回步骤二选择无人机后再生成航线</p>
            )}
          </ul>
        )}

        {step === 5 && (
          <div className="task-pro__summary">
            {/* 全局统计行（设计稿步骤五）：预计总完成时间 / 飞行总长，与步骤 4 演示数据 12min·12km/机联动 */}
            <div className="task-pro__stats">
              <span className="task-pro__stat">
                <StatClockIcon />
                <span className="task-pro__stat-label">预计总完成时间：</span>
                <span className="task-pro__stat-value">{selectedForceDrones.length * 12}分钟</span>
              </span>
              <span className="task-pro__stat">
                <StatRouteIcon />
                <span className="task-pro__stat-label">飞行总长：</span>
                <span className="task-pro__stat-value">
                  {String(selectedForceDrones.length * 12).padStart(3, '0')}km
                </span>
              </span>
            </div>

            {/* 编成无人机遥测卡片（设计稿步骤五）：每台无人机 434×100 卡片，头行 48px 实时遥测 */}
            <div className="task-pro__ov-list">
              {selectedForceDrones.map((d) => {
                const lowBatt = d.battery < 20
                const midBatt = !lowBatt && d.battery <= 60
                return (
                  <div key={d.id} className="task-pro__ov-card">
                    <div className="task-pro__ov-head">
                      <ForceDroneIcon />
                      <span className="task-pro__ov-name">{d.name}</span>
                      <span
                        className={`task-pro__ov-status${
                          d.status === '任务中' ? ' task-pro__ov-status--busy' : ''
                        }`}
                      >
                        <i className="task-pro__ov-status-dot" aria-hidden="true" />
                        {d.status}
                      </span>
                      <span className="task-pro__ov-alt">
                        <ForceAltitudeIcon />
                        {d.altitude}m
                      </span>
                      <span className={`task-pro__ov-batt${lowBatt ? ' task-pro__ov-batt--low' : ''}`}>
                        <ForceBatteryIcon level={d.battery} low={lowBatt} mid={midBatt} />
                        {d.battery}%
                      </span>
                      <span className="task-pro__ov-geo">
                        <span>经度:{d.lon}</span>
                        <span>纬度:{d.lat}</span>
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ====== 底部操作（设计稿 group_1555：保存下一步 / 快速创建 / 返回上一步；总览页为生成任务） ====== */}
      <footer className="task-pro__footer">
        {step < 5 ? (
          <button
            type="button"
            className="task-pro__btn task-pro__btn--primary"
            disabled={hasError || stepInvalid}
            onClick={handleNext}
          >
            保存下一步
          </button>
        ) : (
          <button
            type="button"
            className="task-pro__btn task-pro__btn--primary"
            onClick={() => onSubmit()}
          >
            完成
          </button>
        )}
        {(step === 1 || step === 4) && (
          <button
            type="button"
            className="task-pro__btn task-pro__btn--outline"
            disabled={hasError || stepInvalid}
            onClick={() => onSubmit()}
          >
            快速创建
          </button>
        )}
        {step === 3 && (
          <button
            type="button"
            className="task-pro__btn task-pro__btn--outline"
            onClick={handleAutoPlan}
          >
            自动规划
          </button>
        )}
        <button type="button" className="task-pro__btn task-pro__btn--outline" onClick={handlePrev}>
          返回上一步
        </button>
      </footer>
    </section>
  )
}

/** 时钟图标（总览统计·预计总完成时间：外圈 + 时针分针，白 60%） */
function StatClockIcon() {
  return (
    <svg className="task-pro__stat-ic" viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="8.25"
        fill="none"
        stroke="rgba(255, 255, 255, 0.6)"
        strokeWidth="1.5"
      />
      <path
        d="M12 7.5V12l3.4 2.2"
        stroke="rgba(255, 255, 255, 0.6)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

/** 航程图标（总览统计·飞行总长：斜向航线段 + 箭头，对应设计稿旋转斜条） */
function StatRouteIcon() {
  return (
    <svg className="task-pro__stat-ic" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4.5 17.5L14 8"
        stroke="rgba(255, 255, 255, 0.6)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M11.5 6.5H15V10"
        stroke="rgba(255, 255, 255, 0.6)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

/** 无人机图标（步骤 2 编成行第二列，步骤 3/4/5 同款复用）：home 模块编队切图 icon-formation.png */
function ForceDroneIcon() {
  return (
    <img
      className="task-pro__force-ic task-pro__force-ic--drone"
      src={iconFormation}
      alt=""
      draggable={false}
    />
  )
}

/** 高度图标：复用设备管理面板数据行同款切图（deviceImages.altitudeIcon），14×14 */
function ForceAltitudeIcon() {
  return (
    <img
      className="task-pro__force-ic task-pro__force-ic--alt"
      src={deviceImages.altitudeIcon}
      alt=""
      draggable={false}
    />
  )
}

/** 电量图标：复用设备管理面板数据行同款切图（deviceImages.batteryFull/Mid/Low），
 *  分档口径与 config getBatteryIcon 一致：低 <20% → batteryLow / 中 ≤60% → batteryMid / 高 → batteryFull */
function ForceBatteryIcon({ level, low, mid }: { level: number; low: boolean; mid?: boolean }) {
  const isMid = mid ?? (!low && level <= 60)
  const src = low ? deviceImages.batteryLow : isMid ? deviceImages.batteryMid : deviceImages.batteryFull
  return <img className="task-pro__force-ic" src={src} alt="" draggable={false} />
}

/** 下拉箭头（设计稿 data-状态=向下）：展开态由 CSS 旋转 180° */
function AssignChevronIcon() {
  return (
    <svg className="task-pro__assign-arrow-ic" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M5 8l5 5 5-5"
        stroke="rgba(255, 255, 255, 0.85)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
/** 分段选择器（设计稿 group_1555：白透明底胶囊容器 + 蓝底白描边滑块）：支持 2/3 项 */
function ProSegmented({
  value,
  options,
  onChange,
}: {
  value: string
  options: readonly string[]
  onChange: (v: string) => void
}) {
  const PAD = 2
  const activeIndex = Math.max(0, options.indexOf(value))
  /** 滑块宽 = 等分容器（仅扣两侧 2px 内边距、无项间距），位移 = 索引 × 自身宽（与常规模式分段器一致） */
  const width = `calc((100% - ${PAD * 2}px) / ${options.length})`
  const offset = `translateX(${activeIndex * 100}%)`
  return (
    <div className="task-pro__segment" role="radiogroup">
      <span
        className="task-pro__segment-indicator"
        style={{ width, transform: offset }}
        aria-hidden="true"
      />
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          role="radio"
          aria-checked={value === opt}
          className={`task-pro__segment-item${value === opt ? ' task-pro__segment-item--active' : ''}`}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

/** 四键步进器（设计稿 group_1555：-10 -1 [值+单位] +1 +10）：按键夹取在合法区间，手输越界标红 */
function ProStepper({
  value,
  min,
  max,
  unit,
  invalid,
  ariaLabel,
  onChange,
}: { 
  value: number
  min: number
  max: number
  unit: string
  /** 越界标红（负数/超限实时反馈） */
  invalid?: boolean
  ariaLabel?: string
  onChange: (v: number) => void
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  return (
    <div className={`task-pro__stepper4${invalid ? ' task-pro__stepper4--error' : ''}`}>
      <button type="button" className="task-pro__stepper4-btn" aria-label={`减少10`} onClick={() => onChange(clamp(value - 10))}>
        -10
      </button>
      <button type="button" className="task-pro__stepper4-btn" aria-label={`减少1`} onClick={() => onChange(clamp(value - 1))}>
        -1
      </button>
      <div className="task-pro__stepper4-value">
        <input
          value={value}
          aria-label={ariaLabel ?? '数值'}
          onChange={(e) => onChange(toNumber(e.target.value))}
        />
        <span className="task-pro__stepper4-unit">{unit}</span>
      </div>
      <button type="button" className="task-pro__stepper4-btn" aria-label={`增加1`} onClick={() => onChange(clamp(value + 1))}>
        +1
      </button>
      <button type="button" className="task-pro__stepper4-btn" aria-label={`增加10`} onClick={() => onChange(clamp(value + 10))}>
        +10
      </button>
    </div>
  )
}

/** 拨动开关（识别开关）：关=灰（#C3C3C3 描边圆点居左）/ 开=青（#55CEDE 白圆点居右） */
function ProSwitch({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean
  onChange: (on: boolean) => void
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? '开关'}
      className={`task-pro__switch${checked ? ' task-pro__switch--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="task-pro__switch-knob" />
    </button>
  )
}