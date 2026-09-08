import { useMemo, useState } from 'react'
import {
  taskList as initialTaskList,
  taskTypeOptions,
  type TaskItem,
  type TaskType,
} from '../../config/tasks'
import iconFormation from '../../assets/images/home/icon-formation.png'
import { deviceImages } from '../../assets/images/device'
import { taskPanelImages } from '../../assets/images/task-panel'
import { TaskCreatePanel, type TaskCreateFormValue } from './TaskCreatePanel'
import { TaskMonitorTab } from './TaskMonitorTab'
import './TaskListPanel.css'

/**
 * 设计稿切图资源（src/assets/images/task-panel/，经 Vite 构建哈希化）。
 * 任务行背景三态（常规灰/hover 橙/展开蓝）复用设备面板切图 deviceImages，
 * 与设备管理/目标列表面板视觉保持一致。
 */
const IMAGES = {
  /** 标题栏图标 */
  headerIcon: taskPanelImages.headerIcon,
  /** 关闭按钮图标 */
  closeIcon: taskPanelImages.closeIcon,
  /** 标题下分隔线（434x3） */
  separator: taskPanelImages.separator,
  /** 下拉箭头（16x16） */
  dropdownArrow: taskPanelImages.dropdownArrow,
  /** 巡检任务行首图标（18x18） */
  inspectIcon: taskPanelImages.inspectIcon,
  /** 打击任务行首图标（11x20） */
  strikeIcon: taskPanelImages.strikeIcon,
  /** 行展开箭头-激活态（24x24） */
  expandArrowActive: taskPanelImages.expandArrowActive,
  /** 行展开箭头-默认态（24x24） */
  expandArrowNormal: taskPanelImages.expandArrowNormal,
  /** 展开详情背景（434x265） */
  detailBg: taskPanelImages.detailBg,
  /** 绿色圆底无人机剪影（20x20） */
  droneWhite: taskPanelImages.droneWhite,
  /** 定位图标（17x16，蓝圆底内） */
  locateIcon: taskPanelImages.locateIcon,
  /** 下发进程 3D 圆环切图（100x57，兼作底座装饰） */
  radarCircle: taskPanelImages.radarCircle,
  /** 详情底部装饰图（434x11） */
  detailBottomDeco: taskPanelImages.detailBottomDeco,
  /** 创建任务图标（20x20） */
  createIcon: taskPanelImages.createIcon,
} as const

type TabKey = 'monitor' | 'planning'

const typeOptions: TaskType[] = [...taskTypeOptions]

/** 当前时间格式化为 YYYY/MM/DD HH:mm:ss（与 mock 数据格式一致） */
function formatNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

interface TaskListPanelProps {
  visible: boolean
  onClose: () => void
}

export function TaskListPanel({ visible, onClose }: TaskListPanelProps) {
  const [tasks, setTasks] = useState<TaskItem[]>(initialTaskList)
  const [activeTab, setActiveTab] = useState<TabKey>('planning')
  const [typeFilter, setTypeFilter] = useState<TaskType | null>(null)
  const [typeOpen, setTypeOpen] = useState(false)
  // 首个任务默认展开（对应设计稿 group_10 展开态）
  const [expandedId, setExpandedId] = useState<string | null>(initialTaskList[0]?.id ?? null)
  // hover 中的任务 id（行背景三态与设备/目标面板一致：展开蓝 > hover 橙 > 常规灰）
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  // 创建任务弹层：点击「创建任务」按钮在任务面板右侧弹出（设计稿 group_23）
  const [createOpen, setCreateOpen] = useState(false)

  const filteredTasks = useMemo(
    () => (typeFilter ? tasks.filter((t) => t.type === typeFilter) : tasks),
    [tasks, typeFilter],
  )

  const pendingDeleteTask = tasks.find((t) => t.id === pendingDeleteId) ?? null

  const toggleExpand = (id: string) => setExpandedId((cur) => (cur === id ? null : id))

  /** 下发：状态置为已下发 */
  const handleDispatch = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: '已下发' } : t)))
  }

  const confirmDelete = () => {
    if (!pendingDeleteId) return
    setTasks((prev) => prev.filter((t) => t.id !== pendingDeleteId))
    setExpandedId((cur) => (cur === pendingDeleteId ? null : cur))
    setPendingDeleteId(null)
  }

  /** 一键创建：按表单值追加任务（默认未下发）并展开，随后关闭弹层 */
  const handleSubmitCreate = (value: TaskCreateFormValue) => {
    const id = String(tasks.length + 1).padStart(2, '0')
    const task: TaskItem = {
      id,
      name: value.name || `${id}${value.taskType === '打击任务' ? '打击' : '巡检'}任务`,
      type: value.taskType,
      status: '未下发',
      createdAt: formatNow(),
      devices: [{ id: `${id}-d1`, name: '01中科晶锐', badge: 'online' }],
      progress: { current: 0, total: value.targetCount },
    }
    setTasks((prev) => [...prev, task])
    setExpandedId(id)
    setCreateOpen(false)
  }

  const handleTypeSelect = (type: TaskType) => {
    setTypeFilter((cur) => (cur === type ? null : cur))
    setTypeOpen(false)
  }

  return (
    <section
      className={`task-panel${visible ? ' task-panel--visible' : ''}`}
      aria-label="任务列表面板"
    >
      {/* ====== 标题栏 ====== */}
      <header className="task-panel__header">
        <span className="task-panel__header-icon">
          <img src={IMAGES.headerIcon} alt="" />
        </span>
        <span className="task-panel__title">任务管理</span>
        <button
          className="task-panel__close"
          onClick={onClose}
          type="button"
          aria-label="关闭任务列表面板"
        >
          <img src={IMAGES.closeIcon} alt="" />
        </button>
      </header>

      {/* 分隔线 */}
      <img className="task-panel__separator" src={IMAGES.separator} alt="" />

      {/* ====== 页签：执行监控 / 任务规划 ====== */}
      <div
        className={`task-panel__tabs${activeTab === 'planning' ? ' task-panel__tabs--planning' : ''}`}
        role="tablist"
      >
        <span className="task-panel__tab-slider" aria-hidden="true" />
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'monitor'}
          className={`task-panel__tab${activeTab === 'monitor' ? ' task-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('monitor')}
        >
          执行监控
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'planning'}
          className={`task-panel__tab${activeTab === 'planning' ? ' task-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('planning')}
        >
          任务规划
        </button>
      </div>

      {/* ====== 任务类型筛选（仅任务规划 tab 显示，设计稿：执行监控下无此筛选行） ====== */}
      {activeTab === 'planning' && (
        <div className="task-panel__filter">
          <span className="task-panel__filter-label">任务类型</span>
          <div className={`task-panel__select${typeOpen ? ' task-panel__select--open' : ''}`}>
            <button
              type="button"
              className="task-panel__select-trigger"
              onClick={() => setTypeOpen((o) => !o)}
            >
              <span className={typeFilter ? '' : 'task-panel__select-placeholder'}>
                {typeFilter ?? '请选择'}
              </span>
              <img src={IMAGES.dropdownArrow} alt="" />
            </button>
            {typeOpen && (
              <div className="task-panel__dropdown" role="listbox">
                {typeOptions.map((t) => (
                  <div
                    key={t}
                    role="option"
                    aria-selected={typeFilter === t}
                    className={`task-panel__dropdown-item${typeFilter === t ? ' is-selected' : ''}`}
                    onClick={() => handleTypeSelect(t)}
                  >
                    {t}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====== 列表主体 ====== */}
      {activeTab === 'planning' ? (
        <div className="task-panel__body">
          <div className="task-panel__list">
            {filteredTasks.map((task) => {
              const expanded = expandedId === task.id
              return (
                <div className="task-item" key={task.id}>
                  {/* 任务行：背景三态（展开蓝 > hover 橙 > 常规灰），绝对定位铺满整行 */}
                  <div
                    className={`task-item__row${expanded ? ' task-item__row--active' : ''}`}
                    onClick={() => toggleExpand(task.id)}
                    onMouseEnter={() => setHoveredId(task.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <img
                      className="task-item__row-bg"
                      src={
                        expanded
                          ? deviceImages.rowBgBlue
                          : hoveredId === task.id
                            ? deviceImages.rowBgOrange
                            : deviceImages.rowBgGray
                      }
                      alt=""
                    />
                    <div className="task-item__main">
                      <img
                        className="task-item__type-icon"
                        src={task.type === '巡检任务' ? IMAGES.inspectIcon : IMAGES.strikeIcon}
                        alt=""
                      />
                      <span className="task-item__name">{task.name}</span>
                    </div>
                    <div className="task-item__status-wrap">
                      <span
                        className={`task-item__status-dot${
                          task.status === '未下发' ? ' task-item__status-dot--blue' : ''
                        }`}
                      />
                      <span className="task-item__status">{task.status}</span>
                    </div>
                    <span className="task-item__time">{task.createdAt}</span>
                    <img
                      className="task-item__expand"
                      src={expanded ? IMAGES.expandArrowActive : IMAGES.expandArrowNormal}
                      alt=""
                    />
                  </div>

                  {/* 展开详情 */}
                  {expanded && (
                    <div className="task-item__detail">
                      {/* 内容区与横向分割线包为一组：竖向分割线的定位锚点 */}
                      <div className="task-detail__main">
                        <div className="task-detail__top">
                          {/* 左侧：时间轴 + 执行设备卡片 */}
                          <div className="task-detail__timeline">
                            {task.devices.map((dev) => (
                              <div className="task-detail__node" key={dev.id}>
                                <div className="task-detail__card">
                                  <span
                                    className={`task-detail__badge task-detail__badge--${dev.badge}`}
                                  >
                                    {dev.badge === 'locate' ? (
                                      <img
                                        className="task-detail__locate"
                                        src={IMAGES.locateIcon}
                                        alt=""
                                      />
                                    ) : (
                                      <img
                                        className="task-detail__drone-white"
                                        src={IMAGES.droneWhite}
                                        alt=""
                                      />
                                    )}
                                  </span>
                                  <img
                                    className="task-detail__drone-icon"
                                    src={iconFormation}
                                    alt=""
                                  />
                                  <span className="task-detail__device-name">{dev.name}</span>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* 右侧：下发进程仪表（标签 + 数值 + 3D 圆环切图 + 底座辉光） */}
                          <div className="task-detail__gauge">
                            <span className="task-detail__gauge-label">下发进程</span>
                            <span className="task-detail__gauge-value">
                              {task.progress.current}/{task.progress.total}
                            </span>
                            <div className="task-detail__gauge-ring-wrap">
                              <span className="task-detail__gauge-ring-glow" />
                              <img
                                className="task-detail__gauge-ring"
                                src={IMAGES.radarCircle}
                                alt=""
                              />
                            </div>
                          </div>
                        </div>

                        {/* 竖向分割线：设备卡片右侧 24px（设计稿 box_7），
                          自内容区顶边起，止于横向分割线处，不向下超出 */}
                        <span className="task-detail__v-divider" aria-hidden="true" />

                        {/* 分割线：设备数据行与操作按钮之间（434x1） */}
                        <div className="task-detail__divider" />
                      </div>

                      {/* 操作按钮 */}
                      <div className="task-detail__actions">
                        <button
                          type="button"
                          className="task-detail__btn task-detail__btn--primary"
                          disabled={task.status === '已下发'}
                          onClick={() => handleDispatch(task.id)}
                        >
                          下发
                        </button>
                        <button
                          type="button"
                          className="task-detail__btn task-detail__btn--disabled"
                          disabled
                        >
                          开始
                        </button>
                        <button
                          type="button"
                          className="task-detail__btn task-detail__btn--outline"
                        >
                          重规划
                        </button>
                        <button
                          type="button"
                          className="task-detail__btn task-detail__btn--outline"
                          onClick={() => setPendingDeleteId(task.id)}
                        >
                          删除
                        </button>
                      </div>

                      <img className="task-detail__deco" src={IMAGES.detailBottomDeco} alt="" />
                    </div>
                  )}
                </div>
              )
            })}
            {filteredTasks.length === 0 && <div className="task-panel__empty">暂无任务</div>}
          </div>
        </div>
      ) : (
        <div className="task-panel__body">
          <TaskMonitorTab />
        </div>
      )}

      {/* ====== 创建任务（仅任务规划 tab 显示，执行监控下不展示此按钮） ====== */}
      {activeTab === 'planning' && (
        <button type="button" className="task-panel__create" onClick={() => setCreateOpen(true)}>
          <img src={IMAGES.createIcon} alt="" />
          <span>创建任务</span>
        </button>
      )}

      {/* ====== 创建任务弹层（右侧弹出，设计稿 group_23） ====== */}
      <TaskCreatePanel
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleSubmitCreate}
      />

      {/* ====== 删除确认弹窗 ====== */}
      {pendingDeleteTask && (
        <div className="task-panel__modal-mask" onClick={() => setPendingDeleteId(null)}>
          <div className="task-panel__modal" onClick={(e) => e.stopPropagation()}>
            <p className="task-panel__modal-text">确定删除「{pendingDeleteTask.name}」吗？</p>
            <div className="task-panel__modal-actions">
              <button
                type="button"
                className="task-panel__modal-btn"
                onClick={() => setPendingDeleteId(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="task-panel__modal-btn task-panel__modal-btn--danger"
                onClick={confirmDelete}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}