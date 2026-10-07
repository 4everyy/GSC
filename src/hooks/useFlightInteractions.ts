/**
 * @file useFlightInteractions.ts
 * @description useFlightInteractions —— 飞行面板交互逻辑（自 HomePage.tsx 拆出）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { useEffect } from 'react'
import { type useExclusivePanels } from './useExclusivePanels'
import { type useFlightAnimations } from './useFlightAnimations'
import { type useMapEngine } from './index'

type Panels = ReturnType<typeof useExclusivePanels>
type Animations = ReturnType<typeof useFlightAnimations>
type Adapter = ReturnType<typeof useMapEngine>['adapter']

export function useFlightInteractions(
  panels: Panels,
  animations: Animations,
  adapter: Adapter,
) {
  const {
    tapReturnOpen,
    setTapReturnOpen,
    setTapReturnPoint,
    setTapReturnPointConfirmed,
    setTapReturnHover,
    setTapReturnLine,
    setTapReturnRouteReady,
    setTapReturnConfirmed,
    tapReturnPoint,
    returnHomeOpen,
    setReturnHomeLines,
    setReturnHomeConfirmed,
    areaLandingOpen,
    areaLandingRect,
    areaLandingRouteGenerated,
    setAreaLandingConfirmed,
    rallyPointOpen,
    rallyPointRect,
    rallyPointRouteGenerated,
    setRallyPointConfirmed,
    formationFlightOpen,
    setFormationFlightOpen,
    formationFlightPoint,
    formationFlightRouteGenerated,
    setFormationFlightHover,
    setFormationFlightPoint,
    setFormationFlightRouteGenerated,
    setFormationFlightConfirmed,
    orbitFlightOpen,
    setOrbitFlightOpen,
    orbitPoint,
    orbitRouteGenerated,
    setOrbitFlightHover,
    setOrbitPoint,
    setOrbitRouteGenerated,
    setOrbitFlightConfirmed,
    setOrbitPinMenuOpen,
    setOrbitZoomTick,
    waypointFlightOpen,
    waypointPickingActive,
    waypointPoint,
    setWaypointHover,
    setWaypointPoint,
    setWaypointFlightOpen,
    setWaypointPickingActive,
    setWaypointRouteGenerated,
    setWaypointFlightConfirmed,
    routeFlightOpen,
    routeFlightPicking,
    routeFlightPoints,
    setRouteFlightHover,
    setRouteFlightPoints,
    setRouteFlightPicking,
    setRouteFlightFinished,
    setRouteFlightGenerated,
    setRouteFlightConfirmed,
    setRoutePinMenu,
    setRoutePinPinned,
  } = panels
  const {
    stopTapReturnFlight,
    stopReturnHomeFlights,
    stopAreaLandingFlights,
    stopRallyPointFlights,
    stopFormationFlightFlights,
    stopOrbitFlight,
    stopWaypointFlight,
    stopRouteFlightAnimation,
  } = animations

  // 面板收起时（手动取消/点击其他功能按钮互斥切换）终止循环飞行动画
  useEffect(() => {
    if (!tapReturnOpen) {
      stopTapReturnFlight()
      // 确认置灰标记随面板关闭一并复位，重开面板恢复可确认
      setTapReturnConfirmed(false)
    }
  }, [tapReturnOpen, stopTapReturnFlight, setTapReturnConfirmed])
  // 返航面板关闭（取消/互斥切换）时清除返航航线连线并终止循环飞行动画
  useEffect(() => {
    if (!returnHomeOpen) {
      setReturnHomeLines(null)
      // 确认置灰标记随航线一并复位，重开面板恢复可确认
      setReturnHomeConfirmed(false)
      stopReturnHomeFlights()
    }
  }, [returnHomeOpen, stopReturnHomeFlights, setReturnHomeLines, setReturnHomeConfirmed])
  // 区域降落面板关闭（取消/互斥切换）或航线失效（删除重绘/区域清除）时终止循环飞行
  useEffect(() => {
    if (!areaLandingOpen || !areaLandingRect || !areaLandingRouteGenerated) {
      stopAreaLandingFlights()
      // 确认置灰标记随面板关闭/选区失效一并复位，重开面板恢复可确认
      setAreaLandingConfirmed(false)
    }
  }, [areaLandingOpen, areaLandingRect, areaLandingRouteGenerated, stopAreaLandingFlights, setAreaLandingConfirmed])
  // 集结点面板关闭（取消/互斥切换）或航线失效（删除重绘/区域清除/重新生成）时终止循环飞行
  useEffect(() => {
    if ((!rallyPointOpen && !formationFlightOpen) || !rallyPointRect || !rallyPointRouteGenerated) {
      stopRallyPointFlights()
      setRallyPointConfirmed(false)
    }
  }, [rallyPointOpen, formationFlightOpen, rallyPointRect, rallyPointRouteGenerated, stopRallyPointFlights, setRallyPointConfirmed])
  // 编队飞行面板关闭（取消/互斥切换）或航线失效时终止循环飞行
  useEffect(() => {
    if (!formationFlightOpen || !formationFlightRouteGenerated) {
      stopFormationFlightFlights()
    }
  }, [formationFlightOpen, formationFlightRouteGenerated, stopFormationFlightFlights])
  // 环绕飞行面板关闭（取消/互斥切换）或航线失效（重新取点/取消重绘）时终止盘旋飞行
  useEffect(() => {
    if (!orbitFlightOpen || !orbitPoint || !orbitRouteGenerated) {
      stopOrbitFlight()
      // 确认置灰标记随面板关闭/航线失效一并复位，重开面板恢复可确认
      setOrbitFlightConfirmed(false)
    }
  }, [orbitFlightOpen, orbitPoint, orbitRouteGenerated, stopOrbitFlight, setOrbitFlightConfirmed])

  // 指点返航取点：面板打开期间点击地图（.map-base 容器内）即取点——document capture 阶段监听
  useEffect(() => {
    if (!tapReturnOpen) return
    const handleMapClick = (e: MouseEvent) => {
      if (!adapter) return
      const container = adapter.getContainer()
      if (!(e.target instanceof Node) || !container.contains(e.target)) return
      const bounds = container.getBoundingClientRect()
      const ll = adapter.unproject({
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      })
      setTapReturnPoint({ x: e.clientX, y: e.clientY, lat: ll.lat, lng: ll.lng })
      // 新落点未确认：重置确认标记，按钮条随之显示
      setTapReturnPointConfirmed(false)
    }
    // mousemove 实时更新图钉跟随点（鼠标在地图内时跟随、移到 UI 上时清除）
    const handleMouseMove = (e: MouseEvent) => {
      if (!adapter) return
      const container = adapter.getContainer()
      if (!container || !(e.target instanceof Node) || !container.contains(e.target)) {
        setTapReturnHover(null)
        return
      }
      setTapReturnHover({ x: e.clientX, y: e.clientY })
    }
    // 右键取消（两阶段，仅在地图上生效，点击 UI 不取消，均阻止默认右键菜单）：- 取点阶段（尚未定格落点，图钉跟随鼠标）：右键等效面板「取消」按钮——终止循环飞行动画
    const handleTapReturnContextMenu = (e: MouseEvent) => {
      if (!adapter) return
      const container = adapter.getContainer()
      if (!container || !(e.target instanceof Node) || !container.contains(e.target)) return
      e.preventDefault()
      if (!tapReturnPoint) {
        // 取点阶段：等效「取消」收起面板
        stopTapReturnFlight()
        setTapReturnPoint(null)
        setTapReturnConfirmed(false)
        setTapReturnOpen(false)
        return
      }
      setTapReturnPoint(null)
      setTapReturnPointConfirmed(false)
      stopTapReturnFlight()
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('click', handleMapClick, true)
    document.addEventListener('contextmenu', handleTapReturnContextMenu)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('click', handleMapClick, true)
      document.removeEventListener('contextmenu', handleTapReturnContextMenu)
      setTapReturnHover(null)
    }
  }, [tapReturnOpen, tapReturnPoint, adapter, stopTapReturnFlight, setTapReturnPoint, setTapReturnPointConfirmed, setTapReturnHover, setTapReturnConfirmed, setTapReturnOpen])

  // 环绕飞行取点：面板打开期间鼠标在地图容器内移动时图钉实时跟随（钉尖对准鼠标，替代原生光标），鼠标移到面板/UI 上时隐藏跟随图钉
  useEffect(() => {
    if (!orbitFlightOpen) return
    const handleOrbitMouseMove = (e: MouseEvent) => {
      if (!adapter) return
      const container = adapter.getContainer()
      if (!container || !(e.target instanceof Node) || !container.contains(e.target)) {
        setOrbitFlightHover(null)
        return
      }
      setOrbitFlightHover({ x: e.clientX, y: e.clientY })
    }
    const handleOrbitMapClick = (e: MouseEvent) => {
      if (!adapter) return
      const container = adapter.getContainer()
      if (!container || !(e.target instanceof Node) || !container.contains(e.target)) return
      // 点击定格图钉/「取消重绘」按钮：交由图钉交互处理（显示菜单），不重新取点
      if (e.target instanceof Element && e.target.closest('.tap-return-marker--pin')) return
      const bounds = container.getBoundingClientRect()
      const ll = adapter.unproject({ x: e.clientX - bounds.left, y: e.clientY - bounds.top })
      // 重新取点：已生成实线航线时回到虚线待生成状态（「确认」随之重新置灰）
      setOrbitRouteGenerated(false)
      setOrbitPinMenuOpen(false)
      setOrbitPoint({ x: e.clientX, y: e.clientY, lat: ll.lat, lng: ll.lng })
    }
    // - 取点阶段（尚未定格环绕中心）：右键等效面板「取消」按钮——清…
    const handleOrbitContextMenu = (e: MouseEvent) => {
      if (!adapter) return
      const container = adapter.getContainer()
      if (!container || !(e.target instanceof Node) || !container.contains(e.target)) return
      e.preventDefault()
      setOrbitPoint(null)
      setOrbitRouteGenerated(false)
      setOrbitPinMenuOpen(false)
      if (!orbitPoint) setOrbitFlightOpen(false)
    }
    document.addEventListener('mousemove', handleOrbitMouseMove)
    document.addEventListener('click', handleOrbitMapClick, true)
    document.addEventListener('contextmenu', handleOrbitContextMenu)
    return () => {
      document.removeEventListener('mousemove', handleOrbitMouseMove)
      document.removeEventListener('click', handleOrbitMapClick, true)
      document.removeEventListener('contextmenu', handleOrbitContextMenu)
      setOrbitFlightHover(null)
    }
  }, [orbitFlightOpen, orbitPoint, adapter, setOrbitFlightHover, setOrbitPoint, setOrbitRouteGenerated, setOrbitPinMenuOpen, setOrbitFlightOpen])

  // 编队飞行取点：面板打开且尚未定格航点期间，鼠标在地图容器内移动时图钉实时跟随（钉尖对准鼠标，替代原生光标）
  useEffect(() => {
    if (!formationFlightOpen) return
    const handleFormationMouseMove = (e: MouseEvent) => {
      if (!adapter) return
      // 已定格航点：光标已恢复正常样式，无需跟随图钉（也避免逐帧无谓重渲染）
      if (formationFlightPoint) return
      const container = adapter.getContainer()
      if (!container || !(e.target instanceof Node) || !container.contains(e.target)) {
        setFormationFlightHover(null)
        return
      }
      setFormationFlightHover({ x: e.clientX, y: e.clientY })
    }
    const handleFormationMapClick = (e: MouseEvent) => {
      if (!adapter) return
      const container = adapter.getContainer()
      if (!container || !(e.target instanceof Node) || !container.contains(e.target)) return
      const bounds = container.getBoundingClientRect()
      const ll = adapter.unproject({ x: e.clientX - bounds.left, y: e.clientY - bounds.top })
      setFormationFlightPoint({ x: e.clientX, y: e.clientY, lat: ll.lat, lng: ll.lng })
    }
    // - 取点阶段（尚未定格航点）：右键等效面板「取消」按钮——收起面…
    const handleFormationContextMenu = (e: MouseEvent) => {
      if (!adapter) return
      const container = adapter.getContainer()
      if (!container || !(e.target instanceof Node) || !container.contains(e.target)) return
      e.preventDefault()
      if (!formationFlightPoint) {
        // 取点阶段：等效「取消」收起面板
        setFormationFlightOpen(false)
        return
      }
      setFormationFlightPoint(null)
    }
    document.addEventListener('mousemove', handleFormationMouseMove)
    document.addEventListener('click', handleFormationMapClick, true)
    document.addEventListener('contextmenu', handleFormationContextMenu)
    return () => {
      document.removeEventListener('mousemove', handleFormationMouseMove)
      document.removeEventListener('click', handleFormationMapClick, true)
      document.removeEventListener('contextmenu', handleFormationContextMenu)
      setFormationFlightHover(null)
    }
  }, [formationFlightOpen, formationFlightPoint, adapter, setFormationFlightHover, setFormationFlightPoint, setFormationFlightOpen])

  // 编队飞行面板关闭（取消/互斥切换）时：清除跟随点、定格航点与航线生成态
  useEffect(() => {
    if (!formationFlightOpen) {
      setFormationFlightHover(null)
      setFormationFlightPoint(null)
      setFormationFlightRouteGenerated(false)
      // 确认置灰标记随面板关闭一并复位，重开面板恢复可确认
      setFormationFlightConfirmed(false)
    }
  }, [formationFlightOpen, setFormationFlightHover, setFormationFlightPoint, setFormationFlightRouteGenerated, setFormationFlightConfirmed])

  // 盘旋圆随缩放重算：缩放结束后 getMetersPerPixel 变化
  useEffect(() => {
    if (!adapter || !orbitFlightOpen) return
    return adapter.onZoomEnd(() => setOrbitZoomTick((t) => t + 1))
  }, [adapter, orbitFlightOpen, setOrbitZoomTick])

  // 航点飞行取点：点击「航线生成」进入取点模式后，鼠标在地图容器内移动时图钉实时跟随 + 选中飞机到鼠标的绿色虚线…
  useEffect(() => {
    if (!waypointFlightOpen || !waypointPickingActive || waypointPoint) return
    const toLngLat = (clientX: number, clientY: number) => {
      if (!adapter) return null
      const container = adapter.getContainer()
      if (!container) return null
      const bounds = container.getBoundingClientRect()
      const ll = adapter.unproject({ x: clientX - bounds.left, y: clientY - bounds.top })
      return { lat: ll.lat, lng: ll.lng }
    }
    const handleMouseMove = (e: MouseEvent) => {
      if (!adapter) return
      const container = adapter.getContainer()
      // 鼠标移出地图（设备面板/底栏/航点飞行面板等 UI）：清除跟随点——图钉与实时虚线随之隐藏
      if (!container || !(e.target instanceof Node) || !container.contains(e.target)) {
        setWaypointHover(null)
        return
      }
      const ll = toLngLat(e.clientX, e.clientY)
      if (!ll) return
      setWaypointHover({ x: e.clientX, y: e.clientY, lat: ll.lat, lng: ll.lng })
    }
    const handleMapClick = (e: MouseEvent) => {
      if (!adapter) return
      const container = adapter.getContainer()
      if (!container || !(e.target instanceof Node) || !container.contains(e.target)) return
      const ll = toLngLat(e.clientX, e.clientY)
      if (!ll) return
      setWaypointPoint({ x: e.clientX, y: e.clientY, lat: ll.lat, lng: ll.lng })
    }
    // 右键取消：取点阶段（尚未定格航点）右键点击关闭面板（等价「取消」）并阻止默认右键菜单
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      setWaypointFlightOpen(false)
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('click', handleMapClick, true)
    document.addEventListener('contextmenu', handleContextMenu)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('click', handleMapClick, true)
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [waypointFlightOpen, waypointPickingActive, waypointPoint, adapter, setWaypointFlightOpen, setWaypointHover, setWaypointPoint])

  // 航点飞行面板关闭（取消/确认/互斥切换）时：清除跟随点、定格航点与取点模式，图钉与连线随状态清除消失
  useEffect(() => {
    if (!waypointFlightOpen) {
      stopWaypointFlight()
      setWaypointHover(null)
      setWaypointPoint(null)
      setWaypointRouteGenerated(false)
      setWaypointPickingActive(false)
      // 确认置灰标记随面板关闭一并复位，重开面板恢复可确认
      setWaypointFlightConfirmed(false)
    }
  }, [waypointFlightOpen, stopWaypointFlight, setWaypointHover, setWaypointPoint, setWaypointRouteGenerated, setWaypointPickingActive, setWaypointFlightConfirmed])

  // 航线飞行取点：点击「航线生成」进入取点模式后，左键点击地图逐点追加编号航点
  useEffect(() => {
    if (!routeFlightOpen || !routeFlightPicking) return
    const toLngLat = (clientX: number, clientY: number) => {
      if (!adapter) return null
      const container = adapter.getContainer()
      if (!container) return null
      const bounds = container.getBoundingClientRect()
      const ll = adapter.unproject({ x: clientX - bounds.left, y: clientY - bounds.top })
      return { lat: ll.lat, lng: ll.lng }
    }
    const inMap = (e: MouseEvent) => {
      if (!adapter) return false
      const container = adapter.getContainer()
      return !!container && e.target instanceof Node && container.contains(e.target)
    }
    const handleMouseMove = (e: MouseEvent) => {
      // 鼠标移出地图（设备面板/底栏/航线飞行面板等 UI）：清除跟随点——取点图钉与鼠标跟随虚线随之隐藏（已定格航点与航线保持显示）
      if (!inMap(e)) {
        setRouteFlightHover(null)
        return
      }
      const ll = toLngLat(e.clientX, e.clientY)
      if (!ll) return
      setRouteFlightHover({ x: e.clientX, y: e.clientY, lat: ll.lat, lng: ll.lng })
    }
    const handleMapClick = (e: MouseEvent) => {
      if (!inMap(e)) return
      const ll = toLngLat(e.clientX, e.clientY)
      if (!ll) return
      setRouteFlightPoints((prev) => [...prev, { x: e.clientX, y: e.clientY, ...ll }])
    }
    // 结束取点：已放置航点则定格航线并解除「确认」置灰；未放置则仅退出取点
    const finishPicking = () => {
      setRouteFlightPicking(false)
      setRouteFlightFinished(routeFlightPoints.length > 0)
      setRouteFlightHover(null)
    }
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      finishPicking()
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finishPicking()
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('click', handleMapClick, true)
    document.addEventListener('contextmenu', handleContextMenu)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('click', handleMapClick, true)
      document.removeEventListener('contextmenu', handleContextMenu)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [routeFlightOpen, routeFlightPicking, routeFlightPoints, adapter, setRouteFlightHover, setRouteFlightPoints, setRouteFlightPicking, setRouteFlightFinished])

  // 航线飞行面板关闭（取消/确认/互斥切换）时：终止循环飞行并清除取点状态与已画航线
  useEffect(() => {
    if (!routeFlightOpen) {
      stopRouteFlightAnimation()
      setRouteFlightPicking(false)
      setRouteFlightPoints([])
      setRouteFlightHover(null)
      setRouteFlightFinished(false)
      setRouteFlightGenerated(false)
      setRoutePinMenu(null)
      setRoutePinPinned(null)
      // 确认置灰标记随面板关闭一并复位，重开面板恢复可确认
      setRouteFlightConfirmed(false)
    }
  }, [routeFlightOpen, stopRouteFlightAnimation, setRouteFlightPicking, setRouteFlightPoints, setRouteFlightHover, setRouteFlightFinished, setRouteFlightGenerated, setRoutePinMenu, setRoutePinPinned, setRouteFlightConfirmed])

  // 删除航线航点：移除对应下标的航点，剩余航点自动重连成新航线（图钉序号随之重排）
  const handleDeleteRoutePoint = (index: number) => {
    // 航点删除导致航线变化：终止进行中的循环飞行（动画点位即将与航线错位）
    stopRouteFlightAnimation()
    setRouteFlightPoints((prev) => prev.filter((_, i) => i !== index))
    setRoutePinMenu(null)
    setRoutePinPinned(null)
  }

  // 航点被全部删除：航线不复存在，复位取点完成/已生成标记（「确认」随之重新置灰）
  useEffect(() => {
    if (routeFlightPoints.length === 0) {
      setRouteFlightFinished(false)
      setRouteFlightGenerated(false)
      // 确认置灰标记随航线失效一并复位，重新生成并确认后方可再次执行
      setRouteFlightConfirmed(false)
    }
  }, [routeFlightPoints, setRouteFlightFinished, setRouteFlightGenerated, setRouteFlightConfirmed])

  // 重新进入取点（重取航点）：清除删除菜单，避免下标与航点错位
  useEffect(() => {
    if (routeFlightPicking) {
      setRoutePinMenu(null)
      setRoutePinPinned(null)
    }
  }, [routeFlightPicking, setRoutePinMenu, setRoutePinPinned])

  // 落点变化/清除（重新取点、取消/重开面板）时：清除旧连线并复位「确认」置灰，需再次点击「航线生成」重画
  useEffect(() => {
    setTapReturnRouteReady(false)
    setTapReturnLine(null)
    // 指令确认置灰标记一并复位：重新取点后需重新走「航线生成 → 确认」流程
    setTapReturnConfirmed(false)
  }, [tapReturnPoint, setTapReturnRouteReady, setTapReturnLine, setTapReturnConfirmed])

  return { handleDeleteRoutePoint }
}