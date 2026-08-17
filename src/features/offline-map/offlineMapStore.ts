/**
 * 离线地图状态管理（zustand）。
 *
 * 单一数据源管理：
 * - packages：已导入的离线包列表（从 IndexedDB 加载）；
 * - activePackageId：当前激活的包（决定渲染哪个包的瓦片）；
 * - status / error / importProgress：导入与加载状态，驱动 UI。
 *
 * 严格离线：所有 action 仅读写本地 IndexedDB；唯一例外是 ensureCityPackage
 * 从项目内置的同源静态目录 public/maps/ 拉取预构建 mbtiles（非在线瓦片源）。
 */
import { create } from 'zustand'
import type { StyleSpecification } from 'maplibre-gl'
import type { OfflinePackageMeta } from './types'
import { getAllPackages } from './indexedDb'
import { importMbtiles, removeMbtilesPackage } from './mbtilesLoader'
import { buildRasterStyle } from './styleBuilder'
import { findCityName } from './cityDatabase'

/**
 * 离线地图包的本地存放目录（Vite public 同源静态资源）。
 *
 * 运维用 prepare-data.ps1 生成 {城市key}.mbtiles 后放入 public/maps/，
 * 前端切换城市时按 key 同名拉取（仅同源文件，绝不访问在线瓦片源）。
 */
export const MAPS_PUBLIC_DIR = '/maps'

/**
 * 构造城市离线包的**同源** URL（严格离线：仅允许同源静态目录 public/maps/，
 * 杜绝在线绝对地址 / Esri / tileserver 等回源）。
 *
 * cityKey 仅允许小写字母/数字/连字符，既防 path traversal，也防「城市 key」被注入为
 * 在线 URL（如 `//evil.com/x`、`https://...`）。
 * @throws cityKey 非法时抛错
 */
export function buildCityPackageUrl(cityKey: string): string {
  if (!/^[a-z0-9-]+$/.test(cityKey)) {
    throw new Error(
      `非法城市 key（严格离线仅允许同源静态目录 public/maps/）：${cityKey}`,
    )
  }
  return `${MAPS_PUBLIC_DIR}/${cityKey}.mbtiles`
}

/** 离线地图整体状态 */
export type OfflineMapStatus = 'idle' | 'loading' | 'importing' | 'ready' | 'error'

/** 导入进度 */
export interface ImportProgressState {
  written: number
  total: number
}

/** zustand store 形状 */
interface OfflineMapState {
  /** 已导入的离线包（按导入时间降序） */
  packages: OfflinePackageMeta[]
  /** 当前激活的包 id（null = 未激活，渲染占位底图） */
  activePackageId: string | null
  /** 状态机：idle→loading→ready / idle→importing→ready / →error */
  status: OfflineMapStatus
  /** 错误信息（status=error 时有值） */
  error: string | null
  /** 导入进度（status=importing 时有值） */
  importProgress: ImportProgressState | null

  // ============ Actions ============

  /** 从 IndexedDB 加载已导入的离线包列表（应用初始化 / 导入后刷新） */
  loadPackages: () => Promise<void>
  /** 导入 .mbtiles 文件（解析→存储→自动激活） */
  importPackage: (file: File, sourceKey?: string) => Promise<OfflinePackageMeta | null>
  /** 删除离线包（若删除的是激活包则清除激活） */
  removePackage: (id: string) => Promise<void>
  /** 切换激活包（null 表示回到占位底图） */
  setActivePackage: (id: string | null) => void
  /**
   * 确保指定城市的离线包可用并激活：
   * - 已导入 → 直接激活；
   * - 未导入 → 从 public/maps/{key}.mbtiles（同源）拉取并导入后激活；
   * - 静态文件缺失 → error 态 + 可操作提示。
   * @returns 激活的包 id；失败返回 null
   */
  ensureCityPackage: (cityKey: string) => Promise<string | null>
}

export const useOfflineMapStore = create<OfflineMapState>((set, get) => ({
  packages: [],
  activePackageId: null,
  status: 'idle',
  error: null,
  importProgress: null,

  loadPackages: async () => {
    set({ status: 'loading', error: null })
    try {
      const packages = await getAllPackages()
      set({ packages, status: 'ready' })
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : '加载离线包列表失败',
      })
    }
  },

  importPackage: async (file, sourceKey) => {
    set({ status: 'importing', error: null, importProgress: { written: 0, total: 0 } })
    try {
      const meta = await importMbtiles(file, {
        sourceKey,
        onProgress: (p) => set({ importProgress: { written: p.written, total: p.total } }),
      })
      // 刷新列表并自动激活新导入的包
      const packages = await getAllPackages()
      set({
        packages,
        activePackageId: meta.id,
        status: 'ready',
        importProgress: null,
      })
      return meta
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : '导入离线包失败',
        importProgress: null,
      })
      return null
    }
  },

  removePackage: async (id) => {
    try {
      await removeMbtilesPackage(id)
      const packages = await getAllPackages()
      const wasActive = get().activePackageId === id
      set({
        packages,
        // 删除激活包时，若仍有其他包则自动切到第一个，否则回到占位底图
        activePackageId: wasActive ? (packages[0]?.id ?? null) : get().activePackageId,
      })
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : '删除离线包失败',
      })
    }
  },

  setActivePackage: (id) => set({ activePackageId: id }),

  ensureCityPackage: async (cityKey) => {
    if (!cityKey) return null
    // 1. 已导入该城市 → 直接激活，无需重复拉取
    const existing = get().packages.find((p) => p.sourceKey === cityKey || p.id === cityKey)
    if (existing) {
      set({ activePackageId: existing.id })
      return existing.id
    }
    // 2. 未导入 → 从项目内置同源目录 public/maps/{key}.mbtiles 拉取
    //    （importProgress=null 表示处于「下载/准备」阶段，UI 显示「正在加载离线数据…」）
    set({ status: 'importing', error: null, importProgress: null })
    try {
      // 严格离线：仅从同源静态目录 public/maps/{key}.mbtiles 拉取，
      // buildCityPackageUrl 校验 key 仅含 a-z0-9- 并构造同源 URL，杜绝在线回源。
      const resp = await fetch(buildCityPackageUrl(cityKey))
      if (!resp.ok) {
        throw new Error(
          `「${findCityName(cityKey) ?? cityKey}」尚未准备离线数据：请将 ${cityKey}.mbtiles 放入 public/maps/ 后重试（可用 prepare-data.ps1 生成）`,
        )
      }
      const blob = await resp.blob()
      // 以 {key}.mbtiles 命名构造 File，使 slugify→id、findCityName→sourceKey 自动对齐城市
      const file = new File([blob], `${cityKey}.mbtiles`, { type: 'application/octet-stream' })
      const meta = await importMbtiles(file, {
        sourceKey: cityKey,
        onProgress: (p) => set({ importProgress: { written: p.written, total: p.total } }),
      })
      const packages = await getAllPackages()
      set({ packages, activePackageId: meta.id, status: 'ready', importProgress: null })
      return meta.id
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : '加载城市离线数据失败',
        importProgress: null,
      })
      return null
    }
  },
}))

// ============================ 派生选择器 ============================

/**
 * 计算当前激活包对应的栅格样式（供 MapLibreContainer.styleSpec 使用）。
 *
 * 无激活包时返回 null（MapLibreContainer 回退到占位底图）。
 *
 * ⚠️ 严禁直接作为 zustand 选择器使用：`useOfflineMapStore(selectActiveStyle)` 。
 *    buildRasterStyle 每次返回全新对象，会破坏 useSyncExternalStore 的快照稳定性
 *    契约 → 无限重渲染 → 整页白屏（参见 useOfflineMap.ts 的修复说明）。
 *    React 接入请改用 useOfflineMap()（内部以 useMemo 基于引用稳定的 activePackage 派生）。
 *    本选择器仅供非 React 上下文（如一次性 getState() 派生）使用。
 */
export function selectActiveStyle(state: OfflineMapState): StyleSpecification | null {
  if (!state.activePackageId) return null
  const pkg = state.packages.find((p) => p.id === state.activePackageId)
  if (!pkg) return null
  return buildRasterStyle(pkg)
}
