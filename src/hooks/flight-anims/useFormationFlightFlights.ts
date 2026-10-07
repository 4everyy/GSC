/**
 * @file useFormationFlightFlights.ts
 * @description Formation flight animation hook (extracted from useFlightAnimations.ts)
 * @author 4everyy
 * @date 2026-10-07
 */
import { useCallback, useEffect, useRef } from 'react'
import { useFlightAnimStore } from '../../stores/index'

export function useFormationFlightFlights() {
  const formationFlightRaf = useRef<number | null>(null)

  // 停止编队飞行循环动画：取消动画帧并清除全部飞行无人机（无动画时为无操作）
  const stopFormationFlightFlights = useCallback(() => {
    if (formationFlightRaf.current !== null) {
      cancelAnimationFrame(formationFlightRaf.current)
      formationFlightRaf.current = null
    }
    const { formationFlightFlights, setFormationFlightFlights } = useFlightAnimStore.getState()
    if (formationFlightFlights.length > 0) setFormationFlightFlights([])
  }, [])
  // 编队飞行模拟飞行：各选中无人机沿「飞机图标中心 → 队形中对应降落点」航线同步循环飞行（单程 4s + 降落点停留 600ms 为一个周期
  const startFormationFlightFlights = useCallback(
    (flights: { x1: number; y1: number; x2: number; y2: number; icon: string }[]) => {
      const { setFormationFlightFlights } = useFlightAnimStore.getState()
      stopFormationFlightFlights()
      if (flights.length === 0) return
      const duration = 4000
      const holdAtEnd = 600
      const cycle = duration + holdAtEnd
      const startTime = performance.now()
      // 各航线航向角（切图机头默认朝右，rotate = atan2 屏幕角）
      const angles = flights.map((f) => (Math.atan2(f.y2 - f.y1, f.x2 - f.x1) * 180) / Math.PI)
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
    },
    [stopFormationFlightFlights],
  )
  // Unmount cleanup: cancel rAF and reset the store slice (migrated from useFlightAnimations)
  useEffect(() => {
    return () => {
      if (formationFlightRaf.current !== null) cancelAnimationFrame(formationFlightRaf.current)
      useFlightAnimStore.getState().setFormationFlightFlights([])
    }
  }, [])

  return { startFormationFlightFlights, stopFormationFlightFlights }
}
