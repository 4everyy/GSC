import { homeImages } from '../assets/images/home'
import type { AlarmType } from '../types'

// 4种告警类型 - 按截图顺序：红、橙、蓝、绿
export const ALARM_TYPES: AlarmType[] = [
  { badge: homeImages.alarmBadge4, color: 'red' },
  { badge: homeImages.alarmBadge1, color: 'orange' },
  { badge: homeImages.alarmBadge2, color: 'blue' },
  { badge: homeImages.alarmBadge3, color: 'green' },
]