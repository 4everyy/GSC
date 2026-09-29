import { create } from 'zustand'
import { type RouteLinePoint } from '../api/index'

/**
 * inspectionRouteStore —— 区域巡检预设航线全局状态。
 *
 * 承载「一键创建」（actionType=77）成功返回的预设巡检航线（返回数据 plane_line
 * 字段经 podControlOneClickCreate 解析为 RouteLinePoint[][]，每条线为一组按顺序
 * 连线的经纬度点）。数据口径：①每条线首点为该机起飞点（后端按飞机当前位置生成，
 * 位于巡检区外），第二个点起才是巡检折线——消费方（InspectionRouteLayer 画线 /
 * ReconFlightOverlay 飞行动效）需跳过首点；②后端把蛇形航线按边界行切分为 N 段，
 * 每段头部数点与前一段尾部数点完全重复（边界行同属前后两段）——写入时经
 * trimSharedRouteRows 裁掉本线头部与前一段重复的点（边界行归属前一段），使各
 * 子区域航线之间留出断口、不连成一条。写入侧为 TaskCreatePanel 一键创建成功
 * 回调；读取侧为 InspectionRouteLayer（HomePage 态势图），按线宽 4px 依次连线渲染。
 * 再次创建成功时整体覆盖（旧航线自动替换）；空数组即无航线显示。
 */

/** 点坐标键（精确字符串匹配：后端对同一坐标返回完全一致的数值） */
function ptKey(p: RouteLinePoint): string {
  return `${p.latitude},${p.longitude}`
}

/**
 * 裁剪相邻子区域航线的重叠段：对第 i（i>0）条线，剥掉首点（起飞点）后，自头部
 * 起逐点丢弃在前一条线巡检折线中出现过的点（后端蛇形切分时边界行同时分给前后
 * 两段，坐标逐点完全一致），使各子区域航线之间留出断口、不连成一条；边界行
 * 归属前一段。退化保护：裁剪后巡检折线不足 2 点（无法连线）时保留原线不动。
 */
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
  /**
   * 预设巡检航线（每条线为一组按顺序连线的经纬度点；空数组 = 无航线）。
   * 注意：①每条线首点为该机起飞点（非巡检点），巡检折线自第二个点起；
   * ②写入时已裁掉各线头部与前一条线重复的边界行点（子区域间不相连）。
   */
  planeLines: RouteLinePoint[][]
  /** 写入一键创建返回的巡检航线（成功后调用，整体覆盖） */
  setInspectionRoutes: (lines: RouteLinePoint[][]) => void
}

export const useInspectionRouteStore = create<InspectionRouteState>((set) => ({
  planeLines: [],
  // 写入即裁剪相邻线重叠边界行：所有消费方（画线/动效）拿到的都是已断开的数据
  setInspectionRoutes: (lines) => set({ planeLines: trimSharedRouteRows(lines) }),
}))
