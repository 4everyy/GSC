/**
 * @file useExclusivePanels.ts
 * @description 互斥面板状态总控 Hook：底部按钮条 11 个功能面板开合联动
 * @author 4everyy
 * @date 2026-10-07
 */
import { useState, useCallback, useMemo } from 'react'
import { type PanelTab } from '../components/PanelKit/PanelKit'
import { type AreaLandingFormation } from '../components/AreaPanels/AreaPanels'
import { type BottomBarPanel } from '../lib/formationLayout'
import { usePanelSlideConfirms } from './usePanelSlideConfirms'
import { useAreaSelectInteraction } from './useAreaSelectInteraction'
import { useTapReturnState } from './useTapReturnState'
import { useWaypointState, useRouteFlightState, useOrbitFlightState } from './panelStateSlices'
import { useRallyPointState, useFormationFlightState } from './useRallyFormationState'

/** 11 个功能面板的互斥开合编排：面板域状态拆至子 Hook，本 Hook 只做互斥切换与底部按钮条查询表 */
export function useExclusivePanels() {
  // 基础面板状态（起飞/降落/返航/悬停）
  const [takeoffOpen, setTakeoffOpen] = useState(false)
  const [landingOpen, setLandingOpen] = useState(false)
  const [returnHomeOpen, setReturnHomeOpen] = useState(false)
  // 返航航线连线（视口屏幕坐标，SVG 绘制）：点击返航面板「航线生成」后
  const [returnHomeLines, setReturnHomeLines] = useState<
    { x1: number; y1: number; x2: number; y2: number }[] | null
  >(null)
  // 返航指令已确认：滑动二次确认成功后置 true，「确认」按钮随之置灰（防止重复下发指令）
  const [returnHomeConfirmed, setReturnHomeConfirmed] = useState(false)
  const [hoverOpen, setHoverOpen] = useState(false)

  // 区域降落面板信息（提升到 HomePage：面板收起（进入框选）/重开之间保留）：当前 tab、降落速度（m/s）、降落编队
  const [areaLandingOpen, setAreaLandingOpen] = useState(false)
  const [areaLandingTab, setAreaLandingTab] = useState<PanelTab>('params')
  const [areaLandingSpeed, setAreaLandingSpeed] = useState(10)
  const [areaLandingFormation, setAreaLandingFormation] = useState<AreaLandingFormation>('一字型')
  const [areaLandingRect, setAreaLandingRect] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  // 选区四角经纬度（WGS84，框选确认时由视口坐标换算）：供区域降落面板「区域信息」实时显示，随选区一并创建/清除
  const [areaLandingCorners, setAreaLandingCorners] = useState<
    { lat: number; lng: number }[] | null
  >(null)
  // 区域降落航线已生成：点击「航线生成」后按所选降落编队在已确认区域内布置降落坪图标（数量=选中飞机数）并与各飞机画绿色实线
  const [areaLandingRouteGenerated, setAreaLandingRouteGenerated] = useState(false)
  // 区域降落指令已确认：滑动二次确认成功后置 true，「确认」按钮随之置灰（防止重复下发指令）
  const [areaLandingConfirmed, setAreaLandingConfirmed] = useState(false)

  // 集结点面板开合（提前声明：useAreaSelectInteraction 的 Esc 恢复逻辑依赖该 setter）
  const [rallyPointOpen, setRallyPointOpen] = useState(false)

  // 框选绘制交互（模式/起点/终点/拖动/跟随点/归属 + 进入清零 + Esc 退出）已拆至 useAreaSelectInteraction
  const {
    areaSelectMode,
    setAreaSelectMode,
    areaSelectAnchor,
    setAreaSelectAnchor,
    areaSelectEnd,
    setAreaSelectEnd,
    areaSelectDragging,
    setAreaSelectDragging,
    areaSelectHover,
    setAreaSelectHover,
    areaSelectSource,
    setAreaSelectSource,
  } = useAreaSelectInteraction({ setAreaLandingOpen, setRallyPointOpen })

  // 指点返航域
  const tapReturn = useTapReturnState()
  // 航点/航线/环绕域
  const waypoint = useWaypointState()
  const routeFlight = useRouteFlightState()
  const orbit = useOrbitFlightState()
  // 集结点/编队飞行域
  const rally = useRallyPointState()
  const formation = useFormationFlightState()
  // 11 个功能面板的滑动二次确认弹窗状态已拆至 usePanelSlideConfirms
  const slides = usePanelSlideConfirms()

  // 互斥开合处理函数与底部按钮条查询表

  // 互斥基元：关掉全部 11 个功能面板（setter 引用稳定）
  const closeAllPanels = useCallback(() => {
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    tapReturn.setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setHoverOpen(false)
    waypoint.setWaypointFlightOpen(false)
    routeFlight.setRouteFlightOpen(false)
    orbit.setOrbitFlightOpen(false)
    setRallyPointOpen(false)
    formation.setFormationFlightOpen(false)
    // setState 引用稳定，无需依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 互斥开关：关掉其余面板后切换目标面板（beforeOpen 在切换前清理目标面板残留状态）
  const toggleExclusivePanel = useCallback(
    (toggle: (updater: (v: boolean) => boolean) => void, beforeOpen?: () => void) => {
      closeAllPanels()
      beforeOpen?.()
      toggle((v) => !v)
    },
    // closeAllPanels 引用稳定
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [closeAllPanels],
  )

  const openTakeoffPanel = useCallback(
    () => toggleExclusivePanel(setTakeoffOpen),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toggleExclusivePanel],
  )
  const openLandingPanel = useCallback(
    () => toggleExclusivePanel(setLandingOpen),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toggleExclusivePanel],
  )
  const openReturnHomePanel = useCallback(
    () => toggleExclusivePanel(setReturnHomeOpen),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toggleExclusivePanel],
  )
  const openTapReturnPanel = useCallback(
    () =>
      toggleExclusivePanel(tapReturn.setTapReturnOpen, () => {
        // 打开即清除上一轮落点，恢复初始取点态
        tapReturn.setTapReturnPoint(null)
        tapReturn.setTapReturnPointConfirmed(false)
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toggleExclusivePanel],
  )
  const openAreaLandingPanel = useCallback(() => {
    closeAllPanels()
    // 面板弹出 + 首次（未绘制区域）同时进入绘制态：光标变停机坪图标，按住左键拖拽绘制降落区域，松开定格后「确定/取消」（光标恢复常态）
    if (!areaLandingOpen) {
      setAreaLandingOpen(true)
      if (!areaLandingRect) {
        setAreaSelectSource('area-landing')
        setAreaSelectMode(true)
      }
      return
    }
    // 面板已开：再点按钮收起面板，并退出可能进行中的绘制
    setAreaLandingOpen(false)
    setAreaSelectMode(false)
    // 读取 areaLandingOpen/areaLandingRect 分支
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaLandingOpen, areaLandingRect, closeAllPanels])
  const openHoverPanel = useCallback(
    () => toggleExclusivePanel(setHoverOpen),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toggleExclusivePanel],
  )
  const openWaypointFlightPanel = useCallback(() => {
    // 面板由关到开：立即进入取点模式（光标变航点图钉），并清除上一次遗留航点
    if (!waypoint.waypointFlightOpen) {
      waypoint.setWaypointHover(null)
      waypoint.setWaypointPoint(null)
      waypoint.setWaypointRouteGenerated(false)
      waypoint.setWaypointPickingActive(true)
    }
    toggleExclusivePanel(waypoint.setWaypointFlightOpen)
    // 读取 waypointFlightOpen 分支
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoint.waypointFlightOpen, toggleExclusivePanel])
  const openRouteFlightPanel = useCallback(() => {
    // 面板由关到开：立即进入取点模式（光标变带编号图钉），并清除上一次遗留航线
    if (!routeFlight.routeFlightOpen) {
      routeFlight.setRouteFlightPoints([])
      routeFlight.setRouteFlightHover(null)
      routeFlight.setRouteFlightFinished(false)
      routeFlight.setRouteFlightGenerated(false)
      routeFlight.setRoutePinMenu(null)
      routeFlight.setRoutePinPinned(null)
      routeFlight.setRouteFlightPicking(true)
    }
    toggleExclusivePanel(routeFlight.setRouteFlightOpen)
    // 读取 routeFlightOpen 分支
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeFlight.routeFlightOpen, toggleExclusivePanel])
  const openOrbitFlightPanel = useCallback(
    () =>
      toggleExclusivePanel(orbit.setOrbitFlightOpen, () => {
        // 重新打开时清除上一轮定格的环绕中心与航线生成状态，恢复取点状态
        orbit.setOrbitPoint(null)
        orbit.setOrbitRouteGenerated(false)
        orbit.setOrbitPinMenuOpen(false)
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toggleExclusivePanel],
  )
  const openRallyPointPanel = useCallback(() => {
    closeAllPanels()
    // 面板弹出 + 首次（未绘制区域）同时进入绘制态（与区域降落同款交互）
    if (!rallyPointOpen) {
      setRallyPointOpen(true)
      if (!rally.rallyPointRect) {
        setAreaSelectSource('rally-point')
        setAreaSelectMode(true)
      }
      return
    }
    // 面板已开：再点按钮收起面板，并退出可能进行中的绘制
    setRallyPointOpen(false)
    setAreaSelectMode(false)
    // 读取 rallyPointOpen/rallyPointRect 分支
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rallyPointOpen, rally.rallyPointRect, closeAllPanels])
  const openFormationFlightPanel = useCallback(
    () =>
      toggleExclusivePanel(formation.setFormationFlightOpen, () => {
        // 面板由关到开：清除上一次遗留航点（光标变图钉，与指点返航同方案）
        formation.setFormationFlightPoint(null)
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toggleExclusivePanel],
  )
  // 区域列表「添加区域」进入绘制（area-list 来源）：六边形绘制交互——进入仅图标光标跟随
  const openAreaListSelect = useCallback(() => {
    closeAllPanels()
    setAreaSelectSource('area-list')
    setAreaSelectMode(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeAllPanels])

  // 各功能面板展开状态查询表：底部按钮「弹出 + 激活背景」统一由此判断
  const panelOpenState: Record<BottomBarPanel, boolean> = useMemo(
    () => ({
      takeoff: takeoffOpen,
      landing: landingOpen,
      'return-home': returnHomeOpen,
      'tap-return': tapReturn.tapReturnOpen,
      'area-landing': areaLandingOpen || (areaSelectMode && areaSelectSource === 'area-landing'),
      hover: hoverOpen,
      'waypoint-flight': waypoint.waypointFlightOpen,
      'route-flight': routeFlight.routeFlightOpen,
      'orbit-flight': orbit.orbitFlightOpen,
      'rally-point': rallyPointOpen || (areaSelectMode && areaSelectSource === 'rally-point'),
      'formation-flight': formation.formationFlightOpen,
    }),
    // 任一面板开合/框选状态变化才重建引用，供 memo 化的 BottomBar 浅比较
    [
      takeoffOpen,
      landingOpen,
      returnHomeOpen,
      tapReturn.tapReturnOpen,
      areaLandingOpen,
      areaSelectMode,
      areaSelectSource,
      hoverOpen,
      waypoint.waypointFlightOpen,
      routeFlight.routeFlightOpen,
      orbit.orbitFlightOpen,
      rallyPointOpen,
      formation.formationFlightOpen,
    ],
  )

  // 各功能按钮点击处理函数查询表：与 panelOpenState 平行的互斥切换入口，渲染处据此绑定 onClick（替代逐面板嵌套三元链）
  const panelHandlers: Record<BottomBarPanel, () => void> = useMemo(
    () => ({
      takeoff: openTakeoffPanel,
      landing: openLandingPanel,
      'return-home': openReturnHomePanel,
      'tap-return': openTapReturnPanel,
      'area-landing': openAreaLandingPanel,
      hover: openHoverPanel,
      'waypoint-flight': openWaypointFlightPanel,
      'route-flight': openRouteFlightPanel,
      'orbit-flight': openOrbitFlightPanel,
      'rally-point': openRallyPointPanel,
      'formation-flight': openFormationFlightPanel,
    }),
    // 依赖已 useCallback 化的处理函数，引用随其依赖同步重建
    [
      openTakeoffPanel,
      openLandingPanel,
      openReturnHomePanel,
      openTapReturnPanel,
      openAreaLandingPanel,
      openHoverPanel,
      openWaypointFlightPanel,
      openRouteFlightPanel,
      openOrbitFlightPanel,
      openRallyPointPanel,
      openFormationFlightPanel,
    ],
  )

  // 展开合并各域状态：对调用方（HomePage 等）保持与拆分前完全一致的扁平 API
  return {
    takeoffOpen,
    setTakeoffOpen,
    landingOpen,
    setLandingOpen,
    returnHomeOpen,
    setReturnHomeOpen,
    returnHomeLines,
    setReturnHomeLines,
    returnHomeConfirmed,
    setReturnHomeConfirmed,
    hoverOpen,
    setHoverOpen,
    areaLandingOpen,
    setAreaLandingOpen,
    areaLandingTab,
    setAreaLandingTab,
    areaLandingSpeed,
    setAreaLandingSpeed,
    areaLandingFormation,
    setAreaLandingFormation,
    areaLandingRect,
    setAreaLandingRect,
    areaLandingCorners,
    setAreaLandingCorners,
    areaLandingRouteGenerated,
    setAreaLandingRouteGenerated,
    areaLandingConfirmed,
    setAreaLandingConfirmed,
    rallyPointOpen,
    setRallyPointOpen,
    ...tapReturn,
    ...waypoint,
    ...routeFlight,
    ...orbit,
    ...rally,
    ...formation,
    ...slides,
    areaSelectMode,
    setAreaSelectMode,
    areaSelectAnchor,
    setAreaSelectAnchor,
    areaSelectEnd,
    setAreaSelectEnd,
    areaSelectDragging,
    setAreaSelectDragging,
    areaSelectHover,
    setAreaSelectHover,
    areaSelectSource,
    setAreaSelectSource,
    panelOpenState,
    panelHandlers,
    openAreaListSelect,
  }
}