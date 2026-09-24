import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createReadStream, existsSync, stat, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * 寮€鍙戞ā寮忔敞鍏ワ紙浠?dev server 鐢熸晥锛屼笉褰卞搷 build锛夛細
 * 涓庣嚎涓?nginx sub_filter 涓€鑷粹€斺€斿姞杞?deploy/inject 涓嬬殑瀹氬埗 CSS/JS锛?
 * 浣?`npm run dev`锛堜换鎰忕鍙?5173/5174鈥︼級涓?https://localhost / :8081 瑙嗚琛ㄧ幇涓€鑷淬€?
 */
function gscDevInject(): Plugin {
  const injectDir = resolve(process.cwd(), 'deploy/inject')
  return {
    name: 'gsc-dev-inject',
    apply: 'serve',
    configureServer(server) {
      // 鎻愪緵 /inject/* 闈欐€佹湇鍔★紙婧愭枃浠跺湪 deploy/inject锛宒ev 涓嬫棤闇€鎷疯礉锛?
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/^\/inject\/([\w.-]+)$/)
        if (!m) return next()
        const file = join(injectDir, m[1])
        if (!file.startsWith(injectDir) || !existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404
          return res.end()
        }
        res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'application/javascript')
        res.setHeader('Cache-Control', 'no-cache')
        createReadStream(file).pipe(res)
      })
    },
    transformIndexHtml() {
      return [
        {
          tag: 'link',
          attrs: { rel: 'stylesheet', href: '/inject/hide-offline-import.css' },
          injectTo: 'head',
        },
        { tag: 'script', attrs: { src: '/inject/import-progress.js' }, injectTo: 'head' },
      ]
    },
  }
}


/** dev 闈欐€佹湇鍔″ /maps/*.mbtiles 鎻愪緵 HTTP Range 鏀寔锛堢洿璇?GB 绾х绾垮寘蹇呴渶锛?*/
function gscMbtilesRangePlugin(): Plugin {
  return {
    name: 'gsc-mbtiles-range',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/maps\/([A-Za-z0-9_-]+\.mbtiles)$/.exec(req.url ?? '')
        if (!m) return next()
        const file = join(server.config.root, 'public', 'maps', m[1])
        stat(file, (err, st) => {
          if (err || !st.isFile()) return next()
          const size = st.size
          const range = /bytes=(\d*)-(\d*)/.exec(String(req.headers.range ?? ''))
          const send = (code: number, head: Record<string, string | number>) => {
            res.writeHead(code, { 'Accept-Ranges': 'bytes', 'Content-Type': 'application/octet-stream', ...head })
          }
          if (!range) {
            send(200, { 'Content-Length': size })
            createReadStream(file).pipe(res)
            return
          }
          const start = range[1] ? Number(range[1]) : 0
          const end = Math.min(range[2] ? Number(range[2]) : size - 1, size - 1)
          if (start < 0 || start > end) {
            send(416, { 'Content-Range': `bytes */${size}` })
            res.end()
            return
          }
          send(206, { 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 })
          createReadStream(file, { start, end }).pipe(res)
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // loadEnv：vite.config.ts 直接读 process.env 只能拿到 shell 环境变量，
  // .env.local / .env 中的 VITE_WS_PROXY_TARGET、VITE_API_PROXY_TARGET 此前实际不生效
  // （2026-09-24 排障发现，文档声称可覆盖但从未生效），现改为 loadEnv 显式加载。
  const env = loadEnv(mode, process.cwd())
  const wsTarget = env.VITE_WS_PROXY_TARGET || 'ws://192.168.120.43:2222'
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://192.168.120.43:2222'
  return {
  plugins: [
    gscMbtilesRangePlugin(),react(), gscDevInject()],
  // maplibre-gl 鍐呴儴浣跨敤 Web Worker锛岃嫢琚?Vite 渚濊禆棰勬墦鍖呬細鐮村潖 worker 寮曠敤
  // (maplibre-gl-worker.mjs)锛屽鑷?map 'load' 浜嬩欢姘镐笉瑙﹀彂銆乁I 鍗″湪"鍔犺浇涓?銆?
  // 鎺掗櫎鍚庤娴忚鍣ㄧ洿鎺ユ寜鍘熷璺緞鍔犺浇 worker銆?
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  worker: {
    format: 'es',
  },
  build: {
    sourcemap: true,
    target: 'es2020',
    cssCodeSplit: true,
    rolldownOptions: {
      output: {
        // rolldown锛坴ite 8锛変笅鍑芥暟寮?manualChunks 鍏煎灞備笉淇濊瘉鍒嗙粍缁撴灉
        // 锛堝疄娴?React 鏍稿績琚苟鍏?antd chunk锛岀櫥褰曢〉浠嶉渶鍔犺浇 380KB+ antd锛夛紝
        // 鏀圭敤鍘熺敓 advancedChunks 鏄惧紡鍒嗙粍锛?
        // - react 鐙珛鎴愮粍锛氱櫥褰曢〉棣栧睆浠呴渶 entry(30KB)+react锛屼笉鍐嶆嫋鍏?antd锛?
        // - 鍖归厤蹇呴』闄愬畾鍖呮牴鐩綍锛岄伩鍏?rc-util/es/react 绛夊瓙璺緞璇叆 react 缁勩€?
        advancedChunks: {
          groups: [
            { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 10 },
            { name: 'antd', test: /[\\/]node_modules[\\/](antd|@ant-design|@rc-component)[\\/]/ },
            { name: 'zustand', test: /[\\/]node_modules[\\/]zustand[\\/]/ },
            { name: 'vendor', test: /[\\/]node_modules[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    host: true,
    // 绂荤嚎鍦板浘鍖呬綋绉ぇ锛堟暟鍗亊鏁扮櫨 MB锛夛紝chokidar 鐩戝惉澶嶅埗涓殑澶ф枃浠朵細 EBUSY 宕╂簝
    // dev server锛涚摝鐗囨寜闇€ fetch锛屾棤闇€鐑洿鏂帮紝鐩存帴蹇界暐銆?
    watch: {
      ignored: ['**/maps/**/*.mbtiles'],
    },
    proxy: {
      // WebSocket 寮€鍙戜唬鐞嗭細鍓嶇缁熶竴杩炲悓婧?/ws 璺緞锛岀敱 dev server 杞彂鍒板悗绔€?
      // 鐩爣鍦板潃浼樺厛璇荤幆澧冨彉閲?VITE_WS_PROXY_TARGET锛岄粯璁ゆ寚鍚戣仈璋冨悗绔€?
      // 鍚庣鍦板潃鍙樻洿鏃讹紝鍦?.env.local 涓缃細
      //   VITE_WS_PROXY_TARGET=ws://<鍚庣IP>:<绔彛>
      '/ws': {
        target: wsTarget,
        ws: true,
        changeOrigin: true,
        // WS 上游不可达/拒绝升级时打印到 dev 终端：静默挂起极难排查
        // （浏览器侧表现为 WS 永远停在 CONNECTING，2026-09-24 排障实测）
        configure(proxy) {
          proxy.on('error', (err, req) => {
            console.error(
              `[ws-proxy] ${req?.url ?? ''} upgrade failed: ${err.message}` +
                ` (upstream ${wsTarget} unreachable; start backend or set VITE_WS_PROXY_TARGET in .env.local)`,
            )
          })
        },
      },
      // HTTP API 寮€鍙戜唬鐞嗭細/api/* 杞彂鑷冲悗绔紙榛樿 http://192.168.120.43:2222锛?
      // 鍙敤 .env.local 鐨?VITE_API_PROXY_TARGET 瑕嗙洊锛涚敓浜х幆澧冪敱 nginx 鍙嶄唬锛夈€?
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        // 涓婃父涓嶅彲杈炬椂蹇€熷け璐ワ紙榛樿鎸傚埌 OS 绾ц秴鏃?~30s+锛岀櫥褰曟寜閽暱鏃堕棿鏃犲搷搴旓級
        timeout: 5000,
        proxyTimeout: 5000,
        // 涓婃父涓嶅彲杈炬椂娴忚鍣ㄥ彧鐪嬪埌 502锛岀湡瀹炲師鍥犳墦鍗板埌 dev 缁堢锛?
        // 渚夸簬鍖哄垎銆屽悗绔湭鍚姩銆嶄笌銆岃处鍙峰瘑鐮侀敊璇€嶃€?
        configure(proxy) {
          proxy.on('error', (err, req) => {
            console.error(
              `[api-proxy] ${req?.method ?? ''} ${req?.url ?? ''} forward failed: ${err.message}` +
                ` (upstream ${apiTarget} unreachable;` +
                ` start backend or set VITE_API_PROXY_TARGET in .env.local)`,
            )
          })
        },
      },
    },
  },
  preview: {
    host: true,
  },
  }
})