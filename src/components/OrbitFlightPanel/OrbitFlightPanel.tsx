/**
 * OrbitFlightPanel —— 环绕飞行面板（底部条第 10 段按钮「环绕飞行」）。
 *
 * 与指点返航/航点飞行面板结构一致（参数设置区块头 + 盘旋高度 + 盘旋半径 + 航点信息 +
 * 确认/航线生成/取消），仅多一行「盘旋半径」步进，通过 TapReturnPanel 的 radiusLabel
 * 参数化追加，不重复任何样式。
 */
import { TapReturnPanel } from '../TapReturnPanel/TapReturnPanel'

export interface OrbitFlightPanelProps {
  /** 确认：携带当前设置的盘旋高度（米） */
  onConfirm: (height: number) => void
  /** 航线生成（暂记录日志，待接入真实链路） */
  onGenerateRoute?: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function OrbitFlightPanel({ onConfirm, onGenerateRoute, onCancel }: OrbitFlightPanelProps) {
  return (
    <TapReturnPanel
      title="环绕飞行"
      heightLabel="盘旋高度"
      radiusLabel="盘旋半径"
      className="orbit-flight-panel"
      onConfirm={onConfirm}
      onGenerateRoute={onGenerateRoute}
      onCancel={onCancel}
    />
  )
}