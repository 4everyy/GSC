/// <reference types="vite/client" />

/**
 * Vite 环境变量类型扩展。
 * 在 .env 文件中配置的 VITE_ 前缀变量会在此声明，便于在代码中获得类型提示。
 */
interface ImportMeta {
  readonly env: ImportMetaEnv
}
interface ImportMetaEnv {
  /** 后端联调开关：开发模式需设为 true 才启用 HTTP/WS（生产构建始终启用） */
  readonly VITE_BACKEND_ENABLED?: string
}
