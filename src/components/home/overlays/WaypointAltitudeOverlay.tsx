/**
 * @file WaypointAltitudeOverlay.tsx
 * @description .aircraft-altitude 样式（1.5px 绿色虚线垂线 + 底端发光投影点 +右侧 11px #00ff95 数值
 * @author 4everyy
 * @date 2026-10-07
 */

import { useFlightAnimStore } from '../../../stores/index'

/** - 订阅 flightAnimStore.waypointFligh… */
export function WaypointAltitudeOverlay() {
  const flight = useFlightAnimStore(
    (s) => s.waypointFlight ?? s.routeFlightFlight ?? s.orbitFlight,
  )
  const alt = flight?.altitude
  const groundY = flight?.groundY

  // 快照未就绪 / 未携带高度信息 → 不渲染（起飞从 0.000m 起即显示并直接变化）
  if (!flight || alt === undefined || groundY === undefined) return null

  const x = flight.x
  const topY = flight.y
  // 防御：地面点必须位于图标下方（图标按高度向上抬升）
  const bottomY = Math.max(groundY, topY + 4)
  const lineH = bottomY - topY

  return (
    /* 同款容器：position/top/left/height 经 inline 覆盖为视口定位 + 实时线长 */
    <span
      className="aircraft-altitude"
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: x,
        top: topY,
        height: lineH,
        transition: 'none',
        // 高于飞行图标 .drone-flight（z-index 1501）：爬升/平飞/盘旋全程虚线与数值标注不图标遮挡
        zIndex: 1502,
      }}
    >
      <span className="aircraft-altitude__stick" />
      {/* 数值固定 3 位小数、小数部分恒为 .000（如 20.000m → 21.000m）：单机操控
          高度变化时仅整数位跳动，小数点后三位保持不变；store 保留浮点驱动
          虚线/图标平滑位移，显示层取整后格式化（与 AircraftLayer 地面标注同规则）；
          标签固定在无人机图标上方而非沿虚线垂直居中——原 top:50% 在低高度/线短时
          恰落在 48×48 图标中心被机身遮挡，inline top:-34px（图标半径 24px + 约 10px
          间隙）使数值全程悬于图标上方清晰可见，left:6px 仍沿虚线右侧对齐 */}
      <span
        className="aircraft-altitude__value"
        style={{ top: -34 }}
      >
        {Math.floor(alt).toFixed(3)}m
      </span>
    </span>
  )
}