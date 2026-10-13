/**
 * @file ScreenToggle.tsx
 * @description ScreenToggle —— 顶栏「另一屏」开关（桌面壳双屏唤醒入口）：
 *              通常作为 WindowControls 的 leading 槽位插入（▢ ─ ✕ 同节奏排列）。
 *              图标为双 pane 显示屏：pane 位置映射真实屏幕布局（主屏左 / 视频屏右），
 *              代表「另一屏」的 pane 存活 = 青绿填充、关闭 = 暗色幽灵，状态结构性可读；
 *              点击切换 = 唤醒重建 / 关闭对方屏，一屏被单独关闭后可从另一屏此入口一键唤醒。
 *              状态经主进程广播（gsc:screens-changed）跨窗同步，初始值 invoke 拉取；
 *              纯浏览器环境无 gscWin 桥，本组件不渲染（浏览器内无多窗概念）。
 * @author 4everyy
 * @date 2026-10-12
 */
import { useEffect, useState } from 'react'
import {
  SCREEN_LABELS,
  hasScreenBridge,
  subscribeScreensChanged,
  toggleScreen,
  type ScreenHash,
  type ScreensState,
} from '../../lib/windowControls'
import './ScreenToggle.css'

/** 双 pane 显示屏图标（内联 SVG，白色 currentColor 描边，风格与 WindowControls 一致）：
 *  selfPane 在左侧（主屏）或右侧（视频屏），otherPane 以填充态表达对方屏是否存活 */
function IconScreen({ self, on }: { self: ScreenHash; on: boolean }) {
  /* 另一屏的 pane 画在真实布局侧：主屏（#/）的对方是右 pane，视频屏（#/video）的对方是左 pane */
  const otherIsRight = self === '#/'
  return (
    <svg
      className="screen-toggle__icon"
      width="18"
      height="18"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* 另一屏 pane（填充态 = 存活） */}
      <rect
        className={`screen-toggle__pane ${on ? 'is-on' : ''}`}
        x={otherIsRight ? 7.75 : 2.25}
        y="2.5"
        width="4"
        height="8"
        rx="0.75"
        stroke="none"
      />
      {/* 中缝分界 */}
      <path d="M7 1.75 V11.25" />
      {/* 显示屏外框 + 支架 */}
      <rect x="1.5" y="1.75" width="11" height="9.5" rx="1.5" />
      <path d="M7 11.25 V13" />
      <path d="M5.75 13 h2.5" />
    </svg>
  )
}

interface ScreenToggleProps {
  /** 当前屏幕标识：组件据此渲染「另一屏」的开关 */
  self: ScreenHash
  /** 禁用（如视频监测屏锁定期间） */
  disabled?: boolean
}

export function ScreenToggle({ self, disabled = false }: ScreenToggleProps) {
  /** 两屏状态（null = 尚未拿到初始值，按钮置灰防误触） */
  const [state, setState] = useState<ScreensState | null>(null)

  /* 挂载即订阅：先拉初始状态，再收主进程广播（创建/关闭任意屏都会推送） */
  useEffect(() => subscribeScreensChanged(setState), [])

  /* 纯浏览器无多窗概念：不渲染 */
  if (!hasScreenBridge()) return null

  const other: ScreenHash = self === '#/' ? '#/video' : '#/'
  const on = state?.[other] ?? false
  const label = SCREEN_LABELS[other]

  return (
    <button
      type="button"
      className={`screen-toggle ${disabled ? 'is-disabled' : ''}`}
      title={on ? `关闭${label}` : `打开${label}`}
      aria-label={on ? `关闭${label}` : `打开${label}`}
      aria-pressed={on}
      disabled={disabled || state === null}
      onClick={() => toggleScreen(other)}
    >
      <IconScreen self={self} on={on} />
    </button>
  )
}
