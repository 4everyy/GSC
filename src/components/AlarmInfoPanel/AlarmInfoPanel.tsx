import { useEffect, useRef, useState } from 'react'
import { homeImages } from '../../assets/images/home'
import type { AlarmColor } from '../../types'
import './AlarmInfoPanel.css'

/**
 * 告警信息面板（首页右上角）。
 *
 * 设计稿 box_3（414×122 @1920 基准）：
 * - 标题行：告警图标 + "告警信息"
 * - 紧急信息行（一级，红 #F32C30）：左侧 "!" 标记 + 文本 + 行尾处理图标（叉号）
 * - 警告信息行（二级，橙 #F3C200）：文本 + 行尾处理图标（叉号）
 *
 * 交互：
 * - 点击顶部告警徽标（红/橙/蓝）切换面板边框色调；
 * - 点击行尾叉号即默认将该条告警处理完成，该行播放隐藏动画（淡出右移 + 折叠收起）后从列表移除；
 * - 全部告警处理完成后，面板整体播放隐藏动画（淡出 + 右滑离场）后从页面移除。
 * 布局：absolute 定位，右边距与右侧图层按钮一致（clamp(8px,.83vw,16px)）。
 */
interface AlarmInfoPanelProps {
  /** 当前激活的告警色调（来自顶栏徽标点击），未激活时不着色 */
  alarmColor?: AlarmColor
}

/** 告警级别：一级 red（紧急信息）/ 二级 orange（警告信息）/ 三级 blue（提示信息），与顶栏三个告警徽标一一对应 */
type AlarmTone = 'red' | 'orange' | 'blue'

/** 面板展示的告警消息（示例数据，后续接入真实告警源） */
interface AlarmMessage {
  id: number
  text: string
  /** 告警级别：一级（紧急信息，红）/ 二级（警告信息，橙）/ 三级（提示信息，蓝） */
  tone: AlarmTone
}

const ALARM_MESSAGES: AlarmMessage[] = [
  { id: 1, text: '告警信息提示文本告警信息提示文本告警信息提示', tone: 'red' },
  { id: 2, text: '告警信息提示文本告警信息提示文最大文本最大文本...', tone: 'orange' },
]

/** 告警级别文字色：一级（第一个徽标/红）#F32C30、二级（第二个徽标/橙）#F3C200、三级（第三个徽标/蓝）#0EA7F9 */
const TONE_TEXT: Record<AlarmTone, string> = {
  red: '#F32C30',
  orange: '#F3C200',
  blue: '#0EA7F9',
}

/** 行隐藏动画总时长（ms）＝淡出 260ms + 折叠收起 100ms，需与 CSS 中行 .is-leaving 的动画时长保持一致 */
const ROW_HIDE_DURATION = 360

/** 面板整体隐藏动画时长（ms），需与 CSS 中 .alarm-info-panel.is-leaving 的动画时长保持一致 */
const PANEL_HIDE_DURATION = 400

export function AlarmInfoPanel({ alarmColor }: AlarmInfoPanelProps) {
  const colorClass = alarmColor ? `alarm-info-panel--${alarmColor}` : ''

  // 告警消息列表：点击叉号处理完成后（行动画播完）即从列表移除
  const [messages, setMessages] = useState(ALARM_MESSAGES)
  // 正在播放隐藏动画的消息 id 集合
  const [leavingIds, setLeavingIds] = useState<number[]>([])
  // 面板整体隐藏流程：leaving＝正在播放隐藏动画，hidden＝动画播完、不再渲染
  const [panelLeaving, setPanelLeaving] = useState(false)
  const [panelHidden, setPanelHidden] = useState(false)
  // 待触发的定时器集合（组件卸载时统一清理，避免 setState 到已卸载组件）
  const timersRef = useRef<number[]>([])

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer))
    },
    [],
  )

  // 全部告警处理完成后播放面板隐藏动画并移除面板；
  // 若将来接入真实告警源、列表重新非空，则复位面板显示状态使其可再次出现。
  // 显示状态在渲染期依据消息数量直接派生（避免 effect 内同步 setState 级联），
  // 隐藏动画定时器仍由 effect 异步启动。
  const [prevMsgCount, setPrevMsgCount] = useState(messages.length)
  if (prevMsgCount !== messages.length) {
    setPrevMsgCount(messages.length)
    if (messages.length > 0) {
      setPanelLeaving(false)
      setPanelHidden(false)
    } else {
      setPanelLeaving(true)
    }
  }

  useEffect(() => {
    if (messages.length > 0 || !panelLeaving || panelHidden) return
    const timer = window.setTimeout(() => setPanelHidden(true), PANEL_HIDE_DURATION)
    timersRef.current.push(timer)
  }, [messages.length, panelLeaving, panelHidden])

  /** 点击叉号：该条告警默认处理完成，先播放行隐藏动画，动画结束后再从列表移除 */
  const handleDismiss = (id: number) => {
    if (leavingIds.includes(id)) return // 动画播放中，忽略重复点击
    setLeavingIds((prev) => [...prev, id])
    const timer = window.setTimeout(() => {
      setMessages((prev) => prev.filter((msg) => msg.id !== id))
      setLeavingIds((prev) => prev.filter((leavingId) => leavingId !== id))
    }, ROW_HIDE_DURATION)
    timersRef.current.push(timer)
  }

  // 面板隐藏动画播完后，整体从页面移除
  if (panelHidden) return null

  return (
    <div
      className={`alarm-info-panel ${colorClass}${panelLeaving ? ' is-leaving' : ''}`}
      role="region"
      aria-label="告警信息"
    >
      {/* 标题行：图标 + 文字 */}
      <div className="alarm-info-panel__header">
        <img className="alarm-info-panel__icon" src={homeImages.alarmInfoIcon} alt="" draggable={false} />
        <span className="alarm-info-panel__title">告警信息</span>
      </div>

      {/* 消息行：标记 + 文本 + 处理（叉号）图标；点击叉号后该条告警默认处理完成并播放隐藏动画 */}
      {messages.map((msg) => {
        const isLeaving = leavingIds.includes(msg.id)
        return (
          <div
            key={msg.id}
            className={`alarm-info-panel__row${msg.tone === 'red' ? ' alarm-info-panel__row--red' : ''}${isLeaving ? ' is-leaving' : ''}`}
            aria-hidden={isLeaving}
          >
            {msg.tone === 'red' && (
              <i className="alarm-info-panel__mark" aria-hidden="true">
                <i className="alarm-info-panel__mark-h" />
                <i className="alarm-info-panel__mark-arrow" />
              </i>
            )}
            <span className="alarm-info-panel__text" style={{ color: TONE_TEXT[msg.tone] ?? TONE_TEXT.orange }} title={msg.text}>
              {msg.text}
            </span>
            <img
              className="alarm-info-panel__close"
              src={homeImages.alarmCloseIcon}
              alt="处理该条告警"
              draggable={false}
              onClick={() => handleDismiss(msg.id)}
            />
          </div>
        )
      })}
    </div>
  )
}