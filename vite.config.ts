import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
    proxy: {
      // 开发环境代理：将 /tiles/* 请求转发到本地 tileserver-gl (8081)。
      // 解决浏览器跨域 / IPv6 / LAN 访问时 localhost:8081 不可达的问题。
      // MapLibreContainer 通过 transformRequest 将 localhost:8081 的请求
      // 重定向到此代理路径，所有瓦片/字体/样式请求均走同源代理。
      // 目标固定为 IPv4 127.0.0.1（而非 localhost）：
      // Windows 上 Node 解析 localhost 常优先 IPv6 (::1)，而 WSL 的 wslrelay.exe
      // 会抢占 [::1]:8081，导致代理上游命中 wslrelay 返回 502 Bad Gateway。
      // 指定 127.0.0.1 可稳定命中 Docker 在 0.0.0.0:8081 的监听。
      '/tiles': {
        target: 'http://127.0.0.1:8081',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tiles/, ''),
      },
      // 城市数据准备后端（server/index.mjs，默认 8082）：
      // 前端 /api/admin/* 请求转发到本地后端，触发 prepare-data.ps1 生成 mbtiles。
      '/api': {
        target: 'http://127.0.0.1:8082',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    // 生产预览代理（vite preview）：与 server.proxy 配置一致。
    // 确保构建产物通过 vite preview 本地验证时，/tiles/* 与 /api/* 均转发到本地服务。
    // 正式生产部署时由 Nginx 配置 `location /api/ { proxy_pass http://127.0.0.1:8082/; }`。
    proxy: {
      '/tiles': {
        target: 'http://127.0.0.1:8081',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tiles/, ''),
      },
      '/api': {
        target: 'http://127.0.0.1:8082',
        changeOrigin: true,
      },
    },
  },
})
