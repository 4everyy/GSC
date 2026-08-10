import { homeImages } from '../assets/images/home'
import { deviceImages } from '../assets/images/device'

export interface ToolbarItem {
  label: string
  icon: string
  background: {
    normal: string
    hover: string
    active: string
  }
}

/** 所有按钮共用的新背景图（来自 device 目录） */
const BTN_BG = {
  normal: deviceImages.menuBtnNormal,
  hover: deviceImages.menuBtnHover,
  active: deviceImages.menuBtnActive,
}

export const toolbarItems: ToolbarItem[] = [
  {
    label: '设备管理',
    icon: homeImages.iconFormation,
    background: BTN_BG,
  },
  {
    label: '区域规划',
    icon: homeImages.iconAreaPlanning,
    background: BTN_BG,
  },
  {
    label: '历史轨迹',
    icon: homeImages.iconHistory,
    background: BTN_BG,
  },
  {
    label: '任务列表',
    icon: homeImages.iconTask,
    background: BTN_BG,
  },
]
