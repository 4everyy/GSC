/* 底部按钮条渲染自测：真实浏览器渲染后截图，供缝隙宽度分析。
 * 用法：node scripts/screenshot_bottom_bar.cjs [输出png路径]
 * 依赖：vite preview 已在 http://localhost:4173 运行（npm run build && npx vite preview）
 */
const puppeteer = require('puppeteer-core')

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const URL = 'http://localhost:4173/'
const OUT = process.argv[2] || 'D:/Ground_Control_Station/.tmp_bar.png'

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    protocolTimeout: 180000,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--force-device-scale-factor=1',
      '--disable-web-security',
    ],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })

  // 拦截非必要资源（瓦片/wasm），减轻主线程负担
  await page.setRequestInterception(true)
  page.on('request', (req) => {
    const u = req.resourceType()
    if (u === 'media' || u === 'font') return req.abort()
    if (/tiles|\.pbf|\.wasm|maplibre/i.test(req.url()) && u === 'xhr') return req.abort()
    req.continue()
  })

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.bottom-bar__btn', { timeout: 60000 })

  // 注入洋红背景并隐藏地图/无关 UI，使按钮条缝隙像素可被精确检测
  await page.evaluate(() => {
    const s = document.createElement('style')
    s.textContent = `
      canvas, .maplibregl-canvas, .map-base { display: none !important; }
      .map-toolbar, .map-controls, .map-footer, .status-header,
      .restricted-zone, .inspection-zone, .aircraft, [data-hover-panel],
      .offline-map-panel, .aircraft-focus-panel, .map-scale {
        display: none !important;
      }
      html, body, #root, .design-viewport, .design-canvas, .map-stage {
        background: #ff00ff !important;
      }
    `
    document.head.appendChild(s)
  })

  const rects = await page.evaluate(() => {
    const bar = document.querySelector('.bottom-bar')
    const br = bar.getBoundingClientRect()
    const btns = [...bar.children].map((b) => {
      const r = b.getBoundingClientRect()
      return {
        x: +r.x.toFixed(2),
        w: +r.width.toFixed(2),
        right: +r.right.toFixed(2),
        h: +r.height.toFixed(2),
        marginRight: getComputedStyle(b).marginRight,
      }
    })
    return { bar: { x: br.x, y: br.y, w: br.width, h: br.height }, btns }
  })
  console.log(JSON.stringify(rects, null, 1))

  await page.screenshot({
    path: OUT,
    clip: {
      x: Math.max(0, rects.bar.x - 2),
      y: rects.bar.y,
      width: rects.bar.w + 4,
      height: rects.bar.h,
    },
  })
  await browser.close()
  console.log('saved:', OUT)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})