/**
 * WaypointFlightPanel —— 航点飞行面板（底部条第 8 段按钮「航点飞行」）。
 *
 * 与指点返航面板结构完全一致（参数设置区块头 + 高度步进 + 航点信息 + 确认/航线生成/取消），
 * 仅标题（航点飞行）、高度标签（飞行高度）与确认置灰三处不同，
 * 故直接复用参数化后的 TapReturnPanel，不重复任何样式。
 */
import { TapReturnPanel } from '../TapReturnPanel/TapReturnPanel'

export interface WaypointFlightPanelProps {
  /** 确认：携带当前设置的飞行高度（米） */
  onConfirm: (height: number) => void
  /** 航线生成（暂记录日志，待接入真实链路） */
  onGenerateRoute?: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function WaypointFlightPanel({ onConfirm, onGenerateRoute, onCancel }: WaypointFlightPanelProps) {
  return (
    <TapReturnPanel
      title="航点飞行"
      heightLabel="飞行高度"
      className="waypoint-flight-panel"
      confirmMuted
      onConfirm={onConfirm}
      onGenerateRoute={onGenerateRoute}
      onCancel={onCancel}
    />
  )
}