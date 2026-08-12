/**
 * IndexedDB 封装层 —— 瓦片缓存 + 下载任务持久化的唯一数据访问入口。
 *
 * 设计依据：docs/离线地图下载方案.md §5.2。
 *
 * 使用 `idb` 库（package.json 已声明 ^8.0.3）封装原生 IndexedDB，
 * 提供 Promise 化的 get/put/delete/cursor 统计接口。所有模块（运行时缓存
 * 拦截、批量下载引擎、LocalTab 管理）均通过本模块读写，保证键空间一致。
 */

import { openDB, type IDBPDatabase } from 'idb'
import type { CacheGroupStat, DownloadTask, TileCacheRecord } from './types'

/** IndexedDB 数据库名 */
const DB_NAME = 'gcs-tile-cache'
/** 数据库版本（schema 变更时递增） */
const DB_VERSION = 1
/** 瓦片存储（主键 key = 归一化请求路径） */
const STORE_TILES = 'tiles'
/** 下载任务存储（主键 id） */
const STORE_TASKS = 'tasks'

/** style.json 缓存的特殊 sourceId 标记（与真实瓦片区分，统计时过滤） */
export const STYLE_SOURCE_ID = '__style__'
/** style.json 缓存的 z 哨兵（真实瓦片 z >= 0） */
const STYLE_Z_SENTINEL = -1

let dbPromise: Promise<IDBPDatabase> | null = null

/**
 * 获取（惰性初始化）IndexedDB 单例连接。
 *
 * 整个应用生命周期只打开一次，后续复用同一 Promise，避免重复建连开销。
 * 升级回调中创建 tiles / tasks 两个 object store（幂等）。
 */
function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_TILES)) {
          db.createObjectStore(STORE_TILES, { keyPath: 'key' })
        }
        if (!db.objectStoreNames.contains(STORE_TASKS)) {
          db.createObjectStore(STORE_TASKS, { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

/** 读取单个瓦片缓存 */
export async function getTile(
  key: string,
): Promise<TileCacheRecord | undefined> {
  return (await getDB()).get(STORE_TILES, key)
}

/** 批量读取多个瓦片（单只读事务，减少往返），顺序与 keys 对齐 */
export async function getTiles(
  keys: string[],
): Promise<(TileCacheRecord | undefined)[]> {
  if (keys.length === 0) return []
  const db = await getDB()
  const tx = db.transaction(STORE_TILES, 'readonly')
  const results = await Promise.all(keys.map((k) => tx.store.get(k)))
  await tx.done
  return results
}

/** 写入/更新单个瓦片缓存 */
export async function putTile(rec: TileCacheRecord): Promise<void> {
  await (await getDB()).put(STORE_TILES, rec)
}

/**
 * 按 sourceId（路径前缀）删除瓦片，返回已删除数量。
 *
 * 通过游标遍历，避免全量加载到内存。
 */
export async function deleteTilesBySource(sourceId: string): Promise<number> {
  const db = await getDB()
  const tx = db.transaction(STORE_TILES, 'readwrite')
  let cursor = await tx.store.openCursor()
  let deleted = 0
  while (cursor) {
    if (cursor.value.sourceId === sourceId) {
      await cursor.delete()
      deleted++
    }
    cursor = await cursor.continue()
  }
  await tx.done
  return deleted
}

/**
 * 按 key 集合精确删除瓦片（作用域删除），返回实际删除数量。
 *
 * 用于「按任务/区域清除」场景：只删除传入 key 对应的瓦片，不影响同 sourceId
 * 下其他区域/任务的缓存，修复「清除一个区域却误删整个数据源」的缺陷。
 * 仅删除确实存在的 key（get 命中才 delete），计数与实际删除条数一致。
 */
export async function deleteTilesByKeys(keys: string[]): Promise<number> {
  if (keys.length === 0) return 0
  const db = await getDB()
  const tx = db.transaction(STORE_TILES, 'readwrite')
  let deleted = 0
  for (const key of keys) {
    if (await tx.store.get(key)) {
      await tx.store.delete(key)
      deleted++
    }
  }
  await tx.done
  return deleted
}

/** 清空全部瓦片缓存 */
export async function clearAllTiles(): Promise<void> {
  const db = await getDB()
  await db.clear(STORE_TILES)
}

/** 清空全部下载任务记录（tasks store） */
export async function clearAllTasks(): Promise<void> {
  const db = await getDB()
  await db.clear(STORE_TASKS)
}

/**
 * 全表扫描，按 sourceId 聚合统计（供 LocalTab 展示）。
 *
 * 过滤掉 STYLE_SOURCE_ID 标记的 style.json 缓存，仅统计真实瓦片。
 */
export async function getCacheStats(): Promise<CacheGroupStat[]> {
  const db = await getDB()
  const tx = db.transaction(STORE_TILES, 'readonly')
  const map = new Map<string, CacheGroupStat>()
  let cursor = await tx.store.openCursor()
  while (cursor) {
    const rec = cursor.value as TileCacheRecord
    if (rec.sourceId !== STYLE_SOURCE_ID) {
      const acc = map.get(rec.sourceId) ?? {
        sourceId: rec.sourceId,
        label: rec.sourceId,
        count: 0,
        bytes: 0,
        minZoom: rec.z,
        maxZoom: rec.z,
        lastCachedAt: 0,
      }
      acc.count++
      acc.bytes += rec.blob.size
      acc.minZoom = Math.min(acc.minZoom, rec.z)
      acc.maxZoom = Math.max(acc.maxZoom, rec.z)
      acc.lastCachedAt = Math.max(acc.lastCachedAt, rec.cachedAt)
      map.set(rec.sourceId, acc)
    }
    cursor = await cursor.continue()
  }
  await tx.done
  return Array.from(map.values())
}

/** 读取全部下载任务（刷新恢复用） */
export async function getAllTasks(): Promise<DownloadTask[]> {
  const all = await (await getDB()).getAll(STORE_TASKS)
  return all as DownloadTask[]
}

/** 写入/更新下载任务（持久化进度） */
export async function putTask(task: DownloadTask): Promise<void> {
  await (await getDB()).put(STORE_TASKS, task)
}

/** 删除下载任务记录 */
export async function deleteTask(id: string): Promise<void> {
  await (await getDB()).delete(STORE_TASKS, id)
}

// ===================== style.json 缓存（离线回退） =====================

/**
 * 缓存 style.json 文本（用于断网时回退加载底图样式）。
 *
 * style.json 是文本资源，存入 tiles store，以 sourceId=STYLE_SOURCE_ID
 * 与 z 哨兵标记，统计接口会自动过滤。
 */
export async function putStyle(
  key: string,
  text: string,
  contentType = 'application/json',
): Promise<void> {
  await (await getDB()).put(STORE_TILES, {
    key,
    sourceId: STYLE_SOURCE_ID,
    z: STYLE_Z_SENTINEL,
    x: 0,
    y: 0,
    blob: new Blob([text], { type: contentType }),
    contentType,
    cachedAt: Date.now(),
  } satisfies TileCacheRecord)
}

/** 读取缓存的 style.json 文本（无缓存返回 undefined） */
export async function getStyle(
  key: string,
): Promise<string | undefined> {
  const rec = await getTile(key)
  if (!rec || rec.sourceId !== STYLE_SOURCE_ID) return undefined
  return rec.blob.text()
}

// ===================== 存储配额与持久化 =====================

/**
 * 查询存储配额（已用 usage / 总额 quota，单位字节）。
 *
 * 不支持 Storage API 的环境（如 SSR / 老旧浏览器）返回 0。
 */
export async function getCacheEstimate(): Promise<{
  usage: number
  quota: number
}> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usage: 0, quota: 0 }
  }
  const { usage = 0, quota = 0 } = await navigator.storage.estimate()
  return { usage, quota }
}

/**
 * 请求持久化存储，避免浏览器在低空间时自动清理瓦片缓存（依据 §6.4）。
 *
 * 返回是否已处于持久化状态（已请求成功或本来就是）。
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return false
  }
  if (navigator.storage.persisted && (await navigator.storage.persisted())) {
    return true
  }
  return navigator.storage.persist()
}

/**
 * 检测当前环境是否支持离线缓存所需的 Web API。
 *
 * 隐私模式下 IndexedDB 可能受限，调用方应据此提示用户（依据 §10 风险）。
 */
export function isOfflineCacheSupported(): boolean {
  return typeof indexedDB !== 'undefined'
}
