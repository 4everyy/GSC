/**
 * GSC 地面站 Vite 配置。
 */
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createReadStream, existsSync, readFileSync, stat, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * 开发模式注入（仅 dev server 生效，不影响 build）：
 * 与线上 nginx sub_filter 一致——加载 deploy/inject 下的定制 CSS/JS，
 * 使 npm run dev（任意端口 5173/5174…）与 https://localhost / :8081 视觉表现一致。
 *
 * 2026-09-28 深度修复：deploy/inject 目录可能不存在（被清理 / 克隆后未同步），
 * 此时若仍注入标签会产生两个 404 请求，污染页面加载；
 * 现改为目录存在性探测——缺失时跳过注入并打印一次提示。
 */
function gscDevInject(): Plugin {
  const injectDir = resolve(process.cwd(), 'deploy/inject')
  return {
    name: 'gsc-dev-inject',
    apply: 'serve',
    configureServer(server) {
      // 提供 /inject/* 静态服务（源文件在 deploy/inject，dev 下无需拷贝）
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
      // 目录缺失（或关键文件缺失）时不注入：避免 404 资源污染页面加载
      const cssOk = existsSync(join(injectDir, 'hide-offline-import.css'))
      const jsOk = existsSync(join(injectDir, 'import-progress.js'))
      if (!cssOk && !jsOk) {
        console.warn('[gsc-dev-inject] deploy/inject not found (' + injectDir + ') - skip injecting.')
        return []
      }
      const tags: Array<{ tag: string; attrs: Record<string, string>; injectTo: 'head' }> = []
      if (cssOk) {
        tags.push({
          tag: 'link',
          attrs: { rel: 'stylesheet', href: '/inject/hide-offline-import.css' },
          injectTo: 'head',
        })
      }
      if (jsOk) {
        tags.push({ tag: 'script', attrs: { src: '/inject/import-progress.js' }, injectTo: 'head' })
      }
      return tags
    },
  }
}

/** dev 静态服务对 /maps/*.mbtiles 提供 HTTP Range 支持（数 GB 级离线包必需） */
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
            send(416, { 'Content-Range': 'bytes */' + size })
            res.end()
            return
          }
          send(206, { 'Content-Range': 'bytes ' + start + '-' + end + '/' + size, 'Content-Length': end - start + 1 })
          createReadStream(file, { start, end }).pipe(res)
        })
      })
    },
  }
}

/**
 * maplibre-gl v6 独立 Worker 文件服务（修复生产构建离线地图空白）。
 *
 * 背景：maplibre-gl v6 将 Web Worker 拆分为独立文件（maplibre-gl-worker.mjs +
 * maplibre-gl-shared.mjs），运行时经 new URL('./maplibre-gl-worker.mjs', import.meta.url)
 * 推导地址。该地址是运行时字符串拼接，打包器无法静态分析：
 * - dev：optimizeDeps.exclude 让浏览器按 node_modules 原始路径加载，推导正确；
 * - build：主包被打进 /assets/vendor-*.js，推导出的 /assets/maplibre-gl-worker.mjs
 *   在 dist 中不存在，Worker 加载 404，地图 load 永不触发，离线地图空白。
 *
 * 修复：应用侧显式设置 config.WORKER_URL = '/maplibre/maplibre-gl-worker.mjs'
 * （见 src/features/offline-map/index.ts），本插件保证该路径两端可达：
 * - serve：middleware 按需从 node_modules 返回（不落地 public/，仓库干净）；
 * - build：emitFile 把两个 worker 文件写进产物 /maplibre/ 目录。
 */
const MAPLIBRE_WORKER_FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'] as const

function gscMaplibreWorkerPlugin(): Plugin {
  return {
    name: 'gsc-maplibre-worker',
    // 注意：不可设 apply: 'serve'——那会在 build 时禁用整个插件（含 generateBundle）。
    // dev/build 行为分流由钩子自身保证：configureServer 仅 dev 调用，generateBundle 仅 build 调用。
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]
        const m = /^\/maplibre\/(maplibre-gl-worker\.mjs|maplibre-gl-shared\.mjs)$/.exec(path)
        if (!m) return next()
        const file = join(server.config.root, 'node_modules', 'maplibre-gl', 'dist', m[1])
        if (!existsSync(file)) {
          res.statusCode = 404
          return res.end()
        }
        res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache' })
        createReadStream(file).pipe(res)
      })
    },
    generateBundle() {
      for (const f of MAPLIBRE_WORKER_FILES) {
        this.emitFile({
          type: 'asset',
          fileName: 'maplibre/' + f,
          source: readFileSync(join(process.cwd(), 'node_modules', 'maplibre-gl', 'dist', f)),
        })
      }
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
    plugins: [gscMbtilesRangePlugin(), gscMaplibreWorkerPlugin(), react(), gscDevInject()],
    // maplibre-gl 内部使用 Web Worker，若被 Vite 依赖预打包会破坏 worker 引用
    // (maplibre-gl-worker.mjs)，导致 map 'load' 事件永不触发、UI 卡在加载中。
    // 排除后让浏览器直接按原始路径加载 worker。
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
          // rolldown（vite 8）下函数式 manualChunks 兼容层不保证分组结果
          // （实测 React 核心被并入 antd chunk，登录页仍需加载 380KB+ antd），
          // 改用原生 advancedChunks 显式分组：
          // - react 独立成组：登录页首屏仅需 entry(30KB)+react，不再拖入 antd；
          // - 匹配必须限定包根目录，避免 rc-util/es/react 等子路径误入 react 组。
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
      // 离线地图包体积大（数百 MB），chokidar 监听复制中的大文件会 EBUSY 崩溃
      // dev server；瓦片按需 fetch，无需热更新，直接忽略。
      watch: {
        ignored: ['**/maps/**/*.mbtiles'],
      },
      proxy: {
        // WebSocket 开发代理：前端统一连同源 /ws 路径，由 dev server 转发到后端。
        // 目标地址优先读环境变量 VITE_WS_PROXY_TARGET，默认指向联调后端。
        // 后端地址变更时，在 .env.local 中设置：
        //   VITE_WS_PROXY_TARGET=ws://<后端IP>:<端口>
        '/ws': {
          target: wsTarget,
          ws: true,
          changeOrigin: true,
          // WS 上游不可达/拒绝升级时打印到 dev 终端：静默挂起极难排查
          // （浏览器侧表现为 WS 永远停在 CONNECTING，2026-09-24 排障实测）
          configure(proxy) {
            proxy.on('error', (err, req) => {
              console.error(
                '[ws-proxy] ' + (req?.url ?? '') + ' upgrade failed: ' + err.message +
                  ' (upstream ' + wsTarget + ' unreachable; start backend or set VITE_WS_PROXY_TARGET in .env.local)',
              )
            })
          },
        },
        // HTTP API 开发代理：/api/* 转发到后端（默认 http://192.168.120.43:2222，
        // 可用 .env.local 的 VITE_API_PROXY_TARGET 覆盖；生产环境由 nginx 反代）。
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          // 上游不可达时快速失败（默认挂到 OS 级超时~30s+，登录按钮长时间无响应）
          timeout: 5000,
          proxyTimeout: 5000,
          // 上游不可达时浏览器只看到 502，真实原因打印到 dev 终端，
          // 便于区分「后端未启动」与「账号密码错误」。
          configure(proxy) {
            proxy.on('error', (err, req) => {
              console.error(
                '[api-proxy] ' + (req?.method ?? '') + ' ' + (req?.url ?? '') + ' forward failed: ' + err.message +
                  ' (upstream ' + apiTarget + ' unreachable;' +
                  ' start backend or set VITE_API_PROXY_TARGET in .env.local)',
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

