/**
 * 航线规划功能的配置常量。
 *
 * 将"魔法值"集中到此处，便于统一调整与未来扩展（如多主题色、用户偏好）。
 */

/** 新建航线的默认折线/航点颜色（青色，在卫星图上醒目） */
export const DEFAULT_ROUTE_COLOR = '#00e5ff'

/** 新建航线的默认飞行速度（m/s） */
export const DEFAULT_ROUTE_SPEED = 10

/**
 * 模拟飞行的动画加速倍率。
 *
 * route.defaultSpeed 代表无人机"真实"飞行速度（如 10 m/s），
 * 但在地图动画中按真实速度播放会非常缓慢（4km 航线需 ~7 分钟），
 * 肉眼几乎无法感知移动。
 *
 * 此倍率仅作用于 DroneSimulator 的动画推进，不改变航线数据语义；
 * 例如倍率 15 表示动画中的飞行速度为真实速度的 15 倍。
 */
export const SIM_SPEED_MULTIPLIER = 15

/** 编辑模式下地图容器的鼠标光标（十字准星，提示可点击加点） */
export const EDIT_MODE_CURSOR = 'crosshair'