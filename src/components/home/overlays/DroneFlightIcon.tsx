/**
 * @file DroneFlightIcon.tsx
 * @description 模拟飞行动画组合图标（底座 + 机身）
 * @author 4everyy
 * @date 2026-10-07
 */
import { type CSSProperties, memo } from 'react'
import { deviceImages } from '../../../assets/device/index'

/** DroneFlightIcon —— 模拟飞行动画专用组合图标（底座 + 飞机整体）。 */

/** 与 config aircraft 的成套关系保持一致… */
const PLANE_BOTTOM_MAP = new Map<string, string>([
  [deviceImages.bluePlane, deviceImages.blueBottom],
  [deviceImages.redPlane, deviceImages.redBottom],
  [deviceImages.yellowPlane, deviceImages.yellowBottom],
  [deviceImages.grayPlane, deviceImages.grayBottom],
])

interface DroneFlightIconProps {
  /** 视口 fixed 坐标 x（px，动画插值位置） */
  x: number
  /** 视口 fixed 坐标 y（px，动画插值位置） */
  y: number
  /** 航向角（deg，屏幕坐标系 0° = 正右；机头对准航线轨迹切线方向） */
  angle: number
  /** 飞机机身切图（与静止标记同套：blue/red/yellow/gray_plane.png） */
  icon: string
  /** 调用方按动效阶段叠加修饰类… */
  className?: string
}

function DroneFlightIconImpl({ x, y, angle, icon, className }: DroneFlightIconProps) {
  const bottomSrc = PLANE_BOTTOM_MAP.get(icon) ?? deviceImages.blueBottom
  // 位置锚定：容器仅做 left/top 定位（居中平移由 CSS 的 translate 承担），航向旋转下沉到机身层——底座正置固定
  const style: CSSProperties = {
    left: x,
    top: y,
  }
  return (
    <span
      className={className ? `drone-flight ${className}` : 'drone-flight'}
      style={style}
      aria-hidden="true"
    >
      <img className="drone-flight__base" src={bottomSrc} alt="" draggable={false} />
      <img
        className="drone-flight__plane"
        src={icon}
        style={{ transform: `translate(-50%, -50%) rotate(${angle}deg)` }}
        alt=""
        draggable={false}
      />
    </span>
  )
}

/** 动画每帧重渲染：memo 浅比较，坐标未变的编队伙伴不重复 diff */
export const DroneFlightIcon = memo(DroneFlightIconImpl)