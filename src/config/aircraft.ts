import { homeImages } from '../assets/images/home'

export interface Aircraft {
  src: string
  className: string
  label: string
  /** 对应设备管理面板 deviceList 的下标，用于 hover/选中双向联动 */
  deviceIndex: number
}

export const aircraft: Aircraft[] = [
  { src: homeImages.aircraftRed, className: 'aircraft aircraft--red', label: '01设备', deviceIndex: 0 },
  { src: homeImages.aircraftOrange, className: 'aircraft aircraft--orange', label: '03设备', deviceIndex: 2 },
  { src: homeImages.aircraftBlue, className: 'aircraft aircraft--blue', label: '04设备', deviceIndex: 3 },
  { src: homeImages.aircraftGray, className: 'aircraft aircraft--gray', label: '02设备', deviceIndex: 1 },
  { src: homeImages.aircraftBlue, className: 'aircraft aircraft--blue2', label: '05设备', deviceIndex: 4 },
]
