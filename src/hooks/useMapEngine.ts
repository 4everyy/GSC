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
import { useCallback, useState } from 'react'
import type { MapEngineInstance } from '../map-engines'

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