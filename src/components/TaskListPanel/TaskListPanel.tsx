/**
 * @file TaskListPanel.tsx
 * @description TaskListPanel —— 任务管理面板（PRD TSK-P0-02）。 职责拆分（单一职责）： - TaskItemCard.tsx  任务规划 tab 的单条任务卡片（行 + 展开详情） - TaskMonitorTab.tsx 执行监控 tab（执行中任务卡片列表 + 展开详情） - TaskPanels.tsx    创建流程门面（TaskCreatePanel / TaskProPanel） - 本文件            面板编排层：状态持有、tab 切换、筛选、删除确认弹窗
 * @author 4everyy
 * @date 2026-10-07
 */
import { useMemo, useState } from 'react'
import { taskList as initialTaskList, taskTypeOptions, type TaskItem, type TaskType } from '../../config/index'
import { taskPanelImages } from '../../assets/task-panel/index'
import {
  TaskCreatePanel,
  type TaskCreateFormValue,
  type TaskCreateType,
  TaskProPanel,
} from './TaskPanels'
import { TaskItemCard } from './TaskItemCard'
import { TaskMonitorTab } from './TaskMonitorTab'
import './TaskListPanel.css'

/** 设计稿切图资源（面板框架专用，src/assets/task-panel/） */
const IMAGES = {
  /** 标题栏图标 */
  headerIcon: taskPanelImages.headerIcon,
  /** 关闭按钮图标 */
  closeIcon: taskPanelImages.closeIcon,
  /** 标题下分隔线（434x3） */
  separator: taskPanelImages.separator,
  /** 下拉箭头（16x16） */
  dropdownArrow: taskPanelImages.dropdownArrow,
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
        /* 创建流程（内嵌）：占满面板内容区，替换页签/筛选/列表/创建按钮基础表单与专业模式互斥切换 */
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
                {filteredTasks.map((task) => (
                  <TaskItemCard
                    key={task.id}
                    task={task}
                    expanded={expandedId === task.id}
                    hovered={hoveredId === task.id}
                    onToggle={toggleExpand}
                    onHover={setHoveredId}
                    onDispatch={handleDispatch}
                    onDelete={setPendingDeleteId}
                  />
                ))}
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