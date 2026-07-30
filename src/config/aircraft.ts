import { homeImages } from '../assets/images/home'

export interface Aircraft {
  src: string
  className: string
  label: string
}

export const aircraft: Aircraft[] = [
  { src: homeImages.aircraftRed, className: 'aircraft aircraft--red', label: '红色飞行器' },
  { src: homeImages.aircraftGray, className: 'aircraft aircraft--gray', label: '灰色飞行器' },
  { src: homeImages.aircraftYellow, className: 'aircraft aircraft--yellow', label: '黄色飞行器' },
  { src: homeImages.aircraftBlue, className: 'aircraft aircraft--blue', label: '蓝色飞行器' },
]