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
 * 结构（对应设计稿）：
 * - 筛选条：紧急信息 / 处理状态 / 处理状态下拉（section_5，背景切图）
 * - 告警卡片列表 ×5（box_7 382×84）：青→蓝半透明渐变卡片（2px 圆角），
 *   结构 = 头部（标题/时间/状态徽章）→ 青色分隔线 → 主体（无人机图标/名称/告警文本）
 * - 右侧滚动条（image_9）
 */
import { useState } from 'react'
import { deviceImages } from '../../assets/images/device'
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
  /** 告警文本（卡片收起时的单行摘要） */
  text: string
  /** 告警详细文案（点击卡片展开后多行展示，卡片高度随内容自适应加高） */
  detail: string
  /** 聚合无人机列表（可选）：不同无人机存在相同告警时聚合为一张卡，
      头部展示数量角标（如 ③ = 3 架），展开后逐架列出详细信息 */
  drones?: string[]
}

/** 三级别演示数据（完全独立）：红=紧急 / 橙=警告 / 蓝=提示，
    切换顶栏徽标即整组切换，各自展开/已读状态互不串扰 */
const DEMO_EVENTS: Record<AlarmColor, AlarmEvent[]> = {
  // 紧急信息（红）：危急类事件
  red: [
    { title: '电量危急', time: '2026/07/28  14:24:56', drone: '02无人机', text: '电量低于返航阈值请立即返航电量低于返航阈值', detail: '紧急详情：02无人机当前电量12%，已低于返航阈值15%，建议立即执行自动返航并确认备降点安全，持续监控电量变化与飞行状态直至平稳降落。' },
    { title: '链路失联', time: '2026/07/28  14:21:03', drone: '01无人机', text: '数据链路中断超过10秒请检查电台数据链路中断', detail: '紧急详情：01无人机与地面站数据链路中断已超过10秒，最后位置与高度已记录，系统正在自动重连，请立即检查电台工作状态与天线指向。' },
    { title: '迫降告警', time: '2026/07/28  14:17:40', drone: '03无人机', text: '动力系统异常已触发紧急迫降动力系统异常', detail: '紧急详情：03无人机3号电机输出异常，整机动力冗余不足，已自动切换紧急迫降流程，请清理预定迫降区域并做好地面接应准备。' },
    { title: '禁区闯入', time: '2026/07/28  14:12:18', drone: '02无人机', text: '即将进入禁飞区请立即调整航线即将进入禁飞区', detail: '紧急详情：02无人机当前航线将在30秒后进入禁飞区边界，系统已发出纠偏指令，请操作员立即确认并手动调整航向规避限制空域。' },
    { title: '坠机风险', time: '2026/07/28  14:08:55', drone: '01无人机', text: '姿态角异常存在坠机风险姿态角异常存在坠机风险', detail: '紧急详情：01无人机横滚角短时超过安全阈值，姿态控制进入保护模式，请立即切换手动增稳模式并评估是否执行应急降落。' },
  ],
  // 警告信息（橙）：含聚合卡演示（01/02/03 相同任务事件聚合一张卡）
  orange: [
    { title: '设备异常', time: '2026/07/28  14:24:56', drone: '01无人机', text: '告警信息提示文本告警信息提示文本', detail: '告警信息提示文本于容器高度自适应告警信息提示文本于容器高度自适应告警信息提示文本于容器高度自适应告警信息提示文本于容器高度自适应' },
    { title: '任务事件', time: '2026/07/28  14:24:56', drone: '01无人机', text: '告警信息提示文本告警信息提示文本', detail: '告警信息提示文本于容器高度自适应告警信息提示文本于容器高度自适应告警信息提示文本于容器高度自适应告警信息提示文本于容器高度自适应' },
    // 聚合卡演示：01/02/03 三架无人机存在相同任务事件告警，聚合为一张卡（头部角标 ③）
    { title: '任务事件', time: '2026/07/28  14:24:56', drone: '01无人机', drones: ['01无人机', '02无人机', '03无人机'], text: '告警信息提示文本告警信息提示文本', detail: '告警信息提示文本于容器高度自适应告警信息提示文本于容器高度自适应告警信息提示文本于容器高度自适应告警信息提示文本于容器高度自适应' },
    { title: '设备异常', time: '2026/07/28  14:24:56', drone: '01无人机', text: '告警信息提示文本告警信息提示文本', detail: '告警信息提示文本于容器高度自适应告警信息提示文本于容器高度自适应告警信息提示文本于容器高度自适应告警信息提示文本于容器高度自适应' },
    { title: '任务事件', time: '2026/07/28  14:24:56', drone: '01无人机', text: '告警信息提示文本告警信息提示文本', detail: '告警信息提示文本于容器高度自适应告警信息提示文本于容器高度自适应告警信息提示文本于容器高度自适应告警信息提示文本于容器高度自适应' },
  ],
  // 提示信息（蓝）：常规提示类事件
  blue: [
    { title: '维护提醒', time: '2026/07/28  14:25:12', drone: '03无人机', text: '螺桨达到建议更换周期请及时更换螺桨达到', detail: '提示详情：03无人机螺桨累计使用时长已达到建议更换周期，为保障飞行效率与安全，建议任务结束后更换螺桨并记录维护台账。' },
    { title: '电量偏低', time: '2026/07/28  14:22:47', drone: '02无人机', text: '剩余电量低于50%请规划返航剩余电量低于', detail: '提示详情：02无人机剩余电量48%，低于50%预警线，请评估剩余任务时长并提前规划返航时机，避免触发低电量告警。' },
    { title: '天气提示', time: '2026/07/28  14:18:30', drone: '01无人机', text: '作业区域风速上升趋势请注意风速上升趋势', detail: '提示详情：作业区域未来10分钟风速呈上升趋势，预计接近5m/s，请关注飞机姿态与续航表现，必要时暂停任务择机恢复。' },
    { title: '固件更新', time: '2026/07/28  14:15:05', drone: '02无人机', text: '检测到新版本固件可择机升级检测到新版本固件', detail: '提示详情：02无人机检测到新版本固件v2.3.1，包含链路稳定性优化，建议在非任务时段执行升级，升级过程约需5分钟。' },
    { title: '航线偏移', time: '2026/07/28  14:09:22', drone: '03无人机', text: '实际航线与计划偏差超出提示阈值航线偏差', detail: '提示详情：03无人机实际航线与计划航线水平偏差1.8米，超出提示阈值，系统已自动修正，请留意后续航段跟踪精度。' },
  ],
}

/** 数量角标字符（带圈数字 ①–⑨）：聚合卡头部展示无人机数量，超出回退普通数字 */
const CIRCLED_NUMS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'] as const

/** 告警级别 → 筛选条标题：一级（红）紧急信息 / 二级（橙）警告信息 / 三级（蓝）提示信息 */
const LEVEL_TITLE: Record<AlarmColor, string> = {
  red: '紧急信息',
  orange: '警告信息',
  blue: '提示信息',
}

interface AlarmDetailPanelProps {
  /** 当前激活的告警色调（与常驻告警框同步，红/橙/蓝） */
  alarmColor?: AlarmColor
}

export function AlarmDetailPanel({ alarmColor }: AlarmDetailPanelProps) {
  // 记忆最近一次有效级别（渲染期派生状态）：收起瞬间 activeAlarm → null、alarmColor → undefined，
  // 但收起动画播放期间面板仍可见，须沿用收起前的级别标题与色调，
  // 避免"警告/提示信息"在收起途中跳变为"紧急信息"（红色默认值）。
  // 再次展开（含直接切换到另一级别徽标）时立即同步为新级别。
  const [lastColor, setLastColor] = useState<AlarmColor>(alarmColor ?? 'red')
  if (alarmColor && alarmColor !== lastColor) setLastColor(alarmColor)
  const effectiveColor = alarmColor ?? lastColor
  const colorClass = ` alarm-detail-panel--${effectiveColor}`

  // 当前级别的演示数据：三级别 mock 完全独立，切换徽标即整组切换
  const events = DEMO_EVENTS[effectiveColor]

  // 展开的卡片（手风琴：同时仅一张展开；点击已展开卡片收起）。
  // 展开态卡片高度自适应加高，主体下方多行展示详细文案 detail。
  // 索引型状态仅对当前级别有效，级别切换时经下方派生重置清空，
  // 避免上一级别的展开/已读索引串扰新级别卡片
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // 已读卡片集合：点击展开过的卡片即视为已读（灰调背景），收起后保持已读态
  const [readIds, setReadIds] = useState<Set<number>>(new Set())

  // 级别切换重置（渲染期派生重置，与上方 lastColor 同一模式）：
  // 切换紧急/警告/提示时清空展开与已读状态，各级别互不串扰
  const [resetColor, setResetColor] = useState<AlarmColor>(effectiveColor)
  if (effectiveColor !== resetColor) {
    setResetColor(effectiveColor)
    setExpandedId(null)
    setReadIds(new Set())
  }

  return (
    <div className={`alarm-detail-panel${colorClass}`}>
      {/* 标题行/提示行由常驻框承担，此处仅详情内容；收起走顶栏徽标 toggle */}
      <div className="alarm-detail-panel__filter">
        <img src={homeImages.alarmDetailFilterBar} alt="" className="alarm-detail-panel__filter-bg" />
        {/* 纯白切图经 CSS mask 染成当前告警级别色（红/橙/蓝，与文案同色），故用 span 而非 img */}
        <span className="alarm-detail-panel__filter-icon" />
        <span className="alarm-detail-panel__filter-title">{LEVEL_TITLE[effectiveColor]}</span>
        <span className="alarm-detail-panel__filter-status-label">处理状态</span>
        {/* 原生下拉框：占位 option「请选择」默认显示（disabled hidden，
            展开列表中不出现）；列表为演示用状态选项，待接入真实数据 */}
        <select className="alarm-detail-panel__select" defaultValue="" aria-label="处理状态筛选">
          <option value="" disabled hidden>请选择</option>
          <option value="pending">待处理</option>
          <option value="processing">处理中</option>
          <option value="done">已处理</option>
        </select>
      </div>

      {/* 告警卡片列表（新版 box_7：渐变卡片，移除旧时间轴节点）：
          点击卡片展开/收起详情（手风琴），展开后卡片加高并显示多行详细文案 */}
      <div className="alarm-detail-panel__events">
        {events.map((ev, i) => (
          <div
            className={`alarm-detail-panel__event${expandedId === i ? ' alarm-detail-panel__event--expanded' : ''}${readIds.has(i) ? ' alarm-detail-panel__event--read' : ''}`}
            key={i}
            role="button"
            aria-expanded={expandedId === i}
            onClick={() => {
              // 展开即视为已读（灰调卡片）；再次点击收起，已读态保持
              if (expandedId === i) {
                setExpandedId(null)
                return
              }
              setExpandedId(i)
              setReadIds((prev) => (prev.has(i) ? prev : new Set(prev).add(i)))
            }}
          >
            {/* 头部 box_36：标题 + 时间（右对齐）+ 状态徽章 label_15 */}
            <div className="alarm-detail-panel__event-head">
              <span className="alarm-detail-panel__event-title">{ev.title}</span>
              {/* 聚合卡：标题后跟无人机数量角标（③ = 3 架存在相同告警） */}
              {ev.drones && (
                <span className="alarm-detail-panel__event-count">
                  {CIRCLED_NUMS[ev.drones.length - 1] ?? ev.drones.length}
                </span>
              )}
              <span className="alarm-detail-panel__event-time">{ev.time}</span>
              {/* 状态徽章兼作展开指示箭头：收起态向下（down-arrow），展开态向上（up-arrow） */}
              <img
                src={expandedId === i ? deviceImages.upArrow : deviceImages.downArrow}
                alt=""
                className="alarm-detail-panel__event-status"
              />
            </div>
            {/* 青色分隔线 group_8 */}
            <div className="alarm-detail-panel__event-divider" />
            {/* 主体 box_37：编队图标 icon-formation + 名称 + 告警文本。
                聚合卡展开态：主体行与展开区首条目（01无人机）重复，整行收纳隐藏 */}
            <div
              className={`alarm-detail-panel__event-body${ev.drones && expandedId === i ? ' alarm-detail-panel__event-body--hidden' : ''}`}
            >
              <img src={homeImages.iconFormation} alt="" className="alarm-detail-panel__event-drone" />
              <span className="alarm-detail-panel__event-drone-name">
                {/* 聚合卡主体行始终只显示首架无人机名（如 01无人机）；
                    数量由头部角标 ③ 承担，完整清单在展开区逐架展示 */}
                {ev.drones ? ev.drones[0] : ev.drone}
              </span>
              {/* 简要告警文本常驻渲染：展开态经 --hidden 收纳淡出（与详情滑出同步过渡） */}
              <span
                className={`alarm-detail-panel__event-text${expandedId === i ? ' alarm-detail-panel__event-text--hidden' : ''}`}
              >
                {ev.text}
              </span>
            </div>
            {/* 滑动展开容器（常驻挂载）：grid 行高 0fr→1fr 过渡实现滑出/收回动画；
                内层 overflow hidden 裁切，收起时完全隐藏不占高 */}
            <div
              className={`alarm-detail-panel__event-expand${expandedId === i ? ' alarm-detail-panel__event-expand--open' : ''}`}
            >
              <div className="alarm-detail-panel__event-expand-inner">
                {/* 聚合卡：逐架列出无人机（图标+名称+该机详细文案）；单卡沿用原详情 */}
                {ev.drones ? (
                  <div className="alarm-detail-panel__event-drones">
                    {ev.drones.map((d, j) => (
                      <div className="alarm-detail-panel__event-drone-item" key={j}>
                        <div className="alarm-detail-panel__event-drone-item-head">
                          <img src={homeImages.iconFormation} alt="" className="alarm-detail-panel__event-drone" />
                          <span className="alarm-detail-panel__event-drone-name">{d}</span>
                        </div>
                        <div className="alarm-detail-panel__event-drone-item-detail">{ev.detail}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="alarm-detail-panel__event-detail">{ev.detail}</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}