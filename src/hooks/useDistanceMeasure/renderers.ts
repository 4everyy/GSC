import { measureIcons } from '../../assets/images/measure/index'
import { type LngLat, type MapAdapter, type MarkerHandle, type PolylineHandle } from '../../map-engines'
import { type CommittedMeasurement } from './index'


/** 生成唯一测距会话标识。适配器按 id 索引覆盖物，id 复用会让旧覆盖物残留且无法移除，
 *  故每次激活测距都用新 session 前缀所有覆盖物 id，确保与已「确定」的测距记录不冲突。 */
export function makeMeasureSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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

/** 线段中点：经纬度线性平均（视觉足够准确） */
export function midpoint(a: LngLat, b: LngLat): LngLat {
  return { lng: (a.lng + b.lng) / 2, lat: (a.lat + b.lat) / 2 }
}

/**
 * 求悬停位置到折线各段的最近线段索引（返回 i 对应 points[i-1]→points[i] 段）。
 * 经纬度平面近似 + 点到线段投影距离，用于把光标位置映射到悬停段。
 */
export function findNearestSegmentIndex(points: LngLat[], pos: LngLat): number {
  let bestIdx = -1
  let bestDist = Infinity
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const vx = b.lng - a.lng
    const vy = b.lat - a.lat
    const lenSq = vx * vx + vy * vy
    const t =
      lenSq === 0
        ? 0
        : Math.max(0, Math.min(1, ((pos.lng - a.lng) * vx + (pos.lat - a.lat) * vy) / lenSq))
    const dx = pos.lng - (a.lng + t * vx)
    const dy = pos.lat - (a.lat + t * vy)
    const distSq = dx * dx + dy * dy
    if (distSq < bestDist) {
      bestDist = distSq
      bestIdx = i
    }
  }
  return bestIdx
}


/** 已提交测距控制器：悬停高亮 + 悬浮删除 + 记录生命周期管理 */
export interface CommittedController {
  /** finish() 时提交一条记录：为折线附加悬停交互并纳入跟踪 */
  commit: (record: CommittedMeasurement) => void
  /** 清理所有已提交记录（卸载 / 引擎切换时调用） */
  clearAll: () => void
}

/**
 * 创建已提交测距控制器。
 *
 * 以下逻辑仅读取 getter（每次调用取最新值），避免闭包陈旧。
 * 悬浮删除按钮为单例 Marker：仅 hover 某条已提交折线时显示并定位到命中点，
 * 点击删除悬停的那一段（剩余点自动重连并显示新段距离）。隐藏采用 150ms 延时，给光标留出
 * 在折线命中层与按钮之间移动的时间，避免闪烁。
 */
export function createCommittedController(deps: {
  getAdapter: () => MapAdapter | null
}): CommittedController {
  const { getAdapter } = deps

  // 已「确定」的测距记录：finish() 时快照当前覆盖物 id 进来，
  // 之后 cleanup()/toggle() 不再移除，使多次测距结果累积保留在地图上
  const committedRef: CommittedMeasurement[] = []
  // 悬浮删除按钮（单例 Marker）：仅 hover 已提交折线时显示，定位到命中点
  let deleteBtnEl: HTMLDivElement | null = null
  // 删除按钮内层 .measure-delete-btn 元素：显隐直接操作它（host 为零尺寸 Marker 容器）
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

  /**
   * 删除当前悬停的那一段（仅该段，而非整条测距）：
   * - 定位：以悬停期间记录的光标位置找最近线段，删除该段及其终点图钉；
   * - 重连：剩余点重设折线路径，缺口两侧最近的两个点自动连接；
   * - 标签：分段距离标签按剩余段整体重建，新连接段的距离随重绘显示；
   * - 边界：仅剩一段（2 个点）时删除该段即整条测距消失，退化为整条删除。
   */
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
    // 移除该段终点（points[segIdx]）的图钉；markerIds 与 points 按落点顺序一一对应
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


/**
 * 锚点统一使用 (0,0)：零尺寸容器的原点即地图坐标。
 * 图钉/标签内部子元素已通过 absolute 定位相对原点偏移，
 * 无需引擎再做任何锚点/偏移补偿。
 */
export const PIN_ANCHOR = { x: 0, y: 0 }

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
export function createStartMarkerElement(): HTMLElement {
  return createPinMarkerElement(measureIcons.start)
}

/** 终点/路径点标记：红色定位图钉（蓝湖设计稿 end.png） */
export function createEndMarkerElement(): HTMLElement {
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
export function createFinishPanelElement(handlers: {
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
 * 点击删除悬停的那一段（剩余点自动重连并显示新段距离）。
 *
 * 与图钉/距离标签一致采用「零尺寸容器 + 绝对定位子元素」：容器原点对齐命中坐标，
 * 按钮经 translate(-50%,-50%) 居中于原点（零尺寸容器锚点解析为 'center'）。
 * 防闪烁：鼠标在折线命中层与按钮之间移动时，由 hook 的 150ms 延时隐藏兜底
 * （按钮 mouseenter 取消延时，mouseleave 重新计时）。
 * 容器本身不拦截地图交互，仅按钮 pointer-events:auto 可点。
 */
export function createDeleteButtonElement(handlers: {
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
export function createDistanceLabelElement(text: string): HTMLElement {
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
export function repositionFinishPanel(
  panel: HTMLElement,
  container: HTMLElement | null,
): void {
  const host = panel.parentElement
  if (!host) return
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
}


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
