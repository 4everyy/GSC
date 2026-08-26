/**
 * 苏州 z18 卫星瓦片续传下载（天地图 img_w → public/maps/suzhou.mbtiles）
 *
 * 特性：
 *  - 多 key 轮询（5 key × t0-t7 子域），失败自动冷却/重试，全自动无人值守
 *  - 断点续传：启动时读取 mbtiles 已有 z18 瓦片自动跳过，可反复重启
 *  - 404 空瓦片记入 skip 名单持久化，避免死循环
 *  - 批量事务写入 SQLite（WAL），每 100 张一提交
 *  - 状态输出：scripts/z18-dl-status.json + stdout 日志（重定向到 z18-dl.out.log）
 *
 * 用法：node scripts/z18-dl.mjs
 */
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'

const KEYS = [
  // 第一批（2026-08-26 额度已尽，每日 0 点自动恢复）
  '9bc473f63d2446e309cc53778b768879',
  '31c69ae96cf7ed8006dc2600dd4df705',
  'bf1f1f0046174dc50311f842462b4103',
  '46254faf5b0c216bae13c9669f3d50c7',
  'a4d8f20952fcfc4cc318dadadac028a8',
  // 第二批（2026-08-26 下午新增）
  'ab93e010120673ba97ed03a9ce02138b',
  'fb5ae171d1f34429fa9e316d3c3afd05',
  '7cd22ede14210d66b060ee2c7efa42b2',
  '61c17e143b905a3d136b0f0e323bb7cd',
  '6095ee908179a443a6e1aed07519e974',
]

const Z = 18
const N = 2 ** Z
const TMS_FLIP = N - 1
const BBOX = { west: 119.9, east: 121.3, south: 30.7, north: 31.9 } // 与 mbtiles metadata.bounds 一致
const DB_PATH = 'public/maps/suzhou.mbtiles'
const STATUS_FILE = 'scripts/z18-dl-status.json'
const SKIP_FILE = 'scripts/z18-dl-skip.json'

const CONCURRENCY = 10 // 总并发
const BATCH = 100 // 每事务提交瓦片数
const TIMEOUT_MS = 25_000
const MAX_ATTEMPTS = 4
const COOLDOWN_403_MS = 180_000 // 403：key 限额，冷却 3 分钟
const COOLDOWN_ERR_MS = 30_000 // 网络错/坏响应：key 短冷却

const t0 = Date.now()
const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a)

// ---------- 几何：bbox → z18 XYZ 行列 ----------
const lon2x = (lon) => Math.floor(((lon + 180) / 360) * N)
const lat2y = (lat) =>
  Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * N)

const X0 = lon2x(BBOX.west)
const X1 = lon2x(BBOX.east - 1e-9)
const Y0 = lat2y(BBOX.north)
const Y1 = lat2y(BBOX.south + 1e-9)
const W = X1 - X0 + 1
const H = Y1 - Y0 + 1
const TOTAL = W * H
const pack = (x, y) => x * N + y
const unpack = (p) => [Math.floor(p / N), p % N]

// ---------- 打开数据库 ----------
const db = new DatabaseSync(DB_PATH)
db.exec('PRAGMA journal_mode=WAL')
db.exec('PRAGMA synchronous=NORMAL')

// 已有 z18 瓦片 → 跳过集合（断点续传）
const existing = new Set()
for (const r of db.prepare('SELECT tile_column AS x, tile_row AS tms FROM tiles WHERE zoom_level = ?').all(Z)) {
  existing.add(pack(r.x, TMS_FLIP - r.tms))
}

// 404 空瓦片名单（持久化）
let skipSet = new Set()
try {
  skipSet = new Set(JSON.parse(fs.readFileSync(SKIP_FILE, 'utf8')))
} catch {}

// ---------- 目标清单：按距市中心环状由内向外 ----------
const cx = (X0 + X1) / 2
const cy = (Y0 + Y1) / 2
const pending = []
for (let x = X0; x <= X1; x++) {
  for (let y = Y0; y <= Y1; y++) {
    const p = pack(x, y)
    if (existing.has(p) || skipSet.has(p)) continue
    pending.push(p)
  }
}
pending.sort((a, b) => {
  const [ax, ay] = unpack(a)
  const [bx, by] = unpack(b)
  return (ax - cx) ** 2 + (ay - cy) ** 2 - ((bx - cx) ** 2 + (by - cy) ** 2)
})

log(`目标 bbox=${JSON.stringify(BBOX)} z${Z}`)
log(`全域 ${TOTAL} 张 (${W}x${H})，已有 ${existing.size}，跳过(404) ${skipSet.size}，本次待下载 ${pending.length}`)

// ---------- key 管理 ----------
const keys = KEYS.map((tk) => ({ tk, ok: 0, fail: 0, cooldownUntil: 0 }))
let keyIdx = 0
function pickKey() {
  const now = Date.now()
  for (let i = 0; i < keys.length; i++) {
    const k = keys[(keyIdx + i) % keys.length]
    if (k.cooldownUntil <= now) {
      keyIdx = (keyIdx + i + 1) % keys.length
      return k
    }
  }
  return null // 全部冷却中
}
async function waitForKey() {
  for (;;) {
    const k = pickKey()
    if (k) return k
    const wait = Math.min(...keys.map((x) => x.cooldownUntil - Date.now())) + 100
    log(`所有 key 冷却中，等待 ${Math.max(0, Math.round(wait / 1000))}s`)
    await sleep(Math.max(500, wait))
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- 下载单张 ----------
function tileUrl(key, s, x, y) {
  return `https://t${s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL=${x}&TILEROW=${y}&TILEMATRIX=${Z}&tk=${key}`
}

const HEADERS = {
  referer: process.env.TDT_REF || 'https://map.tianditu.gov.cn/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}

async function fetchTile(x, y) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const k = await waitForKey()
    const s = (x + y + attempt) % 8
    try {
      const res = await fetch(tileUrl(k.tk, s, x, y), { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (res.status === 404) return null // 真缺失，永久跳过
      if (res.status === 403 || res.status === 429) {
        k.fail++
        k.cooldownUntil = Date.now() + COOLDOWN_403_MS
        log(`HTTP ${res.status} → key ${k.tk.slice(0, 8)}… 冷却 ${COOLDOWN_403_MS / 1000}s`)
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 500 || buf[0] !== 0xff || buf[1] !== 0xd8) {
        throw new Error(`非 JPEG 响应 ${buf.length}B`)
      }
      k.ok++
      return buf
    } catch (e) {
      k.fail++
      k.cooldownUntil = Date.now() + COOLDOWN_ERR_MS
      if (attempt === MAX_ATTEMPTS) throw e
      await sleep(500 * attempt)
    }
  }
  throw new Error('unreachable')
}

// ---------- 批量写入 ----------
const ins = db.prepare('INSERT OR IGNORE INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)')
let writeBuf = []
let dirtySkip = false
function flushWrites() {
  if (!writeBuf.length) return
  db.exec('BEGIN')
  try {
    for (const [x, y, buf] of writeBuf) ins.run(Z, x, TMS_FLIP - y, buf)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    log('写入事务失败:', e.message)
  }
  writeBuf = []
}

// ---------- 进度统计 ----------
let done = 0
let failed = 0
let skipped404 = 0
const rateWindow = [] // [ts]
let lastReport = 0
let stop = false

function report(force = false) {
  const now = Date.now()
  if (!force && now - lastReport < 15_000) return
  lastReport = now
  // 滚动速率（60s 窗口）
  while (rateWindow.length && now - rateWindow[0] > 60_000) rateWindow.shift()
  const rate = rateWindow.length / 60
  const remain = pending.length - done - failed - skipped404
  const etaH = rate > 0 ? remain / rate / 3600 : Infinity
  const status = {
    pid: process.pid,
    startedAt: new Date(t0).toISOString(),
    updatedAt: new Date(now).toISOString(),
    zoom: Z,
    totalAll: TOTAL,
    existingBefore: existing.size,
    todo: pending.length,
    done,
    failed,
    skipped404,
    remain,
    ratePerSec: +rate.toFixed(2),
    etaHours: isFinite(etaH) ? +etaH.toFixed(2) : null,
    keys: keys.map((k) => ({ key: k.tk.slice(0, 8) + '…', ok: k.ok, fail: k.fail })),
  }
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2))
  log(
    `进度 ${done}/${pending.length} (${((done / pending.length) * 100).toFixed(1)}%) ` +
      `速率 ${rate.toFixed(1)}/s 剩余 ${remain} ETA ${isFinite(etaH) ? etaH.toFixed(1) + 'h' : '?'} ` +
      `失败 ${failed} 404 ${skipped404} ` +
      `keys[${keys.map((k) => `${k.ok}✓/${k.fail}✗`).join(' ')}]`
  )
}

function saveSkips() {
  if (!dirtySkip) return
  fs.writeFileSync(SKIP_FILE, JSON.stringify([...skipSet]))
  dirtySkip = false
}

process.on('SIGINT', () => {
  log('收到中断，落盘退出…')
  stop = true
})

// ---------- 工作池 ----------
let cursor = 0
async function worker() {
  while (!stop) {
    if (cursor >= pending.length) return
    const p = pending[cursor++]
    const [x, y] = unpack(p)
    try {
      const buf = await fetchTile(x, y)
      if (buf === null) {
        skipSet.add(p)
        dirtySkip = true
        skipped404++
      } else {
        writeBuf.push([x, y, buf])
        done++
        rateWindow.push(Date.now())
        if (writeBuf.length >= BATCH) flushWrites()
      }
    } catch (e) {
      failed++
      if (failed % 50 === 1) log(`瓦片 ${Z}/${x}/${y} 最终失败: ${e.message}`)
    }
    report()
  }
}

;(async () => {
  log(`启动 pid=${process.pid} 并发=${CONCURRENCY}`)
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  flushWrites()
  saveSkips()
  report(true)
  const cnt = db.prepare('SELECT COUNT(*) AS n FROM tiles WHERE zoom_level = ?').get(Z).n
  log(`完成：本次成功 ${done}，404 跳过 ${skipped404}，失败 ${failed}；mbtiles z18 现有 ${cnt} 张；耗时 ${((Date.now() - t0) / 3600000).toFixed(2)}h`)
  db.close()
})()