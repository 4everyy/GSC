/* 模拟飞行动画 hooks（自 HomePage.tsx 拆出）：8 套 requestAnimationFrame 循环动画，
 * 覆盖返航/指点返航/区域降落/航点飞行/航线飞行/环绕飞行/集结点/编队飞行。
 * 每套动画产出 { x, y, angle, icon }（视口坐标 + 航向角 + 图标切图）驱动
 * tap-return-drone 图片定位与旋转；启停函数由 HomePage 在面板确认/取消/互斥切换时
 * 调用，组件卸载时自动清理全部动画帧。仅前端演示，待接入真实指令链路后由实时遥测驱动 */
import { useCallback, useEffect, useRef, useState } from 'react'

/** 单个飞行体的瞬时状态：视口屏幕坐标 + 航向角（度，切图机头朝上为 0）+ 图标切图 */
export interface FlightState {
  x: number
  y: number
  angle: number
  icon: string
}

export function useFlightAnimations() {
  // ---- 返航（多机） ----
  // 返航模拟飞行状态：确认返航后，无人机图标沿航线连线循环飞向 H 返航标记
  // （视口屏幕坐标 + 航向角 + 图标），rAF 驱动，面板关闭（取消/互斥切换）时终止
  const [returnHomeFlights, setReturnHomeFlights] = useState<FlightState[]>([])
  const returnHomeFlightRaf = useRef<number | null>(null)

  // ---- 指点返航（单机） ----
  // 模拟飞行状态：确认指点返航后，无人机图标沿连线循环飞向落点图钉
  // （视口屏幕坐标 + 航向角 + 图标），rAF 驱动，直至手动点击「取消」终止
  const [tapReturnFlight, setTapReturnFlight] = useState<FlightState | null>(null)
  const tapReturnFlightRaf = useRef<number | null>(null)

  // ---- 区域降落（多机） ----
  // 区域降落模拟飞行状态：确认区域降落后，各选中无人机图标沿各自航线（图标中心 →
  // 对应降落坪）同步循环飞行，rAF 驱动，面板关闭/删除重绘时终止
  const [areaLandingFlights, setAreaLandingFlights] = useState<FlightState[]>([])
  const areaLandingFlightRaf = useRef<number | null>(null)

  // ---- 航点飞行（单机） ----
  // 航点飞行模拟飞行状态：确认航点飞行后，无人机图标沿已生成实线航线循环飞向航点
  // 图钉，rAF 驱动，面板关闭/重新取点时终止
  const [waypointFlight, setWaypointFlight] = useState<FlightState | null>(null)
  const waypointFlightRaf = useRef<number | null>(null)

  // ---- 航线飞行（单机） ----
  // 航线飞行模拟飞行状态：确认航线飞行后，无人机图标沿已生成实线折线航线
  // 依次飞过各编号航点，rAF 驱动，面板关闭/重新取点/删除航点时终止
  const [routeFlightFlight, setRouteFlightFlight] = useState<FlightState | null>(null)
  const routeFlightFlightRaf = useRef<number | null>(null)

  // ---- 环绕飞行（单机） ----
  // 环绕飞行模拟飞行状态：确认环绕飞行后，无人机先沿直线切入盘旋圆，再绕圆持续盘旋
  // （视口坐标 + 航向角 + 图标），rAF 驱动，面板关闭/重新取点/取消重绘时终止
  const [orbitFlight, setOrbitFlight] = useState<FlightState | null>(null)
  const orbitFlightRaf = useRef<number | null>(null)

  // ---- 集结点（多机） ----
  // 集结点模拟飞行状态：滑窗确认后各机沿绿色航线循环飞向对应集结坪
  // （视口坐标 + 航向角 + 图标），rAF 驱动，取消/关闭/删除重绘/重新生成时终止
  const [rallyPointFlights, setRallyPointFlights] = useState<FlightState[]>([])
  const rallyPointFlightRaf = useRef<number | null>(null)
  // 集结点模拟飞行进行中标记：队形变更时判断是否需要以新布局重启动画
  const rallyPointFlyingRef = useRef(false)

  // ---- 编队飞行（多机） ----
  // 编队飞行模拟飞行状态：滑窗确认后各机沿绿色航线同步循环飞向队形中对应降落点
  // （视口坐标 + 航向角 + 图标），rAF 驱动，取消/关闭/重新生成时终止
  const [formationFlightFlights, setFormationFlightFlights] = useState<FlightState[]>([])
  const formationFlightRaf = useRef<number | null>(null)

  // 模拟飞行动画：无人机图标沿「航线生成」连线自飞机位置匀速飞向落点图钉（单程约 4s），
  // 图标按航向角旋转（切图机头默认朝上，rotate = atan2 屏幕角 + 90°）；
  // 到达落点停留 600ms 后回到起点重飞——无限循环播放，
  // 直至手动点击面板「取消」（或切换到其他功能面板）才停止。
  // 仅前端演示，待接入真实指令链路后由实时遥测驱动
  const startTapReturnFlight = (
    line: { x1: number; y1: number; x2: number; y2: number },
    icon: string,
  ) => {
    if (tapReturnFlightRaf.current !== null) cancelAnimationFrame(tapReturnFlightRaf.current)
    const duration = 4000
    const holdAtEnd = 600
    const cycle = duration + holdAtEnd
    const startTime = performance.now()
    const angle = (Math.atan2(line.y2 - line.y1, line.x2 - line.x1) * 180) / Math.PI + 90
    const step = (now: number) => {
      // 周期取模实现无限循环：0~4s 飞行 → 停留落点 600ms → 回到起点重飞
      const t = Math.min(1, ((now - startTime) % cycle) / duration)
      setTapReturnFlight({
        x: line.x1 + (line.x2 - line.x1) * t,
        y: line.y1 + (line.y2 - line.y1) * t,
        angle,
        icon,
      })
      tapReturnFlightRaf.current = requestAnimationFrame(step)
    }
    tapReturnFlightRaf.current = requestAnimationFrame(step)
  }
  // 停止循环飞行：取消动画帧并清除飞行无人机（「取消」按钮/面板收起时调用）
  const stopTapReturnFlight = useCallback(() => {
    if (tapReturnFlightRaf.current !== null) {
      cancelAnimationFrame(tapReturnFlightRaf.current)
      tapReturnFlightRaf.current = null
    }
    setTapReturnFlight(null)
  }, [])

  // 航点飞行模拟飞行：无人机沿「飞机图标中心 → 航点图钉」航线循环飞行（单程约 4s），
  // 到达航点停留 600ms 后回到起点重飞——无限循环，直至面板关闭/重新取点终止；
  // 仅前端演示，待接入真实指令链路后由实时遥测驱动
  const startWaypointFlight = (
    line: { x1: number; y1: number; x2: number; y2: number },
    icon: string,
  ) => {
    if (waypointFlightRaf.current !== null) cancelAnimationFrame(waypointFlightRaf.current)
    const duration = 4000
    const holdAtEnd = 600
    const cycle = duration + holdAtEnd
    const startTime = performance.now()
    const angle = (Math.atan2(line.y2 - line.y1, line.x2 - line.x1) * 180) / Math.PI + 90
    const step = (now: number) => {
      // 周期取模实现无限循环：0~4s 飞行 → 停留航点 600ms → 回到起点重飞
      const t = Math.min(1, ((now - startTime) % cycle) / duration)
      setWaypointFlight({
        x: line.x1 + (line.x2 - line.x1) * t,
        y: line.y1 + (line.y2 - line.y1) * t,
        angle,
        icon,
      })
      waypointFlightRaf.current = requestAnimationFrame(step)
    }
    waypointFlightRaf.current = requestAnimationFrame(step)
  }
  // 停止航点飞行循环：取消动画帧并清除飞行无人机（面板关闭/重新取点时调用）
  const stopWaypointFlight = useCallback(() => {
    if (waypointFlightRaf.current !== null) {
      cancelAnimationFrame(waypointFlightRaf.current)
      waypointFlightRaf.current = null
    }
    setWaypointFlight(null)
  }, [])
  // 航线飞行模拟飞行：无人机沿「航点1 → 航点2 → …」折线航线循环飞行（恒速约 120px/s），
  // 按累计长度线性插值依次经过各编号航点，到达末航点停留 600ms 后回到首航点重飞——
  // 无限循环，直至面板关闭/重新取点/删除航点终止；仅前端演示，待接入真实指令链路后
  // 由实时遥测驱动
  const startRouteFlightAnimation = (points: { x: number; y: number }[], icon: string) => {
    if (routeFlightFlightRaf.current !== null)
      cancelAnimationFrame(routeFlightFlightRaf.current)
    if (points.length === 0) return
    // 预计算折线分段长度：segLens[i] 为航点 i → i+1 段长，total 为全程总长
    const segLens: number[] = []
    let total = 0
    for (let i = 0; i < points.length - 1; i++) {
      const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)
      segLens.push(len)
      total += len
    }
    const speed = 0.12 // px/ms（约 120px/s，降低移动速度使预览更平缓）
    const duration = Math.max(1200, total / speed)
    const holdAtEnd = 600
    const cycle = duration + holdAtEnd
    const startTime = performance.now()
    const step = (now: number) => {
      // 周期取模实现无限循环：0~duration 飞行 → 停留末航点 600ms → 回到首航点重飞
      const elapsed = (now - startTime) % cycle
      const dist = Math.min(total, (elapsed / duration) * total)
      // 沿折线按累计距离定位：找到所在线段并线性插值（航向角随所在段实时更新）
      let acc = 0
      let x = points[0].x
      let y = points[0].y
      let angle = 0
      for (let i = 0; i < segLens.length; i++) {
        if (dist <= acc + segLens[i] || i === segLens.length - 1) {
          const t = segLens[i] > 1e-6 ? (dist - acc) / segLens[i] : 0
          x = points[i].x + (points[i + 1].x - points[i].x) * t
          y = points[i].y + (points[i + 1].y - points[i].y) * t
          angle =
            (Math.atan2(points[i + 1].y - points[i].y, points[i + 1].x - points[i].x) * 180) /
              Math.PI +
            90
          break
        }
        acc += segLens[i]
      }
      setRouteFlightFlight({ x, y, angle, icon })
      routeFlightFlightRaf.current = requestAnimationFrame(step)
    }
    routeFlightFlightRaf.current = requestAnimationFrame(step)
  }
  // 停止航线飞行循环：取消动画帧并清除飞行无人机（面板关闭/重新取点/删除航点时调用）
  const stopRouteFlightAnimation = useCallback(() => {
    if (routeFlightFlightRaf.current !== null) {
      cancelAnimationFrame(routeFlightFlightRaf.current)
      routeFlightFlightRaf.current = null
    }
    setRouteFlightFlight(null)
  }, [])
  // 返航模拟飞行：无人机沿「飞机图标中心 → H 返航标记」航线循环飞行（单程约 4s），
  // 到达 H 标记停留 600ms 后回到起点重飞——无限循环，直至面板关闭（取消）终止；
  // 仅前端演示，待接入真实指令链路后由实时遥测驱动
  const startReturnHomeFlights = (
    routes: { x1: number; y1: number; x2: number; y2: number }[],
    icons: string[],
  ) => {
    if (returnHomeFlightRaf.current !== null) cancelAnimationFrame(returnHomeFlightRaf.current)
    if (routes.length === 0) return
    const duration = 4000
    const holdAtEnd = 600
    const cycle = duration + holdAtEnd
    const startTime = performance.now()
    // 各航线航向角（切图机头默认朝上，rotate = atan2 屏幕角 + 90°）
    const angles = routes.map(
      (r) => (Math.atan2(r.y2 - r.y1, r.x2 - r.x1) * 180) / Math.PI + 90,
    )
    const step = (now: number) => {
      // 周期取模实现无限循环：0~4s 飞行 → 停留 H 标记 600ms → 回到起点重飞（多机同步）
      const t = Math.min(1, ((now - startTime) % cycle) / duration)
      setReturnHomeFlights(
        routes.map((r, i) => ({
          x: r.x1 + (r.x2 - r.x1) * t,
          y: r.y1 + (r.y2 - r.y1) * t,
          angle: angles[i],
          icon: icons[i],
        })),
      )
      returnHomeFlightRaf.current = requestAnimationFrame(step)
    }
    returnHomeFlightRaf.current = requestAnimationFrame(step)
  }
  // 停止返航循环飞行：取消动画帧并清除飞行无人机（面板关闭时调用）
  const stopReturnHomeFlights = useCallback(() => {
    if (returnHomeFlightRaf.current !== null) {
      cancelAnimationFrame(returnHomeFlightRaf.current)
      returnHomeFlightRaf.current = null
    }
    setReturnHomeFlights((prev) => (prev.length > 0 ? [] : prev))
  }, [])
  // 区域降落模拟飞行：各选中无人机沿「飞机图标中心 → 对应降落坪」航线同步循环飞行
  // （单程约 4s，多机并行），到达降落坪停留 600ms 后回到起点重飞——无限循环，
  // 直至面板关闭/删除重绘终止；仅前端演示，待接入真实指令链路后由实时遥测驱动
  const startAreaLandingFlights = (
    routes: { x1: number; y1: number; x2: number; y2: number }[],
    icons: string[],
  ) => {
    if (areaLandingFlightRaf.current !== null) cancelAnimationFrame(areaLandingFlightRaf.current)
    if (routes.length === 0) return
    const duration = 4000
    const holdAtEnd = 600
    const cycle = duration + holdAtEnd
    const startTime = performance.now()
    // 各航线航向角（切图机头默认朝上，rotate = atan2 屏幕角 + 90°）
    const angles = routes.map(
      (r) => (Math.atan2(r.y2 - r.y1, r.x2 - r.x1) * 180) / Math.PI + 90,
    )
    const step = (now: number) => {
      // 周期取模实现无限循环：0~4s 飞行 → 停留降落坪 600ms → 回到起点重飞
      const t = Math.min(1, ((now - startTime) % cycle) / duration)
      setAreaLandingFlights(
        routes.map((r, i) => ({
          x: r.x1 + (r.x2 - r.x1) * t,
          y: r.y1 + (r.y2 - r.y1) * t,
          angle: angles[i],
          icon: icons[i],
        })),
      )
      areaLandingFlightRaf.current = requestAnimationFrame(step)
    }
    areaLandingFlightRaf.current = requestAnimationFrame(step)
  }
  // 停止区域降落循环飞行：取消动画帧并清除全部飞行无人机
  const stopAreaLandingFlights = useCallback(() => {
    if (areaLandingFlightRaf.current !== null) {
      cancelAnimationFrame(areaLandingFlightRaf.current)
      areaLandingFlightRaf.current = null
    }
    setAreaLandingFlights([])
  }, [])
  // 停止集结点循环飞行：取消动画帧并清除全部飞行无人机（无动画时为无操作）
  const stopRallyPointFlights = useCallback(() => {
    rallyPointFlyingRef.current = false
    if (rallyPointFlightRaf.current !== null) {
      cancelAnimationFrame(rallyPointFlightRaf.current)
      rallyPointFlightRaf.current = null
    }
    setRallyPointFlights((prev) => (prev.length > 0 ? [] : prev))
  }, [])
  // 集结点模拟飞行：各选中无人机沿「飞机图标中心 → 对应集结坪」航线同步循环飞行
  // （单程约 4s + 集结坪停留 600ms 为一个周期，多机并行），到达后回到起点重飞——
  // 无限循环，直至取消面板/删除重绘/重新生成终止；仅前端演示，待接入真实指令链路后由实时遥测驱动
  const startRallyPointFlights = (
    flights: { x1: number; y1: number; x2: number; y2: number; icon: string }[],
  ) => {
    stopRallyPointFlights()
    if (flights.length === 0) return
    const duration = 4000
    const holdAtEnd = 600
    const cycle = duration + holdAtEnd
    const startTime = performance.now()
    // 各航线航向角（切图机头默认朝上，rotate = atan2 屏幕角 + 90°）
    const angles = flights.map((f) => (Math.atan2(f.y2 - f.y1, f.x2 - f.x1) * 180) / Math.PI + 90)
    const step = (now: number) => {
      // 周期取模实现无限循环：0~4s 飞行 → 集结坪停留 600ms → 回到起点重飞
      const t = Math.min(1, ((now - startTime) % cycle) / duration)
      setRallyPointFlights(
        flights.map((f, i) => ({
          x: f.x1 + (f.x2 - f.x1) * t,
          y: f.y1 + (f.y2 - f.y1) * t,
          angle: angles[i],
          icon: f.icon,
        })),
      )
      rallyPointFlightRaf.current = requestAnimationFrame(step)
    }
    rallyPointFlyingRef.current = true
    rallyPointFlightRaf.current = requestAnimationFrame(step)
  }
  // 停止编队飞行循环动画：取消动画帧并清除全部飞行无人机（无动画时为无操作）
  const stopFormationFlightFlights = useCallback(() => {
    if (formationFlightRaf.current !== null) {
      cancelAnimationFrame(formationFlightRaf.current)
      formationFlightRaf.current = null
    }
    setFormationFlightFlights((prev) => (prev.length > 0 ? [] : prev))
  }, [])
  // 编队飞行模拟飞行：各选中无人机沿「飞机图标中心 → 队形中对应降落点」航线同步循环
  // 飞行（单程 4s + 降落点停留 600ms 为一个周期，多机并行、同步推进保持队形），
  // 到达后回到起点重飞——无限循环，直至取消面板/重新生成终止；
  // 仅前端演示，待接入真实指令链路后由实时遥测驱动
  const startFormationFlightFlights = (
    flights: { x1: number; y1: number; x2: number; y2: number; icon: string }[],
  ) => {
    stopFormationFlightFlights()
    if (flights.length === 0) return
    const duration = 4000
    const holdAtEnd = 600
    const cycle = duration + holdAtEnd
    const startTime = performance.now()
    // 各航线航向角（切图机头默认朝上，rotate = atan2 屏幕角 + 90°）
    const angles = flights.map((f) => (Math.atan2(f.y2 - f.y1, f.x2 - f.x1) * 180) / Math.PI + 90)
    const step = (now: number) => {
      // 周期取模实现无限循环：0~4s 飞行 → 降落点停留 600ms → 回到起点重飞
      const t = Math.min(1, ((now - startTime) % cycle) / duration)
      setFormationFlightFlights(
        flights.map((f, i) => ({
          x: f.x1 + (f.x2 - f.x1) * t,
          y: f.y1 + (f.y2 - f.y1) * t,
          angle: angles[i],
          icon: f.icon,
        })),
      )
      formationFlightRaf.current = requestAnimationFrame(step)
    }
    formationFlightRaf.current = requestAnimationFrame(step)
  }
  // 环绕飞行模拟飞行：无人机先沿「飞机图标中心 → 圆周最近点」直线匀速切入盘旋圆
  // （约 120px/s），到达圆周后按恒定角速度绕圆无限盘旋（不再返回起点）；
  // 航向角实时对齐运动方向（切图机头默认朝上，rotate = atan2 屏幕角 + 90°）；
  // 直至面板关闭/重新取点/取消重绘终止；仅前端演示，待接入真实指令链路后由实时遥测驱动
  const startOrbitFlight = (
    plane: { x: number; y: number },
    center: { x: number; y: number },
    radius: number,
    icon: string,
  ) => {
    if (orbitFlightRaf.current !== null) cancelAnimationFrame(orbitFlightRaf.current)
    // 切入段终点：圆周最近点（沿飞机→圆心方向自圆心回退半径）
    const dx = center.x - plane.x
    const dy = center.y - plane.y
    const dist = Math.hypot(dx, dy)
    const ux = dist > 1e-6 ? dx / dist : 1
    const uy = dist > 1e-6 ? dy / dist : 0
    const entry = { x: center.x - ux * radius, y: center.y - uy * radius }
    const speed = 0.12 // px/ms（约 120px/s，与航线飞行一致）
    const entryDuration = Math.max(800, dist / speed)
    // 盘旋段：同线速度换算角速度（整圈时长夹在 3~12s，避免小圆过快/大圆过慢）
    const orbitPeriod = Math.min(12000, Math.max(3000, (2 * Math.PI * radius) / speed))
    const omega = (2 * Math.PI) / orbitPeriod // rad/ms
    const entryAngle = Math.atan2(entry.y - center.y, entry.x - center.x)
    const startTime = performance.now()
    const step = (now: number) => {
      const elapsed = now - startTime
      if (elapsed < entryDuration) {
        // 直线切入：飞机中心 → 圆周最近点 匀速飞行（航向固定为切入方向）
        const t = elapsed / entryDuration
        setOrbitFlight({
          x: plane.x + (entry.x - plane.x) * t,
          y: plane.y + (entry.y - plane.y) * t,
          angle: (Math.atan2(uy, ux) * 180) / Math.PI + 90,
          icon,
        })
      } else {
        // 圆周盘旋：自切入点起持续绕行（屏幕坐标下 θ 递增为顺时针），无限循环
        const theta = entryAngle + omega * (elapsed - entryDuration)
        setOrbitFlight({
          x: center.x + radius * Math.cos(theta),
          y: center.y + radius * Math.sin(theta),
          // 运动方向 = 位置角 θ 的切向 (-sinθ, cosθ)
          angle: (Math.atan2(Math.cos(theta), -Math.sin(theta)) * 180) / Math.PI + 90,
          icon,
        })
      }
      orbitFlightRaf.current = requestAnimationFrame(step)
    }
    orbitFlightRaf.current = requestAnimationFrame(step)
  }
  // 停止环绕飞行：取消动画帧并清除飞行无人机（面板关闭/重新取点/取消重绘时调用）
  const stopOrbitFlight = useCallback(() => {
    if (orbitFlightRaf.current !== null) {
      cancelAnimationFrame(orbitFlightRaf.current)
      orbitFlightRaf.current = null
    }
    setOrbitFlight(null)
  }, [])

  // 组件卸载时终止进行中的模拟飞行动画（自 HomePage 迁入）
  useEffect(() => {
    return () => {
      if (returnHomeFlightRaf.current !== null) cancelAnimationFrame(returnHomeFlightRaf.current)
      if (areaLandingFlightRaf.current !== null) cancelAnimationFrame(areaLandingFlightRaf.current)
      if (tapReturnFlightRaf.current !== null) cancelAnimationFrame(tapReturnFlightRaf.current)
      if (waypointFlightRaf.current !== null) cancelAnimationFrame(waypointFlightRaf.current)
      if (routeFlightFlightRaf.current !== null)
        cancelAnimationFrame(routeFlightFlightRaf.current)
      if (orbitFlightRaf.current !== null) cancelAnimationFrame(orbitFlightRaf.current)
      if (rallyPointFlightRaf.current !== null) cancelAnimationFrame(rallyPointFlightRaf.current)
      if (formationFlightRaf.current !== null) cancelAnimationFrame(formationFlightRaf.current)
    }
  }, [])

  return {
    // 飞行状态（驱动 tap-return-drone 图片渲染）
    tapReturnFlight,
    waypointFlight,
    routeFlightFlight,
    returnHomeFlights,
    areaLandingFlights,
    orbitFlight,
    rallyPointFlights,
    formationFlightFlights,
    // 启停函数（面板确认/取消/互斥切换时调用）
    startTapReturnFlight,
    stopTapReturnFlight,
    startWaypointFlight,
    stopWaypointFlight,
    startRouteFlightAnimation,
    stopRouteFlightAnimation,
    startReturnHomeFlights,
    stopReturnHomeFlights,
    startAreaLandingFlights,
    stopAreaLandingFlights,
    startRallyPointFlights,
    stopRallyPointFlights,
    startFormationFlightFlights,
    stopFormationFlightFlights,
    startOrbitFlight,
    stopOrbitFlight,
    // 集结点飞行进行中标记（队形变更时判断是否重启动画）
    rallyPointFlyingRef,
  }
}
