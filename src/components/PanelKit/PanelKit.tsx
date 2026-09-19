import { type ReactNode, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import './PanelKit.css'
import { createPortal } from 'react-dom'
import { deviceImages } from '../../assets/images/device/index'
import { AircraftListPanel, type AircraftListItem } from '../home/panels/FlightCommandPanels'

/**
 * PanelShell —— 侧边功能面板公共外壳。
 *
 * 从 TakeoffPanel 抽取的公共结构：标题栏 + 内容区（children）+ 底部「确认/取消」按钮，
 * 以及统一的深色玻璃背景、右上 45° 切角 + 装饰三角视觉（纯 CSS 复刻设计稿，260×469）。
 *
 * 用法：TakeoffPanel / LandingPanel 等通过 className 传入定位钩子
 * （.takeoff-panel / .landing-panel，定位规则在 HomePage.css 中声明），
 * 面板内容作为 children 插入，自动占满标题与底部按钮之间的剩余空间。
 */

export interface PanelShellProps {
  /** 面板标题（如「起飞」「降落」） */
  title: string
  /** 无障碍名称，缺省为「{title}面板」 */
  ariaLabel?: string
  /** 附加类名（页面级定位钩子，如 takeoff-panel / landing-panel） */
  className?: string
  /** 确认按钮文案，默认「确认」 */
  confirmText?: string
  /** 取消按钮文案，默认「取消」 */
  cancelText?: string
  /** 中间按钮文案（如返航面板的「航线生成」），缺省不渲染 */
  middleText?: string
  /** 确认按钮置灰态（如区域降落/集结面板设计稿的灰色确认钮），仅改变配色 */
  confirmMuted?: boolean
  /** 中间按钮置灰态（如航线飞行面板设计稿的灰色「航线生成」钮），仅改变配色 */
  middleMuted?: boolean
  /** 点击确认 */
  onConfirm: () => void
  /** 点击取消（关闭面板） */
  onCancel: () => void
  /** 点击中间按钮（如「航线生成」，暂记录日志） */
  onMiddle?: () => void
  /** 面板内容：占满标题与底部按钮之间，自动撑满剩余高度 */
  children: ReactNode
}

export function PanelShell({
  title,
  ariaLabel,
  className,
  confirmText = '确认',
  cancelText = '取消',
  middleText,
  confirmMuted = false,
  middleMuted = false,
  onConfirm,
  onCancel,
  onMiddle,
  children,
}: PanelShellProps) {
  return (
    <div
      className={className ? `panel-shell ${className}` : 'panel-shell'}
      role="dialog"
      aria-label={ariaLabel ?? `${title}面板`}
    >
      <span className="panel-shell__title">{title}</span>
      <div className="panel-shell__body">{children}</div>
      <div
        className={`panel-shell__actions${middleText ? ' panel-shell__actions--triple' : ''}`}
      >
        <button
          type="button"
          className={`panel-shell__btn panel-shell__btn--confirm${confirmMuted ? ' panel-shell__btn--muted' : ''}`}
          onClick={onConfirm}
        >
          {confirmText}
        </button>
        {middleText && (
          <button
            type="button"
            className={`panel-shell__btn panel-shell__btn--middle${middleMuted ? ' panel-shell__btn--middle-muted' : ''}`}
            onClick={onMiddle}
          >
            {middleText}
          </button>
        )}
        <button
          type="button"
          className="panel-shell__btn panel-shell__btn--cancel"
          onClick={onCancel}
        >
          {cancelText}
        </button>
      </div>
    </div>
  )
}

/**
 * PanelTabs —— 功能面板内「参数设置 / 飞机列表」tab 栏（公共组件）。
 *
 * 从 TakeoffPanel 抽取：260×36 半透明轨道 + 126×32 蓝色渐变选中块，
 * 起飞（TakeoffPanel）/ 返航（ReturnHomePanel）等同类参数面板共用。
 */

export type PanelTab = 'params' | 'aircraft'

export interface PanelTabsProps {
  /** 当前选中 tab（受控） */
  tab: PanelTab
  /** 切换 tab */
  onChange: (tab: PanelTab) => void
  /** 参数设置 tab 文案，默认「参数设置」 */
  paramsText?: string
  /** 飞机列表 tab 文案，默认「飞机列表」 */
  aircraftText?: string
}

export function PanelTabs({
  tab,
  onChange,
  paramsText = '参数设置',
  aircraftText = '飞机列表',
}: PanelTabsProps) {
  return (
    <div className="panel-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'params'}
        className={`panel-tabs__tab${tab === 'params' ? ' panel-tabs__tab--active' : ''}`}
        onClick={() => onChange('params')}
      >
        {paramsText}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'aircraft'}
        className={`panel-tabs__tab${tab === 'aircraft' ? ' panel-tabs__tab--active panel-tabs__tab--active-last' : ''}`}
        onClick={() => onChange('aircraft')}
      >
        {aircraftText}
      </button>
    </div>
  )
}

/**
 * SlideConfirmDialog —— 滑动二次确认弹窗（可复用组件）。
 *
 * 适用于高风险指令（起飞 / 降落 / 航点飞行等）的二次确认：
 * 面板「确认」后弹出本弹窗，将滑块拖到最右边松手才真正执行 onConfirm；
 * 未拖到位松手自动回弹；点击遮罩空白处或右上角关闭按钮触发 onCancel。
 *
 * 实现要点：
 * - createPortal 挂载 document.body + 遮罩显式 pointer-events:auto，
 *   规避地图舞台容器 pointer-events:none 的继承导致拖拽收不到事件；
 * - 丝滑拖拽：pointermove 中直接改写 thumb 的 transform 与进度层 fill 的 width
 *   （绕过 React 渲染管线，逐帧跟手），松手时再把 state 同步为当前 DOM 值，
 *   下一帧归零实现平滑回弹，避免 re-render 跳变；
 * - 拖动过程中青色进度层实时增长（即时变色反馈），到位松手后整轨变青完成态；
 * - window 原生 pointermove/pointerup/pointercancel 监听 + ref 镜像最新值。
 */

export interface SlideConfirmDialogProps {
  /** 是否显示（false 时不渲染弹窗） */
  open: boolean
  /** 弹窗标题（如「起飞」「航点飞行」） */
  title: string
  /** 指令描述文案（如「执行航点飞行指令」） */
  message: string
  /** 滑轨提示文案，默认「拖动滑块到最右边，确认操作」 */
  hint?: string
  /** 滑块拖到最右松手后触发（带约 350ms 变色过渡） */
  onConfirm: () => void
  /** 点击遮罩空白处或右上角关闭按钮触发（确认过渡中不触发） */
  onCancel: () => void
}

/** 滑块尺寸常量（与设计稿一致）：宽 65、距滑轨边缘 2px */
const THUMB_WIDTH = 65
const THUMB_GAP = 2
/** 进度层初始宽度：对齐滑块中心（左边距 2 + 半宽 32.5） */
const FILL_BASE = THUMB_GAP + THUMB_WIDTH / 2

export function SlideConfirmDialog({
  open,
  title,
  message,
  hint = '拖动滑块到最右边，确认操作',
  onConfirm,
  onCancel,
}: SlideConfirmDialogProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 滑块当前位移（px，0 = 左端起点）——state 仅在松手/重置时同步，拖动中直改 DOM */
  const [left, setLeft] = useState(0)
  const [dragging, setDragging] = useState(false)
  /** 已滑到最右（完成态：整轨变青、提示文案隐藏） */
  const [done, setDone] = useState(false)
  /** 滑块可移动的最大行程（滑轨宽 − 滑块宽 − 两侧边距） */
  const [travel, setTravel] = useState(251)

  // window 监听器闭包读取的最新值镜像（避免 stale closure）
  const leftRef = useRef(0)
  const travelRef = useRef(251)
  const dragStart = useRef({ x: 0, left: 0 })
  const doneRef = useRef(false)
  const onConfirmRef = useRef(onConfirm)
  useEffect(() => {
    onConfirmRef.current = onConfirm
  }, [onConfirm])

  /** 把滑块与进度层同步到指定位移（直改 DOM，不触发 React 渲染） */
  const applyLeft = (v: number) => {
    if (thumbRef.current) thumbRef.current.style.transform = `translateX(${v}px)`
    if (fillRef.current) fillRef.current.style.width = `${FILL_BASE + v}px`
  }

  // 打开时重置滑块并测量滑轨行程；关闭/卸载时清理确认过渡定时器。
  // 状态重置在渲染期依据 open 变化派生；ref 重置与行程测量放入 rAF 异步执行
  //（规避 effect 内同步 setState 与渲染期读 ref）。
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setLeft(0)
      setDragging(false)
      setDone(false)
    }
  }

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => {
      leftRef.current = 0
      doneRef.current = false
      applyLeft(0)
      const width = trackRef.current?.clientWidth ?? 320
      const t = Math.max(width - THUMB_WIDTH - THUMB_GAP * 2, 0)
      travelRef.current = t
      setTravel(t)
    })
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [open])

  // 拖拽期间在 window 上监听 move / up / cancel（原生监听，不受 React 委托影响）
  useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent) => {
      const dx = e.clientX - dragStart.current.x
      const next = Math.min(Math.max(dragStart.current.left + dx, 0), travelRef.current)
      leftRef.current = next
      applyLeft(next) // 直改 DOM：逐帧跟手 + 进度层实时变色
    }
    /** 松手：到位（≥92% 行程）确认并整轨变青，否则平滑回弹到起点 */
    const up = () => {
      const cur = leftRef.current
      // 先把 state 同步为当前 DOM 值并恢复过渡（同一渲染内 transform 无变化，不跳变）
      setDragging(false)
      setLeft(cur)
      if (cur >= travelRef.current * 0.92) {
        leftRef.current = travelRef.current
        setLeft(travelRef.current)
        doneRef.current = true
        setDone(true)
        timerRef.current = setTimeout(() => onConfirmRef.current(), 350)
      } else {
        // 下一帧归零：transform/width 以 CSS 过渡平滑回弹
        requestAnimationFrame(() => {
          leftRef.current = 0
          setLeft(0)
        })
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [dragging])

  if (!open) return null

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (doneRef.current) return
    e.preventDefault() // 阻止原生文本选中/图片拖拽，保证拖动跟手
    dragStart.current = { x: e.clientX, left: leftRef.current }
    setDragging(true)
  }

  /** 弹窗主体（portal 到 body，脱离地图舞台 pointer-events:none 子树） */
  const dialog = (
    <div
      className="slide-confirm-overlay"
      onClick={(e) => {
        // 仅点击遮罩空白处才取消（拖动滑块松手在遮罩上时不误触）
        if (e.target === e.currentTarget && !doneRef.current) onCancel()
      }}
    >
      <div
        className="slide-confirm"
        role="dialog"
        aria-modal="true"
        aria-label={`${title}二次确认`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部 2px 高亮条 */}
        <div className="slide-confirm__accent" aria-hidden="true" />

        {/* 标题行：标题水平居中，行最右侧关闭按钮 */}
        <div className="slide-confirm__header">
          <div className="slide-confirm__header-center">
            <span className="slide-confirm__title">{title}</span>
          </div>
          <button
            type="button"
            className="slide-confirm__close"
            aria-label="关闭"
            onClick={onCancel}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="rgba(255,255,255,0.65)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* 指令信息行：居中「白色感叹号图标（18px 与文字一致）+ 文案」 */}
        <div className="slide-confirm__message">
          <span className="slide-confirm__message-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10.5" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
              <path d="M12 6.5v7" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="17" r="1.3" fill="#FFFFFF" />
            </svg>
          </span>
          <span className="slide-confirm__message-text">{message}</span>
        </div>

        {/* 滑轨：青色进度层实时增长；拖到最右松手后整轨变青完成态 */}
        <div
          className={`slide-confirm__track${dragging ? ' slide-confirm__track--dragging' : ''}${done ? ' slide-confirm__track--done' : ''}`}
          ref={trackRef}
        >
          <div
            className="slide-confirm__fill"
            ref={fillRef}
            style={{ width: FILL_BASE + left }}
            aria-hidden="true"
          />
          {!done && <span className="slide-confirm__hint">{hint}</span>}
          <div
            className={`slide-confirm__thumb${dragging ? ' slide-confirm__thumb--dragging' : ''}`}
            ref={thumbRef}
            style={{ transform: `translateX(${left}px)` }}
            role="slider"
            aria-label={hint}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((left / (travel || 1)) * 100)}
            onPointerDown={handlePointerDown}
          >
            {/* »»» 三箭头 #D9D9D9 */}
            <svg className="slide-confirm__thumb-icon" viewBox="0 0 30 24" aria-hidden="true">
              <path
                d="M4 5l7 7-7 7"
                fill="none"
                stroke="#D9D9D9"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M12 5l7 7-7 7"
                fill="none"
                stroke="#D9D9D9"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M20 5l7 7-7 7"
                fill="none"
                stroke="#D9D9D9"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(dialog, document.body)
}

/**
 * HeightStepper —— 数值设置行（公共组件）。
 *
 * 从 TakeoffPanel 抽取：标签（起飞高度/返航高度/降落速度）+ −/+ 步进器 + 数值框 + 单位（默认 m）。
 * 起飞（TakeoffPanel）/ 返航（ReturnHomePanel）/ 集结（AreaLandingPanel）等参数面板共用。
 * editable 开启后数值框本身即原生输入框（不再嵌套内层 input，点击框内任意位置直接聚焦）：
 * 仅数字键入、实时 clamp 联动 −/+、聚焦全选便于整值覆盖、失焦/回车归一化——
 * 环绕飞行「盘旋高度/盘旋半径」使用。
 */

export interface HeightStepperProps {
  /** 行标签，如「起飞高度」「返航高度」「降落速度」 */
  label: string
  /** 当前数值（高度为米，速度为米/秒） */
  height: number
  /** 数值变化（已 clamp） */
  onChange: (height: number) => void
  /** 单位文案，默认「m」（速度场景传「m/s」） */
  unit?: string
  /** 最小值，默认 1 */
  min?: number
  /** 最大值，默认 500 */
  max?: number
  /** 减小按钮无障碍名称 */
  minusAriaLabel?: string
  /** 增大按钮无障碍名称 */
  plusAriaLabel?: string
  /** 数值框可编辑（手动输入数字），默认 false 仅展示 */
  editable?: boolean
}

export function HeightStepper({
  label,
  height,
  onChange,
  unit = 'm',
  min = 1,
  max = 500,
  minusAriaLabel = '减小高度',
  plusAriaLabel = '增大高度',
  editable = false,
}: HeightStepperProps) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))

  /* 聚焦期间的本机草稿：null = 未聚焦，直接展示外部值 height。
   * 草稿不再由 effect 从 height 回写——聚焦键入不会被外部重渲染（半径联动地图、
   * mousemove 等）打断还原；未聚焦时 −/+ 步进与外部联动照常刷新展示。 */
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? String(height)

  /** 失焦/回车提交：有效数字 clamp 后写回，空串忽略（保持原值） */
  const commitDraft = (raw: string) => {
    const n = Number(raw)
    if (raw !== '' && Number.isFinite(n)) onChange(clamp(n))
    setDraft(null)
  }

  /* 宽单位（如 m/s）：加修饰类收紧单位左间距，避免整行超出面板宽度（见 HeightStepper.css） */
  const fieldClassName = `height-stepper__field${unit.length > 2 ? ' height-stepper__field--wide-unit' : ''}`

  return (
    <div className={fieldClassName}>
      <span className="height-stepper__label">{label}</span>
      <button
        type="button"
        className="height-stepper__btn height-stepper__btn--minus"
        aria-label={minusAriaLabel}
        onClick={() => onChange(clamp(height - 1))}
      />
      {editable ? (
        <input
          type="text"
          className="height-stepper__value-box height-stepper__value-box--editable"
          value={shown}
          onFocus={(e) => {
            setDraft(String(height))
            e.target.select() // 聚焦全选：直接键入即整值覆盖
          }}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '') // 仅数字
            setDraft(digits)
            if (digits !== '') onChange(clamp(Number(digits))) // 实时 clamp 联动
          }}
          onBlur={(e) => commitDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          inputMode="numeric"
          autoComplete="off"
          aria-label={`${label}输入`}
          spellCheck={false}
        />
      ) : (
        <div className="height-stepper__value-box">
          <span className="height-stepper__value">{height}</span>
        </div>
      )}
      <button
        type="button"
        className="height-stepper__btn height-stepper__btn--plus"
        aria-label={plusAriaLabel}
        onClick={() => onChange(clamp(height + 1))}
      />
      <span className="height-stepper__unit">{unit}</span>
    </div>
  )
}

/**
 * FormationSelect —— 队形下拉选择行公共组件（标签居左 + 下拉选择器居右）。
 *
 * 从 RallyPointPanel（集结队形）与 FormationFlightPanel（编队队形）抽取的公共行控件：
 * - 标签 56px 宽（与 HeightStepper 标签一致），下拉框左缘与步进按钮列对齐（label 56 + m-left 16）；
 * - 下拉框白 20% 底 + 60% 白描边，展开菜单深色底，选中项青色高亮；
 * - 受控组件：value/onChange 由父级管理，options 为选项数组。
 */

export interface FormationSelectProps<T extends string = string> {
  /** 行标签（如「集结队形」「编队队形」） */
  label: string
  /** 选项数组 */
  options: readonly T[]
  /** 当前选中队形 */
  value: T
  /** 选中队形变化 */
  onChange: (value: T) => void
}

export function FormationSelect<T extends string = string>({
  label,
  options,
  value,
  onChange,
}: FormationSelectProps<T>) {
  const [open, setOpen] = useState(false)

  return (
    <div className="formation-select">
      <span className="formation-select__label">{label}</span>
      <div
        className={`formation-select__box${open ? ' formation-select__box--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="formation-select__value">{value}</span>
        <img src={deviceImages.dropdown} alt="" />
        {open && (
          <div className="formation-select__dropdown">
            {options.map((item) => (
              <div
                key={item}
                className={`formation-select__dropdown-item${
                  item === value ? ' formation-select__dropdown-item--active' : ''
                }`}
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(item)
                  setOpen(false)
                }}
              >
                {item}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * HoverPanel —— 悬停面板。
 *
 * 悬停面板与降落面板结构完全一致（设计稿 group_45：标题 + 飞机列表 + 确认/取消，
 * 无参数设置区），外壳与「飞机列表」区块均已抽取为公共组件，此处仅做标题定制
 * （title=悬停）与页面级定位（className=hover-panel，定位规则声明于 HomePage.css）。
 *
 * 列表内容/样式实现详见 AircraftListPanel。
 */

export type HoverAircraft = AircraftListItem

export interface HoverPanelProps {
  /** 飞机列表，缺省使用设计稿示例数据 */
  aircraft?: HoverAircraft[]
  onRemove?: (id: string) => void
  /** 确认悬停 */
  onConfirm: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function HoverPanel({ aircraft, onRemove, onConfirm, onCancel }: HoverPanelProps) {
  return (
    <AircraftListPanel
      title="悬停"
      className="hover-panel"
      aircraft={aircraft}
      onRemove={onRemove}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
