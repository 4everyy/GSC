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
import { useCallback, useEffect, useRef } from 'react'
import { useDraggable, type DragPosition } from './useDraggable'
import type { LngLat, MapAdapter } from '../map-engines/types'
import { createStageProjector, queryStageEl, saveScopedAnchors } from '../utils/geoAnchor'

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

  // 最新 positions / adapter 引用（避免 effect 频繁重挂）
  const positionsRef = useRef(positions)
  positionsRef.current = positions
  const adapterRef = useRef(adapter)
  adapterRef.current = adapter

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