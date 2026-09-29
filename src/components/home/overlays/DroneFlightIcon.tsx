import { type CSSProperties, memo } from 'react'
import { deviceImages } from '../../../assets/images/device/index'

/**
 * DroneFlightIcon —— 模拟飞行动画专用组合图标（底座 + 飞机整体）。
 *
 * 与地图上静止飞机标记（AircraftLayer：blue_bottom.svg + blue_plane.png 上下叠放）
 * 视觉规格保持一致：模拟飞行的飞机不再是一个光秃秃的 48×48 机身切图，
 * 而是底座与飞机组合沿航线移动，且飞机头自适应对准航线轨迹方向。
 *
 * 结构与旋转策略（底座固定 + 机身转向）：
 * - 外层容器（.drone-flight）仅承载 fixed 定位（left/top 由动画插值坐标驱动）
 *   与 translate(-50%,-50%) 居中锚定，自身不旋转——底座作为地面基准（椭圆停机坪
 *   光环）正置固定，不随航向转动（观感与静止飞机标记一致）；
 * - 机身层（.drone-flight__plane）单独承载 rotate(航向角)：飞机头对准航线
 *   轨迹切线方向（含航点飞行沿航线平飞段），底座不受机身转向影响；
 * - 底座层（.drone-flight__base）与机身层仅负责同色成套切图的叠放，
 *   两层尺寸规格（底座 64px 等比宽 / 机身 40px 等比宽，均精确居中于 48px 盒）
 *   与静止标记的 .aircraft-icon__bottom / .aircraft-icon__top 完全一致。
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
  /** 附加类名（如 drone-flight--landed）：调用方按动效阶段叠加修饰类
   *  （集结点精准落坪态提升 z-index，飞机显示在集结坪预设图标之上） */
  className?: string
}

function DroneFlightIconImpl({ x, y, angle, icon, className }: DroneFlightIconProps) {
  const bottomSrc = PLANE_BOTTOM_MAP.get(icon) ?? deviceImages.blueBottom
  // 位置锚定：容器仅做 left/top 定位（居中平移由 CSS 的 translate 承担），
  // 航向旋转下沉到机身层——底座正置固定，仅飞机图标转向对准航线轨迹切线方向
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