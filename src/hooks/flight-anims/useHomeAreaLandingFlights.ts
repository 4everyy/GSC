/**
 * @file useHomeAreaLandingFlights.ts
 * @description Return-home & area-landing flight animation hooks (extracted from useFlightAnimations.ts)
 * @author 4everyy
 * @date 2026-10-07
 */
import { useCallback, useEffect, useRef } from 'react'
import { useFlightAnimStore } from '../../stores/index'

export function useHomeAreaLandingFlights() {
  const returnHomeFlightRaf = useRef<number | null>(null)
  const areaLandingFlightRaf = useRef<number | null>(null)

  // 返航模拟飞行：无人机沿「飞机图标中心 → H 返航标记」航线循环飞行（单程约 4s）
  const startReturnHomeFlights = useCallback(
    (routes: { x1: number; y1: number; x2: number; y2: number }[], icons: string[]) => {
      const { setReturnHomeFlights } = useFlightAnimStore.getState()
      if (returnHomeFlightRaf.current !== null) cancelAnimationFrame(returnHomeFlightRaf.current)
      if (routes.length === 0) return
      const duration = 4000
      const holdAtEnd = 600
      const cycle = duration + holdAtEnd
      const startTime = performance.now()
      // 各航线航向角（切图机头默认朝右，rotate = atan2 屏幕角）
      const angles = routes.map((r) => (Math.atan2(r.y2 - r.y1, r.x2 - r.x1) * 180) / Math.PI)
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
    },
    [],
  )
  // 停止返航循环飞行：取消动画帧并清除飞行无人机（面板关闭时调用）
  const stopReturnHomeFlights = useCallback(() => {
    if (returnHomeFlightRaf.current !== null) {
      cancelAnimationFrame(returnHomeFlightRaf.current)
      returnHomeFlightRaf.current = null
    }
    const { returnHomeFlights, setReturnHomeFlights } = useFlightAnimStore.getState()
    if (returnHomeFlights.length > 0) setReturnHomeFlights([])
  }, [])
  // 区域降落模拟飞行：各选中无人机沿「飞机图标中心 → 对应降落坪」航线同步循环飞行（单程约 4s，多机并行）
  const startAreaLandingFlights = useCallback(
    (routes: { x1: number; y1: number; x2: number; y2: number }[], icons: string[]) => {
      const { setAreaLandingFlights } = useFlightAnimStore.getState()
      if (areaLandingFlightRaf.current !== null) cancelAnimationFrame(areaLandingFlightRaf.current)
      if (routes.length === 0) return
      const duration = 4000
      const holdAtEnd = 600
      const cycle = duration + holdAtEnd
      const startTime = performance.now()
      // 各航线航向角（切图机头默认朝右，rotate = atan2 屏幕角）
      const angles = routes.map((r) => (Math.atan2(r.y2 - r.y1, r.x2 - r.x1) * 180) / Math.PI)
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
    },
    [],
  )
  // 停止区域降落循环飞行：取消动画帧并清除全部飞行无人机
  const stopAreaLandingFlights = useCallback(() => {
    if (areaLandingFlightRaf.current !== null) {
      cancelAnimationFrame(areaLandingFlightRaf.current)
      areaLandingFlightRaf.current = null
    }
    useFlightAnimStore.getState().setAreaLandingFlights([])
  }, [])
  // Unmount cleanup: cancel rAF and reset the store slice (migrated from useFlightAnimations)
  useEffect(() => {
    return () => {
      if (returnHomeFlightRaf.current !== null) cancelAnimationFrame(returnHomeFlightRaf.current)
      if (areaLandingFlightRaf.current !== null) cancelAnimationFrame(areaLandingFlightRaf.current)
      useFlightAnimStore.getState().setReturnHomeFlights([])
      useFlightAnimStore.getState().setAreaLandingFlights([])
    }
  }, [])

  return { startReturnHomeFlights, stopReturnHomeFlights, startAreaLandingFlights, stopAreaLandingFlights }
}
