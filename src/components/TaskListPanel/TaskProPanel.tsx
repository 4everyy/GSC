import { useEffect, useState } from 'react'
import { taskPanelImages } from '../../assets/images/task-panel'
import './TaskProPanel.css'

/**
 * 「专业模式」任务规划面板（设计稿 node 655-44315）。
 *
 * 进入路径：任务管理 → 创建任务 → 专业模式。点击「专业模式」后：
 * - 任务面板组（TaskListPanel + TaskCreatePanel）整体关闭（淡出）；
 * - 本面板作为独立工作区全屏居中展开（遮罩 + 淡入）。
 *
 * 结构：
 * - 标题栏：创建任务 / 专业模式徽标 / 关闭
 * - 左栏：任务参数（名称* / 任务类型 / 执行方式 / 高度 / 速度 / 失联策略）
 * - 右栏：航点编辑表格（经度 / 纬度 / 高度 / 速度 / 动作 / 删除），支持添加航点
 * - 底部：生成任务（提交）/ 取消
 */
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
const IMAGES = {
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

  /** 每次打开重置：保证每次进入专业模式都是崭新表单，无上次残留 */
  useEffect(() => {
    if (!visible) return
    setName('')
    setNameError('')
    setTaskType('巡检任务')
    setExecMode('单次执行')
    setHeight(50)
    setSpeed(5)
    setLostPolicy('继续执行')
    setWaypoints([createWaypoint(), createWaypoint(), createWaypoint()])
  }, [visible])

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
            <img src={IMAGES.closeIcon} alt="" />
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
            <SegmentedControl
              value={taskType === '打击任务' ? '目标打击' : '区域巡检'}
              options={['区域巡检', '目标打击']}
              onChange={(v) => setTaskType(v === '区域巡检' ? '巡检任务' : '打击任务')}
            />

            <span className="task-pro__label">执行方式</span>
            <SegmentedControl
              value={execMode}
              options={['单次执行', '周期执行']}
              onChange={setExecMode}
            />

            <span className="task-pro__label">飞行高度（m）</span>
            <Stepper value={height} min={0} max={500} onChange={setHeight} />

            <span className="task-pro__label">飞行速度（m/s）</span>
            <Stepper value={speed} min={1} max={20} onChange={setSpeed} />

            <span className="task-pro__label">失联执行策略</span>
            <SegmentedControl
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
                            <img src={IMAGES.stepperMinus} alt="" />
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
                            <img src={IMAGES.stepperPlus} alt="" />
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
                            <img src={IMAGES.stepperMinus} alt="" />
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
                            <img src={IMAGES.stepperPlus} alt="" />
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
              <img src={IMAGES.addIcon} alt="" />
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
function SegmentedControl<T extends string>({
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
        <img src={IMAGES.stepperMinus} alt="" />
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
        <img src={IMAGES.stepperPlus} alt="" />
      </button>
    </div>
  )
}