/**
 * @file InspectionRouteLayer.tsx
 * @description InspectionRouteLayer —— 区域巡检预设航线图层。
 * @author 4everyy
 * @date 2026-10-07
 */
import { useEffect, useRef } from 'react'
import { type MapAdapter } from '../../../map-engines/types'
import { useInspectionRouteStore } from '../../../stores/inspectionRoute'
import { taskPanelImages } from '../../../assets/task-panel'
import type { RouteLinePoint } from '../../../api/index'

/** 覆盖物 id 前缀（隔离命名空间，避免与业务图层冲突） */
const LINE_ID_PREFIX = 'inspection-route-line-'
/** 航线视觉：线宽 8px（产品口径） */
const LINE_WIDTH = 8
/** 子区域航线调色板（深色底图高区分度荧光色系，按线索引 i % 长度循环取色）：索引即区域序号（后端按蛇形切分顺序返回，与执行飞机一一对应） */
const LINE_COLORS = [
  '#00FF95', // 区域1：荧光绿（原统一预设色，单区域视觉不变）
  '#00C2FF', // 区域2：亮青蓝
  '#FFD60A', // 区域3：明黄
  '#FF7A45', // 区域4：亮橙
  '#B388FF', // 区域5：亮紫
  '#FF4D8D', // 区域6：玫粉
] as const
/** 沿线方向箭头（route-direction-arrow.svg 白色箭头贴图）：叠加在区域配色航线上 */
const LINE_ARROW_SIZE = 8
const LINE_ARROW_SPACING = 28

/** 单条航线数据签名（点序列序列化；变化即整线重建） */
function lineSig(line: RouteLinePoint[]): string {
  return line.map((p) => `${p.latitude},${p.longitude}`).join(';')
}

interface InspectionRouteLayerProps {
  /** 地图引擎适配器（未就绪时不渲染） */
  adapter: MapAdapter | null
}

export function InspectionRouteLayer({ adapter }: InspectionRouteLayerProps) {
  const planeLines = useInspectionRouteStore((s) => s.planeLines)

  /** 已挂载航线及其签名（按线索引）：增量 diff 依据 */
  const renderedRef = useRef(new Map<number, string>())

  useEffect(() => {
    if (!adapter) return
    const prev = renderedRef.current
    const want = new Map<number, string>()
    planeLines.forEach((line, i) => {
      want.set(i, lineSig(line))
    })
    // 移除：不再存在 或 签名变化（后者先删后建）
    for (const [i, sig] of prev) {
      if (want.get(i) === sig) continue
      adapter.removePolyline(`${LINE_ID_PREFIX}${i}`)
      prev.delete(i)
    }
    // 新增（含签名变化后的重建）。
    planeLines.forEach((line, i) => {
      const sig = want.get(i)
      if (sig === undefined || prev.get(i) === sig) return
      const pts = (line.length > 1 ? line.slice(1) : line)
        .map((p) => ({ lng: p.longitude, lat: p.latitude }))
      if (pts.length < 2) {
        prev.set(i, sig)
        return
      }
      adapter.addPolyline(`${LINE_ID_PREFIX}${i}`, pts, {
        width: LINE_WIDTH,
        // 按子区域索引取色：多区域巡检时各区域航线异色，一眼可辨归属
        color: LINE_COLORS[i % LINE_COLORS.length],
        opacity: 0.95,
        // 未巡检航线叠加方向箭头，标明巡检行进方向（贴图随折线自动旋转）
        arrows: {
          iconUrl: taskPanelImages.routeDirectionArrow,
          iconSize: LINE_ARROW_SIZE,
          spacing: LINE_ARROW_SPACING,
          // 闪光呼吸：箭头透明度/尺寸正弦脉动，密排后呈流光闪烁
          pulse: true,
        },
      })
      prev.set(i, sig)
    })
  }, [adapter, planeLines])

  // 组件卸载 / adapter 更换时全量清理…
  useEffect(() => {
    if (!adapter) return
    return () => {
      for (const i of renderedRef.current.keys()) {
        adapter.removePolyline(`${LINE_ID_PREFIX}${i}`)
      }
      renderedRef.current.clear()
    }
  }, [adapter])

  return null
}