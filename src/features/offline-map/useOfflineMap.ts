/**
 * useOfflineMap —— 离线地图 React 接入 Hook。
 *
 * 职责：
 * - 应用挂载时注册 gcs-pkg:// 协议（幂等）；
 * - 应用挂载时从 IndexedDB 加载已导入的离线包列表；
 * - 暴露派生的栅格样式（供 MapLibreContainer.styleSpec）与激活包元数据。
 *
 * 严格离线：本 Hook 不触发任何网络请求，协议仅读 IndexedDB。
 */
import { useEffect, useMemo } from 'react'
import type { StyleSpecification } from 'maplibre-gl'
import { useOfflineMapStore } from './offlineMapStore'
import { buildRasterStyle } from './styleBuilder'
import { registerTileProtocol } from './tileProtocol'
import type { OfflinePackageMeta } from './types'

/** Hook 返回值 */
export interface UseOfflineMapResult {
  /** 当前激活包的栅格样式（无激活包时为 null → 占位底图） */
  activeStyle: StyleSpecification | null
  /** 当前激活包元数据（用于飞行定位中心点 / UI 展示） */
  activePackage: OfflinePackageMeta | null
  /** 已导入的离线包列表 */
  packages: OfflinePackageMeta[]
  /** 激活包 id */
  activePackageId: string | null
  /** 加载/导入状态 */
  status: ReturnType<typeof useOfflineMapStore.getState>['status']
  /** 错误信息 */
  error: string | null
}

/**
 * 接入离线地图：注册协议 + 加载包列表 + 派生活跃样式。
 *
 * 在 HomePage 调用一次即可。
 */
export function useOfflineMap(): UseOfflineMapResult {
  // 注册协议（幂等，模块级 registered 标志防重复）
  useEffect(() => {
    registerTileProtocol()
  }, [])

  // 加载已导入的包列表
  const loadPackages = useOfflineMapStore((s) => s.loadPackages)
  useEffect(() => {
    void loadPackages()
  }, [loadPackages])

  // 订阅 store 字段
  const packages = useOfflineMapStore((s) => s.packages)
  const activePackageId = useOfflineMapStore((s) => s.activePackageId)
  const status = useOfflineMapStore((s) => s.status)
  const error = useOfflineMapStore((s) => s.error)

  // 派生活跃包：仅在 packages / activePackageId 变化时重算，引用稳定
  const activePackage = useMemo(
    () => packages.find((p) => p.id === activePackageId) ?? null,
    [packages, activePackageId],
  )

  // 派生活跃样式：必须基于「引用稳定」的 activePackage 做 useMemo。
  // ⚠️ 严禁直接把 selectActiveStyle 作为 store 选择器传入 useOfflineMapStore() ——
  //    buildRasterStyle 每次调用都返回全新对象，会破坏 useSyncExternalStore 的快照
  //    稳定性契约（默认 Object.is 比较恒为不等），React 会判定「store 在渲染期间
  //    持续变化」→ 无限重渲染 → Maximum update depth exceeded → 整页白屏。
  //    这正是「启用苏州离线包即白屏」的根因。
  const activeStyle = useMemo(
    () => (activePackage ? buildRasterStyle(activePackage) : null),
    [activePackage],
  )

  return { activeStyle, activePackage, packages, activePackageId, status, error }
}
