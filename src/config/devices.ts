import { deviceImages } from '../assets/images/device'

export interface DeviceTelemetry {
  longitude: string
  velocityY: string
  latitude: string
  yaw: string
  elevation: string
  roll: string
  altitude: string
  voltage: string
  delay: string
  pitch: string
  battery: string
  gps: string
  time: string
}

// 设备状态类型
export type DeviceStatus = 'tasking' | 'standby' | 'offline' | 'charging'
// 电池等级
export type BatteryLevel = 'full' | 'mid' | 'low'

export interface Device {
  name: string
  telemetry?: DeviceTelemetry
  // 新设计稿字段
  status: DeviceStatus
  statusText: string
  altitudeValue: string
  batteryLevel: BatteryLevel
  batteryValue: string
  /** 设备类型图标颜色：blue(在线蓝标) / gray(离线灰标) */
  deviceType: 'blue' | 'gray'
  /** 是否充电中（影响电量图标的显示方式） */
  isCharging?: boolean
}

const firstTelemetry: DeviceTelemetry = {
  longitude: '109.10',
  velocityY: '40.06',
  latitude: '32.21',
  yaw: '103.10',
  elevation: '90.47',
  roll: '0.57',
  altitude: '40.90',
  voltage: '17.05KV',
  delay: '20ms',
  pitch: '-7.16',
  battery: '40%',
  gps: '信号中',
  time: '2026/07/28  14:24:56',
}

export const deviceList: Device[] = [
  {
    name: '01中科晶锐',
    telemetry: firstTelemetry,
    status: 'tasking',
    statusText: '任务中',
    altitudeValue: '40m',
    batteryLevel: 'full',
    batteryValue: '100%',
    deviceType: 'gray',
  },
  {
    name: '02中科晶锐',
    status: 'offline',
    statusText: '离线',
    altitudeValue: '40m',
    batteryLevel: 'low',
    batteryValue: '12%',
    deviceType: 'gray',
  },
  {
    name: '03中科晶锐',
    status: 'standby',
    statusText: '待命',
    altitudeValue: '400m',
    batteryLevel: 'mid',
    batteryValue: '40%',
    deviceType: 'blue',
  },
  {
    name: '04中科晶锐',
    status: 'tasking',
    statusText: '任务中',
    altitudeValue: '40m',
    batteryLevel: 'low',
    batteryValue: '12%',
    deviceType: 'gray',
  },
  {
    name: '05中科晶锐',
    status: 'tasking',
    statusText: '任务中',
    altitudeValue: '40m',
    batteryLevel: 'mid',
    batteryValue: '40%',
    deviceType: 'gray',
    isCharging: true,
  },
]

// 根据电池等级获取对应图标
export function getBatteryIcon(level: BatteryLevel): string {
  switch (level) {
    case 'full':
      return deviceImages.batteryFull
    case 'mid':
      return deviceImages.batteryMid
    case 'low':
      return deviceImages.batteryLow
  }
}

// 根据状态获取状态文字颜色
export function getStatusColor(status: DeviceStatus): string {
  switch (status) {
    case 'tasking':
      return '#7BFF00'
    case 'standby':
      return '#7BFF00'
    case 'offline':
      return '#BD1010'
    case 'charging':
      return '#7BFF00'
  }
}