/**
 * HoverPanel —— 悬停面板。
 *
 * 悬停面板与降落面板结构完全一致（设计稿 group_45：标题 + 飞机列表 + 确认/取消，
 * 无参数设置区），外壳与「飞机列表」区块均已抽取为公共组件，此处仅做标题定制
 * （title=悬停）与页面级定位（className=hover-panel，定位规则声明于 HomePage.css）。
 *
 * 列表内容/样式实现详见 AircraftListPanel。
 */
import { AircraftListPanel, type AircraftListItem } from '../AircraftListPanel/AircraftListPanel'

export type HoverAircraft = AircraftListItem

export interface HoverPanelProps {
  /** 飞机列表，缺省使用设计稿示例数据 */
  aircraft?: HoverAircraft[]
  /** 确认悬停 */
  onConfirm: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function HoverPanel({ aircraft, onConfirm, onCancel }: HoverPanelProps) {
  return (
    <AircraftListPanel
      title="悬停"
      className="hover-panel"
      aircraft={aircraft}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}