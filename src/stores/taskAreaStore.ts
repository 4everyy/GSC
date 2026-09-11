/**
 * taskAreaStore —— 任务区域全局状态。
 *
 * 承载 /api/v1/control/queryTaskAreaList 拉取的任务区域（多边形）列表，
 * 供 TaskAreaLayer 渲染到态势图。区域数据低频变化，采用「一次加载」策略：
 * 首次需要渲染时 load()，成功后 status='ready'；失败 status='error'，
 * 可再次调用 load() 重试（loading 期间防重入）。
 */
import { create } from 'zustand'
import {
  fetchTaskAreaList,
  mapTaskArea,
  type TaskArea,
  type TaskAreaRaw,
} from '../api/taskArea'

type TaskAreaStatus = 'idle' | 'loading' | 'ready' | 'error'

interface TaskAreaState {
  /** 任务区域列表（已过滤逻辑删除与非法顶点） */
  areas: TaskArea[]
  /** 加载状态 */
  status: TaskAreaStatus
  /** 错误信息（status='error' 时有值） */
  error: string | null
  /** 拉取并解析任务区域列表（loading 防重入；成功/失败均收敛状态） */
  load: () => Promise<void>
}

export const useTaskAreaStore = create<TaskAreaState>((set, get) => ({
  areas: [],
  status: 'idle',
  error: null,
  load: async () => {
    if (get().status === 'loading') return
    set({ status: 'loading', error: null })
    try {
      const raw = await fetchTaskAreaList()
      const areas = (Array.isArray(raw) ? raw : ([] as TaskAreaRaw[]))
        .map(mapTaskArea)
        .filter((a): a is TaskArea => a !== null)
      set({ areas, status: 'ready', error: null })
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : '任务区域加载失败',
      })
    }
  },
}))