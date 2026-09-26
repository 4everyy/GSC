import { type CSSProperties, memo } from 'react'
import { deviceImages } from '../../../assets/images/device/index'

/**
 * DroneFlightIcon —— 模拟飞行动画专用组合图标（底座 + 飞机整体）。
 *
 * 与地图上静止飞机标记（AircraftLayer：blue_bottom.svg + blue_plane.png 上下叠放）
 * 视觉规格保持一致：模拟飞行的飞机不再是一个光秃秃的 48×48 机身切图，
 * 而是底座与飞机作为一个刚体整体沿航线移动，且飞机头自适应对准航线轨迹方向。
 *
 * 结构与旋转策略（整体刚体原则）：
 * - 底座 + 机身绑定视为一个整体对象（刚体）：外层容器（.drone-flight）承载
 *   fixed 定位（left/top 由动画插值坐标驱动）与整体旋转 rotate(angle)——
 *   调整飞机头的指向 = 整体旋转调整，底座与机身同步转向不散架；
 * - 机身层（.drone-flight__plane）与底座层（.drone-flight__base）仅负责
 *   同色成套切图的叠放，自身不再单独旋转（随容器整体转向），
 *   机头始终对准航线轨迹切线方向（含航点飞行沿航线平飞段）。
 */

/** 机身切图 → 同色底座切图映射：与 config aircraft 的成套关系保持一致
 *  （blue_plane↔blue_bottom / red↔red / yellow↔yellow / gray↔gray），
 *  使调用方只需传动画 store 里的 icon 即可整体渲染底座+飞机组合 */
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
}

function DroneFlightIconImpl({ x, y, angle, icon }: DroneFlightIconProps) {
  const bottomSrc = PLANE_BOTTOM_MAP.get(icon) ?? deviceImages.blueBottom
  // 整体刚体旋转：translate(-50%,-50%) 居中锚定 + rotate(航向角) 同挂在外层容器——
  // 底座与机身作为一个整体对象同步转向，飞机头对准航线轨迹切线方向
  const style: CSSProperties = {
    left: x,
    top: y,
    transform: `translate(-50%, -50%) rotate(${angle}deg)`,
  }
  return (
    <span className="drone-flight" style={style} aria-hidden="true">
      <img className="drone-flight__base" src={bottomSrc} alt="" draggable={false} />
      <img className="drone-flight__plane" src={icon} alt="" draggable={false} />
    </span>
  )
}

/** 动画每帧重渲染：memo 浅比较，坐标未变的编队伙伴不重复 diff */
export const DroneFlightIcon = memo(DroneFlightIconImpl)