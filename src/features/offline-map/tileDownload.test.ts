import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock tileCache（IndexedDB 层），使测试不依赖真实数据库 ──
vi.mock('./tileCache', () => ({
  getTile: vi.fn(),
  getTiles: vi.fn(),
  putTile: vi.fn(),
}))

import {
  AVG_TILE_SIZE,
  contentTypeForBasemap,
  lonLatToTile,
  enumerateTiles,
  estimateDownload,
  buildTileUrl,
  deriveSourceId,
  downloadTiles,
  probeTileSource,
} from './tileDownload'
import { getTiles, putTile } from './tileCache'
import type { BBox, TileCacheRecord, TileCoord } from './types'

// ===================== 纯函数：content-type / 预估常量 =====================

describe('contentTypeForBasemap', () => {
  it('矢量暗色返回 vector-tile MIME', () => {
    expect(contentTypeForBasemap('dark')).toBe('application/vnd.mapbox-vector-tile')
  })

  it('卫星影像返回 png MIME', () => {
    expect(contentTypeForBasemap('satellite')).toBe('image/png')
  })
})

describe('AVG_TILE_SIZE', () => {
  it('satellite 平均单块大于 dark', () => {
    expect(AVG_TILE_SIZE.satellite).toBeGreaterThan(AVG_TILE_SIZE.dark)
  })
})

// ===================== 纯函数：经纬度 → 瓦片行列号 =====================

describe('lonLatToTile', () => {
  it('原点 (0°,0°) 在 z=0 落到唯一瓦片 (0,0)', () => {
    expect(lonLatToTile(0, 0, 0)).toEqual({ x: 0, y: 0 })
  })

  it('原点 (0°,0°) 在 z=1 落到瓦片 (1,1)', () => {
    // z=1 全球 2×2，赤道与本初子午线交点位于右下象限
    expect(lonLatToTile(1, 0, 0)).toEqual({ x: 1, y: 1 })
  })

  it('西半球负经度 x < n/2', () => {
    const { x } = lonLatToTile(2, -90, 0)
    expect(x).toBeLessThan(2)
  })

  it('苏州区域经纬度落在合理瓦片范围', () => {
    // z=10，苏州工业园约 (120.7°E, 31.3°N)
    const { x, y } = lonLatToTile(10, 120.7, 31.3)
    expect(x).toBeGreaterThanOrEqual(840)
    expect(x).toBeLessThanOrEqual(870)
    expect(y).toBeGreaterThanOrEqual(410)
    expect(y).toBeLessThanOrEqual(425)
  })
})

// ===================== 纯函数：瓦片枚举 =====================

describe('enumerateTiles', () => {
  it('z=0 全球仅 1 块瓦片', () => {
    const world: BBox = { west: -180, east: 180, south: -85, north: 85 }
    const tiles = enumerateTiles(world, 0, 0)
    expect(tiles).toHaveLength(1)
    expect(tiles[0]).toEqual({ z: 0, x: 0, y: 0 })
  })

  it('bbox 经纬度颠倒（west>east / north<south）时自动归一化', () => {
    const flipped: BBox = { west: 121, east: 120, north: 30, south: 31 }
    const normal: BBox = { west: 120, east: 121, south: 30, north: 31 }
    expect(enumerateTiles(flipped, 8, 8)).toEqual(enumerateTiles(normal, 8, 8))
  })

  it('多层级枚举覆盖 minZoom..maxZoom 每一层', () => {
    const bbox: BBox = { west: 120.5, east: 120.6, south: 31.2, north: 31.3 }
    const zooms = new Set(enumerateTiles(bbox, 8, 10).map((t) => t.z))
    expect(zooms).toEqual(new Set([8, 9, 10]))
  })

  it('minZoom 为负数时钳制到 0', () => {
    const tiny: BBox = { west: -1, east: 1, south: -1, north: 1 }
    const tiles = enumerateTiles(tiny, -5, 0)
    expect(tiles.every((t) => t.z >= 0)).toBe(true)
    expect(tiles.some((t) => t.z === 0)).toBe(true)
  })

  it('瓦片坐标不越界（x/y ∈ [0, 2^z-1]）', () => {
    const world: BBox = { west: -180, east: 180, south: -85, north: 85 }
    for (const t of enumerateTiles(world, 3, 5)) {
      const max = 2 ** t.z - 1
      expect(t.x).toBeGreaterThanOrEqual(0)
      expect(t.x).toBeLessThanOrEqual(max)
      expect(t.y).toBeGreaterThanOrEqual(0)
      expect(t.y).toBeLessThanOrEqual(max)
    }
  })
})

// ===================== 纯函数：预估 =====================

describe('estimateDownload', () => {
  it('瓦片数 × dark 平均大小', () => {
    const bbox: BBox = { west: 120.5, east: 120.6, south: 31.2, north: 31.3 }
    const est = estimateDownload(bbox, 10, 10, 'dark')
    const count = enumerateTiles(bbox, 10, 10).length
    expect(est.tileCount).toBe(count)
    expect(est.estimatedBytes).toBe(count * AVG_TILE_SIZE.dark)
  })

  it('satellite 预估字节大于同区域 dark', () => {
    const bbox: BBox = { west: 120.5, east: 120.6, south: 31.2, north: 31.3 }
    const dark = estimateDownload(bbox, 10, 10, 'dark').estimatedBytes
    const sat = estimateDownload(bbox, 10, 10, 'satellite').estimatedBytes
    expect(sat).toBeGreaterThan(dark)
  })
})

// ===================== 纯函数：URL 模板 / sourceId =====================

describe('buildTileUrl', () => {
  it('替换 {z}/{x}/{y} 占位符', () => {
    expect(
      buildTileUrl('/tiles/data/suzhou/{z}/{x}/{y}.pbf', { z: 12, x: 3456, y: 7890 }),
    ).toBe('/tiles/data/suzhou/12/3456/7890.pbf')
  })

  it('不同坐标生成不同 URL', () => {
    const t = '/t/{z}/{x}/{y}.pbf'
    expect(buildTileUrl(t, { z: 0, x: 0, y: 0 })).not.toBe(
      buildTileUrl(t, { z: 1, x: 1, y: 1 }),
    )
  })
})

describe('deriveSourceId', () => {
  it('去掉 {z}/{x}/{y}.ext 得到路径前缀', () => {
    expect(deriveSourceId('/tiles/data/suzhou/{z}/{x}/{y}.pbf')).toBe(
      '/tiles/data/suzhou',
    )
  })

  it('与 matchTilePath 推断的 sourceId 一致（键空间对齐）', () => {
    // 预下载入库键与运行时拦截键必须一致（断点续传前提）
    const template = '/tiles/data/v3/{z}/{x}/{y}.pbf'
    const expected = deriveSourceId(template)
    const url = buildTileUrl(template, { z: 10, x: 100, y: 200 })
    const m = url.match(/^(.+?)\/(\d+)\/(\d+)\/(\d+)\.(pbf|png|jpe?g|webp)$/i)
    expect(m?.[1]).toBe(expected)
  })
})

// ===================== 异步：下载引擎 downloadTiles =====================

/** 测试用坐标集合（苏州 z=10 区域，3 块） */
const COORDS: TileCoord[] = [
  { z: 10, x: 855, y: 418 },
  { z: 10, x: 855, y: 419 },
  { z: 10, x: 856, y: 418 },
]
const TEMPLATE = '/tiles/data/suzhou/{z}/{x}/{y}.pbf'
const SOURCE_ID = '/tiles/data/suzhou'
const CT = 'application/vnd.mapbox-vector-tile'

/** 构造伪造的已缓存记录 */
function fakeRecord(coord: TileCoord, size: number): TileCacheRecord {
  return {
    key: buildTileUrl(TEMPLATE, coord),
    sourceId: SOURCE_ID,
    z: coord.z,
    x: coord.x,
    y: coord.y,
    blob: new Blob([new Uint8Array(size)], { type: CT }),
    contentType: CT,
    cachedAt: Date.now(),
  }
}

/** 构造 fetch 成功响应 mock */
function okResponse(byteLength: number, contentType = CT): unknown {
  return {
    ok: true,
    status: 200,
    headers: {
      get(name: string): string | null {
        if (name === 'content-type') return contentType
        if (name === 'content-length') return String(byteLength)
        return null
      },
    },
    arrayBuffer: async () => new ArrayBuffer(byteLength),
  }
}

describe('downloadTiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    vi.mocked(getTiles).mockResolvedValue([])
    vi.mocked(putTile).mockResolvedValue(undefined)
  })

  it('空坐标集合返回零值快照', async () => {
    const snap = await downloadTiles([], SOURCE_ID, TEMPLATE, CT)
    expect(snap).toEqual({ completed: 0, failed: 0, skipped: 0, total: 0, bytes: 0, aborted: false })
    expect(putTile).not.toHaveBeenCalled()
  })

  it('全部已缓存时跳过 fetch，直接计入 completed', async () => {
    vi.mocked(getTiles).mockResolvedValue([
      fakeRecord(COORDS[0], 100), fakeRecord(COORDS[1], 200), fakeRecord(COORDS[2], 300),
    ])
    const snap = await downloadTiles(COORDS, SOURCE_ID, TEMPLATE, CT)
    expect(snap.completed).toBe(3)
    expect(snap.bytes).toBe(600) // 100+200+300
    expect(snap.aborted).toBe(false)
    expect(putTile).not.toHaveBeenCalled()
  })

  it('新瓦片通过 fetch 下载并写入缓存', async () => {
    vi.mocked(getTiles).mockResolvedValue([undefined, undefined, undefined])
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(50)))
    const snap = await downloadTiles(COORDS, SOURCE_ID, TEMPLATE, CT)
    expect(snap.completed).toBe(3)
    expect(snap.bytes).toBe(150) // 3×50
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(putTile).toHaveBeenCalledTimes(3)
  })

  it('部分已缓存时仅下载缺失块', async () => {
    vi.mocked(getTiles).mockResolvedValue([fakeRecord(COORDS[0], 100), undefined, undefined])
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(50)))
    const snap = await downloadTiles(COORDS, SOURCE_ID, TEMPLATE, CT)
    expect(snap.completed).toBe(3) // 1 缓存 + 2 新下载
    expect(snap.bytes).toBe(200) // 100+50+50
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(putTile).toHaveBeenCalledTimes(2)
  })

  it('HTTP 错误计入 failed 而非中断整体', async () => {
    vi.mocked(getTiles).mockResolvedValue([undefined, undefined, undefined])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })))
    const snap = await downloadTiles(COORDS, SOURCE_ID, TEMPLATE, CT)
    expect(snap.failed).toBe(3)
    expect(snap.completed).toBe(0)
    expect(putTile).not.toHaveBeenCalled()
  })

  it('204 No Content / 0 字节响应计入 skipped 且不入库（避免污染 IndexedDB）', async () => {
    // tileserver-gl 对 mbtiles 中缺失的瓦片返回 204 No Content（0 字节体）。
    // 此类瓦片既非下载成功也非网络错误，须跳过入库，单独计入 skipped。
    vi.mocked(getTiles).mockResolvedValue([undefined, undefined, undefined])
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 204,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(0),
      })),
    )
    const snap = await downloadTiles(COORDS, SOURCE_ID, TEMPLATE, CT)
    expect(snap.skipped).toBe(3)
    expect(snap.completed).toBe(0)
    expect(snap.failed).toBe(0)
    expect(snap.bytes).toBe(0)
    // 关键断言：不写入缓存，避免 0 字节空 Blob 污染 IndexedDB
    expect(putTile).not.toHaveBeenCalled()
  })

  it('0 字节 200 响应同样计入 skipped（防御 content-length 缺失的空体）', async () => {
    vi.mocked(getTiles).mockResolvedValue([undefined, undefined, undefined])
    // 部分实现返回 200 但 body 为空（无 content-length），亦应跳过
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(0),
      })),
    )
    const snap = await downloadTiles(COORDS, SOURCE_ID, TEMPLATE, CT)
    expect(snap.skipped).toBe(3)
    expect(snap.completed).toBe(0)
    expect(putTile).not.toHaveBeenCalled()
  })

  it('开始前已 abort 时跳过全部下载', async () => {
    vi.mocked(getTiles).mockResolvedValue([undefined, undefined, undefined])
    const controller = new AbortController()
    controller.abort()
    vi.stubGlobal('fetch', vi.fn())
    const snap = await downloadTiles(COORDS, SOURCE_ID, TEMPLATE, CT, { signal: controller.signal })
    expect(snap.aborted).toBe(true)
    expect(snap.completed).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('下载过程中 abort 后快照 aborted=true', async () => {
    vi.mocked(getTiles).mockResolvedValue([undefined, undefined, undefined])
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn(async () => { controller.abort(); throw new Error('aborted') }))
    const snap = await downloadTiles(COORDS, SOURCE_ID, TEMPLATE, CT, { signal: controller.signal })
    expect(snap.aborted).toBe(true)
  })

  it('onProgress 回调随下载进度推进', async () => {
    vi.mocked(getTiles).mockResolvedValue([undefined, undefined, undefined])
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(10)))
    const log: number[] = []
    await downloadTiles(COORDS, SOURCE_ID, TEMPLATE, CT, { onProgress: (s) => log.push(s.completed) })
    expect(log.length).toBeGreaterThanOrEqual(4) // 初始 emit + 3 次成功
    expect(log[log.length - 1]).toBe(3)
  })
})

// ===================== 异步：下载前探测 probeTileSource =====================

describe('probeTileSource', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('采样瓦片返回有效数据 → true', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(100)))
    const result = await probeTileSource(TEMPLATE, [{ z: 10, x: 855, y: 418 }])
    expect(result).toBe(true)
  })

  it('采样瓦片全部 204 No Content → false（占位 mbtiles 场景）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 204,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(0),
      })),
    )
    const result = await probeTileSource(TEMPLATE, COORDS)
    expect(result).toBe(false)
  })

  it('多个采样中任一返回数据 → true（混合 204 与正常）', async () => {
    let call = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call++
        if (call === 1) {
          return {
            ok: true,
            status: 204,
            headers: { get: () => null },
            arrayBuffer: async () => new ArrayBuffer(0),
          }
        }
        return okResponse(50)
      }),
    )
    const result = await probeTileSource(TEMPLATE, [
      { z: 10, x: 855, y: 418 },
      { z: 10, x: 856, y: 418 },
    ])
    expect(result).toBe(true)
  })

  it('HTTP 错误（如 404）不视为有数据，继续尝试下一个采样', async () => {
    let call = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call++
        if (call === 1) return { ok: false, status: 404 }
        return okResponse(80)
      }),
    )
    const result = await probeTileSource(TEMPLATE, [
      { z: 10, x: 855, y: 418 },
      { z: 10, x: 856, y: 418 },
    ])
    expect(result).toBe(true)
  })

  it('采样网络异常不中断探测 → false', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network') }))
    const result = await probeTileSource(TEMPLATE, COORDS)
    expect(result).toBe(false)
  })

  it('空采样列表 → false', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const result = await probeTileSource(TEMPLATE, [])
    expect(result).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
})
