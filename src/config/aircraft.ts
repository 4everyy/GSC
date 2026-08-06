import { homeImages } from '../assets/images/home'

export interface Aircraft {
  src: string
  className: string
  label: string
}

export const aircraft: Aircraft[] = [
  { src: homeImages.aircraftRed, className: 'aircraft aircraft--red', label: '01设备' },
  { src: homeImages.aircraftOrange, className: 'aircraft aircraft--orange', label: '03设备' },
  { src: homeImages.aircraftBlue, className: 'aircraft aircraft--blue', label: '02设备' },
  { src: homeImages.aircraftGray, className: 'aircraft aircraft--gray', label: '离线设备' },
  { src: homeImages.aircraftBlue, className: 'aircraft aircraft--blue2', label: '02设备' },
]
