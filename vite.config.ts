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
  },
  preview: {
    host: true,
  },
})
