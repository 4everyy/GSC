import { useEffect, useState } from 'react'
import type { TaskType } from '../../config/tasks'
import { taskPanelImages } from '../../assets/images/task-panel'
import './TaskCreatePanel.css'

/**
 * 「创建任务」弹层（设计稿 group_23，560x700）。
 *
 * 表单字段与任务列表联动：
 * - 任务名称 / 执行对象数量（步进器）/ 执行方式 / 失联执行策略 / 任务类型
 * - 任务区选择：全选 + 任务区列表（01 区域名称/区域类型/区域面积），支持勾选与添加
 * - 底部操作：一键创建（提交）/ 专业模式（占位）
 */
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
const IMAGES = {
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

  /** 每次打开重置：保证每次点开「创建任务」都是崭新表单，无上次残留 */
  useEffect(() => {
    if (!visible) return
    setName('')
    setTargetCount(10)
    setExecMode('单次执行')
    setLostPolicy('继续执行')
    setTaskType('巡检任务')
    setSelectedByType({ 巡检任务: [], 打击任务: [] })
    setNameError('')
  }, [visible])

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
          <img src={IMAGES.closeIcon} alt="" />
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
              <img src={IMAGES.stepperMinus} alt="" />
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
              <img src={IMAGES.stepperPlus} alt="" />
            </button>
          </div>
        </div>
      </div>

      {/* ====== 执行方式 ====== */}
      <span className="task-create__label">执行方式</span>
      <SegmentedControl
        value={execMode}
        options={['单次执行', '周期执行']}
        onChange={setExecMode}
      />

      {/* ====== 失联执行策略 ====== */}
      <span className="task-create__label">失联执行策略</span>
      <SegmentedControl
        value={lostPolicy}
        options={['继续执行', '返航']}
        onChange={setLostPolicy}
      />

      {/* ====== 任务类型 ====== */}
      <span className="task-create__label">任务类型</span>
      <SegmentedControl
        value={taskType === '打击任务' ? '目标打击' : '区域巡检'}
        options={['区域巡检', '目标打击']}
        onChange={(v) => setTaskType(v === '区域巡检' ? '巡检任务' : '打击任务')}
      />

      {/* ====== 任务区选择 ====== */}
      <div className="task-create__area-head">
        <span className="task-create__label">{isStrike ? '目标选择' : '任务区选择'}</span>
        <span className="task-create__info-icon">
          <img src={IMAGES.infoIcon} alt="" />
          <img className="task-create__info-dot" src={IMAGES.infoIconDot} alt="" />
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
              src={allChecked ? IMAGES.areaIndexIcon : IMAGES.checkboxUnchecked}
              alt=""
            />
          </span>
          <span>全选</span>
        </button>
        {!isStrike && (
          <button type="button" className="task-create__add-area">
            <span className="task-create__add-area-inner">
              <img src={IMAGES.addAreaIcon} alt="" />
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
                  src={checked ? IMAGES.areaIndexIcon : IMAGES.checkboxUnchecked}
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
                  <img className="task-create__target-icon" src={IMAGES.targetRightIcon} alt="" />
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
function SegmentedControl<T extends string>({
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