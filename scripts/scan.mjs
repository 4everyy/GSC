/** 分析 alarm-box-bg.png 底部行的透明形状（圆角/斜角深度与宽度） */
import fs from 'node:fs'
import zlib from 'node:zlib'

const buf = fs.readFileSync('src/assets/images/home/alarm-box-bg.png')
// 解析 IHDR
const w = buf.readUInt32BE(16)
const h = buf.readUInt32BE(20)
const bitDepth = buf[8 + 4 + 1]
const colorType = buf[8 + 4 + 2]
console.log(`size=${w}x${h} bitDepth=${bitDepth} colorType=${colorType}`)
const bpp = 4 // RGBA
const stride = w * bpp
// 收集 IDAT
let pos = 8
const idats = []
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos)
  const type = buf.toString('ascii', pos + 4, pos + 8)
  if (type === 'IHDR') {
    // already read
  }
  if (type === 'IDAT') idats.push(buf.subarray(pos + 8, pos + 8 + len))
  pos += 12 + len
}
const raw = zlib.inflateSync(Buffer.concat(idats))
// un-filter
const out = Buffer.alloc(h * stride)
for (let y = 0; y < h; y++) {
  const f = raw[y * (stride + 1)]
  const row = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
  const prev = y > 0 ? out.subarray((y - 1) * stride, (y - 1) * stride + stride) : null
  const cur = out.subarray(y * stride, y * stride + stride)
  for (let x = 0; x < stride; x++) {
    const a = x >= bpp ? cur[x - bpp] : 0
    const b = prev ? prev[x] : 0
    const c = x >= bpp && prev ? prev[x - bpp] : 0
    let v = row[x]
    if (f === 1) v = (v + a) & 0xff
    else if (f === 2) v = (v + b) & 0xff
    else if (f === 3) v = (v + ((a + b) >> 1)) & 0xff
    else if (f === 4) {
      const p = a + b - c
      const pa = Math.abs(p - a)
      const pb = Math.abs(p - b)
      const pc = Math.abs(p - c)
      v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff
    }
    cur[x] = v
  }
}
// 底部 16 行：每行首个/末个不透明像素、不透明数量
for (let y = h - 16; y < h; y++) {
  let first = -1
  let last = -1
  let count = 0
  for (let x = 0; x < w; x++) {
    const alpha = out[y * stride + x * 4 + 3]
    if (alpha > 16) {
      if (first < 0) first = x
      last = x
      count++
    }
  }
  console.log(`y=${y}: first=${first} last=${last} count=${count}`)
}