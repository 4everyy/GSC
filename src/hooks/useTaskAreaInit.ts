/**
 * useTaskAreaInit —— 任务区域 HTTP 初始化 Hook（仅页面加载请求一次）。
 *
 * 挂载于 App 根组件，全站唯一请求实例：
 * - 页面加载时请求一次 /api/v1/control/queryTaskAreaList，经 taskAreaStore.load()
 *   解析装入 store——此后用户打开图层控制面板「任务区域」开关时数据已就绪，
 *   TaskAreaLayer 挂载即渲染（store 已 ready 不重复请求）；
 * - StrictMode 双挂载防护：模块级 inited 标志 + store loading 防重入；
 * - 失败静默（status='error'），TaskAreaLayer 挂载时 status 仍非 ready 会再次
 *   触发 load() 重试；
 * - 后端联调未开启（BACKEND_ENABLED=false）时完全跳过。
 */
import { useEffect } from 'react'
import { BACKEND_ENABLED } from '../config/backend'
import { useTaskAreaStore } from '../stores/taskAreaStore'

/** 模块级单例：已触发过初始拉取（StrictMode 重挂载不重复请求） */
let inited = false

export function useTaskAreaInit() {
  useEffect(() => {
    // 后端联调未开启时跳过，避免代理失败报错
    if (!BACKEND_ENABLED) return
    // 已触发过则跳过（失败重试交给 TaskAreaLayer 挂载时的 load()）
    if (inited) return
    inited = true
    void useTaskAreaStore.getState().load()
  }, [])
}