/**
 * useMapDisplay —— 消费「地图资源切换」全局状态的便捷 hook。
 *
 * 必须在 <MapDisplayProvider> 内部使用，否则抛错以便尽早发现 Provider 缺失。
 */
import { useContext } from 'react'
import { MapDisplayContext, type MapDisplayContextValue } from './MapDisplayContext'

export function useMapDisplay(): MapDisplayContextValue {
  const ctx = useContext(MapDisplayContext)
  if (!ctx) {
    throw new Error('useMapDisplay 必须在 <MapDisplayProvider> 内部使用')
  }
  return ctx
}

export { MapDisplayProvider } from './MapDisplayContext'
export type { MapDisplayContextValue, MapDisplayState } from './MapDisplayContext'
