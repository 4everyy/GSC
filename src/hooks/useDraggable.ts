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
import { useCallback, useEffect, useRef, useState } from 'react'

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

  // 位置变化时持久化到 localStorage
  useEffect(() => {
    if (!storageKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(positions))
    } catch {
      // 存储失败（如隐私模式/配额满）：静默忽略，不影响拖拽功能
    }
  }, [positions, storageKey])

  // 用 ref 持有最新 positions，使 onDragStart 无需依赖 positions 从而保持稳定引用
  const positionsRef = useRef(positions)
  positionsRef.current = positions

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

  return {
    positions,
    draggingIndex,
    onDragStart,
    resetPosition,
    resetAll,
  }
}