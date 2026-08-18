/**
 * RouteFlightPanel —— 航线飞行面板（底部条第 9 段按钮「航线飞行」）。
 *
 * 与指点返航面板结构基本一致（参数设置区块头 + 飞行高度步进 + 确认/航线生成/取消），
 * 差异：无航点信息行、确认与「航线生成」按钮均置灰，
 * 故直接复用参数化后的 TapReturnPanel，不重复任何样式。
 */
import { TapReturnPanel } from '../TapReturnPanel/TapReturnPanel'

export interface RouteFlightPanelProps {
  /** 确认：携带当前设置的飞行高度（米） */
  onConfirm: (height: number) => void
  /** 航线生成（暂记录日志，待接入真实链路） */
  onGenerateRoute?: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function RouteFlightPanel({ onConfirm, onGenerateRoute, onCancel }: RouteFlightPanelProps) {
  return (
    <TapReturnPanel
      title="航线飞行"
      heightLabel="飞行高度"
      className="route-flight-panel"
      confirmMuted
      middleMuted
      showWaypoint={false}
      onConfirm={onConfirm}
      onGenerateRoute={onGenerateRoute}
      onCancel={onCancel}
    />
  )
}