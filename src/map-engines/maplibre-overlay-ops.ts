/**
 * @file maplibre-overlay-ops.ts
 * @description MapLibre 覆盖物操作：折线命中层交互、高亮恢复、样式热切换重放（自 MapLibreAdapter 拆出）。
 * @author 4everyy
 * @date 2026-10-07
 */
import type { Map as MLMap, MapMouseEvent as MLMapMouseEvent } from 'maplibre-gl'
import type { PolylineHighlightOptions, PolylineInteractionOptions } from './types'
import { nextId, type MapLibreOverlayEntry } from './maplibre-utils'

/** 为折线附加透明宽线命中层与 hover 交互，返回解绑函数。 */
export function attachPolylineInteraction(
  map: MLMap,
  overlays: Map<string, MapLibreOverlayEntry>,
  id: string,
  opts: PolylineInteractionOptions,
): () => void {
  const entry = overlays.get(id)
  // 仅折线、且存在主线层与 source 时才可附加交互；否则返回空函数保持幂等
  if (!entry || entry.kind !== 'polyline' || !entry.sourceId) return () => {}
  const mainLayerId = entry.layerIds?.[0]
  if (!mainLayerId) return () => {}

  // 复用既有命中层（幂等），否则新建一条与主线同 source 的透明宽线作为命中区
  let hitLayerId = entry.hitLayerId
  if (!hitLayerId || !map.getLayer(hitLayerId)) {
    hitLayerId = nextId('hit')
    map.addLayer({
      id: hitLayerId,
      type: 'line',
      source: entry.sourceId,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        // 完全透明：仅承担命中检测，不产生视觉
        'line-color': '#000000',
        'line-opacity': 0,
        'line-width': opts.hitWidth ?? 18,
      },
    })
    // 纳入 layerIds，removeOverlay 时随主线/光晕一并清理
    entry.layerIds = [...(entry.layerIds ?? []), hitLayerId]
    entry.hitLayerId = hitLayerId
  } else if (opts.hitWidth !== undefined) {
    // 复用命中层但传入新宽度时同步
    map.setPaintProperty(hitLayerId, 'line-width', opts.hitWidth)
  }

  const onEnterFn = (e: MLMapMouseEvent) => {
    opts.onEnter?.({ lng: e.lngLat.lng, lat: e.lngLat.lat })
  }
  const onMoveFn = (e: MLMapMouseEvent) => {
    opts.onMove?.({ lng: e.lngLat.lng, lat: e.lngLat.lat })
  }
  const onLeaveFn = () => {
    opts.onLeave?.()
  }
  map.on('mouseenter', hitLayerId, onEnterFn)
  map.on('mousemove', hitLayerId, onMoveFn)
  map.on('mouseleave', hitLayerId, onLeaveFn)

  // 仅解绑事件
  return () => {
    map.off('mouseenter', hitLayerId, onEnterFn)
    map.off('mousemove', hitLayerId, onMoveFn)
    map.off('mouseleave', hitLayerId, onLeaveFn)
  }
}

/** 设置/取消折线高亮：首次高亮缓存原始线宽/线色，取消时恢复。 */
export function applyPolylineHighlight(
  map: MLMap,
  overlays: Map<string, MapLibreOverlayEntry>,
  id: string,
  highlighted: boolean,
  opts?: PolylineHighlightOptions,
): void {
  const entry = overlays.get(id)
  if (!entry || entry.kind !== 'polyline') return
  const mainLayerId = entry.layerIds?.[0]
  if (!mainLayerId || !map.getLayer(mainLayerId)) return

  if (highlighted) {
    // 首次高亮时缓存原始线宽/线色，供恢复
    if (entry.baseLineWidth === undefined) {
      const w = map.getPaintProperty(mainLayerId, 'line-width') as number | undefined
      entry.baseLineWidth = typeof w === 'number' ? w : 4
    }
    if (entry.baseLineColor === undefined) {
      const c = map.getPaintProperty(mainLayerId, 'line-color') as string | undefined
      entry.baseLineColor = typeof c === 'string' ? c : undefined
    }
    const scale = opts?.widthScale ?? 1.8
    map.setPaintProperty(mainLayerId, 'line-width', (entry.baseLineWidth ?? 4) * scale)
    if (opts?.color) map.setPaintProperty(mainLayerId, 'line-color', opts.color)
  } else {
    if (entry.baseLineWidth !== undefined) {
      map.setPaintProperty(mainLayerId, 'line-width', entry.baseLineWidth)
    }
    if (entry.baseLineColor !== undefined) {
      map.setPaintProperty(mainLayerId, 'line-color', entry.baseLineColor)
    }
  }
}

/** setStyle 整体替换样式后重放引擎层覆盖物（source/layer 已被清空，DOM marker 不受影响）。 */
export function replayOverlaysAfterStyleChange(
  map: MLMap,
  overlays: Map<string, MapLibreOverlayEntry>,
): void {
  const replay = () => {
    const entries = Array.from(overlays.entries())
    if (entries.length === 0) {
      map.off('styledata', replay)
      return
    }
    try {
      for (const [id, entry] of entries) {
        // 等待期间被移除/已重建（entry 引用失效）的覆盖物跳过
        if (overlays.get(id) !== entry) continue
        // source 仍在当前 style（未被清空）则无需重建，防止重复添加
        if (entry.sourceId && map.getSource(entry.sourceId)) continue
        entry.recreate?.()
      }
      map.off('styledata', replay)
    } catch {
      // 新样式数据尚未就绪，等待下一个 styledata 再试
    }
  }
  map.on('styledata', replay)
}