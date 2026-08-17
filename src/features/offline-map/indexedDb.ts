/**
 * 离线地图 IndexedDB 访问层（基于 idb v8）。
 *
 * 数据库结构（gcs-offline-map，version 1）：
 * - packages 存储：keyPath = id，保存 OfflinePackageMeta（已导入的离线包元数据）。
 * - tiles 存储：keyPath = [pkgId, z, x, y]（复合数组键），保存单张瓦片二进制。
 *   复合键使「按 包+z+x+y 精确取瓦片」退化为单次 db.get，零扫描；
 *   by-pkg 索引用于删除整个包的全部瓦片。
 *
 * 严格离线：本模块只读写本地 IndexedDB，不发起任何网络请求。
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { OfflinePackageMeta } from './types'

/** 单张瓦片记录（写入 tiles 存储） */
export interface TileRecord {
  /** 所属离线包 id（复合键第一段） */
  pkgId: string
  /** 缩放级别（复合键第二段，XYZ 规范） */
  z: number
  /** 列（复合键第三段，XYZ 规范） */
  x: number
  /** 行（复合键第四段，XYZ 规范，原点左上角） */
  y: number
  /** 瓦片图片二进制（png/jpg/webp，由 MapLibre raster source 按字节解码） */
  data: ArrayBuffer
}

/**
 * 离线地图数据库 Schema（idb 强类型描述）。
 *
 * packages.key 为 string（包 id）；tiles.key 为复合数组键 [pkgId,z,x,y]。
 */
export interface OfflineMapDB extends DBSchema {
  packages: {
    key: string
    value: OfflinePackageMeta
    indexes: { 'by-importedAt': number }
  }
  tiles: {
    key: [string, number, number, number]
    value: TileRecord
    indexes: { 'by-pkg': string }
  }
}

/** 数据库名 */
export const DB_NAME = 'gcs-offline-map'
/** 数据库版本 */
export const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<OfflineMapDB>> | null = null

/**
 * 获取（并懒加载缓存）离线地图数据库连接。
 *
 * 首次调用创建两个存储与索引；后续复用同一连接。
 */
export function getOfflineMapDB(): Promise<IDBPDatabase<OfflineMapDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineMapDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // packages 存储：主键 = id，按导入时间索引（列表排序用）
        if (!db.objectStoreNames.contains('packages')) {
          const pkgStore = db.createObjectStore('packages', { keyPath: 'id' })
          pkgStore.createIndex('by-importedAt', 'importedAt')
        }
        // tiles 存储：复合主键 [pkgId,z,x,y]，按包索引（删除整包用）
        if (!db.objectStoreNames.contains('tiles')) {
          const tileStore = db.createObjectStore('tiles', {
            keyPath: ['pkgId', 'z', 'x', 'y'],
          })
          tileStore.createIndex('by-pkg', 'pkgId')
        }
      },
    })
  }
  return dbPromise
}

// ============================ packages 存储访问 ============================

/** 读取全部已导入的离线包元数据（按导入时间降序，最新在前） */
export async function getAllPackages(): Promise<OfflinePackageMeta[]> {
  const db = await getOfflineMapDB()
  const all = await db.getAllFromIndex('packages', 'by-importedAt')
  return all.reverse()
}

/** 按 id 读取单个离线包元数据 */
export async function getPackage(id: string): Promise<OfflinePackageMeta | undefined> {
  const db = await getOfflineMapDB()
  return db.get('packages', id)
}

/** 写入（或覆盖）一个离线包元数据 */
export async function putPackage(meta: OfflinePackageMeta): Promise<void> {
  const db = await getOfflineMapDB()
  await db.put('packages', meta)
}

/** 删除一个离线包元数据（不删瓦片，需配合 deletePackageTiles） */
export async function deletePackage(id: string): Promise<void> {
  const db = await getOfflineMapDB()
  await db.delete('packages', id)
}

// ============================ tiles 存储访问 ============================

/**
 * 精确读取单张瓦片。
 *
 * 复合键查询，O(1)。未命中返回 undefined（调用方决定灰显）。
 */
export async function getTile(
  pkgId: string,
  z: number,
  x: number,
  y: number,
): Promise<TileRecord | undefined> {
  const db = await getOfflineMapDB()
  return db.get('tiles', [pkgId, z, x, y])
}

/**
 * 批量写入瓦片（导入用）。
 *
 * 单事务内逐条 put；调用方按 batchSize 分段调用，避免单事务过大被中止。
 * @returns 本次实际写入的条数
 */
export async function putTileBatch(records: TileRecord[]): Promise<number> {
  if (records.length === 0) return 0
  const db = await getOfflineMapDB()
  const tx = db.transaction('tiles', 'readwrite')
  await Promise.all(records.map((r) => tx.store.put(r)))
  await tx.done
  return records.length
}

/**
 * 删除指定包的全部瓦片（通过 by-pkg 索引遍历删除）。
 *
 * 用于删除离线包时清理其瓦片数据。
 */
export async function deletePackageTiles(pkgId: string): Promise<void> {
  const db = await getOfflineMapDB()
  const tx = db.transaction('tiles', 'readwrite')
  let cursor = await tx.store.index('by-pkg').openCursor(pkgId)
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}

/**
 * 统计指定包的瓦片总数（导入后校验 / UI 展示用）。
 */
export async function countPackageTiles(pkgId: string): Promise<number> {
  const db = await getOfflineMapDB()
  return db.countFromIndex('tiles', 'by-pkg', pkgId)
}
