/**
 * @file HoverPanel.tsx
 * @description HoverPanel（自 PanelKit.tsx 拆出）—— 悬停指令面板：基于 AircraftListPanel 组装， 仅做「悬停」场景的文案与回调绑定（单一职责）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { AircraftListPanel, type AircraftListItem } from '../AircraftListPanel/AircraftListPanel'

/** HoverPanel —— 悬停面板。 */

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
