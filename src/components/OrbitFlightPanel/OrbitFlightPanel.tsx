/**
 * OrbitFlightPanel —— 环绕飞行面板（底部条第 10 段按钮「环绕飞行」）。
 *
 * 与指点返航/航点飞行面板结构一致（参数设置区块头 + 盘旋高度 + 盘旋半径 + 航点信息 +
 * 确认/航线生成/取消），仅多一行「盘旋半径」步进，通过 TapReturnPanel 的 radiusLabel
 * 参数化追加，不重复任何样式。盘旋高度/盘旋半径除 −/+ 步进外支持手动键入数字（editable）。
 * 环绕中心取点与半径步进由 HomePage 驱动地图图钉/盘旋圆；点击「航线生成」后盘旋圆/
 * 最近点连线由虚线定格为实线并解除「确认」置灰，确认走二次滑动确认弹窗。
 */
import { TapReturnPanel } from '../TapReturnPanel/TapReturnPanel'

export interface OrbitFlightPanelProps {
  /** 环绕中心航点（地图取点回填，null = 尚未取点） */
  waypoint?: { lat: number; lng: number } | null
  /** 确认按钮置灰态：未点击「航线生成」定格实线前置灰，生成后解除 */
  confirmMuted?: boolean
  /** 确认：携带当前设置的盘旋高度（米）与盘旋半径（米，未开启半径步进时缺省） */
  onConfirm: (height: number, radius?: number) => void
  /** 盘旋半径步进回调：驱动地图盘旋圆像素半径实时刷新 */
  onRadiusChange: (radius: number) => void
  /** 航线生成：已取点（虚线）→ 虚线定格为实线并解除确认置灰；已生成实线 → 清除旧航点重新取点 */
  onGenerateRoute?: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function OrbitFlightPanel({
  waypoint,
  confirmMuted = false,
  onConfirm,
  onRadiusChange,
  onGenerateRoute,
  onCancel,
}: OrbitFlightPanelProps) {
  return (
    <TapReturnPanel
      title="环绕飞行"
      heightLabel="盘旋高度"
      radiusLabel="盘旋半径"
      editable
      className="orbit-flight-panel"
      waypoint={waypoint}
      confirmMuted={confirmMuted}
      onConfirm={onConfirm}
      onRadiusChange={onRadiusChange}
      onGenerateRoute={onGenerateRoute}
      onCancel={onCancel}
    />
  )
}