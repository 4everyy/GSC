/**
 * @file useTapReturnFlight.ts
 * @description Tap-return flight animation hook (extracted from useFlightAnimations.ts)
 * @author 4everyy
 * @date 2026-10-07
 */
import { useCallback, useEffect, useRef } from 'react'
import { useFlightAnimStore } from '../../stores/index'

export function useTapReturnFlight() {
  const tapReturnFlightRaf = useRef<number | null>(null)

  // 模拟飞行动画：无人机图标沿「航线生成」连线自飞机位置匀速飞向落点图钉（单程约 4s），图标按航向角旋转（切图机头默认朝右
  const startTapReturnFlight = useCallback(
    (line: { x1: number; y1: number; x2: number; y2: number }, icon: string) => {
      const { setTapReturnFlight } = useFlightAnimStore.getState()
      if (tapReturnFlightRaf.current !== null) cancelAnimationFrame(tapReturnFlightRaf.current)
      const duration = 4000
      const holdAtEnd = 600
      const cycle = duration + holdAtEnd
      const startTime = performance.now()
      const angle = (Math.atan2(line.y2 - line.y1, line.x2 - line.x1) * 180) / Math.PI
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
    },
    [],
  )
  // 停止循环飞行：取消动画帧并清除飞行无人机（「取消」按钮/面板收起时调用）
  const stopTapReturnFlight = useCallback(() => {
    if (tapReturnFlightRaf.current !== null) {
      cancelAnimationFrame(tapReturnFlightRaf.current)
      tapReturnFlightRaf.current = null
    }
    useFlightAnimStore.getState().setTapReturnFlight(null)
  }, [])

  // Unmount cleanup: cancel rAF and reset the store slice (migrated from useFlightAnimations)
  useEffect(() => {
    return () => {
      if (tapReturnFlightRaf.current !== null) cancelAnimationFrame(tapReturnFlightRaf.current)
      useFlightAnimStore.getState().setTapReturnFlight(null)
    }
  }, [])

  return { startTapReturnFlight, stopTapReturnFlight }
}
