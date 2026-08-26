/**
 * AlarmDetailPanel —— 告警信息详情面板。
 *
 * 点击顶栏三个告警徽标（红/橙/蓝铃铛）后弹出，拼接到常驻告警信息框（AlarmInfoPanel）正下方——
 * box_6 顶部 122px 的标题/提示行区与常驻框（box_3）相同，由常驻框承担，本组件仅呈现
 * section_5 及以下内容，高度 510 = 632 - 122。
 *
 * 结构（对应设计稿）：
 * - 标题行：铃铛图标 + "告警信息"（block_7）
 * - 两条提示行：文本 + 行尾删除图标（block_8/9，与常驻面板一致）
 * - 筛选条：紧急信息 / 处理状态 / 处理状态下拉（section_5，背景切图）
 * - 事件卡片列表 ×3：标题+时间+状态徽章 → 分隔线 → 无人机+告警文本
 *   （block_10/section_7/section_8），卡片左侧有时间轴节点圆点装饰
 * - 右侧滚动条（image_9）
 */
import { homeImages } from '../../assets/images/home'
import type { AlarmColor } from '../../types'
import './AlarmDetailPanel.css'

/** 事件卡片数据（演示用静态数据，待接入真实告警事件流） */
interface AlarmEvent {
  /** 事件标题（如"设备异常"/"任务事件"） */
  title: string
  /** 事件时间 */
  time: string
  /** 无人机名称 */
  drone: string
  /** 告警文本 */
  text: string
}

const DEMO_EVENTS: AlarmEvent[] = [
  { title: '设备异常', time: '2026/07/28  14:24:56', drone: '01无人机', text: '告警信息提示文本告警信息提示文本' },
  { title: '任务事件', time: '2026/07/28  14:24:56', drone: '01无人机', text: '告警信息提示文本告警信息提示文本' },
  { title: '任务事件', time: '2026/07/28  14:24:56', drone: '01无人机', text: '告警信息提示文本告警信息提示文本' },
]

interface AlarmDetailPanelProps {
  /** 当前激活的告警色调（与常驻告警框同步，红/橙/蓝） */
  alarmColor?: AlarmColor
  /** 关闭按钮回调 */
  onClose: () => void
}

export function AlarmDetailPanel({ alarmColor, onClose }: AlarmDetailPanelProps) {
  const colorClass = alarmColor ? ` alarm-detail-panel--${alarmColor}` : ''

  return (
    <div className={`alarm-detail-panel${colorClass}`}>
      {/* 关闭按钮（标题行/提示行由常驻框承担，此处仅详情内容） */}
      <button
        type='button'
        className='alarm-detail-panel__close'
        aria-label='关闭告警详情'
        onClick={onClose}
      />

      <div className="alarm-detail-panel__filter">
        <img src={homeImages.alarmDetailFilterBar} alt="" className="alarm-detail-panel__filter-bg" />
        <img src={homeImages.alarmDetailIcon} alt="" className="alarm-detail-panel__filter-icon" />
        <span className="alarm-detail-panel__filter-title">紧急信息</span>
        <span className="alarm-detail-panel__filter-status-label">处理状态</span>
        <div className="alarm-detail-panel__select">
          <span className="alarm-detail-panel__select-text">请选择</span>
          <img src={homeImages.alarmDetailSelectArrow} alt="" className="alarm-detail-panel__select-arrow" />
        </div>
      </div>

      {/* 事件卡片列表（时间轴节点装饰 + 卡片） */}
      <div className="alarm-detail-panel__events">
        {DEMO_EVENTS.map((ev, i) => (
          <div className="alarm-detail-panel__event" key={i}>
            {/* 时间轴节点（设计稿 group_10/13/17：35×35 切图 50×50 取 -24px 精灵区域 + 3×3 白点） */}
            <span className="alarm-detail-panel__node">
              <span className="alarm-detail-panel__node-dot" />
            </span>
            <div className="alarm-detail-panel__card">
              <div className="alarm-detail-panel__card-head">
                <span className="alarm-detail-panel__card-title">{ev.title}</span>
                <span className="alarm-detail-panel__card-time">{ev.time}</span>
                <img src={homeImages.alarmDetailStatus} alt="" className="alarm-detail-panel__card-status" />
              </div>
              <div className="alarm-detail-panel__card-divider" />
              <div className="alarm-detail-panel__card-body">
                <span className="alarm-detail-panel__card-drone-wrap">
                  <img src={homeImages.alarmDetailDrone} alt="" className="alarm-detail-panel__card-drone" />
                  <span className="alarm-detail-panel__card-drone-name">{ev.drone}</span>
                </span>
                <span className="alarm-detail-panel__card-text">{ev.text}</span>
              </div>
            </div>
          </div>
        ))}
        {/* 右侧滚动条装饰（image_9：4×80） */}
        <span className="alarm-detail-panel__scrollbar" />
      </div>
    </div>
  )
}