/// <reference types="vite/client" />

/** Vite 环境变量类型扩展。 */
interface ImportMeta {
  readonly env: ImportMetaEnv
}
interface ImportMetaEnv {
  /** 后端联调开关：开发模式需设为 true 才启用 HTTP/WS（生产构建始终启用） */
  readonly VITE_BACKEND_ENABLED?: string
  /** 跳过登录页开关：默认走登录验证（先登录成功再进首页）；设为 true 跳过登录直接进首页 */
  readonly VITE_SKIP_LOGIN?: string
}