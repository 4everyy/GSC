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
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import './SlideConfirmDialog.css'

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