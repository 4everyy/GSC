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
      '/tiles': {
        target: 'http://localhost:8081',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tiles/, ''),
      },
    },
  },
  preview: {
    host: true,
    // 生产预览代理（vite preview）：与 server.proxy 配置一致。
    // 确保构建产物通过 vite preview 本地验证时，/tiles/* 同样转发到 tileserver-gl。
    // 正式生产部署时由 Nginx 配置 `location /tiles/ { proxy_pass http://localhost:8081/; }`。
    proxy: {
      '/tiles': {
        target: 'http://localhost:8081',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tiles/, ''),
      },
    },
  },
})
