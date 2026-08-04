/**
 * useMapEngine —— 地图引擎状态管理 Hook。
 *
 * 职责：
 * - 持有当前选中的地图引擎类型（'baidu' | 'maplibre'）；
 * - 持有 MapEngineInstance（由对应 Container 的 onReady 注入）；
 * - 切换引擎时自动清理旧引擎的覆盖物，避免残留。
 *
 * 设计要点：
 * - engineType 与 engineInstance 分离：engineType 决定渲染哪个 Container，
 *   engineInstance 由 Container 异步初始化后回传；
 * - 切换引擎时 engineInstance 会先变 null（旧 Container 卸载），
 *   再变新实例（新 Container 挂载），业务组件通过 adapter?. 可选链安全访问。
 */
import { useCallback, useState } from 'react'
import type { MapEngineInstance, MapEngineType } from '../map-engines'

export function useMapEngine(initialEngine: MapEngineType = 'baidu') {
  const [engineType, setEngineType] = useState<MapEngineType>(initialEngine)
  const [engineInstance, setEngineInstance] = useState<MapEngineInstance | null>(null)

  /** 切换引擎类型（会触发 Container 卸载/挂载） */
  const switchEngine = useCallback((next: MapEngineType) => {
    // 切换前清理旧引擎的覆盖物（若存在）
    setEngineInstance((prev) => {
      prev?.adapter.destroy()
      return null
    })
    setEngineType(next)
  }, [])

  /** Container onReady 回调：注入新引擎实例 */
  const handleEngineReady = useCallback((instance: MapEngineInstance) => {
    setEngineInstance(instance)
  }, [])

  return {
    /** 当前引擎类型 */
    engineType,
    /** 当前引擎实例（可能为 null：初始化中或切换中） */
    engineInstance,
    /** 适配器（engineInstance?.adapter 的简写） */
    adapter: engineInstance?.adapter ?? null,
    /** 切换引擎 */
    switchEngine,
    /** Container onReady 绑定此回调 */
    onEngineReady: handleEngineReady,
  }
}