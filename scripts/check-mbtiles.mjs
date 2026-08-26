/** 检查 suzhou.mbtiles 元数据（格式、zoom 范围）与本地 tileserver 可达性 —— Node 24 内置 node:sqlite */
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'

const db = new DatabaseSync('public/maps/suzhou.mbtiles', { readOnly: true })
const meta = db.prepare('SELECT name, value FROM metadata').all()
console.log('== metadata ==')
for (const m of meta) console.log(`  ${m.name} = ${m.value}`)

const rng = db.prepare('SELECT MIN(zoom_level) AS zmin, MAX(zoom_level) AS zmax, COUNT(*) AS n FROM tiles').get()
console.log('== tiles ==', rng)

const per = db.prepare('SELECT zoom_level AS z, COUNT(*) AS n FROM tiles GROUP BY zoom_level ORDER BY z').all()
for (const r of per) console.log(`  z${r.z}: ${r.n} tiles`)

db.close()
console.log('file size MB =', (fs.statSync('public/maps/suzhou.mbtiles').size / 1048576).toFixed(1))

// 检查本地 tileserver-gl 是否在运行
try {
  const r = await fetch('http://localhost:8081/', { signal: AbortSignal.timeout(2000) })
  console.log('tileserver-gl :8081 →', r.status)
} catch (e) {
  console.log('tileserver-gl :8081 不可达（', e.cause?.code ?? e.message, '）')
}