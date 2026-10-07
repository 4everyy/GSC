/**
 * @file useMapAnchorSync.ts
 * @description useMapAnchorSync.ts（自 hooks/index.ts 拆出）—— 拖拽位置 + 地理锚定组合 hook： 种子模式播种 / 屏幕固化模式反算、moveend 重投影、按包持久化。独立于拖拽实现独立变化。
 * @author 4everyy
 * @date 2026-10-07
 */
import { useCallback, useEffect, useRef } from 'react'
import { type LngLat, type MapAdapter } from '../map-engines/types'
import { createStageProjector, queryStageEl, saveScopedAnchors } from '../utils/index'
import { useDraggable, type DragPosition } from './useDraggable'

/** useMapAnchorSync —— 拖拽位置 + 地理锚定组合 hook。 */

interface UseMapAnchorSyncOptions {
  /** 地图适配器（null = 引擎未就绪，退化为纯拖拽） */
  adapter: MapAdapter | null
  /** useDraggable 原有参数 */
  count: number
  initialPositions: DragPosition[]
  containerSelector?: string
  /** 降级模式（无种子锚点）下的屏幕位置持久化键；种子模式下不使用 */
  storageKey?: string
  /** 种子地理锚点数组（与 count 一一对应）。 */
  initialAnchors?: LngLat[] | null
  /** 锚点持久化键前缀（如 'gcs:aircraft-anchors'） */
  anchorStorageKey?: string
  /** 锚点持久化作用域（当前离线地图包 id；null = 不持久化） */
  anchorScope?: string | null
}

const clampPct = (v: number) => Math.max(0, Math.min(100, v))

/** 地理锚定同步 hook。 */
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
    // 种子锚定模式下不持久化屏幕位置：刷新后由地理锚点直接投影到位，避免陈旧屏幕百分比闪现
    ...(initialAnchors || !storageKey ? {} : { storageKey }),
  })
  const { positions, draggingIndex, applyPositions } = draggable

  // 最新 positions / adapter 引用（避免 effect 频繁重挂）。
  const positionsRef = useRef(positions)
  useEffect(() => {
    positionsRef.current = positions
  }, [positions])
  const adapterRef = useRef(adapter)
  useEffect(() => {
    adapterRef.current = adapter
  }, [adapter])

  /** 地理锚点数组（ref 持有，不触发渲染）。 */
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
    // 锚定就绪（首锚点已固化）后才跟随拖拽结果刷新
    if (readyRef.current && anchorsRef.current !== null) {
      commitAnchorsFromScreen()
      persistAnchors()
    }
  }, [draggingIndex, commitAnchorsFromScreen, persistAnchors])

  /** 锚定初始化 + 地图事件：种子模式（initialAnchors 提供）引擎就绪立即播种并投影一次 */
  useEffect(() => {
    if (!adapter) return

    // 种子长度与 count 不符（配置变更竞态）时忽略种子，走屏幕固化兜底
    const seeds = initialAnchors && initialAnchors.length === count ? initialAnchors : null

    if (seeds) {
      // 立即固化种子锚点并投影一次：不待 move/flyTo 结束，flyTo 动画期间 move 每帧重投影，图标随视口飞入
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

    // 首个 moveend：视图首次稳定。
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
