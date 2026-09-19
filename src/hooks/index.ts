import { useCallback, useState, useEffect, useRef, useLayoutEffect, type DependencyList, type RefObject } from 'react'
import { type MapEngineInstance } from '../map-engines/index'
import { usePlaneStatusStore } from '../stores/index'
import { type LngLat, type MapAdapter } from '../map-engines/types'
import { createStageProjector, queryStageEl, saveScopedAnchors } from '../utils/index'

/**
 * useMapEngine —— 地图引擎状态管理 Hook。
 *
 * 职责：
 * - 持有 MapEngineInstance（由 MapLibreContainer 的 onReady 异步注入）；
 * - 对外暴露 adapter 供业务组件引擎无关地操作地图。
 *
 * 当前仅接入 MapLibre 引擎。如后续需要支持多引擎切换，
 * 可在此处恢复 engineType 状态与切换清理逻辑。
 */

export function useMapEngine() {
  const [engineInstance, setEngineInstance] = useState<MapEngineInstance | null>(
    null,
  )

  /** Container onReady 回调：注入新引擎实例 */
  const handleEngineReady = useCallback((instance: MapEngineInstance) => {
    setEngineInstance(instance)
  }, [])

  return {
    /** 当前引擎实例（可能为 null：初始化中） */
    engineInstance,
    /** 适配器（engineInstance?.adapter 的简写） */
    adapter: engineInstance?.adapter ?? null,
    /** Container onReady 绑定此回调 */
    onEngineReady: handleEngineReady,
  }
}

/**
 * 无人机状态一次性加载 Hook —— MainApp 挂载一次，拉取
 * /api/v1/control/queryPlaneStatus 首帧写入 planeStatusStore。
 *
 * 接口不做轮询：仅在首页加载时调用一次；后续实时遥测更新
 * 由 WebSocket 链路（features/realtime）承载。
 *
 * - StrictMode 双挂载时避免重复请求（store.loaded 判断 + 引用计数）；
 * - 已加载过（如路由切换回来）则不重复请求。
 */

/** 模块级标记：本次会话内已发起过加载则不再请求 */
let initialized = false

export function usePlaneStatusInit(): void {
  useEffect(() => {
    if (!initialized) {
      initialized = true
      void usePlaneStatusStore.getState().refresh()
    }
  }, [])
}

/**
 * useMapAnchorSync —— 拖拽位置 + 地理锚定组合 hook。
 *
 * 在 useDraggable（舞台百分比拖拽）之上叠加地理锚定，使覆盖物（无人机图标等）
 * 与地图视口绑定：拖动/缩放地图时，图标按地理锚点（LngLat）重投影舞台百分比，
 * 表现为随地图一起移动；用户手动拖动图标后，新位置反算为经纬度固化新锚点。
 *
 * 两种初始化模式：
 *
 * A. 种子锚定（initialAnchors 提供，离线地图包就绪时启用）：
 *    引擎就绪即刻把种子锚点（localStorage 按包恢复 → 无则按包中心 + 设计偏移
 *    播种，由调用方派生）写入并立即投影一次，不等首个 moveend——flyTo 飞行
 *    动画期间 move 事件每帧触发，图标随视口一起移动（锚定的正确表现）；
 *    用户拖拽图标后按新屏幕位置反算刷新锚点并按包持久化（anchorScope 提供
 *    时），刷新页面后锚点稳定不漂移。
 *
 * B. 屏幕固化（initialAnchors 为空，未导入地图包的降级路径）：
 *    等地图视图首次稳定（首个 moveend——首页加载后必有一次定位 flyTo，其动画
 *    结束触发 moveend；用户提前手动拖动打断飞行同样触发）后，把当前屏幕位置
 *    （可能来自 localStorage 恢复）一次性反算为地理锚点数组。不在引擎就绪时
 *    立即固化：flyTo 动画期间视口持续变化，此刻固化的经纬度会让图标被飞行动画
 *    带偏到错误地理位置。
 *
 * 地图 move（拖动/缩放/惯性/飞行动画，每渲染帧触发）：按锚点重投影全部位置并
 * 整体写回（applyPositions），图标实时跟随；用户拖动图标（useDraggable 内部
 * setPositions）时地图未动，锚定同步不触发，拖拽结束后锚点更新为最新屏幕位置
 * 反算结果——锚点只在「种子初始化」「视图首次稳定」与「用户拖完」三个时机固化，
 * 屏幕显示不变。
 *
 * 降级：地图引擎未就绪 / 舞台元素缺失 / 事件未挂载时，行为与纯 useDraggable
 * 完全一致（自由拖放，不随地图移动），不阻塞页面其他功能。
 */

interface UseMapAnchorSyncOptions {
  /** 地图适配器（null = 引擎未就绪，退化为纯拖拽） */
  adapter: MapAdapter | null
  /** useDraggable 原有参数 */
  count: number
  initialPositions: DragPosition[]
  containerSelector?: string
  /** 降级模式（无种子锚点）下的屏幕位置持久化键；种子模式下不使用 */
  storageKey?: string
  /**
   * 种子地理锚点数组（与 count 一一对应）。
   * 提供时启用种子锚定（模式 A）；null/undefined 走屏幕固化（模式 B）。
   * 由调用方按当前离线地图包派生：localStorage 按包恢复优先，无则包中心 + 偏移播种。
   */
  initialAnchors?: LngLat[] | null
  /** 锚点持久化键前缀（如 'gcs:aircraft-anchors'） */
  anchorStorageKey?: string
  /** 锚点持久化作用域（当前离线地图包 id；null = 不持久化） */
  anchorScope?: string | null
}

const clampPct = (v: number) => Math.max(0, Math.min(100, v))

/**
 * 地理锚定同步 hook。
 *
 * 返回值在 useDraggable（positions / draggingIndex / onDragStart /
 * resetPosition / resetAll / applyPositions）之上追加 getAnchor(index)：
 * 读取指定图标的地理锚点（未初始化时 null），供地图聚焦飞转定位用。
 * 下游组件（AircraftLayer、FlightOverlays 等）原有用法不受影响。
 */
export function useMapAnchorSync({
  adapter,
  count,
  initialPositions,
  containerSelector = '.map-stage',
  storageKey,
  initialAnchors = null,
  anchorStorageKey,
  anchorScope = null,
}: UseMapAnchorSyncOptions) {
  const draggable = useDraggable({
    count,
    initialPositions,
    containerSelector,
    // 种子锚定模式下不持久化屏幕位置：刷新后由地理锚点直接投影到位，
    // 避免陈旧屏幕百分比闪现；仅降级模式（无地图包）保留屏幕持久化
    ...(initialAnchors || !storageKey ? {} : { storageKey }),
  })
  const { positions, draggingIndex, applyPositions } = draggable

  // 最新 positions / adapter 引用（避免 effect 频繁重挂）。渲染期不可直写
  // ref，统一在 effect 中同步；effect 按声明顺序先于依赖它们的回调执行
  const positionsRef = useRef(positions)
  useEffect(() => {
    positionsRef.current = positions
  }, [positions])
  const adapterRef = useRef(adapter)
  useEffect(() => {
    adapterRef.current = adapter
  }, [adapter])

  /**
   * 地理锚点数组（ref 持有，不触发渲染）。
   * null = 尚未初始化（等首个 moveend 视图稳定后首次固化）。
   */
  const anchorsRef = useRef<LngLat[] | null>(null)

  /** 锚定就绪标志：种子模式挂载即 true；屏幕固化模式首个 moveend 后 true */
  const readyRef = useRef(false)

  /** 把当前锚点按包持久化（种子/拖拽后统一走此路径） */
  const persistAnchors = useCallback(() => {
    const anchors = anchorsRef.current
    if (!anchorStorageKey || !anchorScope || !anchors) return
    const map: Record<string, LngLat> = {}
    anchors.forEach((a, i) => {
      map[String(i)] = a
    })
    saveScopedAnchors(anchorStorageKey, anchorScope, map)
  }, [anchorStorageKey, anchorScope])

  /** 把当前屏幕位置反算为地理锚点（拖拽后刷新；屏幕固化模式首次固化） */
  const commitAnchorsFromScreen = useCallback(() => {
    const current = positionsRef.current
    const stageEl = queryStageEl(containerSelector)
    const currentAdapter = adapterRef.current
    if (!stageEl || !currentAdapter) return
    const projector = createStageProjector(currentAdapter, stageEl)
    anchorsRef.current = current.map((p) => projector.stagePctToLngLat(p.x, p.y))
  }, [containerSelector])

  /** 拖拽结束后固化新锚点（地图未动，仅记录屏幕位置对应的地理坐标） */
  useEffect(() => {
    if (draggingIndex !== null) return
    // 锚定就绪（首锚点已固化）后才跟随拖拽结果刷新；就绪前的拖拽交给
    // moveend 初始化统一按最终屏幕位置固化
    if (readyRef.current && anchorsRef.current !== null) {
      commitAnchorsFromScreen()
      persistAnchors()
    }
  }, [draggingIndex, commitAnchorsFromScreen, persistAnchors])

  /** 锚定初始化 + 地图事件：
   *  种子模式（initialAnchors 提供）引擎就绪立即播种并投影一次；
   *  屏幕固化模式等首个 moveend。此后 move 每帧按锚点重投影。
   *  initialAnchors 变化（离线地图包切换）时重新播种。 */
  useEffect(() => {
    if (!adapter) return

    // 种子长度与 count 不符（配置变更竞态）时忽略种子，走屏幕固化兜底
    const seeds = initialAnchors && initialAnchors.length === count ? initialAnchors : null

    if (seeds) {
      // 立即固化种子锚点并投影一次：不待 move/flyTo 结束，
      // flyTo 动画期间 move 每帧重投影，图标随视口飞入
      anchorsRef.current = seeds.map((a) => ({ lng: a.lng, lat: a.lat }))
      readyRef.current = true
      const stageEl = queryStageEl(containerSelector)
      if (stageEl) {
        const projector = createStageProjector(adapter, stageEl)
        applyPositions(
          seeds.map((a) => {
            const p = projector.lngLatToStagePct(a)
            return { x: clampPct(p.x), y: clampPct(p.y) }
          }),
        )
      }
      persistAnchors()
    } else {
      // 屏幕固化模式：重置就绪标志，等首个 moveend 固化
      readyRef.current = false
      anchorsRef.current = null
    }

    // 首个 moveend：视图首次稳定。种子模式已就绪（直接跳过）；
    // 屏幕固化模式此刻屏幕位置即设计布局位置，固化为锚点
    const offMoveEnd = adapter.onMoveEnd(() => {
      if (readyRef.current) return
      const stageEl = queryStageEl(containerSelector)
      if (!stageEl) return
      readyRef.current = true
      commitAnchorsFromScreen()
    })

    // 地图移动（拖动/缩放/惯性/飞行动画）：就绪后按锚点重投影所有位置
    const offMove = adapter.onMove(() => {
      if (!readyRef.current) return
      const anchors = anchorsRef.current
      const stageEl = queryStageEl(containerSelector)
      if (!anchors || !stageEl) return
      const projector = createStageProjector(adapter, stageEl)
      applyPositions(
        anchors.map((a) => {
          const p = projector.lngLatToStagePct(a)
          return { x: clampPct(p.x), y: clampPct(p.y) }
        }),
      )
    })

    return () => {
      offMoveEnd()
      offMove()
      readyRef.current = false
    }
  }, [
    adapter,
    containerSelector,
    initialAnchors,
    count,
    applyPositions,
    commitAnchorsFromScreen,
    persistAnchors,
  ])

  /** 读取指定索引图标的地理锚点（未初始化/越界时 null） */
  const getAnchor = useCallback(
    (index: number): LngLat | null => {
      const anchors = anchorsRef.current
      if (!anchors || index < 0 || index >= anchors.length) return null
      return anchors[index]
    },
    [],
  )

  return { ...draggable, getAnchor }
}

/**
 * useDraggable —— 通用百分比拖拽 hook。
 *
 * 设计要点：
 * - 以容器（默认 .map-stage）宽高为参照，将像素位移换算为百分比，
 *   保持与 CSS `left/top: N%` 一致的响应式行为；
 * - mousedown 记录起始快照，mousemove 实时更新位置，mouseup 结束拖拽；
 * - 通过 ref 持有最新 positions，避免 onDragStart 频繁重建；
 * - 全局监听 mousemove/mouseup（挂载到 window），确保鼠标移出元素后仍可拖拽。
 */

export interface DragPosition {
  /** 水平百分比 0-100 */
  x: number
  /** 垂直百分比 0-100 */
  y: number
}

interface UseDraggableOptions {
  /** 拖拽项数量 */
  count: number
  /** 初始位置数组（百分比） */
  initialPositions: DragPosition[]
  /** 容器选择器，用于计算位移百分比（默认 '.map-stage'） */
  containerSelector?: string
  /**
   * localStorage 存储键。
   * 提供后，位置会在拖拽时自动持久化，刷新页面后恢复上次位置。
   */
  storageKey?: string
}

export function useDraggable({
  count,
  initialPositions,
  containerSelector = '.map-stage',
  storageKey,
}: UseDraggableOptions) {
  const [positions, setPositions] = useState<DragPosition[]>(() => {
    // 首次加载时尝试从 localStorage 恢复上次位置
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey)
        if (saved) {
          const parsed = JSON.parse(saved) as DragPosition[]
          // 校验：必须是数组且长度匹配，否则忽略用初始值
          if (
            Array.isArray(parsed) &&
            parsed.length === count &&
            parsed.every(
              (p) =>
                typeof p?.x === 'number' &&
                typeof p?.y === 'number' &&
                p.x >= 0 && p.x <= 100 &&
                p.y >= 0 && p.y <= 100,
            )
          ) {
            return parsed
          }
        }
      } catch {
        // JSON 解析失败等异常：静默回退到初始位置
      }
    }
    return initialPositions
  })
   const [draggingIndex, setDraggingIndex] = useState<number | null>(null)

  // 位置变化时持久化到 localStorage（防抖 300ms）：
  // 外部锚定跟随（地图 move 每渲染帧重投影）会高频更新 positions，
  // 逐帧同步写 localStorage 既浪费也无必要，静默合并到停顿后一次写入
  const persistTimer = useRef<number | null>(null)
  useEffect(() => {
    if (!storageKey) return
    if (persistTimer.current !== null) window.clearTimeout(persistTimer.current)
    persistTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(positions))
      } catch {
        // 存储失败（如隐私模式/配额满）：静默忽略，不影响拖拽功能
      }
    }, 300)
    return () => {
      if (persistTimer.current !== null) {
        window.clearTimeout(persistTimer.current)
        persistTimer.current = null
      }
    }
  }, [positions, storageKey])

  // 用 ref 持有最新 positions，使 onDragStart 无需依赖 positions 从而保持稳定引用
  const positionsRef = useRef(positions)
  useEffect(() => {
    positionsRef.current = positions
  }, [positions])

  // 拖拽过程中的快照（非响应式，避免频繁触发重渲染）
  const dragState = useRef<{
    index: number
    startMouseX: number
    startMouseY: number
    startX: number
    startY: number
    containerWidth: number
    containerHeight: number
  } | null>(null)

  /**
   * 拖拽起始：鼠标左键按下时调用。
   * 记录起始鼠标坐标 + 起始百分比位置 + 容器尺寸，供 mousemove 计算。
   */
  const onDragStart = useCallback(
    (index: number, e: React.MouseEvent) => {
      if (e.button !== 0) return // 仅响应左键
      if (index < 0 || index >= count) return

      e.preventDefault()

      const container = (e.currentTarget as HTMLElement)
        .closest(containerSelector) as HTMLElement | null
      if (!container) return

      const rect = container.getBoundingClientRect()
      const pos = positionsRef.current[index]

      dragState.current = {
        index,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startX: pos.x,
        startY: pos.y,
        containerWidth: rect.width,
        containerHeight: rect.height,
      }
      setDraggingIndex(index)
    },
    [count, containerSelector],
  )

  // 全局 mousemove / mouseup 监听（拖拽期间持续生效）
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const ds = dragState.current
      if (!ds) return

      // 像素位移 → 百分比位移
      const deltaXPercent =
        ((e.clientX - ds.startMouseX) / ds.containerWidth) * 100
      const deltaYPercent =
        ((e.clientY - ds.startMouseY) / ds.containerHeight) * 100

      // 限制在 0-100 范围内，防止拖出容器边界
      const newX = Math.max(0, Math.min(100, ds.startX + deltaXPercent))
      const newY = Math.max(0, Math.min(100, ds.startY + deltaYPercent))

      setPositions((prev) => {
        const next = [...prev]
        next[ds.index] = { x: newX, y: newY }
        return next
      })
    }

    const onMouseUp = () => {
      if (dragState.current) {
        dragState.current = null
        setDraggingIndex(null)
      }
    }

    // 全局监听，确保鼠标移出目标元素后拖拽仍继续
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  /** 重置指定索引位置到初始值 */
  const resetPosition = useCallback(
    (index: number) => {
      setPositions((prev) => {
        const next = [...prev]
        next[index] = { ...initialPositions[index] }
        return next
      })
    },
    [initialPositions],
  )

  /** 重置所有位置到初始值 */
  const resetAll = useCallback(() => {
    setPositions(initialPositions.map((p) => ({ ...p })))
  }, [initialPositions])

  /**
   * 外部整体替换位置数组（如地图移动后按地理锚点重投影舞台百分比）。
   * 与拖拽共用同一状态源，二者天然互斥：拖拽期间 positions 由拖拽驱动，
   * 地图并未移动，不会触发锚定同步；锚定同步仅在地图 move 时触发，
   * 此时不在拖拽会话中。
   */
  const applyPositions = useCallback((next: DragPosition[]) => {
    setPositions(next.map((p) => ({ ...p })))
  }, [])

  return {
    positions,
    draggingIndex,
    onDragStart,
    resetPosition,
    resetAll,
    applyPositions,
  }
}

/**
 * usePanelClamp —— hover 面板边缘自适应平移修正（兜底方案）。
 *
 * 背景：
 * `utils/panelPlacement.ts` 通过百分比阈值选择面板展开方向（左/右、上/下），
 * 但阈值是经验值，在不同视口尺寸 / 拖拽位置下，面板仍可能溢出可视区域被裁剪，
 * 导致「内容显示不全」。
 *
 * 本 hook 作为兜底：在每次渲染、拖拽、resize、DOM 变更、字体加载后，测量所有 hover 面板
 * 的实际矩形，计算使其完全进入可视区域所需的平移量，通过 CSS 变量 `--clamp-x` / `--clamp-y`
 * 注入到面板元素；CSS 端用独立的 `translate` 属性叠加该平移，与各面板既有的
 * `transform` 解耦互不干扰。
 *
 * 关键设计：以面板的「裁剪祖先」边界（而非视口边界）为基准进行修正。
 * hover 面板位于 `.map-stage`（overflow:hidden）内部，实际可见区域 = `.map-stage`
 * 矩形（比视口小，上方被 StatusHeader 遮挡），若按视口边界修正仍会被 overflow:hidden 裁剪。
 *
 * 设计要点：
 * - 使用 useLayoutEffect，在浏览器绘制前同步完成测量与修正，避免溢出闪烁；
 * - 不通过 removeProperty 测量「自然位置」（会触发 MutationObserver 反馈循环），
 *   而是读取当前 --clamp 值并从 rect 中减去，推导出自然位置；
 * - 仅当新计算的 clamp 值与当前不同时才写入，避免触发 MutationObserver 反馈循环；
 * - panel 使用 visibility:hidden 隐藏（非 display:none），始终保留布局可被测量；
 * - 仅做「平移修正」，不改方向；方向由 panelPlacement.ts 的修饰类负责，两者互不干扰。
 * - 每次应用前实时查询面板节点，保证动态增删的面板（如聚焦面板切换）都能被覆盖；
 * - 通过 MutationObserver 监听 DOM 变更（面板增删、宿主 class/style 变化），
 *   确保面板在 hover 显示后立即重新修正，不依赖外部 deps 的精确性。
 */

/**
 * 获取元素最近的可裁剪祖先（overflow ≠ visible）的矩形。
 *
 * hover 面板被 `.map-stage`（overflow:hidden）等容器裁剪，需以该容器边界
 * 而非视口边界为基准进行平移修正，否则面板仍会被容器裁剪不可见。
 *
 * 从面板父元素逐级向上查找，返回第一个设置了 overflow/overflowX/overflowY
 * 为 hidden/scroll/auto/clip 的祖先的 getBoundingClientRect()。
 * 若未找到（已到 body），回退到视口矩形。
 */
function getClippingRect(el: HTMLElement): DOMRect {
  let node: HTMLElement | null = el.parentElement
  while (node && node !== document.body) {
    const style = getComputedStyle(node)
    if (
      style.overflow !== 'visible' ||
      style.overflowX !== 'visible' ||
      style.overflowY !== 'visible'
    ) {
      return node.getBoundingClientRect()
    }
    node = node.parentElement
  }
  return new DOMRect(
    0,
    0,
    document.documentElement.clientWidth,
    document.documentElement.clientHeight,
  )
}

export interface UsePanelClampOptions {
  /** 容器 ref；在其内查找 hover 面板。缺省使用 document.body */
  containerRef?: RefObject<HTMLElement | null>
  /** hover 面板选择器，默认 [data-hover-panel] */
  selector?: string
  /** 距视口边缘的安全间距（px），默认 8 */
  padding?: number
  /** 触发重新计算的额外依赖（宿主百分比坐标、聚焦索引等）。
   *  宿主拖拽时其百分比坐标变化，传入作为依赖可实时重新修正。 */
  deps?: DependencyList
}

export function usePanelClamp({
  containerRef,
  selector = '[data-hover-panel]',
  padding = 8,
  deps = [],
}: UsePanelClampOptions = {}) {
  useLayoutEffect(() => {
    const root = containerRef?.current ?? document.body
    if (!root) return

    // 实时查询面板：每次 apply 都重新查 DOM，保证动态增删的面板都能被覆盖。
    const queryPanels = () => Array.from(root.querySelectorAll<HTMLElement>(selector))

    const apply = () => {
      const panels = queryPanels()
      for (const panel of panels) {
        // 读取当前注入的 clamp 值（inline style），用于从测量矩形中反推「自然位置」。
        // 不使用 removeProperty + remeasure 的方式，因为那会修改 style 属性，
        // 触发 MutationObserver → apply → 修改 style → MO → ... 的无限反馈循环。
        const currentClampX = parseFloat(panel.style.getPropertyValue('--clamp-x')) || 0
        const currentClampY = parseFloat(panel.style.getPropertyValue('--clamp-y')) || 0

        const rect = panel.getBoundingClientRect()
        // 反推自然位置：当前 rect 包含了上一次注入的 clamp 平移，减去即得无修正时的位置
        const naturalRight = rect.right - currentClampX
        const naturalLeft = rect.left - currentClampX
        const naturalBottom = rect.bottom - currentClampY
        const naturalTop = rect.top - currentClampY

        // 以最近可裁剪祖先（如 .map-stage overflow:hidden）为可见边界
        const clip = getClippingRect(panel)
        const boundLeft = clip.left + padding
        const boundRight = clip.right - padding
        const boundTop = clip.top + padding
        const boundBottom = clip.bottom - padding

        let shiftX = 0
        let shiftY = 0
        // 右溢出：向左平移
        if (naturalRight > boundRight) shiftX = boundRight - naturalRight
        // 左溢出（含右溢出修正后的二次校验）：向右平移
        if (naturalLeft + shiftX < boundLeft) shiftX += boundLeft - (naturalLeft + shiftX)
        // 下溢出：向上平移
        if (naturalBottom > boundBottom) shiftY = boundBottom - naturalBottom
        // 上溢出：向下平移
        if (naturalTop + shiftY < boundTop) shiftY += boundTop - (naturalTop + shiftY)

        const newClampX = `${Math.round(shiftX)}px`
        const newClampY = `${Math.round(shiftY)}px`

        // 仅当值变化时才写入，避免触发 MutationObserver 反馈循环
        if (panel.style.getPropertyValue('--clamp-x') !== newClampX) {
          panel.style.setProperty('--clamp-x', newClampX)
        }
        if (panel.style.getPropertyValue('--clamp-y') !== newClampY) {
          panel.style.setProperty('--clamp-y', newClampY)
        }
      }
    }

    apply()

    // 视口尺寸变化：重新修正
    const onResize = () => apply()
    window.addEventListener('resize', onResize)

    // 容器尺寸变化：重新修正
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => apply()) : undefined
    ro?.observe(root)

    // DOM 变更监听：面板的增删（聚焦面板切换）、宿主位置/方向 class 变化
    // 都会触发重新修正。使用微任务节流避免高频回调导致性能问题。
    let scheduled = false
    const scheduleApply = () => {
      if (scheduled) return
      scheduled = true
      Promise.resolve().then(() => {
        scheduled = false
        apply()
      })
    }
    const mo =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(scheduleApply)
        : undefined
    mo?.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    })

    // 字体加载完成后重新修正：字体异步加载会改变文本行高/宽度，导致面板尺寸变化
    let fontReadyHandled = false
    const onFontReady = () => {
      if (fontReadyHandled) return
      fontReadyHandled = true
      apply()
    }
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready.then(onFontReady).catch(() => {})
    }

    return () => {
      window.removeEventListener('resize', onResize)
      ro?.disconnect()
      mo?.disconnect()
      const panels = queryPanels()
      for (const panel of panels) {
        panel.style.removeProperty('--clamp-x')
        panel.style.removeProperty('--clamp-y')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, selector, padding, ...deps])
}
