/**
 * @file inspectionRoute.ts
 * @description 区域巡检预设航线全局状态 store
 * @author 4everyy
 * @date 2026-10-07
 */
import { create } from 'zustand'
import { type RouteLinePoint } from '../api/index'

/** inspectionRouteStore —— 区域巡检预设航线全局状态。 */

/** 点坐标键（精确字符串匹配：后端对同一坐标返回完全一致的数值） */
function ptKey(p: RouteLinePoint): string {
  return `${p.latitude},${p.longitude}`
}

/** 裁剪相邻子区域航线的重叠段：对第 i（i>0）条线 */
export function trimSharedRouteRows(lines: RouteLinePoint[][]): RouteLinePoint[][] {
  return lines.map((line, i) => {
    if (i === 0) return line
    const hasTakeoff = line.length > 1
    const cruise = hasTakeoff ? line.slice(1) : line
    if (cruise.length === 0) return line
    const prev = lines[i - 1]
    const prevCruise = prev.length > 1 ? prev.slice(1) : prev
    const prevKeys = new Set(prevCruise.map(ptKey))
    let drop = 0
    while (drop < cruise.length && prevKeys.has(ptKey(cruise[drop]))) drop++
    if (drop === 0 || cruise.length - drop < 2) return line
    const trimmed = cruise.slice(drop)
    return hasTakeoff ? [line[0], ...trimmed] : trimmed
  })
}

interface InspectionRouteState {
  /** 预设巡检航线（每条线为一组按顺序连线的经纬度点；空数组 = 无航线）。 */
  planeLines: RouteLinePoint[][]
  /** 写入一键创建返回的巡检航线（成功后调用，整体覆盖） */
  setInspectionRoutes: (lines: RouteLinePoint[][]) => void
}

export const useInspectionRouteStore = create<InspectionRouteState>((set) => ({
  planeLines: [],
  // 写入即裁剪相邻线重叠边界行：所有消费方（画线/动效）拿到的都是已断开的数据
  setInspectionRoutes: (lines) => set({ planeLines: trimSharedRouteRows(lines) }),
}))
