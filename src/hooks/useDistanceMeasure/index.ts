import { useCallback, useEffect, useRef, useState } from 'react'
import type { LngLat, MapAdapter, MarkerHandle, PolylineHandle } from '../../map-engines'
import { createCommittedController, type CommittedController } from './committedMeasurements'
import {
  createDistanceLabelElement,
  createEndMarkerElement,
  createFinishPanelElement,
  createStartMarkerElement,
  PIN_ANCHOR,
  repositionFinishPanel,
} from './dom'
import { formatDistance, haversineDistance, makeMeasureSessionId, midpoint } from './geo'
import { createPreviewController, type PreviewController } from './preview'
import type { CommittedMeasurement } from './types'

// 兼容 re-export：旧版单文件曾从 hook 文件直接导出这两个工具函数
export { haversineDistance, formatDistance } from './geo'

/**
 * 测距工具 Hook。
 *
 * 使用方式：
 * ```tsx
 * const measure = useDistanceMeasure({ adapter })
 * <button onClick={() => measure.toggle()}>测距</button>
 * ```
 *
 * 功能：
 * - 激活后点击地图依次添加测距点，自动绘制折线
 * - 起点绿色图钉，其余所有点（含中间点和终点）均为红色图钉
 * - 每段线段单独显示距离标签，悬浮在该段中点上方
 * - 移动鼠标时显示橡皮筋虚线预览 + 当前预览段距离
 * - 右键或 Esc 退出测距模式，清理「进行中」的测距（已「确定」的记录保留）
 * - finish() 确认结束本次测距：结果保留在地图上并可累积，再次点击测距工具开始新测距时，
 *   不会删除已「确定」的记录
 * - 标记到终点（≥2 点）时，在最新终点图钉旁附加「完成测距」面板（取消 / 确定）
 *
 * 实现拆分（本目录）：
 * - geo.ts：球面距离 / 距离格式化 / 最近线段等纯计算
 * - dom.ts：图钉、距离标签、完成面板、悬浮删除按钮等 DOM 工厂 + 面板避让重定位
 * - preview.ts：橡皮筋预览控制器（虚线 + 动态距离标签）
 * - committedMeasurements.ts：已提交测距的悬停高亮 / 悬浮删段控制器
 * - index.ts（本文件）：React 状态与地图事件编排
 */
export function useDistanceMeasure({ adapter }: { adapter: MapAdapter | null }) {
  const [active, setActive] = useState(false)
  const [points, setPoints] = useState<LngLat[]>([])
  const [totalDistance, setTotalDistance] = useState(0)

  // 覆盖物 id 管理
  // 每次激活生成唯一 session，所有覆盖物 id 带该前缀：适配器按 id 索引覆盖物，
  // id 复用会让旧覆盖物残留且无法移除（故已「确定」的测距记录必须用不同 id）
  const sessionRef = useRef<string>(makeMeasureSessionId())
  // 初值不读 sessionRef（渲染期读 ref 违规）；toggle 激活时必先赋新值再使用
  const polylineId = useRef<string>('')
  const markersRef = useRef<MarkerHandle[]>([])
  const polylineHandle = useRef<PolylineHandle | null>(null)
  // 分段距离标签：每段线段一个，显示该段距离，悬浮在线段中点上方
  const segmentLabelHandlesRef = useRef<MarkerHandle[]>([])
  const segmentLabelElsRef = useRef<HTMLElement[]>([])

  // adapter ref 镜像：事件绑定 / 控制器回调读取最新 adapter，避免闭包陈旧
  const adapterRef = useRef(adapter)
  // points 的 ref 镜像：mousemove 闭包需读取最新已落点，避免闭包陈旧
  const pointsRef = useRef<LngLat[]>([])
  // toggle / finish 的 ref 镜像：createMarkerElement（声明早于二者）需读取最新值，
  // 用于终点图钉旁「完成测距」面板的 取消/确定 按钮回调
  const toggleRef = useRef<() => void>(() => {})
  const finishRef = useRef<() => void>(() => {})
  // 「完成测距」面板 DOM 引用：用于边界避让重定位（避免被地图边缘裁切）
  const finishPanelElRef = useRef<HTMLElement | null>(null)
  // repositionFinishPanel 的 ref 镜像：addPoint（声明早于该回调）需调用最新实现
  const repositionRef = useRef<() => void>(() => {})

  // 橡皮筋预览控制器（虚线 + 动态距离标签）：惰性创建，跨渲染复用
  const previewCtlRef = useRef<PreviewController | null>(null)
  // 已提交测距控制器（悬停高亮 + 悬浮删段）：惰性创建，跨渲染复用
  const committedCtlRef = useRef<CommittedController | null>(null)

  function getPreviewCtl(): PreviewController {
    if (!previewCtlRef.current) {
      previewCtlRef.current = createPreviewController({
        getAdapter: () => adapterRef.current,
        getPoints: () => pointsRef.current,
      })
    }
    return previewCtlRef.current
  }

  function getCommittedCtl(): CommittedController {
    if (!committedCtlRef.current) {
      committedCtlRef.current = createCommittedController({
        getAdapter: () => adapterRef.current,
      })
    }
    return committedCtlRef.current
  }

  /**
   * 根据索引创建测距点标记元素（起点用绿色图钉，其余全部用红色图钉）。
   * 最新落点（终点）且已构成有效测距（≥2 点）时，在其图钉旁附加「完成测距」面板
   * （取消 / 确定 二选一），方便就近结束测距。
   */
  const createMarkerElement = useCallback((index: number, pointCount: number): HTMLElement => {
    const el = index === 0 ? createStartMarkerElement() : createEndMarkerElement()
    const isLast = index === pointCount - 1
    if (isLast && index > 0 && pointCount >= 2) {
      const panel = createFinishPanelElement({
        // 取消：取消本次测距并清空进行中的绘制
        onCancel: () => toggleRef.current(),
        // 确定：确认结束并保留结果（折线/图钉/距离标签留在地图上）
        onConfirm: () => finishRef.current(),
      })
      // 记录面板元素，供 repositionFinishPanel 实测边界并按需翻转/贴边
      finishPanelElRef.current = panel
      el.appendChild(panel)
    }
    return el
    // 仅读取 DOM 工厂与 ref 镜像（toggleRef/finishRef 始终指向最新实现），无响应式依赖
  }, [])

  /** 重绘所有标记（清除旧的，按 next 重建） */
  const redrawMarkers = useCallback((next: LngLat[]) => {
    if (!adapter) return
    markersRef.current.forEach((m) => adapter.removeMarker(m.id))
    markersRef.current = []
    // 旧标记（含上一版面板）已移除，先置空；若本次构建出新的终点面板会重新赋值
    finishPanelElRef.current = null
    next.forEach((pt, i) => {
      const el = createMarkerElement(i, next.length)
      const handle = adapter.addMarker(`measure-pt-${sessionRef.current}-${i}`, pt, {
        element: el,
        anchor: PIN_ANCHOR,
      })
      markersRef.current.push(handle)
    })
  }, [adapter, createMarkerElement])

  /** 更新折线（如已有则更新坐标，否则新建） */
  const redrawPolyline = useCallback((next: LngLat[]) => {
    if (!adapter) return
    if (next.length < 2) {
      if (polylineHandle.current) {
        adapter.removePolyline(polylineId.current)
        polylineHandle.current = null
      }
      return
    }
    if (!polylineHandle.current) {
      polylineHandle.current = adapter.addPolyline(polylineId.current, next, {
        width: 2,
        // 与终点图钉主色一致（#D95D04 橙色）
        color: '#D95D04',
        opacity: 0.9,
      })
    } else {
      adapter.setPolylinePoints(polylineHandle.current, next)
    }
  }, [adapter])

  /**
   * 更新分段距离标签：每段线段一个标签，显示该段距离，
   * 悬浮在线段中点上方（中点取经纬度线性平均，视觉足够准确）。
   * 每次落点后重建所有标签（数量随段数变化，重建最简单可靠）。
   * 同时累计总距离，供提示条展示。
   */
  const updateSegmentLabels = useCallback((next: LngLat[]) => {
    if (!adapter) return

    // 清除旧分段标签
    segmentLabelHandlesRef.current.forEach((h) => adapter.removeMarker(h.id))
    segmentLabelHandlesRef.current = []
    segmentLabelElsRef.current = []

    // 逐段创建距离标签，悬浮在各段中点上方
    let total = 0
    for (let i = 1; i < next.length; i++) {
      const segDist = haversineDistance(next[i - 1], next[i])
      total += segDist
      // 线段中点：经纬度线性平均
      const mid = midpoint(next[i - 1], next[i])
      const labelEl = createDistanceLabelElement(formatDistance(segDist))
      const handle = adapter.addMarker(`measure-seg-label-${sessionRef.current}-${i}`, mid, {
        element: labelEl,
        anchor: PIN_ANCHOR,
      })
      segmentLabelHandlesRef.current.push(handle)
      segmentLabelElsRef.current.push(labelEl)
    }
    setTotalDistance(total)
  }, [adapter])

  /** 添加一个测距点 */
  const addPoint = useCallback(
    (lngLat: LngLat) => {
      setPoints((prev) => {
        const next = [...prev, lngLat]
        if (adapter) {
          redrawMarkers(next)
          redrawPolyline(next)
          updateSegmentLabels(next)
          // 清除旧预览（落点后由下次 mousemove 重建）
          getPreviewCtl().clear()
          // 新终点「完成测距」面板已创建，下一帧布局完成后按地图边界避让重定位
          requestAnimationFrame(() => repositionRef.current())
        }
        return next
      })
    },
    [adapter, redrawMarkers, redrawPolyline, updateSegmentLabels],
  )

  /** 清理所有测距覆盖物 */
  const cleanup = useCallback(() => {
    if (!adapter) return
    markersRef.current.forEach((m) => adapter.removeMarker(m.id))
    markersRef.current = []
    if (polylineHandle.current) {
      adapter.removePolyline(polylineId.current)
      polylineHandle.current = null
    }
    segmentLabelHandlesRef.current.forEach((h) => adapter.removeMarker(h.id))
    segmentLabelHandlesRef.current = []
    segmentLabelElsRef.current = []
    finishPanelElRef.current = null
    getPreviewCtl().clear()
    setPoints([])
    setTotalDistance(0)
  }, [adapter])

  /**
   * 激活/退出测距模式。
   * - 仅清理「进行中」的测距；已「确定」(finish) 的记录保留在地图上、不受影响。
   * - 每次激活生成新的唯一 session，确保新测距的覆盖物 id 不与已提交记录冲突。
   */
  const toggle = useCallback(() => {
    setActive((prev) => {
      const next = !prev
      if (next) {
        sessionRef.current = makeMeasureSessionId()
        polylineId.current = `measure-polyline-${sessionRef.current}`
      }
      cleanup()
      return next
    })
  }, [cleanup])

  /**
   * 确认结束本次测距：把当前已绘制覆盖物「提交」为一条持久记录，
   * 覆盖物保留在地图上，仅解除进行中跟踪（之后 cleanup()/toggle() 不会再移除它们）。
   *
   * 与 toggle()/Esc/右键（取消当前测距并清空进行中绘制）的区别：
   * - finish 保留结果并使其累积：多次测距结果可同时留在地图上；
   *   再次点击测距工具开始新测距时，已「确定」的记录不受影响。
   * - cleanup()/toggle()/Esc/右键 只清理「进行中」的测距，不动已提交记录。
   */
  const finish = useCallback(() => {
    // 提交：把当前进行中覆盖物 id 快照成一条记录，使其脱离后续清理，
    // 并为其折线附加悬停交互（高亮 + 悬浮删段，见 committedMeasurements.ts）
    if (adapter) {
      const polyId = polylineHandle.current ? polylineId.current : null
      const record: CommittedMeasurement = {
        markerIds: markersRef.current.map((m) => m.id),
        polylineId: polyId,
        segmentLabelIds: segmentLabelHandlesRef.current.map((h) => h.id),
        // 快照几何数据：删除悬停段后按剩余点重连重绘需要
        points: [...pointsRef.current],
        polylineHandle: polylineHandle.current,
      }
      getCommittedCtl().commit(record)
    }
    // 解除进行中跟踪（不从地图移除），下一次测距从空状态开始
    markersRef.current = []
    polylineHandle.current = null
    segmentLabelHandlesRef.current = []
    segmentLabelElsRef.current = []
    finishPanelElRef.current = null
    getPreviewCtl().clear()
    setPoints([])
    setTotalDistance(0)
    setActive(false)
  }, [adapter])

  /** 清理所有覆盖物：进行中的测距 + 所有已「确定」的记录（卸载 / 引擎切换时调用） */
  const cleanupAll = useCallback(() => {
    cleanup()
    getCommittedCtl().clearAll()
  }, [cleanup])

  /** 按地图容器边界重定位「完成测距」面板（避让裁切；实现见 dom.ts） */
  const repositionNow = useCallback(() => {
    const panel = finishPanelElRef.current
    if (!panel) return
    repositionFinishPanel(panel, adapter ? adapter.getContainer() : null)
  }, [adapter])

  // 同步 toggle / finish / reposition → ref，供声明较早的函数读取最新实现
  useEffect(() => {
    repositionRef.current = repositionNow
  }, [repositionNow])
  useEffect(() => {
    toggleRef.current = toggle
  }, [toggle])
  useEffect(() => {
    finishRef.current = finish
  }, [finish])

  // 绑定/解绑地图点击事件
  useEffect(() => {
    if (!adapter || !active) return

    const unbindClick = adapter.onClick((lngLat) => {
      addPoint(lngLat)
    })
    const unbindContext = adapter.onContextMenu(() => {
      setActive(false)
      cleanup()
    })
    const unbindMouseMove = adapter.onMouseMove((lngLat) => {
      getPreviewCtl().update(lngLat)
    })
    // 平移/缩放/窗口尺寸变化后，终点图钉屏幕位置改变，按需重定位完成面板避让边缘
    const unbindMoveEnd = adapter.onMoveEnd(() => repositionRef.current())
    const unbindZoomEnd = adapter.onZoomEnd(() => repositionRef.current())
    const onResize = () => repositionRef.current()
    window.addEventListener('resize', onResize)

    return () => {
      unbindClick()
      unbindContext()
      unbindMouseMove()
      unbindMoveEnd()
      unbindZoomEnd()
      window.removeEventListener('resize', onResize)
    }
  }, [adapter, active, addPoint, cleanup])

  // 同步 points → pointsRef，供 mousemove 闭包读取最新已落点
  useEffect(() => {
    pointsRef.current = points
  }, [points])

  // 同步 adapter → adapterRef，供控制器等回调读取最新实例
  useEffect(() => {
    adapterRef.current = adapter
  }, [adapter])

  // Esc 退出
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActive(false)
        cleanup()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, cleanup])

  // 组件卸载或 adapter 变化时清理（含已「确定」的测距记录）
  useEffect(() => {
    return () => {
      cleanupAll()
    }
  }, [cleanupAll])

  return {
    active,
    points,
    totalDistance,
    toggle,
    cleanup,
    finish,
    /** 撤销最后一个测距点 */
    undo: useCallback(() => {
      setPoints((prev) => {
        if (prev.length === 0) return prev
        const next = prev.slice(0, -1)
        if (adapter) {
          // 清除所有覆盖物后按 next 全部重绘
          markersRef.current.forEach((m) => adapter.removeMarker(m.id))
          markersRef.current = []
          if (polylineHandle.current) {
            adapter.removePolyline(polylineId.current)
            polylineHandle.current = null
          }
          segmentLabelHandlesRef.current.forEach((h) => adapter.removeMarker(h.id))
          segmentLabelHandlesRef.current = []
          segmentLabelElsRef.current = []
          redrawMarkers(next)
          redrawPolyline(next)
          updateSegmentLabels(next)
          getPreviewCtl().clear()
        }
        return next
      })
    }, [adapter, redrawMarkers, redrawPolyline, updateSegmentLabels]),
  }
}
