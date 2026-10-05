import { deviceImages } from '../assets/device/index'
import { type DeviceStatus, type Device } from '../config'

/* 状态驱动飞机切图（自 AircraftLayer 拆出为公共取色口径）：地面静止图标与
 * 飞行动效图标（DroneFlightIcon）共用——按接口状态动态取色
 * （红=任务中 / 蓝=待命·充电 / 灰=离线），保证起飞动效与地图上原飞机图标
 * 颜色一致，不再出现「地面红色、动效蓝色」的静态/动态口径色差。
 * 注意：本模块刻意不引 stores（被 formationLayout 依赖，而 stores 又依赖
 * formationLayout，避免循环依赖），设备快照由调用方传入。 */

/** 接口状态 → 机身/光晕切图映射（与设备管理面板同素材）：
 *  tasking → 红（任务中）；standby / charging → 蓝（待命/充电）；
 *  offline → 灰（离线）。设备数据缺失（接口未返回该机）时回退静态配置色。 */
export const STATUS_PLANE_ICON: Record<DeviceStatus, { src: string; bottomSrc: string }> = {
  tasking: { src: deviceImages.redPlane, bottomSrc: deviceImages.redBottom },
  standby: { src: deviceImages.bluePlane, bottomSrc: deviceImages.blueBottom },
  charging: { src: deviceImages.bluePlane, bottomSrc: deviceImages.blueBottom },
  offline: { src: deviceImages.grayPlane, bottomSrc: deviceImages.grayBottom },
}

/**
 * 按设备下标解析机身切图：接口状态驱动（红=任务中 / 蓝=待命·充电 / 灰=离线），
 * 设备数据缺失（接口未返回该机）时回退静态配置切图 fallback（config.aircraft 预设色）。
 *
 * devices 为 usePlaneStatusStore 的设备快照（事件回调内经 getState() 一次性读取，
 * 不引入订阅重渲染），取色口径与 AircraftLayer 地面图标完全一致：动效起飞后
 * 机身颜色与原地飞机图标（状态驱动）不再出现色差。
 * DroneFlightIcon 侧按机身切图经 PLANE_BOTTOM_MAP 自动配对同色底座。
 */
export function resolvePlaneSrc(
  devices: readonly (Device | undefined)[],
  deviceIndex: number,
  fallback: string,
): string {
  const device = devices[deviceIndex]
  const statusIcon = device ? STATUS_PLANE_ICON[device.status] : undefined
  return statusIcon?.src ?? fallback
}