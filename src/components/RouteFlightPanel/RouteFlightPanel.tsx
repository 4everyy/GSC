/**
 * RouteFlightPanel —— 航线飞行面板（底部条第 9 段按钮「航线飞行」）。
 *
 * 与指点返航面板结构基本一致（参数设置区块头 + 飞行高度步进 + 确认/航线生成/取消），
 * 差异：
 * - 无单点航点信息行、确认与「航线生成」按钮初始置灰——点击「航线生成」进入取点
 *   （光标变带编号的航线图钉，左键逐点追加航点），右键/Esc 结束取点后航线定格，「确认」解除置灰；
 * - 飞行高度下方蓝色分割线 + 「航线信息」区：标题行 + 逐航点行
 *   （航点 + 圆形序号 + 纬度 000.00 N° / 经度 000.00 E°，设计稿 group_8）。
 * 参数区复用参数化后的 TapReturnPanel，航线信息区经 children 槽位插入，不重复外壳样式。
 */
import { TapReturnPanel } from '../TapReturnPanel/TapReturnPanel'
import './RouteFlightPanel.css'

/** 航点信息行：地图取点回传的经纬度（面板内仅只读展示） */
export interface RouteWaypoint {
  lat: number
  lng: number
}

export interface RouteFlightPanelProps {
  /** 航线就绪（已取点定格）后解除「确认」置灰，默认 false 保持置灰 */
  confirmReady?: boolean
  /** 「航线生成」中间按钮置灰态：默认随 confirmReady（未就绪置灰），
   *  传入 true 强制置灰（航线已生成后防重复生成） */
  routeMuted?: boolean
  /** 航点列表：逐行展示（航点 序号 纬度 N° / 经度 E°），随地图取点实时更新 */
  waypoints?: RouteWaypoint[]
  /** 确认：携带当前设置的飞行高度（米） */
  onConfirm: (height: number) => void
  /** 航线生成：进入地图取点模式（暂记录日志，待接入真实链路） */
  onGenerateRoute?: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

/** 经纬度格式化：6 位 xxx.xx，不足前补 0（N°/E° 单位语义下取绝对值） */
const formatCoord = (v: number) => Math.abs(v).toFixed(2).padStart(6, '0')

export function RouteFlightPanel({
  confirmReady = false,
  routeMuted,
  waypoints = [],
  onConfirm,
  onGenerateRoute,
  onCancel,
}: RouteFlightPanelProps) {
  return (
    <TapReturnPanel
      title="航线飞行"
      heightLabel="飞行高度"
      className="route-flight-panel"
      confirmMuted={!confirmReady}
      middleMuted={routeMuted ?? !confirmReady}
      showWaypoint={false}
      onConfirm={onConfirm}
      onGenerateRoute={onGenerateRoute}
      onCancel={onCancel}
    >
      {/* 航线信息区：蓝色分割线 + 标题行 + 逐航点行（无航点时仅展示分割线与标题） */}
      <div className="route-flight-panel__routes">
        <div className="route-flight-panel__divider" />
        <span className="route-flight-panel__routes-title">航线信息</span>
        <div className="route-flight-panel__waypoint-list">
          {waypoints.map((wp, i) => (
            <div className="route-flight-panel__waypoint-row" key={i}>
              <span className="route-flight-panel__waypoint-label">航点</span>
              <span className="route-flight-panel__waypoint-index">{i + 1}</span>
              <span className="route-flight-panel__waypoint-coord">{formatCoord(wp.lat)}</span>
              <span className="route-flight-panel__waypoint-unit">N°</span>
              <span className="route-flight-panel__waypoint-coord">{formatCoord(wp.lng)}</span>
              <span className="route-flight-panel__waypoint-unit route-flight-panel__waypoint-unit--last">
                E°
              </span>
            </div>
          ))}
        </div>
      </div>
    </TapReturnPanel>
  )
}
