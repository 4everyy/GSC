/**
 * useExclusivePanels —— 功能面板互斥开合状态机（后半段）。
 *
 * 面板 useState 声明已拆至 useBasicPanelStates/useAdvancedPanelStates；
 * 本文件保留各面板开合处理函数（openXxxPanel，含互斥收起与滑出动画时序）
 * 及底部按钮条查询表 panelOpenState / panelHandlers，对外返回值与拆分前完全一致。
 */
import { useAdvancedPanelStates } from './useAdvancedPanelStates'
import type { BottomBarPanel } from '../constants'

export function useExclusivePanels() {
  const prev = useAdvancedPanelStates()
  const {
    takeoffOpen,
    setTakeoffOpen,
    landingOpen,
    setLandingOpen,
    returnHomeOpen,
    setReturnHomeOpen,
    tapReturnOpen,
    setTapReturnOpen,
    setTapReturnPoint,
    setTapReturnPointConfirmed,
    setWaypointHover,
    setWaypointPoint,
    areaLandingOpen,
    setAreaLandingOpen,
    areaLandingRect,
    areaSelectMode,
    setAreaSelectMode,
    areaSelectSource,
    setAreaSelectSource,
    rallyPointRect,
    hoverOpen,
    setHoverOpen,
    waypointFlightOpen,
    setWaypointFlightOpen,
    routeFlightOpen,
    setRouteFlightOpen,
    setWaypointPickingActive,
    setWaypointRouteGenerated,
    setRouteFlightPicking,
    setRouteFlightPoints,
    setRouteFlightHover,
    setRouteFlightFinished,
    setRouteFlightGenerated,
    setRoutePinMenu,
    setRoutePinPinned,
    orbitFlightOpen,
    setOrbitFlightOpen,
    setOrbitPoint,
    setOrbitRouteGenerated,
    setOrbitPinMenuOpen,
    rallyPointOpen,
    setRallyPointOpen,
    formationFlightOpen,
    setFormationFlightOpen,
    setFormationFlightPoint,
  } = prev

  const openTakeoffPanel = () => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setTakeoffOpen((v) => !v)
  }
  const openLandingPanel = () => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setTakeoffOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setLandingOpen((v) => !v)
  }
  const openReturnHomePanel = () => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setReturnHomeOpen((v) => !v)
  }
  const openTapReturnPanel = () => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setAreaLandingOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setTapReturnPoint(null)
    setTapReturnPointConfirmed(false)
    setTapReturnOpen((v) => !v)
  }
  const openAreaLandingPanel = () => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    // 面板弹出 + 首次（未绘制区域）同时进入绘制态：光标变停机坪图标，
    // 按住左键拖拽绘制降落区域，松开定格后「确定/取消」（光标恢复常态）；
    // 已绘制区域则仅弹出面板（「航线生成」已解禁，无需再次绘制）
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
  }
  const openHoverPanel = () => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setWaypointFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setHoverOpen((v) => !v)
  }
  const openWaypointFlightPanel = () => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setHoverOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    // 面板由关到开：立即进入取点模式（光标变航点图钉），并清除上一次遗留航点
    if (!waypointFlightOpen) {
      setWaypointHover(null)
      setWaypointPoint(null)
      setWaypointRouteGenerated(false)
      setWaypointPickingActive(true)
    }
    setWaypointFlightOpen((v) => !v)
  }
  const openRouteFlightPanel = () => {
    setOrbitFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    // 面板由关到开：立即进入取点模式（光标变带编号图钉），并清除上一次遗留航线
    if (!routeFlightOpen) {
      setRouteFlightPoints([])
      setRouteFlightHover(null)
      setRouteFlightFinished(false)
      setRouteFlightGenerated(false)
      setRoutePinMenu(null)
      setRoutePinPinned(null)
      setRouteFlightPicking(true)
    }
    setRouteFlightOpen((v) => !v)
  }
  const openOrbitFlightPanel = () => {
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setRouteFlightOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    // 重新打开时清除上一轮定格的环绕中心与航线生成状态，恢复取点状态
    setOrbitPoint(null)
    setOrbitRouteGenerated(false)
    setOrbitPinMenuOpen(false)
    setOrbitFlightOpen((v) => !v)
  }
  const openRallyPointPanel = () => {
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setFormationFlightOpen(false)
    // 面板弹出 + 首次（未绘制区域）同时进入绘制态（与区域降落同款交互）
    if (!rallyPointOpen) {
      setRallyPointOpen(true)
      if (!rallyPointRect) {
        setAreaSelectSource('rally-point')
        setAreaSelectMode(true)
      }
      return
    }
    // 面板已开：再点按钮收起面板，并退出可能进行中的绘制
    setRallyPointOpen(false)
    setAreaSelectMode(false)
  }
  const openFormationFlightPanel = () => {
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setRallyPointOpen(false)
    // 面板由关到开：立即进入取点模式（光标变图钉，与指点返航同方案），并清除上一次遗留航点
    setFormationFlightPoint(null)
    setFormationFlightOpen((v) => !v)
  }
  // 各功能面板展开状态查询表：底部按钮「弹出 + 激活背景」统一由此判断，
  // 替代逐面板的 && 长链（第 2~12 段功能按钮均提供激活态背景切图）；
  // 区域降落/集结点在框选绘制期间（面板收起、光标为标记）按钮同样保持
  // 弹出激活态——按钮选中态与标记光标态同步出现/消失
  const panelOpenState: Record<BottomBarPanel, boolean> = {
    takeoff: takeoffOpen,
    landing: landingOpen,
    'return-home': returnHomeOpen,
    'tap-return': tapReturnOpen,
    'area-landing': areaLandingOpen || (areaSelectMode && areaSelectSource === 'area-landing'),
    hover: hoverOpen,
    'waypoint-flight': waypointFlightOpen,
    'route-flight': routeFlightOpen,
    'orbit-flight': orbitFlightOpen,
    'rally-point': rallyPointOpen || (areaSelectMode && areaSelectSource === 'rally-point'),
    'formation-flight': formationFlightOpen,
  }

  // 各功能按钮点击处理函数查询表：与 panelOpenState 平行的互斥切换入口，
  // 渲染处据此绑定 onClick（替代逐面板嵌套三元链）
  const panelHandlers: Record<BottomBarPanel, () => void> = {
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
  }


  return {
    ...prev,
    panelOpenState,
    panelHandlers,
  }
}
