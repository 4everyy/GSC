/**
 * @file useTargetListRefresh.ts
 * @description 目标列表刷新交互 Hook：旋转动画 + 结果 toast
 * @author 4everyy
 * @date 2026-10-07
 */
import { useEffect, useRef, useState } from 'react'
import { useTargetLinkStore } from '../../stores/targetLinkStore'

/** Refresh spin duration (ms), matches CSS animation. */
const REFRESH_SPIN_MS = 1200

/** Refresh-done toast hold time (ms). */
const REFRESH_DONE_MS = 1600

/** Refresh-fail toast hold time (ms). */
const REFRESH_FAIL_MS = 2500

/** Refresh status: idle / refreshing / done / failed. */
export type TargetRefreshStatus = 'idle' | 'refreshing' | 'done' | 'failed'

/* useTargetListRefresh: mock refresh flow (unselect all + restore soft-deleted), timers included. */
export function useTargetListRefresh() {
  const [refreshStatus, setRefreshStatus] = useState<TargetRefreshStatus>('idle')
  const refreshTimer = useRef<number | null>(null)
  const refreshDoneTimer = useRef<number | null>(null)
  const replaceSelectedIds = useTargetLinkStore((s) => s.setSelectedTargetIds)
  const restoreTargets = useTargetLinkStore((s) => s.restoreTargets)

  // clear timers on unmount
  useEffect(() => {
    return () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
      if (refreshDoneTimer.current !== null) window.clearTimeout(refreshDoneTimer.current)
    }
  }, [])

  /** 刷新收尾：切「刷新完成/失败」提示，停留 REFRESH_DONE_MS/REFRESH_F… */
  const finishRefresh = (status: 'done' | 'failed') => {
    setRefreshStatus(status)
    const stayMs = status === 'done' ? REFRESH_DONE_MS : REFRESH_FAIL_MS
    if (refreshDoneTimer.current !== null) window.clearTimeout(refreshDoneTimer.current)
    refreshDoneTimer.current = window.setTimeout(() => {
      refreshDoneTimer.current = null
      setRefreshStatus('idle')
    }, stayMs)
  }

  /** 点击刷新：纯前端 mock 刷新（取消全选 + 恢复「假删除」目标） */
  const handleRefresh = () => {
    if (refreshStatus === 'refreshing') return
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
    if (refreshDoneTimer.current !== null) window.clearTimeout(refreshDoneTimer.current)
    // 刷新时取消所有行的选中状态（走 store，同步取消地图图标选中态）
    replaceSelectedIds(new Set())
    // 恢复全部「假删除」的目标（mock 数据保留在 store，刷新恢复显示）
    restoreTargets()
    setRefreshStatus('refreshing')
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null
      finishRefresh('done')
    }, REFRESH_SPIN_MS)
  }

  return { refreshStatus, handleRefresh }
}
