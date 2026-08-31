import type { LngLat, MapAdapter, MarkerHandle, PolylineHandle } from '../../map-engines'
import { PIN_ANCHOR } from './dom'
import { formatDistance, haversineDistance, midpoint } from './geo'

/** 橡皮筋预览控制器：管理虚线 + 动态距离标签两个懒创建的覆盖物 */
export interface PreviewController {
  /** 更新橡皮筋预览（从最后一个已落点到鼠标当前位置绘制虚线 + 预览段距离标签） */
  update: (mousePos: LngLat) => void
  /** 清除橡皮筋预览覆盖物（虚线 + 标签） */
  clear: () => void
}

/**
 * 创建橡皮筋预览控制器。
 *
 * 预览虚线（绿色 #7BFF00）与距离标签均懒创建：首次更新时创建覆盖物，
 * 后续仅更新路径 / 文本 / 位置（避免频繁 DOM 重建）。
 * 通过 getter 读取最新 adapter 与已落点，避免闭包陈旧。
 */
export function createPreviewController(deps: {
  getAdapter: () => MapAdapter | null
  getPoints: () => LngLat[]
}): PreviewController {
  const { getAdapter, getPoints } = deps

  const polylineId = 'measure-preview-polyline'
  const labelId = 'measure-preview-label'
  let polylineHandle: PolylineHandle | null = null
  let labelMarker: MarkerHandle | null = null
  let labelWrapper: HTMLElement | null = null
  let labelEl: HTMLElement | null = null

  /** 清除橡皮筋预览覆盖物（虚线 + 标签） */
  function clear() {
    const adapter = getAdapter()
    if (!adapter) return
    if (polylineHandle) {
      adapter.removePolyline(polylineId)
      polylineHandle = null
    }
    if (labelMarker) {
      adapter.removeMarker(labelId)
      labelMarker = null
    }
    labelWrapper = null
    labelEl = null
  }

  /**
   * 更新橡皮筋预览：从最后一个已落点到鼠标当前位置绘制虚线，
   * 距离标签随鼠标实时跳动（显示当前预览段距离），悬浮在预览虚线中点上方。
   */
  function update(mousePos: LngLat) {
    const adapter = getAdapter()
    if (!adapter) return
    const committed = getPoints()
    if (committed.length === 0) {
      clear()
      return
    }
    const last = committed[committed.length - 1]
    const previewPts = [last, mousePos]

    // 预览虚线（绿色 #7BFF00）：懒创建，后续仅更新路径
    if (!polylineHandle) {
      polylineHandle = adapter.addPolyline(polylineId, previewPts, {
        width: 2,
        color: '#7BFF00',
        opacity: 0.9,
        dash: true,
      })
    } else {
      adapter.setPolylinePoints(polylineHandle, previewPts)
    }

    // 当前预览段距离（仅这一段）
    const previewSegDist = haversineDistance(last, mousePos)
    // 预览段中点
    const previewMid = midpoint(last, mousePos)

    // 预览距离标签：懒创建，后续仅更新文本 + 位置（避免频繁 DOM 重建）
    if (!labelMarker) {
      const wrapper = document.createElement('div')
      wrapper.style.position = 'relative'
      wrapper.style.width = '0'
      wrapper.style.height = '0'
      wrapper.style.overflow = 'visible'

      const label = document.createElement('div')
      // 虚线预览段标签：用线条颜色（绿）标注，无深色背景
      label.className = 'measure-distance-label measure-distance-label--preview'
      label.textContent = formatDistance(previewSegDist)
      label.style.position = 'absolute'
      label.style.left = '0'
      label.style.top = '-10px'
      label.style.transform = 'translateX(-50%)'
      label.style.whiteSpace = 'nowrap'
      wrapper.appendChild(label)

      labelWrapper = wrapper
      labelEl = label
      labelMarker = adapter.addMarker(labelId, previewMid, {
        element: wrapper,
        anchor: PIN_ANCHOR,
      })
    } else {
      // element 即 Marker DOM，直接改 textContent 即可生效
      if (labelEl) {
        labelEl.textContent = formatDistance(previewSegDist)
      }
      // 若 Marker 内容需整体替换，通过 setMarkerElement 推送新 DOM
      if (labelWrapper) {
        adapter.setMarkerElement(labelMarker, labelWrapper)
      }
      // 更新到预览段中点（随鼠标移动）
      adapter.setMarkerPosition(labelMarker, previewMid)
    }
  }

  return { update, clear }
}
