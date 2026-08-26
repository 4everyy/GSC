/** 冒烟测试：验证天地图 URL 与 key 有效性（取已下载区域中心一张 z18 瓦片） */
const KEYS = [
  '9bc473f63d2446e309cc53778b768879',
  '31c69ae96cf7ed8006dc2600dd4df705',
  'bf1f1f0046174dc50311f842462b4103',
  '46254faf5b0c216bae13c9669f3d50c7',
  'a4d8f20952fcfc4cc318dadadac028a8',
]
const x = 218926
const y = 107053 // 已有区域中心
const REFERER = process.env.TDT_REF || 'https://map.tianditu.gov.cn/'
for (const [i, tk] of KEYS.entries()) {
  const url = `https://t${i % 8}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL=${x}&TILEROW=${y}&TILEMATRIX=18&tk=${tk}`
  try {
    const res = await fetch(url, {
      headers: { referer: REFERER, 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(15000),
    })
    const buf = Buffer.from(await res.arrayBuffer())
    const jpeg = buf[0] === 0xff && buf[1] === 0xd8
    console.log(`key${i + 1} ${tk.slice(0, 8)}…: HTTP ${res.status}, ${buf.length}B, jpeg=${jpeg}`)
  } catch (e) {
    console.log(`key${i + 1} ${tk.slice(0, 8)}…: FAIL ${e.cause?.code ?? e.message}`)
  }
}
