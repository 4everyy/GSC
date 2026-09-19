import { useState } from 'react'
import { type TaskType } from '../../config/index'
import { taskPanelImages } from '../../assets/images/task-panel'
import './TaskCreatePanel.css'
import './TaskProPanel.css'

/**
 * TaskPanels —— 任务创建流程弹层合集（2026-09-19 结构重组：TaskCreatePanel 与 TaskProPanel 合并，
 * 二者同属任务创建流程：创建弹层 → 专业模式全屏规划。样式仍分属两个 .css（合计超 800 行，保持独立）。
 * 合并时冲突标识符重命名：IMAGES → CreateIMAGES/ProIMAGES、SegmentedControl → CreateSegmentedControl/ProSegmentedControl。
 */

// ==================== 「创建任务」弹层（设计稿 group_23，560x700）====================
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
  closeIcon: taskPanelImages.createCloseIcon,
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

interface TaskCreatePanelProps {
  visible: boolean
  onClose: () => void
  /** 一键创建：携带表单值提交，由父组件追加任务 */
  onSubmit: (value: TaskCreateFormValue) => void
  /** 专业模式：关闭当前面板组并打开专业模式任务规划面板 */
  onProMode: () => void
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

  /** 每次打开重置：保证每次点开「创建任务」都是崭新表单，无上次残留。
   *  渲染期间检测 visible 变化并重置——React 会丢弃本次输出立即重渲染，
   *  不产生 effect 级联渲染（react.dev「You Might Not Need an Effect」） */
  const [prevVisible, setPrevVisible] = useState(visible)
  if (visible !== prevVisible) {
    setPrevVisible(visible)
    if (visible) {
      setName('')
      setTargetCount(10)
      setExecMode('单次执行')
      setLostPolicy('继续执行')
      setTaskType('巡检任务')
      setSelectedByType({ 巡检任务: [], 打击任务: [] })
      setNameError('')
    }
  }

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
        <span className="task-create__title">创建任务</span>
        <button
          type="button"
          className="task-create__close"
          onClick={onClose}
          aria-label="关闭创建任务面板"
        >
          <img src={CreateIMAGES.closeIcon} alt="" />
        </button>
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
        <button type="button" className="task-create__btn task-create__btn--outline" onClick={onProMode}>
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

// ==================== 「专业模式」任务规划面板（设计稿 node 655-44315）====================
// 进入路径：任务管理 → 创建任务 → 专业模式；任务面板组整体淡出，本面板作为独立工作区全屏居中展开。
// 左栏任务参数（名称*/类型/执行方式/高度/速度/失联策略）+ 右栏航点编辑表格（经纬度/高度/速度/动作/删除）。
export interface TaskProFormValue {
  name: string
  taskType: '巡检任务' | '打击任务'
  execMode: '单次执行' | '周期执行'
  height: number
  speed: number
  lostPolicy: '继续执行' | '返航'
  waypoints: TaskProWaypoint[]
}

/** 单个航点：坐标（经纬度）/ 高度 / 速度 / 动作 */
export interface TaskProWaypoint {
  id: string
  lng: string
  lat: string
  height: number
  speed: number
  action: WaypointAction
}

export type WaypointAction = '悬停' | '拍照' | '录像'
const ACTION_CYCLE: WaypointAction[] = ['悬停', '拍照', '录像']

/** 设计稿切图资源（src/assets/images/task-panel/） */
const ProIMAGES = {
  closeIcon: taskPanelImages.createCloseIcon,
  stepperMinus: taskPanelImages.stepperMinus,
  stepperPlus: taskPanelImages.stepperPlus,
  addIcon: taskPanelImages.addAreaIcon,
} as const

/** 航点序号：统一生成 4 位递增 id，避免删除后 key 冲突 */
let wpSeq = 0
const nextWpId = () => `wp-${++wpSeq}`

/** 数值输入：过滤非数字，NaN 归 0 */
const toNumber = (v: string) => {
  const n = Number(v.replace(/[^\d.-]/g, ''))
  return Number.isNaN(n) ? 0 : n
}

/** 新航点默认值：参考既有地图中心（114.3, 30.6），高度 50m / 速度 5m/s / 悬停 */
const createWaypoint = (): TaskProWaypoint => ({
  id: nextWpId(),
  lng: '114.300000',
  lat: '30.600000',
  height: 50,
  speed: 5,
  action: '悬停',
})

interface TaskProPanelProps {
  visible: boolean
  onClose: () => void
  /** 生成任务：携带表单值提交，由父组件追加任务 */
  onSubmit: (value: TaskProFormValue) => void
}

export function TaskProPanel({ visible, onClose, onSubmit }: TaskProPanelProps) {
  const [name, setName] = useState('')
  /** 任务名称必填校验：为空时在输入框下方显示提示 */
  const [nameError, setNameError] = useState('')
  const [taskType, setTaskType] = useState<TaskProFormValue['taskType']>('巡检任务')
  const [execMode, setExecMode] = useState<TaskProFormValue['execMode']>('单次执行')
  const [height, setHeight] = useState(50)
  const [speed, setSpeed] = useState(5)
  const [lostPolicy, setLostPolicy] = useState<TaskProFormValue['lostPolicy']>('继续执行')
  const [waypoints, setWaypoints] = useState<TaskProWaypoint[]>([])

  /** 每次打开重置：保证每次进入专业模式都是崭新表单，无上次残留。
   *  渲染期间检测 visible 变化并重置——React 会丢弃本次输出立即重渲染，
   *  不产生 effect 级联渲染（react.dev「You Might Not Need an Effect」） */
  const [prevVisible, setPrevVisible] = useState(visible)
  if (visible !== prevVisible) {
    setPrevVisible(visible)
    if (visible) {
      setName('')
      setNameError('')
      setTaskType('巡检任务')
      setExecMode('单次执行')
      setHeight(50)
      setSpeed(5)
      setLostPolicy('继续执行')
      setWaypoints([createWaypoint(), createWaypoint(), createWaypoint()])
    }
  }

  /** 面板常驻 DOM：由遮罩 opacity 过渡实现淡入/淡出（visible 仅切换高亮 class） */

  /** 更新指定航点字段（不可变更新，保持其余行不变） */
  const updateWaypoint = (id: string, patch: Partial<TaskProWaypoint>) => {
    setWaypoints((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)))
  }

  const removeWaypoint = (id: string) => {
    setWaypoints((prev) => prev.filter((w) => w.id !== id))
  }

  const addWaypoint = () => {
    setWaypoints((prev) => [...prev, createWaypoint()])
  }

  const handleSubmit = () => {
    // 必填校验：未填写时在输入框下方显示提示并中止提交
    if (!name.trim()) {
      setNameError('请输入任务名称')
      return
    }
    onSubmit({
      name: name.trim(),
      taskType,
      execMode,
      height,
      speed,
      lostPolicy,
      waypoints,
    })
  }

  return (
    <section
      className={`task-pro-mask${visible ? ' task-pro-mask--visible' : ''}`}
      aria-label="专业模式任务规划面板"
    >
      <div className="task-pro">
        {/* ====== 标题栏 ====== */}
        <header className="task-pro__header">
          <span className="task-pro__title">创建任务</span>
          <span className="task-pro__badge">专业模式</span>
          <button
            type="button"
            className="task-pro__close"
            onClick={onClose}
            aria-label="关闭专业模式面板"
          >
            <img src={ProIMAGES.closeIcon} alt="" />
          </button>
        </header>

        {/* ====== 内容区 ====== */}
        <div className="task-pro__body">
          {/* 左栏：任务参数 */}
          <div className="task-pro__form">
            <label className="task-pro__label" htmlFor="task-pro-name">
              任务名称<span style={{ color: '#ff6060' }}>*</span>
            </label>
            <input
              id="task-pro-name"
              className={`task-pro__input${nameError ? ' task-pro__input--error' : ''}`}
              value={name}
              placeholder="请输入任务名称"
              onChange={(e) => {
                setName(e.target.value)
                if (nameError) setNameError('')
              }}
            />
            {nameError && <span className="task-pro__input-error">{nameError}</span>}

            <span className="task-pro__label">任务类型</span>
            <ProSegmentedControl
              value={taskType === '打击任务' ? '目标打击' : '区域巡检'}
              options={['区域巡检', '目标打击']}
              onChange={(v) => setTaskType(v === '区域巡检' ? '巡检任务' : '打击任务')}
            />

            <span className="task-pro__label">执行方式</span>
            <ProSegmentedControl
              value={execMode}
              options={['单次执行', '周期执行']}
              onChange={setExecMode}
            />

            <span className="task-pro__label">飞行高度（m）</span>
            <Stepper value={height} min={0} max={500} onChange={setHeight} />

            <span className="task-pro__label">飞行速度（m/s）</span>
            <Stepper value={speed} min={1} max={20} onChange={setSpeed} />

            <span className="task-pro__label">失联执行策略</span>
            <ProSegmentedControl
              value={lostPolicy}
              options={['继续执行', '返航']}
              onChange={setLostPolicy}
            />
          </div>

          {/* 右栏：航点编辑 */}
          <div className="task-pro__editor">
            <div className="task-pro__editor-head">
              <span className="task-pro__editor-title">航点编辑</span>
              <span className="task-pro__count">共 {waypoints.length} 个航点</span>
            </div>

            <div className="task-pro__table">
              <div className="task-pro__thead">
                <span className="task-pro__col task-pro__col--index">航点</span>
                <span className="task-pro__col task-pro__col--lng">经度</span>
                <span className="task-pro__col task-pro__col--lat">纬度</span>
                <span className="task-pro__col task-pro__col--height">高度(m)</span>
                <span className="task-pro__col task-pro__col--speed">速度(m/s)</span>
                <span className="task-pro__col task-pro__col--action">动作</span>
                <span className="task-pro__col task-pro__col--op">操作</span>
              </div>

              {waypoints.length === 0 ? (
                <div className="task-pro__empty">暂无航点，请点击下方按钮添加</div>
              ) : (
                <div className="task-pro__rows">
                  {waypoints.map((wp, idx) => (
                    <div className="task-pro__row" key={wp.id}>
                      <span className="task-pro__col task-pro__col--index">
                        <img className="task-pro__wp-icon" src={taskPanelImages.areaIndexIcon} alt="" />
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="task-pro__col task-pro__col--lng">
                        <input
                          className="task-pro__cell-input"
                          value={wp.lng}
                          onChange={(e) => updateWaypoint(wp.id, { lng: e.target.value })}
                          aria-label={`航点 ${idx + 1} 经度`}
                        />
                      </span>
                      <span className="task-pro__col task-pro__col--lat">
                        <input
                          className="task-pro__cell-input"
                          value={wp.lat}
                          onChange={(e) => updateWaypoint(wp.id, { lat: e.target.value })}
                          aria-label={`航点 ${idx + 1} 纬度`}
                        />
                      </span>
                      <span className="task-pro__col task-pro__col--height">
                        <span className="task-pro__cell-stepper">
                          <button
                            type="button"
                            aria-label={`航点 ${idx + 1} 减少高度`}
                            onClick={() =>
                              updateWaypoint(wp.id, { height: Math.max(0, wp.height - 10) })
                            }
                          >
                            <img src={ProIMAGES.stepperMinus} alt="" />
                          </button>
                          <input
                            value={wp.height}
                            onChange={(e) =>
                              updateWaypoint(wp.id, { height: toNumber(e.target.value) })
                            }
                            aria-label={`航点 ${idx + 1} 高度`}
                          />
                          <button
                            type="button"
                            aria-label={`航点 ${idx + 1} 增加高度`}
                            onClick={() =>
                              updateWaypoint(wp.id, { height: Math.min(500, wp.height + 10) })
                            }
                          >
                            <img src={ProIMAGES.stepperPlus} alt="" />
                          </button>
                        </span>
                      </span>
                      <span className="task-pro__col task-pro__col--speed">
                        <span className="task-pro__cell-stepper">
                          <button
                            type="button"
                            aria-label={`航点 ${idx + 1} 减少速度`}
                            onClick={() =>
                              updateWaypoint(wp.id, { speed: Math.max(1, wp.speed - 1) })
                            }
                          >
                            <img src={ProIMAGES.stepperMinus} alt="" />
                          </button>
                          <input
                            value={wp.speed}
                            onChange={(e) =>
                              updateWaypoint(wp.id, { speed: toNumber(e.target.value) })
                            }
                            aria-label={`航点 ${idx + 1} 速度`}
                          />
                          <button
                            type="button"
                            aria-label={`航点 ${idx + 1} 增加速度`}
                            onClick={() =>
                              updateWaypoint(wp.id, { speed: Math.min(20, wp.speed + 1) })
                            }
                          >
                            <img src={ProIMAGES.stepperPlus} alt="" />
                          </button>
                        </span>
                      </span>
                      <span className="task-pro__col task-pro__col--action">
                        <button
                          type="button"
                          className="task-pro__action"
                          onClick={() =>
                            updateWaypoint(wp.id, {
                              action:
                                ACTION_CYCLE[(ACTION_CYCLE.indexOf(wp.action) + 1) % ACTION_CYCLE.length],
                            })
                          }
                        >
                          {wp.action}
                        </button>
                      </span>
                      <span className="task-pro__col task-pro__col--op">
                        <button
                          type="button"
                          className="task-pro__remove"
                          onClick={() => removeWaypoint(wp.id)}
                          aria-label={`删除航点 ${idx + 1}`}
                        >
                          ×
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button type="button" className="task-pro__add" onClick={addWaypoint}>
              <img src={ProIMAGES.addIcon} alt="" />
              <span>添加航点</span>
            </button>
          </div>
        </div>

        {/* ====== 底部操作 ====== */}
        <footer className="task-pro__footer">
          <button type="button" className="task-pro__btn task-pro__btn--primary" onClick={handleSubmit}>
            生成任务
          </button>
          <button type="button" className="task-pro__btn task-pro__btn--outline" onClick={onClose}>
            取消
          </button>
        </footer>
      </div>
    </section>
  )
}

/** 分段选择器：与创建任务面板同构（滑块高亮） */
function ProSegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: readonly T[]
  onChange: (v: T) => void
}) {
  const activeIndex = Math.max(0, options.indexOf(value))
  return (
    <div className="task-pro__segment" role="radiogroup">
      <span
        className="task-pro__segment-indicator"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
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

/** 数值步进器：− 值 +，复用创建任务面板步进图标 */
function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div className="task-pro__stepper">
      <button
        type="button"
        className="task-pro__stepper-btn"
        aria-label="减少"
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <img src={ProIMAGES.stepperMinus} alt="" />
      </button>
      <div className="task-pro__stepper-value">
        <input
          value={value}
          onChange={(e) => onChange(toNumber(e.target.value))}
          aria-label="数值"
        />
      </div>
      <button
        type="button"
        className="task-pro__stepper-btn"
        aria-label="增加"
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <img src={ProIMAGES.stepperPlus} alt="" />
      </button>
    </div>
  )
}
