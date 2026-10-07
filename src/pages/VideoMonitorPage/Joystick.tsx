/**
 * @file Joystick.tsx
 * @description Virtual joystick extracted from VideoMonitorPage.tsx.
 * @author 4everyy
 * @date 2026-10-07
 */
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import joystickCrosshairIcon from '../../assets/home/joystick-crosshair.svg'
import joystickRingInnerIcon from '../../assets/home/joystick-ring-inner.svg'
import joystickRingOuterIcon from '../../assets/home/joystick-ring-outer.svg'
import joystickArrowIcon from '../../assets/home/joystick-arrow.svg'

/* ---------------- 虚拟摇杆（画面左下） ---------------- */

/**
 * 素材组合（均为 src/assets/home/ 下设计稿导出件）：
 * - 最外围：joystick-ring-outer.svg（108×108，黑 0.4 透明圆底）；
 * - 内层：joystick-ring-inner.svg（56×56，黑 0.2 透明圆）套住中心图标；
 * - 中心：joystick-crosshair.svg（26×26 取景图标）；
 * - 四向键：joystick-arrow.svg（10×13，默认朝左的三角箭头——尖在左、平底在右），
 *   按方向旋转使尖端指向外侧（上 90° / 右 180° / 下 -90° / 左 0°）。
 *
 * 交互（Pointer Events，鼠标/触屏通用）：
 * - 点击：按下后 350ms 内松开 → 触发一次 tap 命令；按压期间 :active 通过兄弟选择器
 *   点亮对应方向的「管道」扇形高亮层（.vm-js-glow：conic 90° 扇形 + 径向 mask
 *   裁出内圈~外圈环带，沿管道填充、绝不超出外圈容器）；
 * - 长按：按住 ≥350ms 进入持续态（容器 data-holding 驱动该扇形层呼吸动画），
 *   期间每 100ms 重复触发 hold 命令（模拟持续转动云台），松开/取消即结束；
 * - setPointerCapture 保证指针移出按钮仍能收到 up/cancel，状态必定清理。
 * onCommand 为预留回调，接真实云台控制时由父组件传入即可。
 * disabled（页面锁定态）：四向键按钮原生禁用 + pointerdown 直接忽略，双保险。
 */

/** 四向键方向 */
export type JoystickDir = 'up' | 'right' | 'down' | 'left'

const JOYSTICK_DIR_LABELS: Record<JoystickDir, string> = {
  up: '向上',
  right: '向右',
  down: '向下',
  left: '向左',
}

/** 长按判定阈值：按住超过该时长进入「长按」持续态 */
const JOYSTICK_LONG_PRESS_MS = 350
/** 长按期间命令重复触发间隔（模拟持续控制） */
const JOYSTICK_REPEAT_MS = 100

export function Joystick({
  disabled = false,
  onCommand,
}: {
  /** 禁用态（页面锁定时四向键不响应按压/长按） */
  disabled?: boolean
  /** tap=单击一次；hold=长按持续（按 JOYSTICK_REPEAT_MS 间隔重复触发） */
  onCommand?: (dir: JoystickDir, mode: 'tap' | 'hold') => void
}) {
  /** 当前处于长按态的方向（用于持续高亮背景） */
  const [holding, setHolding] = useState<JoystickDir | null>(null)
  /** 长按判定定时器；触发后置 null（用于区分点击/长按） */
  const longPressTimer = useRef<number | null>(null)
  /** 长按期间重复触发命令的定时器 */
  const repeatTimer = useRef<number | null>(null)

  const clearTimers = () => {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current)
    if (repeatTimer.current !== null) window.clearInterval(repeatTimer.current)
    longPressTimer.current = null
    repeatTimer.current = null
    setHolding(null)
  }

  /* 卸载时清理定时器 */
  useEffect(() => clearTimers, [])

  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>, dir: JoystickDir) => {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setHolding(null)
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null // 已进入长按态，标记非待定
      setHolding(dir)
      onCommand?.(dir, 'hold')
      repeatTimer.current = window.setInterval(() => onCommand?.(dir, 'hold'), JOYSTICK_REPEAT_MS)
    }, JOYSTICK_LONG_PRESS_MS)
  }

  const handlePointerUp = (dir: JoystickDir) => {
    // 长按定时器仍在等待（未进入长按）→ 视为一次点击命令
    if (longPressTimer.current !== null) onCommand?.(dir, 'tap')
    clearTimers()
  }

  return (
    <div
      className="vm-joystick"
      role="group"
      aria-label="云台方向控制"
      /* 长按态方向：驱动对应管道扇形层的呼吸动画（CSS [data-holding='xx']） */
      data-holding={holding ?? undefined}
    >
      <img className="vm-js-outer" src={joystickRingOuterIcon} alt="" />
      <img className="vm-js-inner" src={joystickRingInnerIcon} alt="" />
      <img className="vm-js-center" src={joystickCrosshairIcon} alt="" />
      {(['up', 'right', 'down', 'left'] as const).map((dir) => (
        <Fragment key={dir}>
          <button
            type="button"
            className={`vm-js-btn vm-js-btn--${dir}`}
            disabled={disabled}
            aria-label={JOYSTICK_DIR_LABELS[dir]}
            onPointerDown={(e) => handlePointerDown(e, dir)}
            onPointerUp={() => handlePointerUp(dir)}
            onPointerCancel={clearTimers}
            /* 移动端长按不弹出系统上下文菜单 */
            onContextMenu={(e) => e.preventDefault()}
          >
            <img className="vm-js-arrow-icon" src={joystickArrowIcon} alt="" />
          </button>
          {/* 管道扇形高亮层：点击随按钮 :active 点亮（兄弟选择器），长按由容器
              data-holding 驱动呼吸；径向 mask 保证只填充环带、不超出外圈容器 */}
          <div className={`vm-js-glow vm-js-glow--${dir}`} aria-hidden />
        </Fragment>
      ))}
    </div>
  )
}
