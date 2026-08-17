/**
 * MBTiles 解析与导入（sql.js + IndexedDB）。
 *
 * 流程：
 * 1. 读取 .mbtiles 文件为 ArrayBuffer（MBTiles 本质是 SQLite）；
 * 2. 用 sql.js 在浏览器内打开该 SQLite（wasm 内存库）；
 * 3. 解析 metadata 表（name/format/bounds/center/minzoom/maxzoom）；
 * 4. 流式遍历 tiles 表，TMS→XYZ 翻转后分批写入 IndexedDB；
 * 5. 构造 OfflinePackageMeta 并写入 packages 存储；
 * 6. 关闭 sql.js Database（释放 wasm 内存）。
 *
 * 关键点：
 * - tile_row 为 TMS 规范（原点左下角），需翻转为 XYZ（原点左上角）：
 *     y_xyz = (2^z - 1) - y_tms
 * - tile_data（BLOB）来自 wasm 堆内存，db.close 后即释放，故写入前必须 .slice() 拷贝。
 * - 分批写入（每批 BATCH_SIZE 条）避免单事务过大被 IndexedDB 中止。
 */
import type { OfflinePackageMeta, TileFormat } from './types'
import type { BBox } from './cityDatabase'
import type { SqlJsDatabase } from './sqljs'
import { getSqlJs } from './sqljs'
import {
  countPackageTiles,
  deletePackage,
  deletePackageTiles,
  putPackage,
  putTileBatch,
  type TileRecord,
} from './indexedDb'

/** 每批写入 IndexedDB 的瓦片数（平衡事务大小与吞吐） */
const BATCH_SIZE = 500

/** 导入进度回调参数 */
export interface ImportProgress {
  /** 已写入瓦片数 */
  written: number
  /** 瓦片总数 */
  total: number
}

/**
 * 把文件名转为 URL 安全的包 id。
 *
 * `suzhou.mbtiles` → `suzhou`；`My Package.mbtiles` → `my-package`。
 */
export function slugifyPackageId(fileName: string): string {
  return (
    fileName
      .trim()
      .replace(/\.mbtiles$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'offline-package'
  )
}

/** 执行 SQL 并取首结果集的首行（exec 包装） */
function execFirstRow(db: SqlJsDatabase, sql: string): unknown[] | null {
  const result = db.exec(sql)
  if (result.length === 0) return null
  const first = result[0]
  return first.values.length > 0 ? first.values[0] : null
}

/** 读取 metadata 表为 Map */
function readMetadata(db: SqlJsDatabase): Map<string, string> {
  const map = new Map<string, string>()
  const result = db.exec('SELECT name, value FROM metadata')
  if (result.length > 0) {
    for (const row of result[0].values) {
      const [k, v] = row
      if (typeof k === 'string') {
        map.set(k, typeof v === 'string' ? v : v == null ? '' : String(v))
      }
    }
  }
  return map
}

/**
 * 解析 bounds 字符串 "west,south,east,north" → BBox。
 * @throws 格式非法时抛错
 */
export function parseBounds(raw: string): BBox {
  const parts = raw.split(',').map((s) => Number(s.trim()))
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(`MBTiles bounds 格式非法：${raw}`)
  }
  const [west, south, east, north] = parts
  return { west, south, east, north }
}

/**
 * 解析 center 字符串 "lng,lat,zoom" → { lng, lat, zoom? }。
 * zoom 可缺省。
 */
export function parseCenter(raw: string): { lng: number; lat: number; zoom?: number } {
  const parts = raw.split(',').map((s) => Number(s.trim()))
  if (parts.length < 2 || parts.slice(0, 2).some((n) => Number.isNaN(n))) {
    throw new Error(`MBTiles center 格式非法：${raw}`)
  }
  return {
    lng: parts[0],
    lat: parts[1],
    zoom: parts.length >= 3 && !Number.isNaN(parts[2]) ? parts[2] : undefined,
  }
}

/** 规范化图片格式为 TileFormat */
function normalizeFormat(raw: string | undefined): TileFormat {
  const f = (raw ?? 'png').trim().toLowerCase()
  if (f === 'jpg' || f === 'jpeg' || f === 'png' || f === 'webp' || f === 'pbf') {
    return f
  }
  return 'png'
}

/**
 * 导入一个 .mbtiles 文件到 IndexedDB。
 *
 * @param file 用户选择的 .mbtiles 文件
 * @param options.sourceKey 可选，关联的城市数据源 key（用于「按城市切换」精确匹配）
 * @param options.onProgress 可选，每批写入后的进度回调
 * @returns 写入的离线包元数据（已持久化到 IndexedDB）
 * @throws 文件无法解析 / 非合法 MBTiles 时抛错
 */
export async function importMbtiles(
  file: File,
  options?: {
    sourceKey?: string
    onProgress?: (p: ImportProgress) => void
  },
): Promise<OfflinePackageMeta> {
  const id = slugifyPackageId(file.name)

  // 1. 读取文件二进制
  const buffer = await file.arrayBuffer()

  // 2. 用 sql.js 打开 SQLite（内存库）
  const SQL = await getSqlJs()
  const db = new SQL.Database(new Uint8Array(buffer))

  try {
    // 3. 校验 tiles 表存在
    const tableCheck = execFirstRow(
      db,
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tiles'",
    )
    if (!tableCheck) {
      throw new Error('该文件不是合法的 MBTiles（缺少 tiles 表）')
    }

    // 4. 解析 metadata
    const meta = readMetadata(db)
    const format = normalizeFormat(meta.get('format'))

    // 5. bounds：优先 metadata.bounds，缺省时用全球范围兜底
    const bounds: BBox = meta.get('bounds')
      ? parseBounds(meta.get('bounds')!)
      : { west: -180, south: -85, east: 180, north: 85 }

    // 6. minzoom / maxzoom：优先 metadata，缺省时从 tiles 表计算
    let minZoom = meta.get('minzoom') != null ? Number(meta.get('minzoom')) : NaN
    let maxZoom = meta.get('maxzoom') != null ? Number(meta.get('maxzoom')) : NaN
    if (Number.isNaN(minZoom) || Number.isNaN(maxZoom)) {
      const zoomRow = execFirstRow(db, 'SELECT MIN(zoom_level), MAX(zoom_level) FROM tiles')
      if (zoomRow && zoomRow.length >= 2) {
        if (Number.isNaN(minZoom)) minZoom = Number(zoomRow[0])
        if (Number.isNaN(maxZoom)) maxZoom = Number(zoomRow[1])
      } else {
        minZoom = Number.isNaN(minZoom) ? 0 : minZoom
        maxZoom = Number.isNaN(maxZoom) ? 18 : maxZoom
      }
    }

    // 7. center：优先 metadata.center，缺省时取 bounds 中心
    const centerRaw = meta.get('center')
    const center = centerRaw
      ? { lng: parseCenter(centerRaw).lng, lat: parseCenter(centerRaw).lat }
      : {
          lng: (bounds.west + bounds.east) / 2,
          lat: (bounds.south + bounds.north) / 2,
        }

    // 8. 瓦片总数
    const countRow = execFirstRow(db, 'SELECT COUNT(*) FROM tiles')
    const tileCount = countRow ? Number(countRow[0]) : 0

    // 9. 流式遍历瓦片，TMS→XYZ 翻转，分批写入 IndexedDB
    const stmt = db.prepare('SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles')
    let batch: TileRecord[] = []
    let written = 0
    try {
      while (stmt.step()) {
        const row = stmt.get()
        const z = row[0] as number
        const x = row[1] as number
        const tmsY = row[2] as number
        const tileData = row[3] as Uint8Array
        // TMS → XYZ 翻转：原点从左下角变为左上角
        const y = (1 << z) - 1 - tmsY
        // .slice() 拷贝脱离 wasm 堆（db.close 后原数据释放）
        batch.push({ pkgId: id, z, x, y, data: tileData.slice().buffer })
        if (batch.length >= BATCH_SIZE) {
          await putTileBatch(batch)
          written += batch.length
          batch = []
          options?.onProgress?.({ written, total: tileCount })
        }
      }
      // 尾批
      if (batch.length > 0) {
        await putTileBatch(batch)
        written += batch.length
        options?.onProgress?.({ written, total: tileCount })
      }
    } finally {
      stmt.free()
    }

    // 10. 构造元数据并持久化
    const packageMeta: OfflinePackageMeta = {
      id,
      name: meta.get('name') || file.name.replace(/\.mbtiles$/i, ''),
      format,
      tileSize: 256,
      minZoom,
      maxZoom,
      bounds,
      center,
      tileCount: written,
      importedAt: Date.now(),
      sourceKey: options?.sourceKey,
    }
    await putPackage(packageMeta)

    return packageMeta
  } finally {
    // 释放 sql.js 内存（无论成功失败）
    db.close()
  }
}

/**
 * 删除一个已导入的离线包（元数据 + 全部瓦片）。
 */
export async function removeMbtilesPackage(id: string): Promise<void> {
  await deletePackageTiles(id)
  await deletePackage(id)
}

/**
 * 校验指定包的瓦片完整性（IndexedDB 实际瓦片数 vs 元数据声明数）。
 */
export async function verifyPackageTiles(id: string, expected: number): Promise<boolean> {
  const actual = await countPackageTiles(id)
  return actual === expected
}
