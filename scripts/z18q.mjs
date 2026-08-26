/** 查看 z18 下载状态：node scripts/z18q.mjs */
import fs from 'node:fs'
const j = JSON.parse(fs.readFileSync('scripts/z18-dl-status.json', 'utf8'))
console.log(
  `pid=${j.pid} done=${j.done}/${j.todo} remain=${j.remain} rate=${j.ratePerSec}/s eta=${j.etaHours}h failed=${j.failed} 404=${j.skipped404}`,
)
console.log('keys:', j.keys.map((k) => `${k.key} ${k.ok}✓/${k.fail}✗`).join(' | '))