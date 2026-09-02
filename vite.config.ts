import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * 开发模式注入（仅 dev server 生效，不影响 build）：
 * 与线上 nginx sub_filter 一致——加载 deploy/inject 下的定制 CSS/JS，
 * 使 `npm run dev`（任意端口 5173/5174…）与 https://localhost / :8081 视觉表现一致。
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

export default defineConfig({
  plugins: [react(), gscDevInject()],
  // maplibre-gl 内部使用 Web Worker，若被 Vite 依赖预打包会破坏 worker 引用
  // (maplibre-gl-worker.mjs)，导致 map 'load' 事件永不触发、UI 卡在"加载中"。
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react') || id.includes('scheduler')) return 'react'
          if (id.includes('antd') || id.includes('@ant-design')) return 'antd'
          if (id.includes('zustand')) return 'zustand'
          return 'vendor'
        },
      },
    },
  },
  server: {
    host: true,
    port: 8080,
  },
  preview: {
    host: true,
  },
})