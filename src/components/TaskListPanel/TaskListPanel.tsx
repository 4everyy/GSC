import { useMemo, useState } from 'react'
import { taskList as initialTaskList, taskTypeOptions, type TaskItem, type TaskType, monitorTaskList, type MonitorTaskItem } from '../../config/index'
import iconFormation from '../../assets/images/home/icon-formation.png'
import { deviceImages } from '../../assets/images/device/index'
import { taskPanelImages } from '../../assets/images/task-panel/index'
  import {
    TaskCreatePanel,
    type TaskCreateFormValue,
    type TaskCreateType,
    TaskProPanel,
  } from './TaskPanels'
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
  /** 下发进程 3D 圆环矢量图（106x75，双层叠加按进度扇形揭示） */
  radarCircle: taskPanelImages.radarCircle,
  /** 详情底部装饰图（434x11） */
  detailBottomDeco: taskPanelImages.detailBottomDeco,
  /** 创建任务图标（20x20） */
  createIcon: taskPanelImages.createIcon,
} as const

type TabKey = 'monitor' | 'planning'

const typeOptions: TaskType[] = [...taskTypeOptions]

/** 行详情左侧行数据：全部设备均渲染（视口最多显示 4 行，超出下拉滚动查看，由 CSS 控制） */
function buildDetailRows(devices: TaskItem['devices']) {
  return devices.map((dev) => ({ dev }))
}

/** 下发进程：按全部设备中就绪（online，drone-white 图标）行数统计，
 *  以 x/x（就绪行数/设备总数）形式展示 */
function dispatchProgress(devices: TaskItem['devices']) {
  const ready = devices.filter((d) => d.badge === 'online').length
  return {
    ready,
    total: devices.length,
  }
}

/** 下发进程圆环：生成以图面中心为圆心的椭圆扇形路径（顶部 12 点方向起顺时针），
 *  作为上层亮态图的 clipPath —— 扫过角度 = 进度百分比 × 360°。
 *  扇形半径取整个 viewBox（106x75），保证覆盖该角度范围内图面全部像素
 *  （含 3D 环带侧壁），实现圆环按下发进度逐段点亮 */
function ringSectorPath(pct: number): string {
  const cx = 53
  const cy = 37.5
  const rx = 53
  const ry = 37.5
  const clamped = Math.min(1, Math.max(0, pct))
  if (clamped <= 0) return ''
  if (clamped >= 1) {
    // 整椭圆：两段弧闭合，避免起点与终点重合的退化弧
    return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx - rx} ${cy} Z`
  }
  const rad = (deg: number) => (deg * Math.PI) / 180
  const pt = (deg: number) =>
    `${(cx + rx * Math.cos(rad(deg))).toFixed(2)} ${(cy + ry * Math.sin(rad(deg))).toFixed(2)}`
  const startDeg = -90
  const endDeg = -90 + clamped * 360
  const largeArc = clamped > 0.5 ? 1 : 0
  return `M ${cx} ${cy} L ${pt(startDeg)} A ${rx} ${ry} 0 ${largeArc} 1 ${pt(endDeg)} Z`
}

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
  const [activeTab, setActiveTab] = useState<TabKey>('monitor')
  const [typeFilter, setTypeFilter] = useState<TaskType | null>(null)
  const [typeOpen, setTypeOpen] = useState(false)
  // 首个任务默认展开（对应设计稿 group_10 展开态）
  const [expandedId, setExpandedId] = useState<string | null>(initialTaskList[0]?.id ?? null)
  // hover 中的任务 id（行背景三态与设备/目标面板一致：展开蓝 > hover 橙 > 常规灰）
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  // 创建任务：点击「创建任务」按钮后内嵌展示于任务面板内容区（替换页签/筛选/列表/创建按钮）
  const [createOpen, setCreateOpen] = useState(false)
    // 专业模式：由创建任务面板「专业模式」按钮触发，内嵌替换创建表单（任务面板保持展开）
    const [proOpen, setProOpen] = useState(false)
    // 进入专业模式时的任务类型（由创建表单携带），决定步骤 1「策略适配」表单变体与生成任务类型
    const [proTaskType, setProTaskType] = useState<TaskCreateType>('巡检任务')

  const filteredTasks = useMemo(
    () => (typeFilter ? tasks.filter((t) => t.type === typeFilter) : tasks),
    [tasks, typeFilter],
  )

  const pendingDeleteTask = tasks.find((t) => t.id === pendingDeleteId) ?? null

  const toggleExpand = (id: string) => setExpandedId((cur) => (cur === id ? null : id))

  /** 下发：状态置为已下发，设备行徽标全部置 online（drone-white 图标，下发进程走满） */
  const handleDispatch = (id: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              status: '已下发',
              devices: t.devices.map((d) => ({ ...d, badge: 'online' as const })),
            }
          : t,
      ),
    )
  }

  const confirmDelete = () => {
    if (!pendingDeleteId) return
    setTasks((prev) => prev.filter((t) => t.id !== pendingDeleteId))
    setExpandedId((cur) => (cur === pendingDeleteId ? null : cur))
    setPendingDeleteId(null)
  }

    /** 专业模式生成任务：按进入时任务类型追加任务（默认未下发）并展开，随后收起整个创建流程 */
    const handleSubmitPro = () => {
      const id = String(tasks.length + 1).padStart(2, '0')
      const task: TaskItem = {
        id,
        name: `${id}${proTaskType === '打击任务' ? '打击' : '巡检'}专业模式任务`,
        type: proTaskType,
        status: '未下发',
        createdAt: formatNow(),
        devices: [{ id: `${id}-d1`, name: '01中科晶锐', badge: 'locate' }],
      }
      setTasks((prev) => [...prev, task])
      setExpandedId(id)
      setProOpen(false)
      setCreateOpen(false)
    }

  /** 一键创建：按表单值追加任务（默认未下发）并展开，随后收起内嵌创建面板 */
  const handleSubmitCreate = (value: TaskCreateFormValue) => {
    const id = String(tasks.length + 1).padStart(2, '0')
    const task: TaskItem = {
      id,
      name: value.name || `${id}${value.taskType === '打击任务' ? '打击' : '巡检'}任务`,
      type: value.taskType,
      status: '未下发',
      createdAt: formatNow(),
      devices: [{ id: `${id}-d1`, name: '01中科晶锐', badge: 'locate' }],
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
      className={`task-panel${visible ? ' task-panel--visible' : ''}${
        proOpen ? ' task-panel--create task-panel--pro' : createOpen ? ' task-panel--create' : ''
      }`}
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

      {createOpen ? (
        /* ====== 创建流程（内嵌）：占满面板内容区，替换页签/筛选/列表/创建按钮 ======
           基础表单与专业模式互斥切换；进入专业模式时表单保持挂载仅隐藏（visible=false），
           「返回上一步」回到表单时已填数据保留；返回箭头/提交后返回任务列表视图 */
        <>
          <TaskCreatePanel
            visible={!proOpen}
            onClose={() => setCreateOpen(false)}
            onSubmit={handleSubmitCreate}
            onProMode={(taskType) => {
              setProTaskType(taskType)
              setProOpen(true)
            }}
          />
          <TaskProPanel
            visible={proOpen}
            taskType={proTaskType}
            onBack={() => setProOpen(false)}
            onSubmit={handleSubmitPro}
          />
        </>
      ) : (
        <>
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
                  // 下发进程：全部设备中就绪（online）行数，以 x/x 形式展示
                  const progress = dispatchProgress(task.devices)
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
                              {/* 左侧：时间轴 + 执行设备卡片（全部渲染，视口最多 4 行，超出滚动查看） */}
                              <div className="task-detail__timeline">
                                {buildDetailRows(task.devices).map((row) => {
                                  const dev = row.dev
                                  return (
                                    <div className="task-detail__node" key={dev.id}>
                                      <div
                                        className={`task-detail__card${dev.badge === 'online' ? ' task-detail__card--ready' : ''}`}
                                      >
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
                                  )
                                })}
                              </div>

                              {/* 右侧：下发进程仪表（标签 + x/x 数值 + 3D 圆环切图，整体带高亮底光） */}
                              <div className="task-detail__gauge">
                                <span className="task-detail__gauge-label">下发进程</span>
                                <span className="task-detail__gauge-value">
                                  {progress.ready}/{progress.total}
                                </span>
                                <div className="task-detail__gauge-ring-wrap">
                                  {/* 3D 圆环按进度揭示：底层暗态 + 上层亮态扇形裁剪 */}
                                  <svg
                                    className="task-detail__gauge-ring"
                                    viewBox="0 0 106 75"
                                    aria-hidden="true"
                                  >
                                    <defs>
                                      <clipPath id={`task-ring-clip-${task.id}`}>
                                        <path
                                          d={ringSectorPath(
                                            progress.total > 0 ? progress.ready / progress.total : 0,
                                          )}
                                        />
                                      </clipPath>
                                    </defs>
                                    <image
                                      className="task-detail__gauge-ring-base"
                                      href={IMAGES.radarCircle}
                                      x="0"
                                      y="0"
                                      width="106"
                                      height="75"
                                    />
                                    <image
                                      className="task-detail__gauge-ring-fill"
                                      href={IMAGES.radarCircle}
                                      x="0"
                                      y="0"
                                      width="106"
                                      height="75"
                                      clipPath={`url(#task-ring-clip-${task.id})`}
                                    />
                                  </svg>
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
        </>
      )}

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


/** 任务卡片行首图标：巡检 / 打击二选一 */
function rowIconOf(type: MonitorTaskItem['type']) {
  return type === '打击任务' ? taskPanelImages.strikeIcon : taskPanelImages.inspectIcon
}

/** 执行监控 tab（设计稿 section_6）：
 *  任务卡片列表（行内容 + 底部进度槽）+ 展开详情（执行对象行） */
export function TaskMonitorTab() {
  // 首个任务默认展开
  const [expandedId, setExpandedId] = useState<string | null>(monitorTaskList[0]?.id ?? null)

  const toggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id))

  return (
    <div className="task-monitor">
      <div className="task-monitor__list">
        {monitorTaskList.map((task) => {
          const expanded = expandedId === task.id
          return (
            <div key={task.id}>
              {/* ====== 任务卡片：行内容（点击展开/收起）+ 底部进度槽 ====== */}
              <div className="task-monitor__card">
                <div
                  className="task-monitor__row"
                  role="button"
                  tabIndex={0}
                  aria-expanded={expanded}
                  onClick={() => toggle(task.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') toggle(task.id)
                  }}
                >
                  {/* 行背景切图（双态：常规 / 展开-蓝），铺满卡片全高 */}
                  <img
                    className="task-monitor__row-bg"
                    src={
                      expanded
                        ? taskPanelImages.monitorRowBgActive
                        : taskPanelImages.monitorRowBg
                    }
                    alt=""
                  />
                  {/* 第一列：类型图标 + 任务名称 */}
                  <div className="task-monitor__title">
                    <img className="task-monitor__type-icon" src={rowIconOf(task.type)} alt="" />
                    <span className="task-monitor__name">{task.name}</span>
                  </div>
                  {/* 状态列（仅存在「执行中」状态） */}
                  <span className="task-monitor__status">{task.status}</span>
                  {/* 开始时间列 */}
                  <span className="task-monitor__time">{task.startedAt}</span>
                  {/* 末列：停止图标 + 展开箭头 */}
                  <div className="task-monitor__actions">
                    <img
                      className="task-monitor__stop"
                      src={taskPanelImages.stopIcon}
                      alt="停止任务"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <img
                      className="task-monitor__arrow"
                      src={
                        expanded
                          ? taskPanelImages.expandArrowActive
                          : taskPanelImages.expandArrowNormal
                      }
                      alt=""
                    />
                  </div>
                </div>

                {/* 底部进度槽（428x7）：流动光带 */}
                <div className="task-monitor__progress" aria-hidden="true">
                  <img
                    className="task-monitor__progress-bg"
                    src={taskPanelImages.monitorConnectorBg}
                    alt=""
                  />
                  <span className="task-monitor__progress-line" />
                </div>
              </div>

              {/* ====== 展开详情：执行对象行 + 底部装饰 ====== */}
              {expanded && (
                <div className="task-monitor__detail">
                  {task.devices.map((dev) => (
                    <div
                      className="task-monitor__device"
                      key={dev.id}
                    >
                      <img className="task-monitor__drone" src={iconFormation} alt="" />
                      <span className="task-monitor__device-name">{dev.name}</span>
                      <span className="task-monitor__device-status">{dev.status}</span>
                      <span className="task-monitor__device-duration">{dev.duration}</span>
                      <span className="task-monitor__device-detail">{dev.detail}</span>
                    </div>
                  ))}
                  <img
                    className="task-monitor__detail-deco"
                    src={taskPanelImages.detailBottomDeco}
                    alt=""
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}