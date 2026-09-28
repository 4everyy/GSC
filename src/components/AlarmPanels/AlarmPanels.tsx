import { useState, useEffect, useRef } from 'react'
import { ALARM_COLLAPSE_MS } from '../../lib/formationLayout'
import { deviceImages } from '../../assets/images/device/index'
import { homeImages } from '../../assets/images/home/index'
import { type AlarmColor } from '../../config'
import { useRealtimeStore } from '../../features/realtime/wsClient'
import { type AlarmPayload } from '../../features/realtime/protocol'
import './AlarmPanels.css'

/**
 * AlarmDetailPanel —— 告警信息详情面板。
 *
 * 点击顶栏三个告警徽标（红/橙/蓝铃铛）后弹出，作为 .alarm-panels wrapper 的第二个
 * flex 项位于常驻告警信息框（AlarmInfoPanel）正下方，两框由 wrapper 的 gap 分隔
 * （1920 基准 4px），互不重叠——box_6 顶部 122px 的标题/提示行区与常驻框（box_3）
 * 相同，由常驻框承担，本组件仅呈现 section_5 及以下内容，高度由 max-height 封顶 541（5 卡自然高度），视口不足时随外层轨道压缩、超出卡片经列表区内部滚动查看。
 * 关闭：再次点击顶栏同一告警徽标（HomePage toggle），不再设独立关闭按钮，
 * 避免按钮经负偏移上浮进入常驻框区域形成重叠。
 *
 * 数据源：WS alert 频道 → useRealtimeStore.alarms（真实告警事件流，AlarmPayload），
 * 按当前级别（红/橙/蓝）过滤展示，最新在前；无任何演示数据与兜底占位，
 * 无数据时列表为空（样式结构保留，等待服务端推送）。
 *
 * 结构（对应设计稿）：
 * - 筛选条：紧急信息 / 处理状态 / 处理状态下拉（section_5，背景切图）；
 *   下拉按已读状态筛选列表：全部（默认）/ 未读 / 已读
 * - 告警卡片列表（box_7 382×84）：青→蓝半透明渐变卡片（2px 圆角），
 *   结构 = 头部（标题/时间/状态徽章）→ 青色分隔线 → 主体（无人机图标/名称/告警文本）
 * - 右侧滚动条（image_9）
 */

/** 告警级别 → 筛选条标题：一级（红）紧急信息 / 二级（橙）警告信息 / 三级（蓝）提示信息 */
const LEVEL_TITLE: Record<AlarmColor, string> = {
  red: '紧急信息',
  orange: '警告信息',
  blue: '提示信息',
}

/** 处理状态筛选项：全部（默认）/ 未读 / 已读（依据 readIds 已读集合过滤） */
type StatusFilter = 'all' | 'unread' | 'read'

/** 告警发生时间（Unix 毫秒）→ 展示文案：YYYY/MM/DD  HH:mm:ss（与设计稿格式一致，本地时区） */
function formatOccurredAt(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

interface AlarmDetailPanelProps {
  /** 当前激活的告警色调（与常驻告警框同步，红/橙/蓝） */
  alarmColor?: AlarmColor
  /** 行聚焦请求（常驻告警框行点击联动）：展开并滚动定位到对应卡片；
   *  nonce 递增保证连续聚焦同一卡片也能触发消费，消费后由本组件清除 */
  focusRequest?: { alarmId: string; nonce: number } | null
  /** 消费完毕清除聚焦请求（避免重复消费） */
  onFocusConsumed?: () => void
}

export function AlarmDetailPanel({
  alarmColor,
  focusRequest,
  onFocusConsumed,
}: AlarmDetailPanelProps) {
  // 记忆最近一次有效级别（渲染期派生状态）：收起瞬间 activeAlarm → null、alarmColor → undefined，
  // 但收起动画播放期间面板仍可见，须沿用收起前的级别标题与色调，
  // 避免"警告/提示信息"在收起途中跳变为"紧急信息"（红色默认值）。
  // 再次展开（含直接切换到另一级别徽标）时立即同步为新级别。
  const [lastColor, setLastColor] = useState<AlarmColor>(alarmColor ?? 'red')
  if (alarmColor && alarmColor !== lastColor) setLastColor(alarmColor)
  const effectiveColor = alarmColor ?? lastColor
  const colorClass = ` alarm-detail-panel--${effectiveColor}`

  // 真实告警数据源：WS alert 频道推送沉淀于 useRealtimeStore.alarms
  const alarms = useRealtimeStore((s) => s.alarms)

  // 展开的卡片（手风琴：同时仅一张展开；点击已展开卡片收起）。
  // 展开态卡片高度自适应加高，主体下方多行展示详细文案 detail。
  // 以 alarmId 为键（服务端唯一 ID），级别切换时经下方派生重置清空，
  // 避免上一级别的展开/已读状态串扰新级别卡片
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // 已读卡片集合：点击展开过的卡片即视为已读（灰调背景），收起后保持已读态
  const [readIds, setReadIds] = useState<Set<string>>(new Set())

  // 处理状态筛选：'all' 全部（默认）/ 'unread' 未读 / 'read' 已读，
  // 依据已读集合 readIds 过滤当前级别告警列表
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  // 当前级别告警（最新在前）：切换徽标即整组切换。
  // filter 返回新数组，sort 不会改动 store 中的原列表。
  // 处理状态筛选叠加其上（已读/未读按 readIds 判断）；展开中的卡片保持可见
  // ——未读筛选下点击展开即变已读，不立即消失，收起后再按筛选隐藏
  const events = alarms
    .filter((a) => a.level === effectiveColor)
    .filter((a) => {
      if (statusFilter === 'all' || a.alarmId === expandedId) return true
      return statusFilter === 'read' ? readIds.has(a.alarmId) : !readIds.has(a.alarmId)
    })
    .sort((x, y) => y.occurredAt - x.occurredAt)

  // 级别切换重置（渲染期派生重置，与上方 lastColor 同一模式）：
  // 切换紧急/警告/提示时清空展开、已读与筛选状态，各级别互不串扰
  const [resetColor, setResetColor] = useState<AlarmColor>(effectiveColor)
  if (effectiveColor !== resetColor) {
    setResetColor(effectiveColor)
    setExpandedId(null)
    setReadIds(new Set())
    setStatusFilter('all')
  }

  // 列表滚动容器 ref：聚焦请求到达时滚动定位到对应卡片
  const eventsRef = useRef<HTMLDivElement>(null)

  // 常驻告警框行点击联动：展开目标卡片（标记已读）并滚动定位。
  // 级别切换时上方渲染期重置先清空展开/已读，本 effect 在提交后设置目标卡片，
  // 顺序安全；面板可能仍在展开动画（grid 0fr→1fr，ALARM_COLLAPSE_MS）中，
  // 延迟至动画结束再滚动，定位才准确。目标卡片不在当前级别列表时不动作
  // （级别展开切换已由 alarmPanelStore.openAlarm 完成）。
  const lastFocusNonceRef = useRef(0)
  useEffect(() => {
    if (!focusRequest || focusRequest.nonce === lastFocusNonceRef.current) return
    lastFocusNonceRef.current = focusRequest.nonce
    onFocusConsumed?.()
    const target = focusRequest.alarmId
    setExpandedId(target)
    setReadIds((prev) => (prev.has(target) ? prev : new Set(prev).add(target)))
    const timer = window.setTimeout(() => {
      const card = eventsRef.current?.querySelector<HTMLElement>(`[data-alarm-id="${target}"]`)
      card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, ALARM_COLLAPSE_MS)
    return () => window.clearTimeout(timer)
  }, [focusRequest, onFocusConsumed])

  return (
    <div className={`alarm-detail-panel${colorClass}`}>
      {/* 标题行/提示行由常驻框承担，此处仅详情内容；收起走顶栏徽标 toggle */}
      <div className="alarm-detail-panel__filter">
        <img src={homeImages.alarmDetailFilterBar} alt="" className="alarm-detail-panel__filter-bg" />
        {/* 纯白切图经 CSS mask 染成当前告警级别色（红/橙/蓝，与文案同色），故用 span 而非 img */}
        <span className="alarm-detail-panel__filter-icon" />
        <span className="alarm-detail-panel__filter-title">{LEVEL_TITLE[effectiveColor]}</span>
        <span className="alarm-detail-panel__filter-status-label">处理状态</span>
        {/* 原生下拉框（受控）：全部（默认）/ 未读 / 已读，
            按卡片已读状态（readIds）过滤下方告警列表 */}
        <select
          className="alarm-detail-panel__select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          aria-label="处理状态筛选"
        >
          <option value="all">全部</option>
          <option value="unread">未读</option>
          <option value="read">已读</option>
        </select>
      </div>

      {/* 告警卡片列表（box_7：渐变卡片）：数据全部来自 WS alert 频道真实推送，
          无告警时列表为空；点击卡片展开/收起详情（手风琴），展开后卡片加高并显示多行详细文案 */}
      <div className="alarm-detail-panel__events" ref={eventsRef}>
        {events.map((ev) => {
          const expanded = expandedId === ev.alarmId
          const read = readIds.has(ev.alarmId)
          return (
            <div
              className={`alarm-detail-panel__event${expanded ? ' alarm-detail-panel__event--expanded' : ''}${read ? ' alarm-detail-panel__event--read' : ''}`}
              key={ev.alarmId}
              data-alarm-id={ev.alarmId}
              role="button"
              aria-expanded={expanded}
              onClick={() => {
                // 展开即视为已读（灰调卡片）；再次点击收起，已读态保持
                if (expanded) {
                  setExpandedId(null)
                  return
                }
                setExpandedId(ev.alarmId)
                setReadIds((prev) => (prev.has(ev.alarmId) ? prev : new Set(prev).add(ev.alarmId)))
              }}
            >
              {/* 头部 box_36：标题 + 时间（右对齐）+ 状态徽章 label_15 */}
              <div className="alarm-detail-panel__event-head">
                <span className="alarm-detail-panel__event-title">{ev.title}</span>
                <span className="alarm-detail-panel__event-time">{formatOccurredAt(ev.occurredAt)}</span>
                {/* 状态徽章兼作展开指示箭头：收起态向下（down-arrow），展开态向上（up-arrow） */}
                <img
                  src={expanded ? deviceImages.upArrow : deviceImages.downArrow}
                  alt=""
                  className="alarm-detail-panel__event-status"
                />
              </div>
              {/* 青色分隔线 group_8 */}
              <div className="alarm-detail-panel__event-divider" />
              {/* 主体 box_37：编队图标 icon-formation + 设备名 + 告警文本 */}
              <div className="alarm-detail-panel__event-body">
                <img src={homeImages.iconFormation} alt="" className="alarm-detail-panel__event-drone" />
                <span className="alarm-detail-panel__event-drone-name">{ev.deviceId ?? ''}</span>
                {/* 简要告警文本常驻渲染：展开态经 --hidden 收纳淡出（与详情滑出同步过渡） */}
                <span
                  className={`alarm-detail-panel__event-text${expanded ? ' alarm-detail-panel__event-text--hidden' : ''}`}
                >
                  {ev.detail}
                </span>
              </div>
              {/* 滑动展开容器（常驻挂载）：grid 行高 0fr→1fr 过渡实现滑出/收回动画；
                  内层 overflow hidden 裁切，收起时完全隐藏不占高 */}
              <div
                className={`alarm-detail-panel__event-expand${expanded ? ' alarm-detail-panel__event-expand--open' : ''}`}
              >
                <div className="alarm-detail-panel__event-expand-inner">
                  <div className="alarm-detail-panel__event-detail">{ev.detail}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


/**
 * 告警信息面板（首页右上角）。
 *
 * 设计稿 box_3（414×122 @1920 基准）：
 * - 标题行：告警图标 + "告警信息"
 * - 紧急信息行（一级，红 #F32C30）：文本
 * - 警告信息行（二级，橙 #F3C200）：文本
 *
 * 数据源：WS alert 频道 → useRealtimeStore.alarms（真实告警事件流）。
 * 展示未确认（acknowledged=false）告警，按紧急程度优先排序（一级红 > 二级橙 >
 * 三级蓝，同级内最新在前），置顶最紧急的前 2 行（面板高度设计容量）；
 * 未入选的告警不丢失，完整保留在告警详情面板（AlarmDetailPanel）中查看。
 * 无任何演示数据与兜底占位——无告警时面板不渲染，首条告警到达时出现。
 *
 * 交互：
 * - 点击顶部告警徽标（红/橙/蓝）切换面板边框色调；
 * - 全部告警确认完成后，面板整体播放隐藏动画（淡出 + 右滑离场）后从页面移除，
 *   待新告警到达时重新出现。
 * 布局：absolute 定位，右边距与右侧图层按钮一致（clamp(8px,.83vw,16px)）。
 */
interface AlarmInfoPanelProps {
  /** 当前激活的告警色调（来自顶栏徽标点击），未激活时不着色 */
  alarmColor?: AlarmColor
  /** 行点击联动：展开告警详情面板中该行对应的告警卡片（包装器据此驱动
   *  alarmPanelStore.openAlarm + 详情面板聚焦请求） */
  onRowClick?: (alarmId: string, tone: AlarmTone) => void
}

/** 告警级别：一级 red（紧急信息）/ 二级 orange（警告信息）/ 三级 blue（提示信息），与顶栏三个告警徽标一一对应（同协议 AlarmLevel） */
type AlarmTone = 'red' | 'orange' | 'blue'

/** 面板最大展示行数：面板高 122px（1920 基准）设计容量 = 标题行 + 2 条消息行，取最紧急的 2 条 */
const INFO_PANEL_MAX_ROWS = 2

/** 告警级别紧急度权重：一级红（紧急）> 二级橙（警告）> 三级蓝（提示），数值越小越靠前 */
const TONE_URGENCY: Record<AlarmTone, number> = { red: 0, orange: 1, blue: 2 }

/** 告警级别文字色：一级（第一个徽标/红）#F32C30、二级（第二个徽标/橙）#F3C200、三级（第三个徽标/蓝）#0EA7F9 */
const TONE_TEXT: Record<AlarmTone, string> = {
  red: '#F32C30',
  orange: '#F3C200',
  blue: '#0EA7F9',
}

/** 面板整体隐藏动画时长（ms），需与 CSS 中 .alarm-info-panel.is-leaving 的动画时长保持一致 */
const PANEL_HIDE_DURATION = 400

/** 面板单行展示的告警视图模型（自 AlarmPayload 派生） */
interface AlarmRow {
  /** 告警唯一 ID（ WS alarmId，用于动画/已处理状态关联） */
  id: string
  /** 行文本：详情描述（空时回落标题，均为服务端真实字段） */
  text: string
  /** 告警级别（决定文字色与红色行 "!" 标记） */
  tone: AlarmTone
}

export function AlarmInfoPanel({ alarmColor, onRowClick }: AlarmInfoPanelProps) {
  const colorClass = alarmColor ? `alarm-info-panel--${alarmColor}` : ''

  // 真实告警数据源：WS alert 频道推送沉淀于 useRealtimeStore.alarms
  const alarms = useRealtimeStore((s) => s.alarms)

  // 展示行：未确认（acknowledged=false），按紧急程度优先排序
  //（一级红 > 二级橙 > 三级蓝，同级内最新在前），截取最紧急的前 2 行；
  // 未入选的告警仍完整沉淀在告警详情面板（AlarmDetailPanel）中查看。
  // sort/filter 作用于 slice 前的新数组（展开拷贝），不改动 store 原列表
  const messages: AlarmRow[] = [...alarms]
    .sort((x, y) => TONE_URGENCY[x.level] - TONE_URGENCY[y.level] || y.occurredAt - x.occurredAt)
    .filter((a: AlarmPayload) => !a.acknowledged)
    .slice(0, INFO_PANEL_MAX_ROWS)
    .map((a: AlarmPayload) => ({ id: a.alarmId, text: a.detail || a.title, tone: a.level }))

  // 面板整体隐藏流程：leaving＝正在播放隐藏动画，hidden＝动画播完、不再渲染。
  // 初始即无告警时直接隐藏（不渲染空壳面板），首条告警到达时出现
  const [panelLeaving, setPanelLeaving] = useState(false)
  const [panelHidden, setPanelHidden] = useState(messages.length === 0)
  // 待触发的定时器集合（组件卸载时统一清理，避免 setState 到已卸载组件）
  const timersRef = useRef<number[]>([])

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer))
    },
    [],
  )

  // 全部告警处理完成后播放面板隐藏动画并移除面板；
  // 新告警到达使列表重新非空时，复位面板显示状态使其再次出现。
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

      {/* 消息行：文本；数据来自 WS alert 频道真实推送 */}
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`alarm-info-panel__row${msg.tone === 'red' ? ' alarm-info-panel__row--red' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => onRowClick?.(msg.id, msg.tone)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onRowClick?.(msg.id, msg.tone)
            }
          }}
        >
          <span className="alarm-info-panel__text" style={{ color: TONE_TEXT[msg.tone] ?? TONE_TEXT.orange }} title={msg.text}>
            {msg.text}
          </span>
        </div>
      ))}
    </div>
  )
}