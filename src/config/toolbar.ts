import { homeImages } from '../assets/images/home'

export interface ToolbarItem {
  label: string
  icon: string
  background: {
    normal: string
    hover: string
    active: string
  }
}

export const toolbarItems: ToolbarItem[] = [
  {
    label: '设备管理',
    icon: homeImages.iconFormation,
    background: {
      normal: homeImages.toolbarBtnNormal,
      hover: homeImages.toolbarBtnHover,
      active: homeImages.toolbarBtnActive,
    },
  },
  {
    label: '区域规划',
    icon: homeImages.iconAreaPlanning,
    background: {
      normal: homeImages.toolbarBtnNormal,
      hover: homeImages.toolbarBtnHover,
      active: homeImages.toolbarBtnActive,
    },
  },
  {
    label: '目标定位',
    icon: homeImages.iconTarget,
    background: {
      normal: homeImages.toolbarBtnNormal,
      hover: homeImages.toolbarBtnHover,
      active: homeImages.toolbarBtnActive,
    },
  },
  {
    label: '历史轨迹',
    icon: homeImages.iconHistory,
    background: {
      normal: homeImages.toolbarBtnNormal,
      hover: homeImages.toolbarBtnHover,
      active: homeImages.toolbarBtnActive,
    },
  },
  {
    label: '任务列表',
    icon: homeImages.iconTask,
    background: {
      normal: homeImages.toolbarBtnNormal,
      hover: homeImages.toolbarBtnHover,
      active: homeImages.toolbarBtnActive,
    },
  },
]