/**
 * AircraftListPanel —— 飞机列表面板（公共组件，降落/返航等同类指令面板共用）。
 *
 * 结构（对应设计稿 box_5，260×469）：
 * - 外壳（深色玻璃背景/右上切角/标题/底部确认取消按钮）复用 PanelShell；
 * - 内部「飞机列表」区块复用 AircraftListSection（区块头 + 列表行 + 静态指示条）。
 */
import { PanelShell } from '../PanelShell/PanelShell'
import {
  AircraftListSection,
  DEFAULT_AIRCRAFT,
  type AircraftListItem,
} from './AircraftListSection'
import './AircraftListPanel.css'

export type { AircraftListItem }

export interface AircraftListPanelProps {
  /** 面板标题（如「降落」） */
  title: string
  /** 无障碍名称，缺省为「{title}面板」 */
  ariaLabel?: string
  /** 页面级定位钩子类名（如 landing-panel） */
  className?: string
  /** 区块标题，默认「飞机列表」 */
  sectionTitle?: string
  /** 飞机列表，缺省使用设计稿示例数据 */
  aircraft?: AircraftListItem[]
  /** 确认指令（确认降落） */
  onConfirm: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function AircraftListPanel({
  title,
  ariaLabel,
  className,
  sectionTitle = '飞机列表',
  aircraft = DEFAULT_AIRCRAFT,
  onConfirm,
  onCancel,
}: AircraftListPanelProps) {
  return (
    <PanelShell
      title={title}
      ariaLabel={ariaLabel}
      className={className}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <AircraftListSection sectionTitle={sectionTitle} aircraft={aircraft} />
    </PanelShell>
  )
}