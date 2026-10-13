/**
 * @file WindowControls.tsx
 * @description WindowControls —— 顶栏右上角窗口控制按钮组（缩小 ─ / 关闭 ✕），各屏顶栏共用。
 *              与系统窗口按钮一致：桌面壳（Electron）下经 gscWin 桥最小化/关闭当前窗口；
 *              纯浏览器内缩小为无操作（安全沙箱限制）、关闭返回态势主屏 #/。
 * @author 4everyy
 * @date 2026-10-12
 */
import type { ReactNode } from 'react'
import { minimizeWindow, closeWindow } from '../../lib/windowControls'
import './WindowControls.css'

/* ---------------- 小图标（内联 SVG，白色 currentColor） ---------------- */

function IconMinimize({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M2.5 7 L11.5 7" strokeLinecap="round" />
    </svg>
  )
}

function IconClose({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M2.5 2.5 L11.5 11.5 M11.5 2.5 L2.5 11.5" strokeLinecap="round" />
    </svg>
  )
}

/* ---------------- 窗口控制按钮组 ---------------- */

interface WindowControlsProps {
  /** 整组禁用（如视频监测屏锁定期间） */
  disabled?: boolean
  /**
   * 自定义缩小处理：页面据此收纳为底部任务栏页签（浏览器内）；
   * 缺省走 lib/windowControls.minimizeWindow（桌面壳内真最小化到系统任务栏）
   */
  onMinimize?: () => void
  /** leading 槽位：排在缩小/关闭之前的额外按钮（如 ScreenToggle 另一屏开关），共享组内 8px 间距 */
  leading?: ReactNode
}

export function WindowControls({ disabled = false, onMinimize, leading }: WindowControlsProps) {
  return (
    <div className="win-controls">
      {leading}
      <button
        type="button"
        className="win-controls__btn"
        title="缩小"
        aria-label="缩小"
        disabled={disabled}
        onClick={() => (onMinimize ? onMinimize() : minimizeWindow())}
      >
        <IconMinimize />
      </button>
      <button
        type="button"
        className="win-controls__btn win-controls__btn--close"
        title="关闭"
        aria-label="关闭"
        disabled={disabled}
        onClick={closeWindow}
      >
        <IconClose />
      </button>
    </div>
  )
}
