/**
 * @file PanelShell.tsx
 * @description PanelShell.tsx（自 PanelKit.tsx 拆出）—— 功能面板通用骨架：标题栏 / 内容区 / 底部三按钮， 加上「参数设置 / 飞机列表」PanelTabs。被起飞、降落、返航等多面板复用（复用性）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { type ReactNode } from 'react'

/** PanelShell —— 侧边功能面板公共外壳。 */

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

/** PanelTabs —— 功能面板内「参数设置 / 飞机列表」tab 栏（公共组件）。 */

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
