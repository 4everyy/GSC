/**
 * @file usePanelSlideConfirms.ts
 * @description 功能面板「滑动二次确认」弹窗状态 Hook（自 useExclusivePanels 拆出）
 * @author 4everyy
 * @date 2026-10-07
 */
import { useState } from 'react'
import { type AreaLandingFormation } from '../components/AreaPanels/AreaPanels'
import {
  type RallyPointFormation,
  type FormationFlightFormation,
} from '../components/FlightActionPanels/FlightActionPanels'

/**
 * usePanelSlideConfirms —— 11 个功能面板的「滑动二次确认」弹窗状态（自 useExclusivePanels 拆出）。
 * 统一模式：面板「确认」先暂存参数并弹出滑动确认弹窗，滑到最右才真正下发指令。
 */
export function usePanelSlideConfirms() {
  // 起飞二次确认：暂存起飞高度
  const [takeoffSlide, setTakeoffSlide] = useState<{ open: boolean; height?: number }>({
    open: false,
  })
  // 降落二次确认：无暂存参数
  const [landingSlide, setLandingSlide] = useState<{ open: boolean }>({ open: false })
  // 返航二次确认：暂存返航高度
  const [returnHomeSlide, setReturnHomeSlide] = useState<{ open: boolean; height?: number }>({
    open: false,
  })
  // 指点返航二次确认：暂存返航高度
  const [tapReturnSlide, setTapReturnSlide] = useState<{ open: boolean; height?: number }>({
    open: false,
  })
  // 区域降落二次确认：暂存速度/编队
  const [areaLandingSlide, setAreaLandingSlide] = useState<{
    open: boolean
    speed?: number
    formation?: AreaLandingFormation
  }>({ open: false })
  // 悬停二次确认：无暂存参数
  const [hoverSlide, setHoverSlide] = useState<{ open: boolean }>({ open: false })
  // 航点飞行二次确认：暂存飞行高度
  const [waypointSlide, setWaypointSlide] = useState<{
    open: boolean
    height: number
  }>({
    open: false,
    height: 10,
  })
  // 航线飞行二次确认：暂存飞行高度
  const [routeSlide, setRouteSlide] = useState<{ open: boolean; height: number }>({
    open: false,
    height: 10,
  })
  // 环绕飞行二次确认：暂存盘旋高度/半径
  const [orbitSlide, setOrbitSlide] = useState<{ open: boolean; height: number; radius?: number }>({
    open: false,
    height: 10,
    radius: 50,
  })
  // 集结点二次确认：暂存高度/速度/队形
  const [rallyPointSlide, setRallyPointSlide] = useState<{
    open: boolean
    height?: number
    speed?: number
    formation?: RallyPointFormation
  }>({ open: false })
  // 编队飞行二次确认：暂存高度/队形
  const [formationFlightSlide, setFormationFlightSlide] = useState<{
    open: boolean
    height?: number
    formation?: FormationFlightFormation
  }>({ open: false })

  return {
    takeoffSlide,
    setTakeoffSlide,
    landingSlide,
    setLandingSlide,
    returnHomeSlide,
    setReturnHomeSlide,
    tapReturnSlide,
    setTapReturnSlide,
    areaLandingSlide,
    setAreaLandingSlide,
    hoverSlide,
    setHoverSlide,
    waypointSlide,
    setWaypointSlide,
    routeSlide,
    setRouteSlide,
    orbitSlide,
    setOrbitSlide,
    rallyPointSlide,
    setRallyPointSlide,
    formationFlightSlide,
    setFormationFlightSlide,
  }
}