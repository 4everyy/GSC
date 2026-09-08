import { useState } from 'react'
import { monitorTaskList } from '../../config/tasks'
import type { MonitorTaskItem } from '../../config/tasks'
import { taskPanelImages } from '../../assets/images/task-panel'
import iconFormation from '../../assets/images/home/icon-formation.png'
import './TaskMonitorTab.css'

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
                  {/* 行背景切图（双态：常规 / 展开-蓝），铺满 60px 全高 */}
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
                      className={`task-monitor__device${
                        dev.active ? ' task-monitor__device--active' : ''
                      }`}
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