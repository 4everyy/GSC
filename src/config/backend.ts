/**
 * 后端联调总开关。
 *
 * - 生产构建（vite build / vite preview）：默认启用——生产由 nginx 反代
 *   /api 与 /ws 到后端，前端保持请求与长连接行为；
 * - 开发模式（vite dev）：需在 .env.local 中设置 VITE_BACKEND_ENABLED=true
 *   才启用；未设置时跳过设备状态 HTTP 轮询与 WebSocket 连接，
 *   纯前端 mock 开发不会产生 `http proxy error` 等控制台/终端报错。
 */
export const BACKEND_ENABLED =
  import.meta.env.PROD || import.meta.env.VITE_BACKEND_ENABLED === 'true'

/**
 * 目标列表数据源开关（联调过渡期）。
 *
 * - false（当前）：queryTargetStatus 接口照常请求（保持联调链路可用、
 *   便于观察后端数据），但列表/地图目标仍展示 mock 数据（config/targets.ts）；
 * - true：接口映射结果整体装载 targetLinkStore，恢复真实数据展示。
 *
 * 置 true 即可恢复接口数据，无需改动其他代码。
 */
export const TARGET_API_DATA_ENABLED = false
