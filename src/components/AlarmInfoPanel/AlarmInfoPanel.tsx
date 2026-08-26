import { homeImages } from '../../assets/images/home'
import type { AlarmColor } from '../../types'
import './AlarmInfoPanel.css'

/**
 * 告警信息面板（首页右上角）。
 *
 * 设计稿 box_3（414×122 @1920 基准）：
 * - 标题行：告警图标 + "告警信息"
 * - 红色告警行：左侧 "!" 标记 + 文本 + 行尾删除图标
 * - 黄色提示行：文本 + 行尾删除图标
 *
 * 交互：点击顶部告警徽标（红/橙/蓝）切换面板边框色调；点击行尾删除图标可移除该条消息。
 * 布局：absolute 定位，右边距与右侧图层按钮一致（clamp(8px,.83vw,16px)）。
 */
interface AlarmInfoPanelProps {
  /** 当前激活的告警色调（来自顶栏徽标点击），未激活时不着色 */
  alarmColor?: AlarmColor
}

/** 面板展示的告警消息（示例数据，后续接入真实告警源） */
const ALARM_MESSAGES = [
  { id: 1, text: '告警信息提示文本告警信息提示文本告警信息提示', tone: 'red' as const },
  { id: 2, text: '告警信息提示文本告警信息提示文最大文本最大文本...', tone: 'yellow' as const },
]

type AlarmTone = (typeof ALARM_MESSAGES)[number]['tone']

const TONE_TEXT: Record<AlarmTone, string> = {
  red: '#f32c30',
  yellow: '#f3c200',
}

export function AlarmInfoPanel({ alarmColor }: AlarmInfoPanelProps) {
  const colorClass = alarmColor ? `alarm-info-panel--${alarmColor}` : ''

  return (
    <div className={`alarm-info-panel ${colorClass}`} role="region" aria-label="告警信息">
      {/* 标题行：图标 + 文字 */}
      <div className="alarm-info-panel__header">
        <img className="alarm-info-panel__icon" src={homeImages.alarmInfoIcon} alt="" draggable={false} />
        <span className="alarm-info-panel__title">告警信息</span>
      </div>

      {/* 消息行：标记 + 文本 + 删除图标 */}
      {ALARM_MESSAGES.map((msg) => (
        <div className={"alarm-info-panel__row " + (msg.tone === 'red' ? 'alarm-info-panel__row--red' : '')} key={msg.id}>
          {msg.tone === 'red' && (
            <i className="alarm-info-panel__mark" aria-hidden="true">
              <i className="alarm-info-panel__mark-h" />
              <i className="alarm-info-panel__mark-arrow" />
            </i>
          )}
          <span className="alarm-info-panel__text" style={{ color: TONE_TEXT[msg.tone] }} title={msg.text}>
            {msg.text}
          </span>
          <img
            className="alarm-info-panel__close"
            src={homeImages.alarmCloseIcon}
            alt="删除"
            draggable={false}
          />
        </div>
      ))}

    </div>
  )
}