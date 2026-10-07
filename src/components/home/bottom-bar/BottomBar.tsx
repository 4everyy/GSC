/**
 * @file BottomBar.tsx
 * @description 底部功能按钮条：13 段背景图拼接 + 功能图标
 * @author 4everyy
 * @date 2026-10-07
 */
import { memo } from 'react'
import { BOTTOM_BAR_ITEMS, type BottomBarPanel } from '../../../lib/formationLayout'

/** 底部按钮条渲染 props：选中设备集合（禁用态判定）+ 各面板开合状态与互斥切换入口 */
interface BottomBarProps {
  selectedDevices: Set<number>
  panelOpenState: Record<BottomBarPanel, boolean>
  panelHandlers: Record<BottomBarPanel, () => void>
  formationFlightUnlocked: boolean
}

/* 底部水平居中按钮条（自 HomePage.tsx 拆出）：13 段背景图拼接，第 2~12 段叠加功能图标。 */
export const BottomBar = memo(function BottomBar({
  selectedDevices,
  panelOpenState,
  panelHandlers,
  formationFlightUnlocked,
}: BottomBarProps) {
  return (
    <nav className="bottom-bar" aria-label="底部功能按钮条">
      {BOTTOM_BAR_ITEMS.map((item, index) => {
        // 禁用态（按选中设备数量）：单机功能需恰好选中 1 台，多机功能需至少选中 1 台
        const disabled =
          (!!item.disabledBackground &&
            (item.mode === 'single' ? selectedDevices.size !== 1 : selectedDevices.size < 1)) ||
          (item.panel === 'formation-flight' && !formationFlightUnlocked)
        return (
          <span
            className={`bottom-bar__item${
              item.panel && panelOpenState[item.panel] && item.activeBackground && !disabled
                ? ' bottom-bar__item--active-bg'
                : ''
            }`}
            key={item.background}
          >
            <button
              type="button"
              aria-disabled={disabled || undefined}
              className={`bottom-bar__btn${item.icon ? '' : ' bottom-bar__btn--static'}${disabled ? ' bottom-bar__btn--disabled' : ''}${item.panel && panelOpenState[item.panel] && !disabled ? ' bottom-bar__btn--active' : ''}`}
              aria-label={item.tooltip ?? `功能按钮${index + 1}`}
              style={{ aspectRatio: `${item.width} / 72` }}
              onClick={disabled || !item.panel ? undefined : panelHandlers[item.panel]}
            >
              <span
                className="bottom-bar__visual"
                style={{
                  // 切图文件名（bottom-bar-seg-01.png 等）含连字符，url() 统一加引号以避免 unquoted URL 的解析歧义
                  backgroundImage: `url("${disabled ? (item.disabledBackground ?? item.background) : item.background}")`,
                }}
              >
                {item.icon && (
                  <img
                    className="bottom-bar__icon"
                    src={item.icon}
                    alt=""
                    draggable={false}
                  />
                )}
              </span>
            </button>
            {/* 激活态背景独立层（第 2~12 段功能按钮均提供 activeBackground）：
              切图画布统一 76px 高，实体区 60px 高、宽与默认段一致，四周为发光/投影边缘。
              置于 button 之外避免被其 clip-path 裁剪；内含图标副本与视觉层图标重合，
              激活时淡入覆盖默认段，关闭时淡出，与默认背景形成交叉过渡 */}
            {item.activeBackground && !disabled && (
              <span
                className="bottom-bar__active-glow"
                style={{
                  backgroundImage: `url("${item.activeBackground}")`,
                  // 画布宽 = 段宽 + 16（左右各 8px 发光边缘）：left/width 按段宽换算百分比（left = -8/段宽、width = (段宽+16)/段宽）
                  left: `${Math.round((-8 / item.width) * 100 * 100) / 100}%`,
                  width: `${Math.round(((item.width + 16) / item.width) * 100 * 100) / 100}%`,
                }}
                aria-hidden="true"
              >
                {item.icon && (
                  <img
                    className="bottom-bar__icon bottom-bar__icon--active-glow"
                    src={item.icon}
                    alt=""
                    draggable={false}
                  />
                )}
              </span>
            )}
            {item.tooltip && !disabled && (
              <span className="bottom-bar__tip">{item.tooltip}</span>
            )}
          </span>
        )
      })}
    </nav>
  )
})
