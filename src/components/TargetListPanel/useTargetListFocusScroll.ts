/**
 * @file useTargetListFocusScroll.ts
 * @description 目标列表聚焦滚动 Hook：地图选中联动行居中
 * @author 4everyy
 * @date 2026-10-07
 */
import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { useTargetLinkStore } from '../../stores/targetLinkStore'
import { type TargetItem } from '../../config/index'

/** Focus scroll: consecutive-frame delta below this = layout stable. */
const FOCUS_STABLE_DELTA_PX = 0.5

/** Focus scroll: max retry frames (~1s) before giving up centering. */
const FOCUS_MAX_ATTEMPTS = 60

interface UseTargetListFocusScrollOptions {
  /** list scroll container ref */
  listRef: RefObject<HTMLDivElement | null>
  targets: TargetItem[]
  deletedIds: Set<string>
  typeFilter: string
  setTypeFilter: (v: string) => void
  setExpandedId: Dispatch<SetStateAction<string | null>>
}

/* useTargetListFocusScroll: expand target row + scroll to center on focus request. */
export function useTargetListFocusScroll({
  listRef,
  targets,
  deletedIds,
  typeFilter,
  setTypeFilter,
  setExpandedId,
}: UseTargetListFocusScrollOptions) {
  const focusTargetRequest = useTargetLinkStore((s) => s.focusTargetRequest)
  const clearFocusTargetRequest = useTargetLinkStore((s) => s.clearFocusTargetRequest)

  useEffect(() => {
    if (!focusTargetRequest) return
    const { id, expand } = focusTargetRequest
    // 规避 effect 内同步 setState…
    let raf = 0
    const run = () => {
      // 取消选中：收起该行详情（仅当展开的正是该行），无需滚动，直接消费
      if (!expand) {
        setExpandedId((prev) => (prev === id ? null : prev))
        clearFocusTargetRequest()
        return
      }
      const target = targets.find((t) => t.id === id)
      // 目标不存在或已被「假删除」：仅消费请求，不展开不滚动
      if (!target || deletedIds.has(id)) {
        clearFocusTargetRequest()
        return
      }
      // 当前类型筛选会隐藏该行时重置为「请选择」，保证目标行可见
      if (typeFilter !== '请选择' && target.type !== typeFilter) {
        setTypeFilter('请选择')
      }
      // 手风琴式展开：仅该行展开，其余行收起（已是该行则保持）
      setExpandedId(id)
      // rAF 重试循环：行进入 DOM 且几何位置连续两帧稳定后才计算居中滚动
      let lastTop = Number.NaN
      let stableFrames = 0
      let attempts = 0
      const tick = () => {
        const list = listRef.current
        const row = list?.querySelector<HTMLElement>(`[data-target-id="${CSS.escape(id)}"]`)
        if (list && row && row.offsetHeight > 0) {
          const top = row.getBoundingClientRect().top
          if (Number.isFinite(lastTop) && Math.abs(top - lastTop) < FOCUS_STABLE_DELTA_PX) {
            stableFrames += 1
          } else {
            stableFrames = 0
          }
          lastTop = top
          if (stableFrames >= 2) {
            // 布局已稳定：行中心对齐列表可视区中心（rect 差值换算，不受嵌套定位影响）
            const listRect = list.getBoundingClientRect()
            const rowRect = row.getBoundingClientRect()
            list.scrollTop +=
              rowRect.top + rowRect.height / 2 - (listRect.top + list.clientHeight / 2)
            // 居中完成后消费请求
            clearFocusTargetRequest()
            return
          }
        }
        attempts += 1
        if (attempts >= FOCUS_MAX_ATTEMPTS) {
          // 兜底：超时仍未稳定则放弃本次居中，仅消费请求避免悬挂
          clearFocusTargetRequest()
          return
        }
        raf = window.requestAnimationFrame(tick)
      }
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(run)
    return () => window.cancelAnimationFrame(raf)
  }, [focusTargetRequest, targets, deletedIds, typeFilter, clearFocusTargetRequest])
}
