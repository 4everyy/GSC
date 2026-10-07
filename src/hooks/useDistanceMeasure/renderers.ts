/**
 * @file renderers.ts
 * @description renderers.ts —— 已提交测距控制器 + 橡皮筋预览控制器；几何纯函数拆至 ./geo、 DOM 元素工厂拆至 ./elements。
 * @author 4everyy
 * @date 2026-10-07
 */
import { type LngLat, type MapAdapter, type MarkerHandle, type PolylineHandle } from '../../map-engines'
import { type CommittedMeasurement } from './index'
import { haversineDistance, formatDistance, midpoint, findNearestSegmentIndex } from './geo'
import { PIN_ANCHOR, createDeleteButtonElement, createDistanceLabelElement } from './elements'

/** 兼容旧导入路径：几何纯函数与 DOM 元素工厂经本模块继续对外提供。 */
export {
  makeMeasureSessionId,
  haversineDistance,
  formatDistance,
  midpoint,
  findNearestSegmentIndex,
} from './geo'
export {
  PIN_ANCHOR,
  createStartMarkerElement,
  createEndMarkerElement,
  createFinishPanelElement,
  createDeleteButtonElement,
  createDistanceLabelElement,
  repositionFinishPanel,
} from './elements'

/** 已提交测距控制器：悬停高亮 + 悬浮删除 + 记录生命周期管理 */
export interface CommittedController {
  /** finish() 时提交一条记录：为折线附加悬停交互并纳入跟踪 */
  commit: (record: CommittedMeasurement) => void
  /** 清理所有已提交记录（卸载 / 引擎切换时调用） */
  clearAll: () => void
}

/** 创建已提交测距控制器。 */
export function createCommittedController(deps: {
  getAdapter: () => MapAdapter | null
}): CommittedController {
  const { getAdapter } = deps

  // 已「确定」的测距记录：finish() 时快照当前覆盖物 id 进来，之后 cleanup()/toggle() 不再移除
  const committedRef: CommittedMeasurement[] = []
  // 悬浮删除按钮（单例 Marker）：仅 hover 已提交折线时显示，定位到命中点
  let deleteBtnEl: HTMLDivElement | null = null
  // 显隐直接操作它…
  let deleteBtnInner: HTMLButtonElement | null = null
  let deleteMarker: MarkerHandle | null = null
  const deleteMarkerId = 'measure-delete-btn'
  // 当前悬停的已提交折线 id（点击删除时据此定位记录）
  let activePolylineId: string | null = null
  // 最近一次悬停命中的地理坐标（点击删除时据此定位悬停线段）
  let hoverLngLat: LngLat | null = null
  // 已提交测距分段标签重建序号（保证重建后的标签 id 唯一）
  let labelSeq = 0
  // 离开命中区后的延时隐藏句柄（150ms，防按钮与折线间移动闪烁）
  let hideTimer: number | null = null

  /** 取消待执行的延时隐藏 */
  function clearHideTimer() {
    if (hideTimer !== null) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
  }

  /** 隐藏悬浮删除按钮（仅切内层按钮 display，Marker 保留复用） */
  function hideDeleteButton() {
    if (deleteBtnInner) deleteBtnInner.style.display = 'none'
  }

  /** 懒创建悬浮删除按钮 Marker（单例；id 固定，不与已提交覆盖物 id 冲突） */
  function ensureDeleteButton() {
    const a = getAdapter()
    if (!a) return
    if (!deleteBtnEl) {
      const built = createDeleteButtonElement({
        // 光标进入按钮：取消延时隐藏，保持高亮与按钮可见
        onEnter: clearHideTimer,
        // 光标离开按钮：重新进入延时隐藏流程（可能回到折线命中层）
        onLeave: () => {
          if (activePolylineId) scheduleHide(activePolylineId)
        },
        // 点击删除：仅删除当前悬停的那一段（相邻点自动重连并显示新段距离）
        onDelete: () => {
          if (activePolylineId) deleteHoveredSegment()
        },
      })
      deleteBtnEl = built.host
      deleteBtnInner = built.button
    }
    if (!deleteMarker) {
      deleteMarker = a.addMarker(deleteMarkerId, { lng: 0, lat: 0 }, {
        element: deleteBtnEl ?? undefined,
        anchor: PIN_ANCHOR,
      })
      // 初始隐藏，仅 hover 已提交折线时显示
      if (deleteBtnInner) deleteBtnInner.style.display = 'none'
    }
  }

  /** 显示悬浮删除按钮并定位到命中点（≈光标处） */
  function showDeleteButton(lngLat: LngLat) {
    const a = getAdapter()
    if (!a) return
    ensureDeleteButton()
    if (!deleteMarker) return
    a.setMarkerPosition(deleteMarker, lngLat)
    if (deleteBtnInner) deleteBtnInner.style.display = ''
  }

  /** 延时（150ms）恢复高亮并隐藏按钮 */
  function scheduleHide(polyId: string) {
    clearHideTimer()
    hideTimer = window.setTimeout(() => {
      hideTimer = null
      getAdapter()?.setPolylineHighlight(polyId, false)
      hideDeleteButton()
      activePolylineId = null
    }, 150)
  }

  /** 删除一条已「确定」的测距：解除交互绑定 + 移除其折线/图钉/分段标签 */
  function removeCommitted(polyId: string) {
    const a = getAdapter()
    if (!a) return
    const idx = committedRef.findIndex((c) => c.polylineId === polyId)
    if (idx === -1) return
    const [cm] = committedRef.splice(idx, 1)
    cm.unbindInteractive?.()
    cm.markerIds.forEach((id) => a.removeMarker(id))
    if (cm.polylineId) a.removePolyline(cm.polylineId)
    cm.segmentLabelIds.forEach((id) => a.removeMarker(id))
    clearHideTimer()
    hideDeleteButton()
    activePolylineId = null
  }

  /** 删除当前悬停的那一段（仅该段，而非整条测距）：- 定位：以悬停期间记录的光标位置找最近线段，删除该段及其终点图钉 */
  function deleteHoveredSegment() {
    const a = getAdapter()
    const pid = activePolylineId
    if (!a || !pid) return
    const idx = committedRef.findIndex((c) => c.polylineId === pid)
    if (idx === -1) return
    const cm = committedRef[idx]
    const pts = cm.points
    const segIdx = hoverLngLat ? findNearestSegmentIndex(pts, hoverLngLat) : -1
    if (segIdx === -1 || pts.length <= 2) {
      removeCommitted(pid)
      return
    }
    // 移除该段终点（points[segIdx]）的图钉
    const removedMarkerId = cm.markerIds[segIdx]
    if (removedMarkerId) a.removeMarker(removedMarkerId)
    const next = pts.filter((_, i) => i !== segIdx)
    cm.markerIds = cm.markerIds.filter((id) => id !== removedMarkerId)
    cm.points = next
    // 折线按剩余点重连（复用原 source，悬停命中层与高亮状态保持不变）
    if (cm.polylineHandle) a.setPolylinePoints(cm.polylineHandle, next)
    // 重建分段距离标签：新连接段的中点标签随重绘出现
    cm.segmentLabelIds.forEach((id) => a.removeMarker(id))
    labelSeq += 1
    const nextLabelIds: string[] = []
    for (let i = 1; i < next.length; i++) {
      const segDist = haversineDistance(next[i - 1], next[i])
      const mid = midpoint(next[i - 1], next[i])
      const labelEl = createDistanceLabelElement(formatDistance(segDist))
      const labelId = `${pid}-seg-label-${labelSeq}-${i}`
      a.addMarker(labelId, mid, { element: labelEl, anchor: PIN_ANCHOR })
      nextLabelIds.push(labelId)
    }
    cm.segmentLabelIds = nextLabelIds
    // 复位悬停态：恢复线宽线色、隐藏按钮，等待下一次悬停
    clearHideTimer()
    a.setPolylineHighlight(pid, false)
    hideDeleteButton()
    hoverLngLat = null
    activePolylineId = null
  }

  /** 为已提交折线附加悬停交互：透明命中层 + 进入/离开回调（高亮 + 悬浮删除按钮） */
  function bindInteractive(a: MapAdapter, polyId: string, record: CommittedMeasurement) {
    record.unbindInteractive = a.setPolylineInteractive(polyId, {
      onEnter: (lngLat) => {
        const adapter = getAdapter()
        if (!adapter) return
        activePolylineId = polyId
        hoverLngLat = lngLat
        clearHideTimer()
        adapter.setPolylineHighlight(polyId, true, { color: '#FF8A1E' })
        showDeleteButton(lngLat)
      },
      onMove: (lngLat) => {
        // 实时记录悬停位置（点击删除时据此定位悬停线段），删除按钮跟随光标
        hoverLngLat = lngLat
        showDeleteButton(lngLat)
      },
      onLeave: () => scheduleHide(polyId),
    })
  }

  /** finish() 时提交一条记录：为折线附加悬停交互并纳入跟踪 */
  function commit(record: CommittedMeasurement) {
    const a = getAdapter()
    if (a && record.polylineId) {
      bindInteractive(a, record.polylineId, record)
    }
    committedRef.push(record)
  }

  /** 清理所有已提交记录（卸载 / 引擎切换时调用） */
  function clearAll() {
    const a = getAdapter()
    if (a) {
      committedRef.forEach((cm) => {
        cm.unbindInteractive?.()
        cm.markerIds.forEach((id) => a.removeMarker(id))
        if (cm.polylineId) a.removePolyline(cm.polylineId)
        cm.segmentLabelIds.forEach((id) => a.removeMarker(id))
      })
      // 清理共享的悬浮删除按钮（若有）
      if (deleteMarker) a.removeMarker(deleteMarkerId)
    }
    committedRef.length = 0
    deleteMarker = null
    deleteBtnEl = null
    deleteBtnInner = null
    clearHideTimer()
    hideDeleteButton()
    activePolylineId = null
  }

  return { commit, clearAll }
}


/** 橡皮筋预览控制器：管理虚线 + 动态距离标签两个懒创建的覆盖物 */
export interface PreviewController {
  /** 更新橡皮筋预览（从最后一个已落点到鼠标当前位置绘制虚线 + 预览段距离标签） */
  update: (mousePos: LngLat) => void
  /** 清除橡皮筋预览覆盖物（虚线 + 标签） */
  clear: () => void
}

/** 创建橡皮筋预览控制器。 */
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

  /** 更新橡皮筋预览：从最后一个已落点到鼠标当前位置绘制虚线，距离标签随鼠标实时跳动（显示当前预览段距离），悬浮在预览虚线中点上方。 */
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

