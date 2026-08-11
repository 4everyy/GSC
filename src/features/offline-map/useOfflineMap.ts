/**
 * 消费离线地图全局状态的便捷 hook。
 *
 * 必须在 <OfflineMapProvider> 内部使用，否则抛错以便尽早发现 Provider 缺失。
 */

import { useContext } from 'react'
import { OfflineMapContext, type OfflineMapContextValue } from './OfflineMapContext'

export function useOfflineMap(): OfflineMapContextValue {
  const ctx = useContext(OfflineMapContext)
  if (!ctx) {
    throw new Error('useOfflineMap 必须在 <OfflineMapProvider> 内部使用')
  }
  return ctx
}

export { OfflineMapProvider } from './OfflineMapContext'
export type { OfflineMapContextValue, OfflineMapState, StartDownloadParams } from './OfflineMapContext'
