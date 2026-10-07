/**
 * @file TaskCreatePanel.tsx
 * @description TaskCreatePanel —— 「创建任务」基础表单面板（设计稿 group_23）。 表单字段与任务列表联动：任务名称 / 执行对象数量（步进器）/ 执行方式 / 失联执行策略 / 任务类型。 从 TaskPanels.tsx 抽离（单一职责：快速创建任务）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { useState } from 'react'
import { type TaskType } from '../../config/index'
import { useTaskAreaStore, useLayerStore } from '../../stores/index'
import { useInspectionRouteStore } from '../../stores/inspectionRoute'
import {
  planeIdsByCount,
  podControlOneClickCreate,
  taskAreaTypeMeta,
  type TaskArea,
} from '../../api/index'
import { taskPanelImages } from '../../assets/task-panel'
import './TaskCreatePanel.css'

// 「创建任务」基础表单（设计稿 group_23）表单字段与任务列表联动：任务名称 / 执行对象数量（步进器）/ 执行方式 / 失联执行策略 / 任务类型
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

/** 设计稿切图资源（src/assets/task-panel/，经 Vite 构建哈希化） */
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

/** 面积展示格式化：km² → m²（1km² = 1,000,000m²），取整加千分位 */
const fmtAreaM2 = (km2: number) => `${Math.round(km2 * 1_000_000).toLocaleString('zh-CN')}m²`

/** 目标选择 mock 数据（任务类型=目标打击时展示：编号/类型） */
export const TARGETS = [
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
  /** 任务区数据源（接口化）：区域列表接口 queryTaskAreaList（useTaskAreaStore 首帧拉取 */
  const reconAreas = useTaskAreaStore((s) => s.areas).filter((a) => a.type === 'TeamReconnaissance')
  /** 「添加任务区」进入地图六边形绘制：与区域列表「添加区域」按钮同款跨层级信号——本面板挂载于 MapToolbar 内 */
  const requestAddArea = useTaskAreaStore((s) => s.requestAddArea)
  /** 任务区单选聚焦联动信号：与区域列表面板行复选框勾选同款跨层级信号——单选选中某一任务区时请求态势图平滑聚焦… */
  const requestFocusArea = useTaskAreaStore((s) => s.requestFocusArea)
  /** 选中任务区时按显示状态请求聚焦… */
  const focusIfVisible = (id: string) => {
    if (!useLayerStore.getState().taskAreaVisible) return
    if (useTaskAreaStore.getState().hiddenIds.has(id)) return
    requestFocusArea(id)
  }

  /* 挂载即默认值：父组件按 createOpen 条件挂载/卸载本面板，重新打开自然回到崭新表单 */

  if (!visible) return null

  /** 任务类型=目标打击时，列表切换为目标数据源；区域巡检为接口任务区数据 */
  const isStrike = taskType === '打击任务'
  const listItems = isStrike ? TARGETS : reconAreas

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

  /** 行点击切换选中：区域巡检=任务区单选（选中即替换，可再点取消）；目标打击=目标多选 */
  const toggleArea = (id: string) => {
    if (isStrike) {
      setSelectedAreaIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      )
    } else {
      // 单选选中新任务区时联动聚焦态势图（再点取消不触发，与区域列表面板勾选聚焦同款约定）
      if (!selectedAreaIds.includes(id)) focusIfVisible(id)
      setSelectedAreaIds((prev) => (prev.includes(id) ? [] : [id]))
    }
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
    // 一键创建指令下发（POST /v1/control/podControl，actionType=77）：height 固定200
    if (!isStrike) {
      const vertex = reconAreas
        .filter((a) => selectedAreaIds.includes(a.id))
        .map((a) => a.vertices)
      if (vertex.length > 0) {
        const planeIds = planeIdsByCount(targetCount)
        podControlOneClickCreate(planeIds, vertex)
          .then((routes) => {
            // 成功返回预设巡检航线：整体写入 store，态势图 InspectionRouteLayer监听后按线渲染（覆盖旧航线，重新创建即刷新）
            useInspectionRouteStore.getState().setInspectionRoutes(routes)
            console.info(
              `[task-create] 一键创建指令已发送：执行对象 [${planeIds.join(',')}]，任务区 ${vertex.length} 个，高度 200m，返回预设航线 ${routes.length} 条`,
            )
          })
          .catch((err) => console.error('[task-create] 一键创建指令下发失败：', err))
      }
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

      {/* 工具栏：目标打击=全选（多选）；区域巡检=任务区单选无全选，仅保留「添加任务区」并右对齐 */}
      <div
        className={`task-create__area-toolbar${
          !isStrike ? ' task-create__area-toolbar--single' : ''
        }`}
      >
        {isStrike && (
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
        )}
        {!isStrike && (
          <button
            type="button"
            className="task-create__add-area"
            onClick={requestAddArea}
            title="添加任务区：在地图上绘制六边形新增任务区"
          >
            <span className="task-create__add-area-inner">
              <img src={CreateIMAGES.addAreaIcon} alt="" />
              <span>添加任务区</span>
            </span>
          </button>
        )}
      </div>


      {/* 选择列表：任务类型=区域巡检时为任务区列表（接口数据筛选 TeamReconnaissance），目标打击时为目标列表 */}
      <div
        className={`task-create__area-list${!isStrike ? ' task-create__area-list--single' : ''}`}
      >
        {listItems.length === 0 && (
          <div className="task-create__area-empty">{isStrike ? '暂无目标' : '暂无任务区'}</div>
        )}
        {listItems.map((a, idx) => {
          const checked = selectedAreaIds.includes(a.id)
          return (
            <button
              type="button"
              role={isStrike ? 'checkbox' : 'radio'}
              aria-checked={checked}
              className="task-create__area-item"
              key={a.id}
              onClick={() => toggleArea(a.id)}
            >
              <span className="task-create__area-col task-create__area-col--index">
                {isStrike ? (
                  <img
                    className={
                      checked
                        ? 'task-create__area-checkbox task-create__area-checkbox--checked'
                        : 'task-create__area-checkbox'
                    }
                    src={checked ? CreateIMAGES.areaIndexIcon : CreateIMAGES.checkboxUnchecked}
                    alt=""
                  />
                ) : (
                  <span
                    className={`task-create__area-radio${checked ? ' task-create__area-radio--checked' : ''}`}
                    aria-hidden="true"
                  />
                )}
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
                  <span
                    className="task-create__area-col task-create__area-col--name"
                    title={(a as TaskArea).name}
                  >
                    {(a as TaskArea).name}
                  </span>
                  <span className="task-create__area-col task-create__area-col--type">
                    {taskAreaTypeMeta((a as TaskArea).type).label}
                  </span>
                  <span
                    className="task-create__area-col task-create__area-col--area"
                    title={`区域面积：${fmtAreaM2((a as TaskArea).areaKm2)}`}
                  >
                    {fmtAreaM2((a as TaskArea).areaKm2)}
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

