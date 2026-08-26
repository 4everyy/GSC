/** 检查 suzhou.mbtiles 各层级瓦片覆盖范围（tile_row 为 MBTiles TMS 行号） */
import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync('public/maps/suzhou.mbtiles', { readOnly: true })
for (const z of [15, 16, 17, 18]) {
  const r = db
    .prepare(
      'SELECT MIN(tile_column) x0, MAX(tile_column) x1, MIN(tile_row) y0, MAX(tile_row) y1, COUNT(*) n FROM tiles WHERE zoom_level = ?'
    )
    .get(z)
  // TMS 行号 -> XYZ 行号：xyzY = 2^z - 1 - tmsY
  const flip = (v) => (1 << z) - 1 - v
  console.log(
    `z${z}: n=${r.n}  col[${r.x0}..${r.x1}]  xyzRow[${flip(r.y1)}..${flip(r.y0)}] (lat大→小)`
  )
}
db.close()