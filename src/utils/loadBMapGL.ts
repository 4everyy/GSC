/**
 * 百度地图 JavaScript API GL 的动态加载工具。
 *
 * 职责：
 * - 读取 `VITE_BAIDU_MAP_AK` 环境变量，按需拼接官方脚本 URL；
 * - 通过 Promise 封装脚本加载，确保全局只注入一次 `<script>`，避免重复加载；
 * - SDK 加载失败时抛出明确错误，便于上层展示空态/错误态。
 */

/** SDK 加载成功的全局回调名（百度官方约定） */
const BMAP_CALLBACK = 'bmapGLInitCallback'

/** 全局加载 Promise，用于去重，确保并发调用复用同一次加载 */
let loadPromise: Promise<void> | null = null

/**
 * 动态加载百度地图 GL SDK。
 * 多次调用只会创建一次 `<script>`，后续调用复用同一个 Promise。
 *
 * @returns SDK 就绪后的 Promise；AK 缺失或加载失败时 reject
 */
export function loadBMapGL(): Promise<void> {
  // 已加载完成（百度 SDK 挂载到 window.BMapGL）直接返回
  if (typeof window !== 'undefined' && (window as unknown as { BMapGL?: unknown }).BMapGL) {
    return Promise.resolve()
  }

  // 复用进行中的加载 Promise，避免重复注入脚本
  if (loadPromise) {
    return loadPromise
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    // 读取 Vite 注入的环境变量 AK
    const ak = import.meta.env.VITE_BAIDU_MAP_AK
    if (!ak) {
      loadPromise = null
      reject(new Error('缺少百度地图 AK，请在 .env 中配置 VITE_BAIDU_MAP_AK'))
      return
    }

    // 注册全局初始化回调：SDK 加载完成后会调用并触发 resolve
    ;(window as unknown as Record<string, unknown>)[BMAP_CALLBACK] = () => {
      resolve()
    }

    // 创建脚本标签，v=3.0 指定 GL 版本，callback 指定初始化回调
    const script = document.createElement('script')
    script.src = `https://api.map.baidu.com/api?type=webgl&v=3.0&ak=${ak}&callback=${BMAP_CALLBACK}`
    script.async = true
    script.onerror = () => {
      loadPromise = null
      reject(new Error('百度地图 SDK 加载失败，请检查网络或 AK 配置'))
    }

    document.head.appendChild(script)
  })

  return loadPromise
}