/**
 * @file RallyPointAltitudeOverlay.tsx
 * @description 同一套 .aircraft-altitude 样式（1.5px 绿色虚线垂线 + 底端发光投影点 +右侧 11px #00ff95 数值
 * @author 4everyy
 * @date 2026-10-07
 */

import { useFlightAnimStore } from '../../../stores/index'

/** - 订阅 flightAnimStore.rallyPointFlights… */
export function RallyPointAltitudeOverlay() {
  const flights = useFlightAnimStore((s) => s.rallyPointFlights)

  return (
    <>
      {flights.map((flight, i) => {
        const alt = flight.altitude
        const groundY = flight.groundY
        // 快照未携带高度信息 → 跳过该机（起飞从 0.000m 起即显示并直接变化）
        if (alt === undefined || groundY === undefined) return null
        // 已落地定格 → 隐藏标注（任务完成后仅保留定格飞机，0.000m 标注不再悬挂）
        if (flight.landed) return null
        const x = flight.x
        const topY = flight.y
        // 防御：地面点必须位于图标下方（图标按高度向上抬升）
        const bottomY = Math.max(groundY, topY + 4)
        const lineH = bottomY - topY
        return (
          /* 同款容器：position/top/left/height 经 inline 覆盖为视口定位 + 实时线长 */
          <span
            key={i}
            className="aircraft-altitude"
            aria-hidden="true"
            style={{
              position: 'fixed',
              left: x,
              top: topY,
              height: lineH,
              transition: 'none',
              // 高于飞行图标 .drone-flight（z-index 1501）：爬升/转场/悬停全程虚线与数值标注不被图标遮挡
              zIndex: 1502,
            }}
          >
            <span className="aircraft-altitude__stick" />
            {/* 数值固定 3 位小数（如 120.000m）：store 保留浮点驱动虚线/图标平滑位移，
                显示层取整后格式化（与 AircraftLayer 地面标注同规则）；
                标签固定在无人机图标上方而非沿虚线垂直居中——inline top:-34px
                （图标半径 24px + 约 10px 间隙）使数值全程悬于图标上方清晰可见，
                left:6px 仍沿虚线右侧对齐 */}
            <span className="aircraft-altitude__value" style={{ top: -34 }}>
              {Math.floor(alt).toFixed(3)}m
            </span>
          </span>
        )
      })}
    </>
  )
}