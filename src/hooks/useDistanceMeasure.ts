import { useCallback, useEffect, useRef, useState } from 'react'
import { measureIcons } from '../assets/images/measure'
import type { LngLat, MapAdapter, MarkerHandle, PolylineHandle } from '../map-engines'

/**
 * 两点间距离（球面，Haversine 公式）。
 * @param a WGS84 坐标
 * @param b WGS84 坐标
 * @returns 距离（米）
 */
export function haversineDistance(a: LngLat, b: LngLat): number {
  const R = 6371000 // 地球半径（米）
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** 将距离（米）格式化为可读字符串 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters.toFixed(0)} 米`
  return `${(meters / 1000).toFixed(2)} 公里`
}

/**
 * 创建定位图钉标记元素（使用蓝湖设计稿 PNG 图标）。
 *
 * 关键设计：采用「零尺寸容器 + 绝对定位子元素」方案。
 * 容器宽高均为 0，其原点 (0,0) 即地图坐标点。
 * 图钉 img 相对该原点绝对定位：
 *   - img 左上角放在 (-11.5, -29.5)，使「灰色落点阴影中心」(11.5,29.5) 落在原点
 * 图标 PNG 自身已内置灰色落点（#999999，位于图 y[26..33] x[7..16]），
 * 折线落点对齐该阴影中心，而非图钉最底尖端（避免折线终点落在阴影正下方）。
 * 不依赖引擎的像素锚点 / offset 机制（避免 MapLibre setOffset 拉伸变形、
 * 以及未挂载元素 offsetWidth=0 导致的锚点推断失败）。
 */
function createPinMarkerElement(src: string): HTMLElement {
  const el = document.createElement('div')
  el.style.cursor = 'pointer'
  el.style.position = 'relative'
  el.style.width = '0'
  el.style.height = '0'
  el.style.overflow = 'visible'

  // 图钉图片：24×34，灰色阴影中心在 (11.5,29.5)，故左上角放在 (-11.5,-29.5)
  const img = document.createElement('img')
  img.src = src
  img.style.position = 'absolute'
  img.style.left = '-11.5px'
  img.style.top = '-29.5px'
  img.style.width = '24px'
  img.style.height = '34px'
  img.draggable = false
  el.appendChild(img)

  return el
}

/** 起点标记：绿色定位图钉（蓝湖设计稿 start.png） */
function createStartMarkerElement(): HTMLElement {
  return createPinMarkerElement(measureIcons.start)
}

/** 终点/路径点标记：红色定位图钉（蓝湖设计稿 end.png） */
function createEndMarkerElement(): HTMLElement {
  return createPinMarkerElement(measureIcons.end)
}

/**
 * 创建距离标签元素（零尺寸容器 + 绝对定位标签）。
 *
 * 容器原点 (0,0) 对齐地图坐标（即线段中点），
 * 标签通过 absolute + transform 向上偏移显示在线段上方。
 * 返回内层 label 元素（用于后续更新文本/位置）。
 */
function createDistanceLabelElement(text: string): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.style.position = 'relative'
  wrapper.style.width = '0'
  wrapper.style.height = '0'
  wrapper.style.overflow = 'visible'

  const label = document.createElement('div')
  // 实线段标签：用线条颜色（橙）标注，无深色背景
  label.className = 'measure-distance-label measure-distance-label--segment'
  label.textContent = text
  label.style.position = 'absolute'
  // 水平居中（相对原点）+ 向上偏移 10px（线段上方，避免遮挡折线）
  label.style.left = '0'
  label.style.top = '-10px'
  label.style.transform = 'translateX(-50%)'
  label.style.whiteSpace = 'nowrap'
  wrapper.appendChild(label)

  return label
}

/**
 * 锚点统一使用 (0,0)：零尺寸容器的原点即地图坐标。
 * 图钉/标签内部子元素已通过 absolute 定位相对原点偏移，
 * 无需引擎再做任何锚点/偏移补偿。
 */
const PIN_ANCHOR = { x: 0, y: 0 }

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
 * - 右键或 Esc 退出测距模式，清理所有覆盖物
 */
export function useDistanceMeasure({ adapter }: { adapter: MapAdapter | null }) {
  const [active, setActive] = useState(false)
  const [points, setPoints] = useState<LngLat[]>([])
  const [totalDistance, setTotalDistance] = useState(0)

  // 覆盖物 id 管理
  const polylineId = useRef('measure-polyline')
  const markersRef = useRef<MarkerHandle[]>([])
  const polylineHandle = useRef<PolylineHandle | null>(null)
  // 分段距离标签：每段线段一个，显示该段距离，悬浮在线段中点上方
  const segmentLabelHandlesRef = useRef<MarkerHandle[]>([])
  const segmentLabelElsRef = useRef<HTMLElement[]>([])
  const unbindClickRef = useRef<(() => void) | null>(null)
  const unbindContextRef = useRef<(() => void) | null>(null)

  // 橡皮筋预览（虚线 + 动态距离标签）
  const previewPolylineId = useRef('measure-preview-polyline')
  const previewLabelId = useRef('measure-preview-label')
  const previewPolylineHandle = useRef<PolylineHandle | null>(null)
  const previewLabelMarkerRef = useRef<MarkerHandle | null>(null)
  const previewLabelWrapperRef = useRef<HTMLElement | null>(null)
  const previewLabelElRef = useRef<HTMLElement | null>(null)
  // points 的 ref 镜像：mousemove 闭包需读取最新已落点，避免闭包陈旧
  const pointsRef = useRef<LngLat[]>([])

  /** 根据索引创建测距点标记元素（起点用绿色图钉，其余全部用红色图钉） */
  function createMarkerElement(index: number): HTMLElement {
    if (index === 0) return createStartMarkerElement()
    return createEndMarkerElement()
  }

  /** 重绘所有标记（清除旧的，按 next 重建） */
  function redrawMarkers(next: LngLat[]) {
    if (!adapter) return
    markersRef.current.forEach((m) => adapter.removeMarker(m.id))
    markersRef.current = []
    next.forEach((pt, i) => {
      const el = createMarkerElement(i)
      const handle = adapter.addMarker(`measure-pt-${i}-${Date.now()}`, pt, {
        element: el,
        anchor: PIN_ANCHOR,
      })
      markersRef.current.push(handle)
    })
  }

  /** 更新折线（如已有则更新坐标，否则新建） */
  function redrawPolyline(next: LngLat[]) {
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
  }

  /**
   * 更新分段距离标签：每段线段一个标签，显示该段距离，
   * 悬浮在线段中点上方（中点取经纬度线性平均，视觉足够准确）。
   * 每次落点后重建所有标签（数量随段数变化，重建最简单可靠）。
   * 同时累计总距离，供提示条展示。
   */
  function updateSegmentLabels(next: LngLat[]) {
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
      const mid: LngLat = {
        lng: (next[i - 1].lng + next[i].lng) / 2,
        lat: (next[i - 1].lat + next[i].lat) / 2,
      }
      const labelEl = createDistanceLabelElement(formatDistance(segDist))
      const handle = adapter.addMarker(`measure-seg-label-${i}-${Date.now()}`, mid, {
        element: labelEl,
        anchor: PIN_ANCHOR,
      })
      segmentLabelHandlesRef.current.push(handle)
      segmentLabelElsRef.current.push(labelEl)
    }
    setTotalDistance(total)
  }

  /** 清除橡皮筋预览覆盖物（虚线 + 标签） */
  function clearPreview() {
    if (!adapter) return
    if (previewPolylineHandle.current) {
      adapter.removePolyline(previewPolylineId.current)
      previewPolylineHandle.current = null
    }
    if (previewLabelMarkerRef.current) {
      adapter.removeMarker(previewLabelId.current)
      previewLabelMarkerRef.current = null
    }
    previewLabelWrapperRef.current = null
    previewLabelElRef.current = null
  }

  /**
   * 更新橡皮筋预览：从最后一个已落点到鼠标当前位置绘制虚线，
   * 距离标签随鼠标实时跳动（显示当前预览段距离），悬浮在预览虚线中点上方。
   */
  function updatePreview(mousePos: LngLat) {
    if (!adapter) return
    const committed = pointsRef.current
    if (committed.length === 0) {
      clearPreview()
      return
    }
    const last = committed[committed.length - 1]
    const previewPts = [last, mousePos]

    // 预览虚线（绿色 #7BFF00）：懒创建，后续仅更新路径
    if (!previewPolylineHandle.current) {
      previewPolylineHandle.current = adapter.addPolyline(previewPolylineId.current, previewPts, {
        width: 2,
        color: '#7BFF00',
        opacity: 0.9,
        dash: true,
      })
    } else {
      adapter.setPolylinePoints(previewPolylineHandle.current, previewPts)
    }

    // 当前预览段距离（仅这一段）
    const previewSegDist = haversineDistance(last, mousePos)
    // 预览段中点
    const previewMid: LngLat = {
      lng: (last.lng + mousePos.lng) / 2,
      lat: (last.lat + mousePos.lat) / 2,
    }

    // 预览距离标签：懒创建，后续仅更新文本 + 位置（避免频繁 DOM 重建）
    if (!previewLabelMarkerRef.current) {
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

      previewLabelWrapperRef.current = wrapper
      previewLabelElRef.current = label
      previewLabelMarkerRef.current = adapter.addMarker(previewLabelId.current, previewMid, {
        element: wrapper,
        anchor: PIN_ANCHOR,
      })
    } else {
      // MapLibre：element 即 Marker DOM，直接改 textContent 即可生效
      if (previewLabelElRef.current) {
        previewLabelElRef.current.textContent = formatDistance(previewSegDist)
      }
      // 百度：Label 用 outerHTML 快照，需 setMarkerElement 推送新内容
      if (previewLabelWrapperRef.current) {
        adapter.setMarkerElement(previewLabelMarkerRef.current, previewLabelWrapperRef.current)
      }
      // 更新到预览段中点（随鼠标移动）
      adapter.setMarkerPosition(previewLabelMarkerRef.current, previewMid)
    }
  }

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
          clearPreview()
        }
        return next
      })
    },
    [adapter], // eslint-disable-line react-hooks/exhaustive-deps
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
    clearPreview()
    setPoints([])
    setTotalDistance(0)
  }, [adapter]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 激活/退出测距模式 */
  const toggle = useCallback(() => {
    setActive((prev) => {
      const next = !prev
      if (!next) cleanup()
      return next
    })
  }, [cleanup])

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
      updatePreview(lngLat)
    })
    unbindClickRef.current = unbindClick
    unbindContextRef.current = unbindContext

    return () => {
      unbindClick()
      unbindContext()
      unbindMouseMove()
      unbindClickRef.current = null
      unbindContextRef.current = null
    }
  }, [adapter, active, addPoint, cleanup]) // eslint-disable-line react-hooks/exhaustive-deps

  // 同步 points → pointsRef，供 mousemove 闭包读取最新已落点
  useEffect(() => {
    pointsRef.current = points
  }, [points])

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

  // 组件卸载或 adapter 变化时清理
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  return {
    active,
    points,
    totalDistance,
    toggle,
    cleanup,
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
          clearPreview()
        }
        return next
      })
    }, [adapter]), // eslint-disable-line react-hooks/exhaustive-deps
  }
}