/**
 * InspectionRouteLayer —— 区域巡检预设航线图层。
 *
 * 数据源：inspectionRouteStore.planeLines（创建任务面板「区域巡检 + 一键创建」
 * 成功后由 podControlOneClickCreate 返回的 plane_line 解析写入，每条线为一组
 * 按顺序连线的经纬度点）。注意：每条线首点为该机起飞点（后端按飞机当前位置
 * 生成，位于巡检区外），第二个点起才是巡检航线本身——渲染时跳过首点，
 * 只画巡检折线（避免「起飞点→航线起点」转场长线被误画为航线）。相邻线的
 * 重叠边界行已在 store 写入时裁掉（trimSharedRouteRows，见
 * stores/inspectionRoute.ts），各子区域航线之间留有断口、不连成一条。渲染：每条
 * 航线一个折线覆盖物（线宽固定 8px，按点位顺序连线，统一 #00FF95 预设色，
 * 沿线叠加方向箭头（Rectangle 191.svg）标明巡检行进方向；无人机已飞过的
 * 部分由 ReconFlightOverlay 的 #C9C9C9 灰色轨迹线叠加覆盖——灰线与航线
 * 同宽 8px 且不透明，完全遮盖已飞段的绿色航线与方向箭头）。
 * 更新策略与 TaskAreaLayer
 * 同款增量 diff（按线索引签名）：
 * 签名变化（再次创建返回新航线）先删后建——引擎层同 id 直接添加会泄漏旧
 * source/layer；卸载全量清理。
 */
import { useEffect, useRef } from 'react'
import { type MapAdapter } from '../../../map-engines/types'
import { useInspectionRouteStore } from '../../../stores/inspectionRoute'
import { taskPanelImages } from '../../../assets/images/task-panel'
import type { RouteLinePoint } from '../../../api/index'

/** 覆盖物 id 前缀（隔离命名空间，避免与业务图层冲突） */
const LINE_ID_PREFIX = 'inspection-route-line-'
/** 航线视觉：线宽 8px（产品口径）；统一 #00FF95 预设色（与无人机已飞轨迹
 * 灰 #C9C9C9 区分；TRAIL_WIDTH 与本值保持同步同宽 8px 全遮盖，见
 * ReconFlightOverlay 已飞轨迹线） */
const LINE_WIDTH = 8
const LINE_COLOR = '#00FF95'
/** 沿线方向箭头（Rectangle 191.svg 白色箭头贴图）：叠加在 #00FF95 航线上，
 * 沿折线按点序方向自动旋转，标明未巡检（待飞）区域的行进方向；
 * 尺寸与线宽一致（8px），间距进一步加密至 28px 保证方向指示连续醒目；
 * 开启 pulse 呼吸闪烁（透明度 0.45~1、尺寸 1~1.15 正弦脉动），密排箭头呈流光效果 */
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
    // 新增（含签名变化后的重建）。点集跳过首点（起飞点）：巡检折线自第二个点
    // 起连线；剥首点后不足 2 点（整线仅起飞点+单航点）则该线不画
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
        color: LINE_COLOR,
        opacity: 0.95,
        // 绿色未巡检航线叠加方向箭头，标明巡检行进方向（贴图随折线自动旋转）
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

  // 组件卸载 / adapter 更换时全量清理（正常 planeLines 变化不经过此 cleanup）
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