/**
 * @file planeIcons.ts
 * @description 无人机图标映射：设备状态到机身/底座切图
 * @author 4everyy
 * @date 2026-10-07
 */
import { deviceImages } from '../assets/device/index'
import { type DeviceStatus, type Device } from '../config'

/* 地面静止图标与飞行动效图标（DroneFlightIcon）共用——… */

/** 接口状态 → 机身/光晕切图映射（与设备管理面板同素材）：tasking → 红（任务中） */
export const STATUS_PLANE_ICON: Record<DeviceStatus, { src: string; bottomSrc: string }> = {
  tasking: { src: deviceImages.redPlane, bottomSrc: deviceImages.redBottom },
  standby: { src: deviceImages.bluePlane, bottomSrc: deviceImages.blueBottom },
  charging: { src: deviceImages.bluePlane, bottomSrc: deviceImages.blueBottom },
  offline: { src: deviceImages.grayPlane, bottomSrc: deviceImages.grayBottom },
}

/** 按设备下标解析机身切图：接口状态驱动（红=任务中 / 蓝=待命·充电 / 灰=离线） */
export function resolvePlaneSrc(
  devices: readonly (Device | undefined)[],
  deviceIndex: number,
  fallback: string,
): string {
  const device = devices[deviceIndex]
  const statusIcon = device ? STATUS_PLANE_ICON[device.status] : undefined
  return statusIcon?.src ?? fallback
}