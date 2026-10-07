/**
 * @file panelStateSlices.ts
 * @description 面板域状态切片：航点/航线/环绕取点（自 useExclusivePanels 拆出）
 * @author 4everyy
 * @date 2026-10-07
 */
import { useState } from 'react'

/** 航点飞行面板域状态：取点模式、跟随点、定格航点、航线生成与确认（自 useExclusivePanels 拆出） */
export function useWaypointState() {
  const [waypointFlightOpen, setWaypointFlightOpen] = useState(false)
  // 航点飞行取点模式：点击面板「航线生成」后进入——光标变航点图钉、虚线连线，左键定格航点后退出取点（面板保留，可继续确认/取消）
  const [waypointPickingActive, setWaypointPickingActive] = useState(false)
  // 航点飞行跟随点：面板打开期间鼠标在地图上移动时的实时位置（视口坐标 + 经纬度），驱动图钉跟随与实时虚线连线
  const [waypointHover, setWaypointHover] = useState<{
    x: number
    y: number
    lat: number
    lng: number
  } | null>(null)
  // 航点飞行定格航点：左键点击地图后确定（视口坐标 + 经纬度），虚线随之定格为实线
  const [waypointPoint, setWaypointPoint] = useState<{
    x: number
    y: number
    lat: number
    lng: number
  } | null>(null)
  // 航线生成状态：定格航点（保持虚线）后点击「航线生成」，虚线定格为实线；重新取点/关闭面板时复位
  const [waypointRouteGenerated, setWaypointRouteGenerated] = useState(false)
  // 航点飞行指令已确认：滑动二次确认成功后置 true，「确认」按钮随之置灰（防止重复下发指令）
  const [waypointFlightConfirmed, setWaypointFlightConfirmed] = useState(false)

  return {
    waypointFlightOpen,
    setWaypointFlightOpen,
    waypointPickingActive,
    setWaypointPickingActive,
    waypointHover,
    setWaypointHover,
    waypointPoint,
    setWaypointPoint,
    waypointRouteGenerated,
    setWaypointRouteGenerated,
    waypointFlightConfirmed,
    setWaypointFlightConfirmed,
  }
}

/** 航线飞行面板域状态：逐点取点、跟随点、完成标记、航线生成与确认、航点删除菜单（自 useExclusivePanels 拆出） */
export function useRouteFlightState() {
  const [routeFlightOpen, setRouteFlightOpen] = useState(false)
  // 航线飞行取点：点击「航线生成」后进入——光标变带编号的航线图钉，左键逐点追加航点（1、2、3…），航点1 → 航点2 → … 连线（全程虚线）
  const [routeFlightPicking, setRouteFlightPicking] = useState(false)
  const [routeFlightPoints, setRouteFlightPoints] = useState<
    { x: number; y: number; lat: number; lng: number }[]
  >([])
  const [routeFlightHover, setRouteFlightHover] = useState<{
    x: number
    y: number
    lat: number
    lng: number
  } | null>(null)
  // 标记完成：取点结束后置 true，控制后续交互（确认/取消）与光标恢复
  const [routeFlightFinished, setRouteFlightFinished] = useState(false)
  // 航线生成状态：标记完成（保持虚线）后点击「航线生成」，虚线定格为实线；重新取点/关闭面板时复位
  const [routeFlightGenerated, setRouteFlightGenerated] = useState(false)
  // 航线飞行指令已确认：滑动二次确认成功后置 true，「确认」按钮随之置灰（防止重复下发指令）
  const [routeFlightConfirmed, setRouteFlightConfirmed] = useState(false)
  // 航点删除菜单：menu = 当前显示「删除航点」按钮的航点下标（悬浮或双击触发），pinned = 双击固定的下标（鼠标移出图钉后仍保留）
  const [routePinMenu, setRoutePinMenu] = useState<number | null>(null)
  const [routePinPinned, setRoutePinPinned] = useState<number | null>(null)

  return {
    routeFlightOpen,
    setRouteFlightOpen,
    routeFlightPicking,
    setRouteFlightPicking,
    routeFlightPoints,
    setRouteFlightPoints,
    routeFlightHover,
    setRouteFlightHover,
    routeFlightFinished,
    setRouteFlightFinished,
    routeFlightGenerated,
    setRouteFlightGenerated,
    routeFlightConfirmed,
    setRouteFlightConfirmed,
    routePinMenu,
    setRoutePinMenu,
    routePinPinned,
    setRoutePinPinned,
  }
}

/** 环绕飞行面板域状态：盘旋中心取点/跟随、盘旋半径与缩放刷新、航线生成与确认（自 useExclusivePanels 拆出） */
export function useOrbitFlightState() {
  const [orbitFlightOpen, setOrbitFlightOpen] = useState(false)
  // 环绕飞行图钉跟随点：面板打开期间鼠标在地图上的实时位置（视口坐标，仅视觉不参与取点）
  const [orbitFlightHover, setOrbitFlightHover] = useState<{ x: number; y: number } | null>(null)
  // 环绕飞行取点：左键点击地图定格的环绕中心（视口坐标 + 经纬度），盘旋圆与最近点连线的锚点
  const [orbitPoint, setOrbitPoint] = useState<{
    x: number
    y: number
    lat: number
    lng: number
  } | null>(null)
  // 盘旋半径（米）：与面板「盘旋半径」步进联动，驱动地图盘旋圆像素半径，默认 50m
  const [orbitRadius, setOrbitRadius] = useState(50)
  // 盘旋圆随缩放刷新：缩放级别变化后 getMetersPerPixel 改变，触发重渲染重算像素半径
  const [, setOrbitZoomTick] = useState(0)
  // 航线生成状态：定格环绕中心（保持虚线）后点击「航线生成」，盘旋圆/最近点连线由虚线定格为实线
  const [orbitRouteGenerated, setOrbitRouteGenerated] = useState(false)
  // 环绕飞行指令已确认：滑动二次确认成功后置 true，「确认」按钮随之置灰（防止重复下发指令）
  const [orbitFlightConfirmed, setOrbitFlightConfirmed] = useState(false)
  // 环绕飞行已标记态：hover/点击定格图钉显示「取消重绘」按钮
  const [orbitPinMenuOpen, setOrbitPinMenuOpen] = useState(false)

  return {
    orbitFlightOpen,
    setOrbitFlightOpen,
    orbitFlightHover,
    setOrbitFlightHover,
    orbitPoint,
    setOrbitPoint,
    orbitRadius,
    setOrbitRadius,
    setOrbitZoomTick,
    orbitRouteGenerated,
    setOrbitRouteGenerated,
    orbitFlightConfirmed,
    setOrbitFlightConfirmed,
    orbitPinMenuOpen,
    setOrbitPinMenuOpen,
  }
}
