/**
 * useTargetStatusInit —— 目标状态 HTTP 初始化 Hook（仅页面加载请求一次）。
 *
 * 挂载于 App 根组件，全站唯一请求实例：
 * - 页面加载时请求一次 /api/v1/control/queryTargetStatus，映射去重后经
 *   loadTargetsFromApi 整体装入 targetLinkStore（替换 mock 数据），
 *   真实经纬度写入 t.lngLat 供地图种子锚定优先使用；
 * - StrictMode 双挂载防护：模块级 inFlight promise 复用，成功过（loaded）不再请求；
 * - 失败静默（保留 mock 数据），后续由目标列表面板「刷新」手动重试；
 * - 后端联调未开启（BACKEND_ENABLED=false）时完全跳过。
 */
import { useEffect } from 'react'
import { BACKEND_ENABLED, TARGET_API_DATA_ENABLED } from '../config/backend'
import { fetchAndMapTargets } from '../api/targetStatus'
import { useTargetLinkStore } from '../stores/targetLinkStore'

/** 模块级单例：请求成功过即置 true（StrictMode 重挂载/重复挂载不重复请求） */
let loaded = false
/** 模块级单例：请求进行中的 Promise 复用（并发挂载共享同一次请求） */
let inFlight: Promise<void> | null = null

export function useTargetStatusInit() {
  useEffect(() => {
    // 后端联调未开启时跳过，避免代理失败报错
    if (!BACKEND_ENABLED) return
    // 已成功装载过则不再请求
    if (loaded) return
    // 请求进行中：复用同一 Promise（StrictMode 双挂载场景）
    if (inFlight) return

    inFlight = fetchAndMapTargets()
      .then((items) => {
        // 联调过渡期：接口照常请求验证链路，但列表暂不装载接口数据（保留 mock 展示）
        if (!TARGET_API_DATA_ENABLED) {
          console.info(
            '[targetStatus] 接口请求成功（联调验证），TARGET_API_DATA_ENABLED=false 暂保留 mock 数据：',
            items.length,
            '条',
          )
          loaded = true
          return
        }
        useTargetLinkStore.getState().loadTargetsFromApi(items)
        loaded = true
      })
      .catch((err) => {
        // 失败静默：保留 mock 数据，用户可在目标列表面板点「刷新」重试
        console.warn('[targetStatus] 初始拉取失败，保留 mock 数据：', err)
      })
      .finally(() => {
        inFlight = null
      })
  }, [])
}