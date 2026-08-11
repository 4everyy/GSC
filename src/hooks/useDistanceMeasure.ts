import { useCallback, useEffect, useRef, useState } from 'react'
import { measureIcons } from '../assets/images/measure'
import type { LngLat, MapAdapter, MarkerHandle, PolylineHandle } from '../map-engines'

/** 生成唯一测距会话标识。适配器按 id 索引覆盖物，id 复用会让旧覆盖物残留且无法移除，
 *  故每次激活测距都用新 session 前缀所有覆盖物 id，确保与已「确定」的测距记录不冲突。 */
function makeMeasureSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 一条已「确定」的测距记录。
 * finish() 时把当前进行中覆盖物的 id 快照进来；之后 cleanup()/toggle()/Esc/右键
 * 都不再移除它们，使多次测距结果可累积保留在地图上。
 */
interface CommittedMeasurement {
  markerIds: string[]
  polylineId: string | null
  segmentLabelIds: string[]
  /** 取消该折线悬停交互绑定（删除该条测距 / 卸载时调用） */
  unbindInteractive?: () => void
}

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
 * 创建「测距结束确认」面板元素（依附于最新终点图钉）。
 *
 * 面板为绝对定位，出现在红色终点图钉右侧，便于就近结束测距。
 * 包含标签 + 两按钮（取消 / 确定）：
 * - 取消：调用 onCancel（取消本次测距并清空进行中的绘制），并移除面板
 * - 确定：调用 onConfirm（确认结束并保留结果），并移除面板
 *
 * 定位基准：零尺寸 Marker 容器原点即图钉落点（灰色阴影中心），
 * 具体偏移由 .measure-finish-panel 样式控制（图钉右侧 + 竖直居中）。
 * 面板内 click/contextmenu 均 stopPropagation，避免冒泡到地图触发落点/清空。
 */
function createFinishPanelElement(handlers: {
  onCancel: () => void
  onConfirm: () => void
}): HTMLElement {
  const panel = document.createElement('div')
  panel.className = 'measure-finish-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', '测距结束确认')

  const label = document.createElement('span')
  label.className = 'measure-finish-panel__label'
  label.textContent = '完成测距？'
  panel.appendChild(label)

  const actions = document.createElement('div')
  actions.className = 'measure-finish-panel__actions'

  const makeBtn = (text: string, variant: string, onClick: () => void): HTMLButtonElement => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `measure-finish-panel__btn measure-finish-panel__btn--${variant}`
    btn.textContent = text
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      onClick()
      panel.remove()
    })
    return btn
  }

  actions.appendChild(makeBtn('取消', 'cancel', handlers.onCancel))
  actions.appendChild(makeBtn('确定', 'confirm', handlers.onConfirm))
  panel.appendChild(actions)

  // 面板内任意交互都不冒泡到地图：click 防落点，contextmenu 防右键清空
  panel.addEventListener('click', (e) => e.stopPropagation())
  panel.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })

  return panel
}

/**
 * 创建「悬浮删除」按钮元素（依附于悬停的已提交折线）。
 *
 * 触发场景：hover 已「确定」的测距折线 → 折线高亮 + 本按钮出现在命中点（≈光标处），
 * 点击删除整条测距（折线 + 图钉 + 分段标签）。
 *
 * 与图钉/距离标签一致采用「零尺寸容器 + 绝对定位子元素」：容器原点对齐命中坐标，
 * 按钮经 translate(-50%,-50%) 居中于原点（零尺寸容器锚点解析为 'center'）。
 * 防闪烁：鼠标在折线命中层与按钮之间移动时，由 hook 的 150ms 延时隐藏兜底
 * （按钮 mouseenter 取消延时，mouseleave 重新计时）。
 * 容器本身不拦截地图交互，仅按钮 pointer-events:auto 可点。
 */
function createDeleteButtonElement(handlers: {
  onEnter: () => void
  onLeave: () => void
  onDelete: () => void
}): { host: HTMLDivElement; button: HTMLButtonElement } {
  const wrap = document.createElement('div')
  wrap.style.position = 'relative'
  wrap.style.width = '0'
  wrap.style.height = '0'
  wrap.style.overflow = 'visible'

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'measure-delete-btn'
  btn.setAttribute('aria-label', '删除该测距')
  btn.textContent = '×'
  // 点击删除：阻止冒泡到地图（避免触发落点 / 右键清空）
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    handlers.onDelete()
  })
  btn.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  // 鼠标进入按钮：取消延时隐藏，保持高亮与按钮可见
  btn.addEventListener('mouseenter', () => handlers.onEnter())
  // 鼠标离开按钮：重新进入延时隐藏流程
  btn.addEventListener('mouseleave', () => handlers.onLeave())

  wrap.appendChild(btn)
  return { host: wrap, button: btn }
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
 * - 右键或 Esc 退出测距模式，清理「进行中」的测距（已「确定」的记录保留）
 * - finish() 确认结束本次测距：结果保留在地图上并可累积，再次点击测距工具开始新测距时，
 *   不会删除已「确定」的记录
 * - 标记到终点（≥2 点）时，在最新终点图钉旁附加「完成测距」面板（取消 / 确定）
 */
export function useDistanceMeasure({ adapter }: { adapter: MapAdapter | null }) {
  const [active, setActive] = useState(false)
  const [points, setPoints] = useState<LngLat[]>([])
  const [totalDistance, setTotalDistance] = useState(0)

  // 覆盖物 id 管理
  // 每次激活生成唯一 session，所有覆盖物 id 带该前缀：适配器按 id 索引覆盖物，
  // id 复用会让旧覆盖物残留且无法移除（故已「确定」的测距记录必须用不同 id）
  const sessionRef = useRef<string>(makeMeasureSessionId())
  const polylineId = useRef<string>(`measure-polyline-${sessionRef.current}`)
  const markersRef = useRef<MarkerHandle[]>([])
  // 已「确定」的测距记录：finish() 时快照当前覆盖物 id 进来，
  // 之后 cleanup()/toggle() 不再移除，使多次测距结果累积保留在地图上
  const committedRef = useRef<CommittedMeasurement[]>([])
  const polylineHandle = useRef<PolylineHandle | null>(null)
  // 分段距离标签：每段线段一个，显示该段距离，悬浮在线段中点上方
  const segmentLabelHandlesRef = useRef<MarkerHandle[]>([])
  const segmentLabelElsRef = useRef<HTMLElement[]>([])
  const unbindClickRef = useRef<(() => void) | null>(null)
  const unbindContextRef = useRef<(() => void) | null>(null)

  // adapter ref 镜像：悬停/删除等延时回调读取最新 adapter，避免闭包陈旧
  const adapterRef = useRef(adapter)
  // 悬浮删除按钮（单例 Marker）：仅 hover 已提交折线时显示，定位到命中点
  const deleteBtnElRef = useRef<HTMLDivElement | null>(null)
  // 删除按钮内层 .measure-delete-btn 元素：显隐直接操作它（host 为零尺寸 Marker 容器）
  const deleteBtnInnerRef = useRef<HTMLButtonElement | null>(null)
  const deleteMarkerRef = useRef<MarkerHandle | null>(null)
  const deleteMarkerIdRef = useRef<string>('measure-delete-btn')
  // 当前悬停的已提交折线 id（点击删除时据此定位记录）
  const activePolylineRef = useRef<string | null>(null)
  // 离开命中区后的延时隐藏句柄（150ms，防按钮与折线间移动闪烁）
  const hideTimerRef = useRef<number | null>(null)

  // 橡皮筋预览（虚线 + 动态距离标签）
  const previewPolylineId = useRef('measure-preview-polyline')
  const previewLabelId = useRef('measure-preview-label')
  const previewPolylineHandle = useRef<PolylineHandle | null>(null)
  const previewLabelMarkerRef = useRef<MarkerHandle | null>(null)
  const previewLabelWrapperRef = useRef<HTMLElement | null>(null)
  const previewLabelElRef = useRef<HTMLElement | null>(null)
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

  /**
   * 根据索引创建测距点标记元素（起点用绿色图钉，其余全部用红色图钉）。
   * 最新落点（终点）且已构成有效测距（≥2 点）时，在其图钉旁附加「完成测距」面板
   * （取消 / 确定 二选一），方便就近结束测距。
   */
  function createMarkerElement(index: number, pointCount: number): HTMLElement {
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
  }

  /** 重绘所有标记（清除旧的，按 next 重建） */
  function redrawMarkers(next: LngLat[]) {
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
      const handle = adapter.addMarker(`measure-seg-label-${sessionRef.current}-${i}`, mid, {
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
      // element 即 Marker DOM，直接改 textContent 即可生效
      if (previewLabelElRef.current) {
        previewLabelElRef.current.textContent = formatDistance(previewSegDist)
      }
      // 若 Marker 内容需整体替换，通过 setMarkerElement 推送新 DOM
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
          // 新终点「完成测距」面板已创建，下一帧布局完成后按地图边界避让重定位
          requestAnimationFrame(() => repositionRef.current())
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
    finishPanelElRef.current = null
    clearPreview()
    setPoints([])
    setTotalDistance(0)
  }, [adapter]) // eslint-disable-line react-hooks/exhaustive-deps

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
  // ============ 已提交测距的悬停高亮 + 悬浮删除 ============
  // 以下辅助函数仅读取 ref（ref 对象跨渲染稳定，.current 始终为最新值），避免闭包陈旧。
  // 悬浮删除按钮为单例 Marker：仅 hover 某条已提交折线时显示并定位到命中点，
  // 点击删除整条测距（折线 + 图钉 + 分段标签）。隐藏采用 150ms 延时，给光标留出
  // 在折线命中层与按钮之间移动的时间，避免闪烁。

  /** 取消待执行的延时隐藏 */
  function clearHideTimer() {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  /** 隐藏悬浮删除按钮（仅切内层按钮 display，Marker 保留复用） */
  function hideDeleteButton() {
    if (deleteBtnInnerRef.current) deleteBtnInnerRef.current.style.display = 'none'
  }

  /** 懒创建悬浮删除按钮 Marker（单例；id 固定，不与已提交覆盖物 id 冲突） */
  function ensureDeleteButton() {
    const a = adapterRef.current
    if (!a) return
    if (!deleteBtnElRef.current) {
      const built = createDeleteButtonElement({
        // 光标进入按钮：取消延时隐藏，保持高亮与按钮可见
        onEnter: clearHideTimer,
        // 光标离开按钮：重新进入延时隐藏流程（可能回到折线命中层）
        onLeave: () => {
          const pid = activePolylineRef.current
          if (pid) scheduleHide(pid)
        },
        // 点击删除：移除当前悬停的整条测距
        onDelete: () => {
          const pid = activePolylineRef.current
          if (pid) removeCommitted(pid)
        },
      })
      deleteBtnElRef.current = built.host
      deleteBtnInnerRef.current = built.button
    }
    if (!deleteMarkerRef.current) {
      deleteMarkerRef.current = a.addMarker(deleteMarkerIdRef.current, { lng: 0, lat: 0 }, {
        // 此处 deleteBtnElRef.current 运行时已由上方 if 块保证非空；
        // ?? undefined 仅消除类型层面 null→undefined 的不匹配（element?: HTMLElement）
        element: deleteBtnElRef.current ?? undefined,
        anchor: PIN_ANCHOR,
      })
      // 初始隐藏，仅 hover 已提交折线时显示
      if (deleteBtnInnerRef.current) deleteBtnInnerRef.current.style.display = 'none'
    }
  }

  /** 显示悬浮删除按钮并定位到命中点（≈光标处） */
  function showDeleteButton(lngLat: LngLat) {
    const a = adapterRef.current
    if (!a) return
    ensureDeleteButton()
    if (!deleteMarkerRef.current) return
    a.setMarkerPosition(deleteMarkerRef.current, lngLat)
    if (deleteBtnInnerRef.current) deleteBtnInnerRef.current.style.display = ''
  }

  /** 延时（150ms）恢复高亮并隐藏按钮 */
  function scheduleHide(polyId: string) {
    clearHideTimer()
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null
      adapterRef.current?.setPolylineHighlight(polyId, false)
      hideDeleteButton()
      activePolylineRef.current = null
    }, 150)
  }

  /** 删除一条已「确定」的测距：解除交互绑定 + 移除其折线/图钉/分段标签 */
  function removeCommitted(polyId: string) {
    const a = adapterRef.current
    if (!a) return
    const idx = committedRef.current.findIndex((c) => c.polylineId === polyId)
    if (idx === -1) return
    const [cm] = committedRef.current.splice(idx, 1)
    cm.unbindInteractive?.()
    cm.markerIds.forEach((id) => a.removeMarker(id))
    if (cm.polylineId) a.removePolyline(cm.polylineId)
    cm.segmentLabelIds.forEach((id) => a.removeMarker(id))
    clearHideTimer()
    hideDeleteButton()
    activePolylineRef.current = null
  }

  const finish = useCallback(() => {
    // 提交：把当前进行中覆盖物 id 快照进 committedRef，使其脱离后续清理
    if (adapter) {
      const polyId = polylineHandle.current ? polylineId.current : null
      const record: CommittedMeasurement = {
        markerIds: markersRef.current.map((m) => m.id),
        polylineId: polyId,
        segmentLabelIds: segmentLabelHandlesRef.current.map((h) => h.id),
      }
      // 为已提交折线附加悬停交互：透明命中层 + 进入/离开回调（高亮 + 悬浮删除按钮）
      if (polyId) {
        record.unbindInteractive = adapter.setPolylineInteractive(polyId, {
          onEnter: (lngLat) => {
            const a = adapterRef.current
            if (!a) return
            activePolylineRef.current = polyId
            clearHideTimer()
            a.setPolylineHighlight(polyId, true, { color: '#FF8A1E' })
            showDeleteButton(lngLat)
          },
          onLeave: () => scheduleHide(polyId),
        })
      }
      committedRef.current.push(record)
    }
    // 解除进行中跟踪（不从地图移除），下一次测距从空状态开始
    markersRef.current = []
    polylineHandle.current = null
    segmentLabelHandlesRef.current = []
    segmentLabelElsRef.current = []
    finishPanelElRef.current = null
    clearPreview()
    setPoints([])
    setTotalDistance(0)
    setActive(false)
  }, [adapter]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 清理所有覆盖物：进行中的测距 + 所有已「确定」的记录（卸载 / 引擎切换时调用） */
  const cleanupAll = useCallback(() => {
    cleanup()
    if (adapter) {
      committedRef.current.forEach((cm) => {
        cm.unbindInteractive?.()
        cm.markerIds.forEach((id) => adapter.removeMarker(id))
        if (cm.polylineId) adapter.removePolyline(cm.polylineId)
        cm.segmentLabelIds.forEach((id) => adapter.removeMarker(id))
      })
      // 清理共享的悬浮删除按钮（若有）
      if (deleteMarkerRef.current) adapter.removeMarker(deleteMarkerIdRef.current)
    }
    committedRef.current = []
    deleteMarkerRef.current = null
    deleteBtnElRef.current = null
    clearHideTimer()
    hideDeleteButton()
    activePolylineRef.current = null
  }, [adapter, cleanup]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * 重定位「完成测距」面板，避免被地图边缘裁切。
   *
   * 面板默认在图钉右侧、竖直居中；本函数实测其与地图容器边界的相对位置并按需翻转/贴边：
   * - 水平：右侧放不下则翻到左侧（.--left）；两侧都放不下则向空间较大的一侧贴边。
   * - 竖直：默认中心在图钉上方 13px，若超出容器顶/底则向内收紧。
   *
   * 测量基准：面板父级即零尺寸 Marker 容器，其 getBoundingClientRect() 即图钉落点屏幕坐标；
   * 边界取适配器地图容器（其 overflow:hidden 会裁切面板）。offsetWidth/Height 不受 transform
   * 影响，故即便面板带入场动画（scale）也能测得真实尺寸。每次先还原默认再判定，避免叠加误差。
   */
  const repositionFinishPanel = useCallback(() => {
    const panel = finishPanelElRef.current
    if (!panel) return
    const host = panel.parentElement
    if (!host) return
    const container = adapter?.getContainer()
    const cb = container ? container.getBoundingClientRect() : null
    const bx0 = cb ? cb.left : 0
    const by0 = cb ? cb.top : 0
    const bx1 = cb ? cb.right : window.innerWidth
    const by1 = cb ? cb.bottom : window.innerHeight
    const pad = 8

    // 还原默认（移除上次的修饰类与内联偏移），按默认布局重新判定
    panel.classList.remove('measure-finish-panel--left')
    panel.style.removeProperty('left')
    panel.style.removeProperty('right')
    panel.style.removeProperty('top')

    const W = panel.offsetWidth
    const H = panel.offsetHeight
    const o = host.getBoundingClientRect() // 零尺寸容器原点 = 图钉落点屏幕坐标
    const ox = o.left
    const oy = o.top

    // —— 水平：默认 left:gap → 面板左边在 ox+gap、右边在 ox+gap+W ——
    const gap = 15
    const fitsRight = ox + gap + W <= bx1 - pad
    const fitsLeft = ox - gap - W >= bx0 + pad
    if (!fitsRight && fitsLeft) {
      // 右侧放不下、左侧够：翻到左侧（.--left 设置 right:gap;left:auto）
      panel.classList.add('measure-finish-panel--left')
    } else if (!fitsRight && !fitsLeft) {
      // 两侧都不够：向空间较大的一侧贴边
      const spaceRight = bx1 - pad - ox
      const spaceLeft = ox - pad - bx0
      if (spaceRight >= spaceLeft) {
        // 右侧贴边：面板右边贴 bx1-pad → left = (bx1-pad-W) - ox
        panel.style.left = `${bx1 - pad - W - ox}px`
      } else {
        // 左侧贴边：面板左边贴 bx0+pad → 相对原点的 right = ox - (bx0+pad) - W
        panel.classList.add('measure-finish-panel--left')
        panel.style.right = `${ox - (bx0 + pad) - W}px`
      }
    }

    // —— 竖直：默认 top:-13px + translateY(-50%) → 面板中心在 oy-13 ——
    const defaultTop = -13
    const defaultCenter = oy + defaultTop
    const minCenter = by0 + pad + H / 2
    const maxCenter = by1 - pad - H / 2
    let center = defaultCenter
    if (center < minCenter) center = minCenter
    else if (center > maxCenter) center = maxCenter
    if (center !== defaultCenter) {
      // 内联 top 覆盖默认 -13px；translateY(-50%) 仍生效，面板中心落在 center 处
      panel.style.top = `${center - oy}px`
    }
  }, [adapter])

  // 同步 toggle / finish / reposition → ref，供声明较早的函数读取最新实现
  useEffect(() => {
    repositionRef.current = repositionFinishPanel
  }, [repositionFinishPanel])
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
      updatePreview(lngLat)
    })
    // 平移/缩放/窗口尺寸变化后，终点图钉屏幕位置改变，按需重定位完成面板避让边缘
    const unbindMoveEnd = adapter.onMoveEnd(() => repositionRef.current())
    const unbindZoomEnd = adapter.onZoomEnd(() => repositionRef.current())
    const onResize = () => repositionRef.current()
    window.addEventListener('resize', onResize)
    unbindClickRef.current = unbindClick
    unbindContextRef.current = unbindContext

    return () => {
      unbindClick()
      unbindContext()
      unbindMouseMove()
      unbindMoveEnd()
      unbindZoomEnd()
      window.removeEventListener('resize', onResize)
      unbindClickRef.current = null
      unbindContextRef.current = null
    }
  }, [adapter, active, addPoint, cleanup]) // eslint-disable-line react-hooks/exhaustive-deps

  // 同步 points → pointsRef，供 mousemove 闭包读取最新已落点
  useEffect(() => {
    pointsRef.current = points
  }, [points])

  // 同步 adapter → adapterRef，供悬停/删除等延时回调读取最新实例
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
          clearPreview()
        }
        return next
      })
    }, [adapter]), // eslint-disable-line react-hooks/exhaustive-deps
  }
}