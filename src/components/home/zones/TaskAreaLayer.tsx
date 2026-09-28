/**
 * TaskAreaLayer —— 任务区域图层（真实后端数据）。
 *
 * 数据源：taskAreaStore（初始 mock 数据 + 用户本地绘制/编辑，纯前端）。
 * 渲染：每个区域一个多边形（类型主题色填充+描边）+ 质心名称标签（胶囊样式）。
 * 降落区（landingArea）额外在质心渲染地面图标标记（48×48 白描边半透明圆 +
 * 20×24 H 停机坪图标，与绘制遮罩/指点返航落点圆圈同款视觉），
 * 名称标签上移避让（图标上方 4px 间隙）。
 * 禁飞区（NoFlyArea）与绘制遮罩预览同款斜线样式：多边形仅 #BE0707 描边
 * （无实色填充）+ DOM SVG 覆盖层渲染 45° 斜线阴影（#BE070799、间距 8px、
 * 充满区域）——地理锚定（project 顶点 + onMove 每渲染帧重投影，与飞机/目标
 * 图标等 DOM 覆盖物同范式）；MapLibre fill-pattern 需 sprite 且随瓦片锚定
 * （间距随缩放变化），故不用引擎层实现。禁飞区名称标签也渲染在该覆盖层内
 * （SVG 之上）：引擎 marker 挂在 canvas 容器内、层叠低于覆盖层会被斜线盖住。
 *
 * 渲染时机与更新策略（增量同步，避免两类渲染缺陷）：
 * - store 状态即时渲染：mock/本地数据变化即刻反映到地图。
 * - 按 id 增量 diff：areas/hiddenIds/editingAreaId 变化时只增删/重建「变化了」
 *   的区域覆盖物，其余区域原样保留——否则隐藏单个区域会触发全量重绘
 *   （先删光全部再重建），其余可见区域闪动一下。
 * - 禁飞区斜线覆盖层持久挂载（首个禁飞区出现时创建），按区域增量增删
 *   pattern/polygon/label；全部禁飞区移除后整层销毁。
 * 卸载清理全部覆盖物。
 * 显隐由 layerStore.taskAreaVisible 控制（HomePage 条件渲染，本组件不感知）。
 * 常态 hover「编辑 | 删除」面板（本组件自带，与绘制遮罩确认态同款交互）：
 * 任何时刻（不限于绘制流程中）hover 任一已保存区域即在地图上浮现面板——
 * 「编辑」走区域列表行内编辑同款链路（taskAreaStore.requestEditArea →
 * HomePage 监听后挂载 HexagonAreaOverlay 进入编辑态），「删除」直接
 * removeArea；绘制/框选遮罩激活（areaSelectActive）或编辑中
 * （editingAreaId）时抑制——确认态面板由遮罩自带实现负责，避免双面板叠加。
 * 编辑态（taskAreaStore.editingAreaId 指向本图层某区域时）：本图层整体跳过
 * 该区域（多边形/标签/斜线一律不画），改由绘制遮罩（HexagonAreaOverlay）的
 * SVG 层绘制编辑视觉——去填充、rgba(255,255,255,0.60) 6px 白描边 + 中央
 * 2px #7160F2 虚线、顶点 vertex-handle.svg / 边中点 midpoint-handle.svg 节点手柄
 *（支持拖拽改变绘制区域：顶点拖拽移动角点、中点拖拽插入新顶点，蒙层高亮
 * 每帧跟随）；退出编辑后本图层恢复该区域持久样式。
 */
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { type LngLatBounds, type MapAdapter } from '../../../map-engines/types'
import { useTaskAreaStore } from '../../../stores/index'
import { taskAreaTypeMeta, type TaskArea } from '../../../api/index'
import { homeImages } from '../../../assets/images/home'

/** 覆盖物 id 前缀（隔离命名空间，避免与业务图层冲突） */
const POLYGON_ID_PREFIX = 'task-area-polygon-'
const LABEL_ID_PREFIX = 'task-area-label-'
const LANDING_CENTER_ID_PREFIX = 'task-area-landing-center-'
/** 禁飞区持久渲染视觉（与绘制遮罩预览完全一致）：
 *  45° 斜线阴影（左下→右上）颜色 #BE070799、间距 8px（2px 线宽）；
 *  多边形描边用其实色版本 #BE0707 */
const NOFLY_HATCH_COLOR = '#BE070799'
const NOFLY_STROKE_COLOR = '#BE0707'
/** 斜线 pattern id 前缀（每个禁飞区一个独立 pattern，纹理原点可各自锚定首顶点） */
const NOFLY_HATCH_PATTERN_PREFIX = 'task-area-nofly-hatch-'
/** hover「编辑 | 删除」面板尺寸（设计稿 121×32，与绘制遮罩确认态面板一致；
 *  复用同款 .hexagon-area-edit-panel 样式（position: fixed），经 portal 挂 body */
const EDIT_PANEL_WIDTH = 121
const EDIT_PANEL_HEIGHT = 32

/** SVG 命名空间（document.createElementNS 用） */
const SVG_NS = 'http://www.w3.org/2000/svg'

/** 多边形质心（顶点均值；任务区域范围小，均值近似即可）。
 *  区域名称标签/降落图标锚点定位用 */
function polygonCentroid(area: TaskArea): { lng: number; lat: number } {
  let lng = 0
  let lat = 0
  for (const v of area.vertices) {
    lng += v.longitude
    lat += v.latitude
  }
  const n = area.vertices.length
  return { lng: lng / n, lat: lat / n }
}

/** 区域顶点的外包包围盒（WGS84）。
 *  导出供 HomePage 区域聚焦（AreaListPanel 行 hover → fitBounds 完整框入区域）
 *  复用，与引擎 fitBounds 的输入口径一致 */
export function getAreaBounds(area: TaskArea): LngLatBounds {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const v of area.vertices) {
    west = Math.min(west, v.longitude)
    south = Math.min(south, v.latitude)
    east = Math.max(east, v.longitude)
    north = Math.max(north, v.latitude)
  }
  return { west, south, east, north }
}

/** 射线法点在多边形内判定：区域多边形渲染在引擎层（本组件无 DOM hover），
 *  hover「编辑 | 删除」面板显隐由 window mousemove + 本几何判定驱动 */
function pointInPolygon(px: number, py: number, vs: { x: number; y: number }[]) {
  let inside = false
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x
    const yi = vs[i].y
    const xj = vs[j].x
    const yj = vs[j].y
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** 构建名称标签 DOM（深色胶囊 + 类型色描边；pointer-events 关闭避免挡地图交互）。
 *  isLanding 时外套 wrapper 并将胶囊 translateY(-40px)：质心同时挂着 48×48 地面
 *  图标（span -24~+24px），标签高约 24px → 上移 40px 后 span -52~-28px，
 *  与图标顶缘保持 4px 间隙避让（wrapper 作为 marker 根元素，transform 由
 *  引擎接管，位移只能加在子元素上） */
function buildLabelElement(area: TaskArea, isLanding: boolean): HTMLElement {
  const meta = taskAreaTypeMeta(area.type)
  const pill = document.createElement('div')
  pill.textContent = `${meta.label}·${area.name}`
  pill.style.padding = '2px 8px'
  pill.style.fontSize = '12px'
  pill.style.lineHeight = '18px'
  pill.style.color = '#fff'
  pill.style.background = 'rgba(0, 0, 0, 0.6)'
  pill.style.border = `1px solid ${meta.color}`
  pill.style.borderRadius = '999px'
  pill.style.whiteSpace = 'nowrap'
  pill.style.pointerEvents = 'none'
  if (!isLanding) return pill
  const wrapper = document.createElement('div')
  pill.style.transform = 'translateY(-40px)'
  wrapper.appendChild(pill)
  return wrapper
}

/** 构建降落区中心地面图标 DOM：与绘制遮罩/指点返航落点圆圈（tap-return-zone）
 *  同款视觉——48×48、rgba(255,255,255,0.2) 填充、2px 白描边圆形，
 *  flex 居中 20×24 H 停机坪图标；pointer-events 关闭不挡地图交互 */
function buildLandingCenterElement(): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = [
    'box-sizing: border-box',
    'width: 48px',
    'height: 48px',
    'background-color: rgba(255, 255, 255, 0.2)',
    'border: 2px solid rgba(255, 255, 255, 1)',
    'border-radius: 50%',
    'display: flex',
    'align-items: center',
    'justify-content: center',
    'pointer-events: none',
  ].join('; ')
  const img = document.createElement('img')
  img.src = homeImages.tapReturnZoneIcon
  img.style.cssText = 'width: 20px; height: 24px; display: block'
  img.draggable = false
  img.alt = ''
  el.appendChild(img)
  return el
}

/** 斜线覆盖层内单个禁飞区的 DOM 记录（pattern + polygon + 名称标签） */
interface HatchEntry {
  area: TaskArea
  poly: SVGPolygonElement
  pattern: SVGPatternElement
  label: HTMLElement
}

/**
 * 禁飞区斜线阴影覆盖层：持久挂载（首个禁飞区出现时创建），按区域增量增删，
 * 地图移动经 onMove 整层重投影——隐藏/显示单个禁飞区不影响其余禁飞区
 * （不整层重建，避免其余区域斜线闪动）。
 */
interface HatchLayer {
  /** 当前挂载的禁飞区条目（按区域 id 索引） */
  items: Map<string, HatchEntry>
  /** 新增一个禁飞区的斜线 + 标签（含首次投影定位） */
  addItem: (area: TaskArea) => void
  /** 移除一个禁飞区的斜线 + 标签（不存在时静默忽略） */
  removeItem: (id: string) => void
  /** 重投影全部条目（onMove 每渲染帧调用） */
  update: () => void
  /** 整层销毁（DOM 移除 + onMove 解绑） */
  destroy: () => void
}

function createHatchLayer(adapter: MapAdapter): HatchLayer {
  const root = document.createElement('div')
  root.style.cssText = [
    'position: absolute',
    'inset: 0',
    'pointer-events: none',
    'overflow: hidden',
  ].join('; ')
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', '100%')
  svg.setAttribute('height', '100%')
  const defs = document.createElementNS(SVG_NS, 'defs')
  svg.appendChild(defs)
  root.appendChild(svg)
  // 插到 canvas 容器之后：斜线在底图上方（MapLibre 的 marker 也挂在
  // canvas 容器内、低于本覆盖层——禁飞区标签因此渲染在覆盖层内）
  const container = adapter.getContainer()
  const canvasContainer = container.querySelector('.maplibregl-canvas-container')
  if (canvasContainer) canvasContainer.after(root)
  else container.appendChild(root)

  const items = new Map<string, HatchEntry>()
  let offMove: () => void = () => {}

  /** 单条目重投影：顶点 → polygon points、纹理原点 → 首顶点、标签 → 质心 */
  const updateEntry = (e: HatchEntry) => {
    const pts: string[] = []
    let p0 = { x: 0, y: 0 }
    e.area.vertices.forEach((v, i) => {
      const p = adapter.project({ lng: v.longitude, lat: v.latitude })
      if (i === 0) p0 = p
      pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    })
    e.poly.setAttribute('points', pts.join(' '))
    // 纹理原点平移到首顶点：斜线随区域平移（间距恒定 8px 屏幕像素）
    e.pattern.setAttribute('patternTransform', `translate(${p0.x.toFixed(1)} ${p0.y.toFixed(1)})`)
    // 名称标签锚定到投影质心（与其它区域标签同位置口径）
    const pc = adapter.project(polygonCentroid(e.area))
    e.label.style.left = `${pc.x.toFixed(1)}px`
    e.label.style.top = `${pc.y.toFixed(1)}px`
  }

  const layer: HatchLayer = {
    items,
    addItem(area) {
      const patternId = `${NOFLY_HATCH_PATTERN_PREFIX}${area.id}`
      const pattern = document.createElementNS(SVG_NS, 'pattern')
      pattern.setAttribute('id', patternId)
      pattern.setAttribute('width', '8')
      pattern.setAttribute('height', '8')
      pattern.setAttribute('patternUnits', 'userSpaceOnUse')
      // 与绘制遮罩同款 45° 斜线（左下→右上 "/" 方向，2px 线宽，间距 8px）
      const line = document.createElementNS(SVG_NS, 'path')
      line.setAttribute('d', 'M-2 2 l4 -4 M0 8 l8 -8 M6 10 l4 -4')
      line.setAttribute('stroke', NOFLY_HATCH_COLOR)
      line.setAttribute('stroke-width', '2')
      pattern.appendChild(line)
      defs.appendChild(pattern)
      const poly = document.createElementNS(SVG_NS, 'polygon')
      poly.setAttribute('fill', `url(#${patternId})`)
      svg.appendChild(poly)
      // 名称标签（与其它区域同款胶囊样式）不走引擎 marker——marker 挂在
      // canvas 容器内（低于本覆盖层），会被斜线阴影盖住，改渲染在覆盖层内、
      // SVG 之上（DOM 顺序即层叠顺序）；translate(-50%,-50%) 令标签中心对准质心
      const label = buildLabelElement(area, false)
      label.style.position = 'absolute'
      label.style.left = '0'
      label.style.top = '0'
      label.style.transform = 'translate(-50%, -50%)'
      root.appendChild(label)
      const entry: HatchEntry = { area, poly, pattern, label }
      items.set(area.id, entry)
      updateEntry(entry)
    },
    removeItem(id) {
      const e = items.get(id)
      if (!e) return
      e.poly.remove()
      e.pattern.remove()
      e.label.remove()
      items.delete(id)
    },
    update() {
      for (const e of items.values()) updateEntry(e)
    },
    destroy() {
      offMove()
      root.remove()
      items.clear()
    },
  }
  // onMove 覆盖拖动/缩放/惯性/飞行动画的每渲染帧，实时跟随地图
  offMove = adapter.onMove(layer.update)
  return layer
}

interface TaskAreaLayerProps {
  /** 地图引擎适配器（未就绪时不渲染） */
  adapter: MapAdapter | null
  /** 区域绘制/框选遮罩激活中（HomePage 的 areaSelectMode 非空）：抑制 hover
   *  面板——绘制确认态的面板由 HexagonAreaOverlay 自带实现负责，避免叠加 */
  areaSelectActive?: boolean
}

export function TaskAreaLayer({ adapter, areaSelectActive = false }: TaskAreaLayerProps) {
  const areas = useTaskAreaStore((s) => s.areas)
  const hiddenIds = useTaskAreaStore((s) => s.hiddenIds)
  // 编辑中的区域 id（绘制遮罩「编辑」按钮写入）：编辑态专属视觉，见组件头注释
  const editingAreaId = useTaskAreaStore((s) => s.editingAreaId)
  // hover 面板动作：编辑走 requestEditArea 跨层级信号（与区域列表行内编辑
  // 同款链路），删除直接 removeArea
  const requestEditArea = useTaskAreaStore((s) => s.requestEditArea)
  const removeArea = useTaskAreaStore((s) => s.removeArea)

  // ===== 增量同步渲染（按 id diff）=====
  // renderedRef 记录「当前已挂到地图上的区域」及其数据签名（type/name/vertices）：
  // - 不再可见（隐藏/删除/进入编辑态）→ 移除其覆盖物；
  // - 可见但签名变化（编辑确认/类型变更）→ 先移除再重建（引擎层 addPolygon
  //   同 id 直接添加会泄漏旧 source/layer，必须先删后建）；
  // - 新可见 → 绘制。其余区域覆盖物原样保留——隐藏某个区域时其余可见区域
  //   不闪动。
  const renderedRef = useRef(new Map<string, { sig: string }>())
  const hatchRef = useRef<HatchLayer | null>(null)
  useEffect(() => {
    if (!adapter) return
    const sigOf = (a: TaskArea) =>
      `${a.type}|${a.name}|${a.vertices.map((v) => `${v.longitude},${v.latitude}`).join(';')}`
    const want = new Map<string, TaskArea>()
    for (const a of areas) {
      if (hiddenIds.has(a.id) || a.id === editingAreaId) continue
      want.set(a.id, a)
    }
    const prev = renderedRef.current
    // 移除：不再可见 或 数据签名变化（后者先删后建）
    for (const [id, rec] of prev) {
      const area = want.get(id)
      if (area && rec.sig === sigOf(area)) continue
      adapter.removePolygon(`${POLYGON_ID_PREFIX}${id}`)
      adapter.removeMarker(`${LABEL_ID_PREFIX}${id}`)
      adapter.removeMarker(`${LANDING_CENTER_ID_PREFIX}${id}`)
      if (hatchRef.current) {
        hatchRef.current.removeItem(id)
        if (hatchRef.current.items.size === 0) {
          hatchRef.current.destroy()
          hatchRef.current = null
        }
      }
      prev.delete(id)
    }
    // 新增（含签名变化后的重建）
    for (const [id, area] of want) {
      if (prev.has(id)) continue
      const meta = taskAreaTypeMeta(area.type)
      // 降落区判定兼容新旧类型键（接口新枚举 TeamLand / 本地绘制旧值 landingArea）
      const isLanding = area.type === 'TeamLand' || area.type === 'landingArea'
      const isNoFly = area.type === 'NoFlyArea'
      adapter.addPolygon(
        `${POLYGON_ID_PREFIX}${id}`,
        area.vertices.map((v) => ({ lng: v.longitude, lat: v.latitude })),
        isNoFly
          ? // 禁飞区：与绘制遮罩预览一致——无实色填充（斜线由覆盖层渲染）+
            // #BE0707 描边
            {
              fillColor: NOFLY_STROKE_COLOR,
              fillOpacity: 0,
              strokeColor: NOFLY_STROKE_COLOR,
              strokeWeight: 1.5,
              strokeOpacity: 0.9,
            }
          : {
              fillColor: meta.color,
              fillOpacity: 0.12,
              strokeColor: meta.color,
              strokeWeight: 1.5,
              strokeOpacity: 0.9,
            },
      )
      const centroid = polygonCentroid(area)
      // 禁飞区名称标签不挂引擎 marker（canvas 容器内层叠低于斜线覆盖层会被
      // 盖住），改随斜线一起渲染在覆盖层内（见 HatchLayer.addItem）
      if (!isNoFly) {
        adapter.addMarker(`${LABEL_ID_PREFIX}${id}`, centroid, {
          element: buildLabelElement(area, isLanding),
        })
      }
      if (isLanding) {
        adapter.addMarker(`${LANDING_CENTER_ID_PREFIX}${id}`, centroid, {
          element: buildLandingCenterElement(),
          // anchor = 图标几何中心（48×48 → {24,24}），圆形视觉中心对准质心
          anchor: { x: 24, y: 24 },
        })
      }
      if (isNoFly) {
        if (!hatchRef.current) hatchRef.current = createHatchLayer(adapter)
        hatchRef.current.addItem(area)
      }
      prev.set(id, { sig: sigOf(area) })
    }
  }, [adapter, areas, hiddenIds, editingAreaId])

  // 组件卸载 / adapter 更换时全量清理（增量记录与斜线覆盖层一并销毁；
  // 正常的 areas/hiddenIds 变化不经过此 cleanup，避免全量重绘闪动）
  useEffect(() => {
    if (!adapter) return
    return () => {
      for (const id of renderedRef.current.keys()) {
        adapter.removePolygon(`${POLYGON_ID_PREFIX}${id}`)
        adapter.removeMarker(`${LABEL_ID_PREFIX}${id}`)
        adapter.removeMarker(`${LANDING_CENTER_ID_PREFIX}${id}`)
      }
      renderedRef.current.clear()
      hatchRef.current?.destroy()
      hatchRef.current = null
    }
  }, [adapter])

  // ===== 常态 hover「编辑 | 删除」面板（与绘制遮罩确认态同款交互/样式） =====
  // 区域多边形渲染在引擎层（无 DOM hover）——window mousemove 将光标与全部
  // 可见区域（跳过已隐藏/编辑中）顶点实时投影做射线法命中：命中即面板锚定
  // 到该区域第 3 顶点（右下）右侧 8px、垂直居中显示（右侧空间不足翻转到
  // 左侧，视口钳制防溢出）；鼠标位于面板矩形近旁（外扩 8px，覆盖面板与
  // 区域间隙）保持显示以便点击；平移/缩放地图经 onMove 重投影每帧跟随。
  // 绘制/框选遮罩激活（areaSelectActive）或编辑中（editingAreaId）时抑制
  // 并隐藏——确认态面板由遮罩负责，编辑态不放面板（右键先退出编辑）
  const hoverPanelRef = useRef<HTMLDivElement | null>(null)
  const hoverAreaIdRef = useRef<string | null>(null)
  const hoverPanelBoxRef = useRef<{ left: number; top: number } | null>(null)
  useEffect(() => {
    if (!adapter) return
    const hidePanel = () => {
      hoverAreaIdRef.current = null
      hoverPanelBoxRef.current = null
      if (hoverPanelRef.current) hoverPanelRef.current.style.display = 'none'
    }
    if (areaSelectActive || editingAreaId !== null) {
      hidePanel()
      return
    }
    // hover 中的区域被隐藏/移除（区域列表操作）时立即收起面板：鼠标未移动
    // 不触发 mousemove 重判，不校验会残留可点的「编辑 | 删除」按钮作用于
    // 已隐藏区域（hiddenIds 入依赖即在本 effect 重跑时兜底校验）
    const hoveredId = hoverAreaIdRef.current
    if (hoveredId) {
      const s = useTaskAreaStore.getState()
      if (s.hiddenIds.has(hoveredId) || !s.areas.some((a) => a.id === hoveredId)) hidePanel()
    }
    const projectArea = (area: TaskArea) => {
      const bounds = adapter.getContainer().getBoundingClientRect()
      return area.vertices.map((v) => {
        const p = adapter.project({ lng: v.longitude, lat: v.latitude })
        return { x: p.x + bounds.left, y: p.y + bounds.top }
      })
    }
    const positionPanel = (anchor: { x: number; y: number }) => {
      const el = hoverPanelRef.current
      if (!el) return
      const vw = window.innerWidth
      const vh = window.innerHeight
      const flip = anchor.x + 8 + EDIT_PANEL_WIDTH > vw
      const left = flip ? Math.max(8, anchor.x - 8 - EDIT_PANEL_WIDTH) : anchor.x + 8
      const top = Math.min(
        Math.max(anchor.y - EDIT_PANEL_HEIGHT / 2, 8),
        vh - EDIT_PANEL_HEIGHT - 8,
      )
      el.style.left = `${left}px`
      el.style.top = `${top}px`
      hoverPanelBoxRef.current = { left, top }
    }
    const pickAreaAt = (cx: number, cy: number) => {
      const s = useTaskAreaStore.getState()
      const visible = s.areas.filter((a) => !s.hiddenIds.has(a.id) && a.id !== s.editingAreaId)
      // 多区域重叠时后加入者（数组靠后）优先，与绘制遮罩确认态判定一致
      for (let i = visible.length - 1; i >= 0; i--) {
        const vs = projectArea(visible[i])
        if (pointInPolygon(cx, cy, vs)) return visible[i]
      }
      return null
    }
    const onHoverMove = (e: MouseEvent) => {
      const panel = hoverPanelRef.current
      if (!panel) return
      const hit = pickAreaAt(e.clientX, e.clientY)
      if (hit) {
        hoverAreaIdRef.current = hit.id
        positionPanel(projectArea(hit)[2])
        panel.style.display = ''
        return
      }
      const box = hoverPanelBoxRef.current
      const nearPanel =
        !!box &&
        e.clientX >= box.left - 8 &&
        e.clientX <= box.left + EDIT_PANEL_WIDTH + 8 &&
        e.clientY >= box.top - 8 &&
        e.clientY <= box.top + EDIT_PANEL_HEIGHT + 8
      // 面板隐藏时同步作废定位矩形：nearPanel 仅凭几何矩形判定、不校验区域
      // 可见性，box 残留旧坐标会让鼠标移到面板原位置（即使对应区域已隐藏/
      // 已移除）时凭空复现面板——矩形作废后，复现面板的唯一入口是重新命中
      // 可见区域（pickAreaAt 已过滤隐藏区域）
      if (!nearPanel) {
        hoverAreaIdRef.current = null
        hoverPanelBoxRef.current = null
      }
      panel.style.display = nearPanel ? '' : 'none'
    }
    const offMapMove = adapter.onMove(() => {
      const id = hoverAreaIdRef.current
      if (!id) return
      const s = useTaskAreaStore.getState()
      // 跟随前校验隐藏/移除：隐藏区域不得再展示面板（平移地图时同步收起，
      // 与 mousemove 命中判定同口径）
      if (s.hiddenIds.has(id) || !s.areas.some((a) => a.id === id)) {
        hidePanel()
        return
      }
      const area = s.areas.find((a) => a.id === id)
      if (!area) return
      positionPanel(projectArea(area)[2])
    })
    window.addEventListener('mousemove', onHoverMove)
    return () => {
      window.removeEventListener('mousemove', onHoverMove)
      offMapMove()
    }
  }, [adapter, areaSelectActive, editingAreaId, hiddenIds])

  return createPortal(
    <div ref={hoverPanelRef} className="hexagon-area-edit-panel" style={{ display: 'none' }}>
      <div
        className="hexagon-area-edit-panel__btn hexagon-area-edit-panel__btn--edit"
        onClick={() => {
          const id = hoverAreaIdRef.current
          if (!id) return
          if (hoverPanelRef.current) hoverPanelRef.current.style.display = 'none'
          hoverAreaIdRef.current = null
          // 与区域列表行内「编辑区域」同款跨层级信号：HomePage 监听后挂载
          // 绘制遮罩进入该区域编辑态（areaSelectActive 随之翻转为抑制态）
          requestEditArea(id)
        }}
      >
        编辑
      </div>
      <div className="hexagon-area-edit-panel__divider" />
      <div
        className="hexagon-area-edit-panel__btn hexagon-area-edit-panel__btn--delete"
        onClick={() => {
          const id = hoverAreaIdRef.current
          if (!id) return
          if (hoverPanelRef.current) hoverPanelRef.current.style.display = 'none'
          hoverAreaIdRef.current = null
          removeArea(id)
        }}
      >
        删除
      </div>
    </div>,
    document.body,
  )
}