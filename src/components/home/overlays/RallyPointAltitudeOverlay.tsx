/*
 * @description: 集结点飞行高度实时标注（多机版）—— 复用 AircraftLayer 原地面标注
 *                 同一套 .aircraft-altitude 样式（1.5px 绿色虚线垂线 + 底端发光投影点 +
 *                 右侧 11px #00ff95 数值，3 位小数格式），保证两处标注视觉完全一致；
 *                 垂线自飞行图标中心 (y) 垂直延伸至地面轨迹点 (groundY)，
 *                 高度值固定悬于飞行图标上方（不沿虚线居中，避免被图标遮挡）、
 *                 随动画 tick 逐帧实时刷新（三阶段：恒速爬升 20m/s → 按集结速度
 *                 转场 → 到坪悬停，全程标注不脱落）；多机并行渲染，各机独立标注
 * @author: cline
 * @created: 2026-09-28
 */

import { useFlightAnimStore } from '../../../stores/index'

/**
 * 集结点飞行高度标注层（无 props，随父覆盖层逐帧重渲染）：
 * - 订阅 flightAnimStore.rallyPointFlights 数组（rAF 每帧写入 x/y/altitude/
 *   groundY），每机一条虚线 + 数值标注全程跟随（爬升/转场/悬停均不脱落）
 * - 样式与 WaypointAltitudeOverlay 同源（.aircraft-altitude / __stick / __value），
 *   仅以 inline style 覆盖定位（fixed 视口坐标 + 逐帧高度）与 transition
 *   （rAF 每帧写入无需 0.8s 过渡，避免标注滞后于飞行图标）
 */
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
          /* 同款容器：position/top/left/height 经 inline 覆盖为视口定位 + 实时线长，
             transition 关闭（rAF 逐帧驱动，无需过渡）；width:0 + pointer-events:none
             沿用原类，虚线与投影点经 __stick 伪元素自动渲染 */
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
              // 高于飞行图标 .drone-flight（z-index 1501）：爬升/转场/悬停全程
              // 虚线与数值标注不被图标遮挡
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