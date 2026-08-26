import aircraftBlue from './aircraft-blue.png'
import aircraftGray from './aircraft-gray.png'
import aircraftOrange from './aircraft-orange.png'
import aircraftRed from './aircraft-red.png'
import alarmBadgeBlue from './alarm-badge-blue.png'
import alarmBadgeOrange from './alarm-badge-orange.png'
import alarmBadgeRed from './alarm-badge-red.png'
import alarmBoxBg from './alarm-box-bg.png'
import alarmDetailScrollbar from './alarm-detail-scrollbar.png'
import alarmDetailNode from './alarm-detail-node.png'
import alarmDetailDrone from './alarm-detail-drone.png'
import alarmDetailStatus from './alarm-detail-status.png'
import alarmDetailSelectArrow from './alarm-detail-select-arrow.png'
import alarmDetailIcon from './alarm-detail-icon.png'
import alarmDetailFilterBar from './alarm-detail-filter-bar.png'
import alarmDetailBg from './alarm-detail-bg.png'
import alarmCloseIcon from './alarm-close-icon.png'
import alarmInfoIcon from './alarm-info-icon.png'
import alarmSymbol from './alarm-symbol.png'
import iconAreaLanding from './icon-area-landing.png'
import iconAreaPlanning from './icon-area-planning.png'
import iconFormationFlight from './icon-formation-flight.png'
import iconFormation from './icon-formation.png'
import iconHistory from './icon-history.png'
import iconHover from './icon-hover.png'
import iconLand from './icon-land.png'
import iconLayer from './icon-layer.png'
import iconMeasure from './icon-measure.png'
import iconOrbit from './icon-orbit.png'
import iconRallyPoint from './icon-rally-point.png'
import iconReturnToHome from './icon-return-to-home.png'
import iconAreaLandingCenter from './icon-area-landing-center.png'
import iconRouteFlight from './icon-route-flight.png'
import iconTakeoff from './icon-takeoff.png'
import iconTapToReturn from './icon-tap-to-return.png'
import iconWaypointFlight from './icon-waypoint-flight.png'
import layerToggleOn from './layer-toggle-on.png'
import iconTask from './icon-task.png'
import iconZoomIn from './icon-zoom-in.png'
import iconZoomOut from './icon-zoom-out.png'
import signalIcon from './signal-icon.png'
import iconDelete from './icon-delete.png'
import statusOnlineIcon from './status-online-icon.png'
import statusTakeoffIcon from './status-takeoff-icon.png'
import userAvatar from './user-avatar.png'
import areaLandingCursor from './area-landing-cursor.png'
import areaLandingSpot from './area-landing-spot.png'
import tapReturnMarker from './tap-return-marker.png'
import routeFlightPin from './route-flight-pin.png'
import tapReturnZoneIcon from './tap-return-zone-icon.png'
// 底部水平居中按钮条背景：13 段拼接切图，bottomBarSegN 按显示顺序（从左到右）编号
import bottomBarSeg1 from './bottom-bar-seg-01.png'
import bottomBarSeg2 from './bottom-bar-seg-02.png'
import bottomBarSeg3 from './bottom-bar-seg-03.png'
import bottomBarSeg4 from './bottom-bar-seg-04.png'
import bottomBarSeg5 from './bottom-bar-seg-05.png'
import bottomBarSeg6 from './bottom-bar-seg-06.png'
import bottomBarSeg7 from './bottom-bar-seg-07.png'
import bottomBarSeg8 from './bottom-bar-seg-08.png'
import bottomBarSeg9 from './bottom-bar-seg-09.png'
import bottomBarSeg10 from './bottom-bar-seg-10.png'
import bottomBarSeg11 from './bottom-bar-seg-11.png'
import bottomBarSeg12 from './bottom-bar-seg-12.png'
import bottomBarSeg13 from './bottom-bar-seg-13.png'
// 功能按钮（第 2~12 段）激活态背景切图：bottom-bar-seg-XX-active.png
// （XX = 段号，与默认段 bottom-bar-seg-XX.png 一一对应；
//   第 2 段起飞 / 第 3 段降落 / 第 4 段返航 / 第 5 段指点返航 / 第 6 段区域降落 /
//   第 7 段悬停 / 第 8 段航点飞行 / 第 9 段航线飞行 / 第 10 段环绕飞行 /
//   第 11 段集结点 / 第 12 段编队飞行）。
// 规格统一：画布 76px 高，实体区 60px 高（y 6~66）、左右各 8px 发光边缘、宽与默认段一致
import bottomBarSeg2Active from './bottom-bar-seg-02-active.png'
import bottomBarSeg3Active from './bottom-bar-seg-03-active.png'
import bottomBarSeg4Active from './bottom-bar-seg-04-active.png'
import bottomBarSeg5Active from './bottom-bar-seg-05-active.png'
import bottomBarSeg6Active from './bottom-bar-seg-06-active.png'
import bottomBarSeg7Active from './bottom-bar-seg-07-active.png'
import bottomBarSeg8Active from './bottom-bar-seg-08-active.png'
import bottomBarSeg9Active from './bottom-bar-seg-09-active.png'
import bottomBarSeg10Active from './bottom-bar-seg-10-active.png'
import bottomBarSeg11Active from './bottom-bar-seg-11-active.png'
import bottomBarSeg12Active from './bottom-bar-seg-12-active.png'
// 功能按钮（第 2~12 段）禁用态背景切图：bottom-bar-seg-XX-disabled.png
// （XX = 段号，与默认段 / 激活态一一对应，共 11 张，从左到右对应
//   起飞 / 降落 / 返航 / 指点返航 / 区域降落 / 悬停 / 航点飞行 /
//   航线飞行 / 环绕飞行 / 集结点 / 编队飞行）。
// 规格与默认段完全一致：60px 高、宽与默认段相同、无发光边缘——
// 可直接作为视觉层背景替换使用，几何像素级兼容
import bottomBarSeg2Disabled from './bottom-bar-seg-02-disabled.png'
import bottomBarSeg3Disabled from './bottom-bar-seg-03-disabled.png'
import bottomBarSeg4Disabled from './bottom-bar-seg-04-disabled.png'
import bottomBarSeg5Disabled from './bottom-bar-seg-05-disabled.png'
import bottomBarSeg6Disabled from './bottom-bar-seg-06-disabled.png'
import bottomBarSeg7Disabled from './bottom-bar-seg-07-disabled.png'
import bottomBarSeg8Disabled from './bottom-bar-seg-08-disabled.png'
import bottomBarSeg9Disabled from './bottom-bar-seg-09-disabled.png'
import bottomBarSeg10Disabled from './bottom-bar-seg-10-disabled.png'
import bottomBarSeg11Disabled from './bottom-bar-seg-11-disabled.png'
import bottomBarSeg12Disabled from './bottom-bar-seg-12-disabled.png'

export const homeImages = {
  aircraftBlue,
  aircraftGray,
  aircraftOrange,
  aircraftRed,
  alarmBadgeBlue,
  alarmBadgeOrange,
  alarmBadgeRed,
  alarmBoxBg,
  alarmDetailScrollbar,
  alarmDetailNode,
  alarmDetailDrone,
  alarmDetailStatus,
  alarmDetailSelectArrow,
  alarmDetailIcon,
  alarmDetailFilterBar,
  alarmDetailBg,
  alarmCloseIcon,
  alarmInfoIcon,
  alarmSymbol,
  iconAreaLanding,
  iconAreaPlanning,
  iconFormationFlight,
  iconFormation,
  iconHistory,
  iconHover,
  iconLand,
  iconLayer,
  iconMeasure,
  iconOrbit,
  iconRallyPoint,
  iconReturnToHome,
  iconAreaLandingCenter,
  iconRouteFlight,
  iconTakeoff,
  iconTapToReturn,
  iconWaypointFlight,
  layerToggleOn,
  iconTask,
  iconZoomIn,
  iconZoomOut,
  signalIcon,
  iconDelete,
  statusOnlineIcon,
  statusTakeoffIcon,
  userAvatar,
  areaLandingCursor,
  areaLandingSpot,
  tapReturnMarker,
  routeFlightPin,
  tapReturnZoneIcon,
  bottomBarSeg1,
  bottomBarSeg2,
  bottomBarSeg3,
  bottomBarSeg4,
  bottomBarSeg5,
  bottomBarSeg6,
  bottomBarSeg7,
  bottomBarSeg8,
  bottomBarSeg9,
  bottomBarSeg10,
  bottomBarSeg11,
  bottomBarSeg12,
  bottomBarSeg13,
  bottomBarSeg2Active,
  bottomBarSeg3Active,
  bottomBarSeg4Active,
  bottomBarSeg5Active,
  bottomBarSeg6Active,
  bottomBarSeg7Active,
  bottomBarSeg8Active,
  bottomBarSeg9Active,
  bottomBarSeg10Active,
  bottomBarSeg11Active,
  bottomBarSeg12Active,
  bottomBarSeg2Disabled,
  bottomBarSeg3Disabled,
  bottomBarSeg4Disabled,
  bottomBarSeg5Disabled,
  bottomBarSeg6Disabled,
  bottomBarSeg7Disabled,
  bottomBarSeg8Disabled,
  bottomBarSeg9Disabled,
  bottomBarSeg10Disabled,
  bottomBarSeg11Disabled,
  bottomBarSeg12Disabled,
}