import { deviceImages } from '../assets/images/device'

export interface DeviceTelemetry {
  longitude: number
  latitude: number
  altitude: number
  elevation: number
  airspeed: number
  yaw: number
  roll: number
  pitch: number
  time: string
  delay: string
}

export interface Device {
  name: string
  deviceIcon: string
  icons: string[]
  telemetry?: DeviceTelemetry
}

const firstTelemetry: DeviceTelemetry = {
  longitude: 109.1,
  latitude: 32.21,
  altitude: 40.06,
  elevation: 90.47,
  airspeed: 4.9,
  yaw: 103.1,
  roll: 0.57,
  pitch: -7.16,
  time: '2026/07/28  14:24:56',
  delay: '20ms',
}

export const deviceList: Device[] = [
  {
    name: '01中科晶锐',
    deviceIcon: deviceImages.iconBlue,
    icons: [deviceImages.actionIcon1, deviceImages.actionIcon2],
    telemetry: firstTelemetry,
  },
  { name: '01中科晶锐', deviceIcon: deviceImages.iconBlue, icons: [deviceImages.actionIcon1, deviceImages.actionIcon2] },
  { name: '01中科晶...', deviceIcon: deviceImages.iconGray, icons: [deviceImages.actionIcon1, deviceImages.actionIcon2] },
  { name: '02大疆', deviceIcon: deviceImages.iconGray, icons: [deviceImages.actionIcon3, deviceImages.actionIcon4] },
  { name: '02大疆', deviceIcon: deviceImages.iconGray, icons: [deviceImages.actionIcon3, deviceImages.actionIcon4] },
  { name: '02大疆', deviceIcon: deviceImages.iconGray, icons: [deviceImages.actionIcon5, deviceImages.actionIcon6] },
  { name: '02大疆', deviceIcon: deviceImages.iconGray, icons: [deviceImages.actionIcon5, deviceImages.actionIcon6] },
]