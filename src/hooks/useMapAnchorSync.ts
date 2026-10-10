/**
 * @file useMapAnchorSync.ts
 * @description useMapAnchorSync.ts（自 hooks/index.ts 拆出）—— 图标位置 + 地理锚定组合 hook：种子模式播种 / 屏幕固化模式反算、moveend 重投影、按包持久化。（原「手动拖拽图标」能力已移除，图标位置完全由地理锚点投影驱动）
 * @author 4everyy
 * @date 2026-10-07
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { type LngLat, type MapAdapter } from '../map-engines/types'
import { createStageProjector, queryStageEl, saveScopedAnchors } from '../utils/index'

/** useMapAnchorSync —— 图标位置 + 地理锚定同步 hook（无拖拽交互）。 */

/** 舞台百分比坐标（沿用原 DragPosition 命名，兼容既有引用） */
export interface DragPosition {
  /** 水平百分比 0-100 */
  x: number
  /** 垂直百分比 0-100 */
  y: number
}

interface UseMapAnchorSyncOptions {
  /** 地图适配器（null = 引擎未就绪，显示初始/恢复位置） */
  adapter: MapAdapter | null
  /** 图标数量 */
  count: number
  /** 初始位置数组（百分比） */
  initialPositions: DragPosition[]
  /** 容器选择器，用于反算地理锚点（默认 '.map-stage'） */
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
  const [positions, setPositions] = useState<DragPosition[]>(() => {
    // 种子锚定模式 / 无存储键：直接用初始位置（种子模式下随即由地理锚点投影覆盖），
    // 避免陈旧屏幕百分比闪现
    if (initialAnchors || !storageKey) return initialPositions
    // 降级模式：首次加载时尝试从 localStorage 恢复上次位置
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
    return initialPositions
  })

  // 位置变化时持久化到 localStorage（防抖 300ms）：地图 move 每渲染帧重投影会高频更新 positions
  const persistTimer = useRef<number | null>(null)
  useEffect(() => {
    if (!storageKey) return
    if (persistTimer.current !== null) window.clearTimeout(persistTimer.current)
    persistTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(positions))
      } catch {
        // 存储失败（如隐私模式/配额满）：静默忽略
      }
    }, 300)
    return () => {
      if (persistTimer.current !== null) {
        window.clearTimeout(persistTimer.current)
        persistTimer.current = null
      }
    }
  }, [positions, storageKey])

  /** 外部整体替换位置数组（地图移动后按地理锚点重投影舞台百分比）。 */
  const applyPositions = useCallback((next: DragPosition[]) => {
    setPositions(next.map((p) => ({ ...p })))
  }, [])

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

  /** 把当前锚点按包持久化（种子播种后统一走此路径） */
  const persistAnchors = useCallback(() => {
    const anchors = anchorsRef.current
    if (!anchorStorageKey || !anchorScope || !anchors) return
    const map: Record<string, LngLat> = {}
    anchors.forEach((a, i) => {
      map[String(i)] = a
    })
    saveScopedAnchors(anchorStorageKey, anchorScope, map)
  }, [anchorStorageKey, anchorScope])

  /** 把当前屏幕位置反算为地理锚点（屏幕固化模式首次固化） */
  const commitAnchorsFromScreen = useCallback(() => {
    const current = positionsRef.current
    const stageEl = queryStageEl(containerSelector)
    const currentAdapter = adapterRef.current
    if (!stageEl || !currentAdapter) return
    const projector = createStageProjector(currentAdapter, stageEl)
    anchorsRef.current = current.map((p) => projector.stagePctToLngLat(p.x, p.y))
  }, [containerSelector])

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

  return { positions, applyPositions, getAnchor }
}