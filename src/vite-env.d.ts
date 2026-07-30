/// <reference types="vite/client" />

/**
 * Vite 环境变量类型扩展。
 * 在 .env 文件中配置的 VITE_ 前缀变量会在此声明，便于在代码中获得类型提示。
 */
interface ImportMetaEnv {
  /** 百度地图 JavaScript API GL 的 AK（访问密钥） */
  readonly VITE_BAIDU_MAP_AK: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}