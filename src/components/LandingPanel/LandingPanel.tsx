/**
 * LandingPanel —— 降落面板。
 *
 * 降落面板与起飞面板结构类似：外壳（背景/切角/标题/底部确认取消按钮）与
 * 「飞机列表」区块均已抽取为公共组件，此处仅做标题定制（title=降落）与
 * 页面级定位（className=landing-panel，定位规则声明于 HomePage.css）。
 *
 * 列表内容/样式实现详见 AircraftListPanel。
 */
import { AircraftListPanel, type AircraftListItem } from '../AircraftListPanel/AircraftListPanel'

export type LandingAircraft = AircraftListItem

export interface LandingPanelProps {
  /** 飞机列表，缺省使用设计稿示例数据 */
  aircraft?: LandingAircraft[]
  /** 确认降落 */
  onConfirm: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function LandingPanel({ aircraft, onConfirm, onCancel }: LandingPanelProps) {
  return (
    <AircraftListPanel
      title="降落"
      className="landing-panel"
      aircraft={aircraft}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}