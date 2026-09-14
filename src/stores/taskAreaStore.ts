/**
 * taskAreaStore —— 任务区域全局状态。
 *
 * 承载 /api/v1/control/queryTaskAreaList 拉取的任务区域（多边形）列表，
 * 供 TaskAreaLayer 渲染到态势图。区域数据低频变化，采用「一次加载」策略：
 * 首次需要渲染时 load()，成功后 status='ready'；失败 status='error'，
 * 可再次调用 load() 重试（loading 期间防重入）。
 * 初始以 mock 数据填充（config/taskAreas.ts）：后端未开启或接口失败时
 * 静默保留 mock（与目标列表策略一致），成功后整体替换为真实数据。
 */
import { create } from 'zustand'
import {
  fetchTaskAreaList,
  mapTaskArea,
  type TaskArea,
  type TaskAreaRaw,
  type TaskAreaVertex,
} from '../api/taskArea'
import { BACKEND_ENABLED } from '../config/backend'
import { MOCK_TASK_AREAS } from '../config/taskAreas'

type TaskAreaStatus = 'idle' | 'loading' | 'ready' | 'error'

interface TaskAreaState {
  /** 任务区域列表（已过滤逻辑删除与非法顶点） */
  areas: TaskArea[]
  /** 加载状态 */
  status: TaskAreaStatus
  /** 错误信息（status='error' 时有值） */
  error: string | null
  /** 本地隐藏的区域 id 集合（区域列表面板「显示」图标维护，TaskAreaLayer 渲染时过滤） */
  hiddenIds: Set<string>
  /** 拉取并解析任务区域列表（loading 防重入；成功/失败均收敛状态；成功时重置本地隐藏） */
  load: () => Promise<void>
  /** 切换单个区域在态势图上的显隐（区域列表面板「显示」图标） */
  toggleHidden: (id: string) => void
  /** 本地移除单个区域（后端暂无删除接口；刷新 load() 后恢复） */
  removeArea: (id: string) => void
  /**
   * 本地新增区域（区域列表「添加区域」框选确认后调用）；
   * 后端暂无新增接口，仅写入本地状态（刷新 load() 后消失），
   * 列表（AreaListPanel）与态势图（TaskAreaLayer）即时同步展示
   */
  addArea: (vertices: TaskAreaVertex[]) => void
  /**
   * 「添加区域」请求计数器：区域列表面板（挂载于 MapToolbar 内，与 HomePage 平级，
   * 无法经 props 传递）点击「添加区域」按钮时 +1；HomePage 监听计数变化进入
   * 地图框选模式（与 deviceLinkStore.devicePanelOpenRequests 同款跨层级信号）
   */
  addAreaRequests: number
  /** 请求进入「添加区域」框选模式（AreaListPanel 按钮触发） */
  requestAddArea: () => void
}

export const useTaskAreaStore = create<TaskAreaState>((set, get) => ({
  // 初始填充 mock（load() 成功后整体替换为接口数据）
  areas: [...MOCK_TASK_AREAS],
  status: 'idle',
  error: null,
  hiddenIds: new Set<string>(),
  load: async () => {
    if (get().status === 'loading') return
    // 后端未开启（纯前端 mock 开发）：保留 mock 数据直接就绪，不发起请求
    if (!BACKEND_ENABLED) {
      set({ status: 'ready', error: null })
      return
    }
    set({ status: 'loading', error: null })
    try {
      const raw = await fetchTaskAreaList()
      const areas = (Array.isArray(raw) ? raw : ([] as TaskAreaRaw[]))
        .map(mapTaskArea)
        .filter((a): a is TaskArea => a !== null)
      set({ areas, status: 'ready', error: null, hiddenIds: new Set<string>() })
    } catch (err) {
      // 失败保留现有数据（初始 mock 或上次成功数据），列表/地图继续展示
      set({
        status: 'error',
        error: err instanceof Error ? err.message : '任务区域加载失败',
      })
    }
  },
  toggleHidden: (id) =>
    set((s) => {
      const next = new Set(s.hiddenIds)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return { hiddenIds: next }
    }),
  removeArea: (id) =>
    set((s) => {
      const nextHidden = new Set(s.hiddenIds)
      nextHidden.delete(id)
      return { areas: s.areas.filter((a) => a.id !== id), hiddenIds: nextHidden }
    }),
  addAreaRequests: 0,
  requestAddArea: () => set((s) => ({ addAreaRequests: s.addAreaRequests + 1 })),
  addArea: (vertices) =>
    set((s) => {
      // 顶点不足 3 个无法构成多边形，静默忽略（防御兜底）
      if (vertices.length < 3) return {}
      // 面积按经纬度包围盒估算（米）：经度每度 ≈111320·cos(纬度)，纬度每度 ≈110540
      const lats = vertices.map((v) => v.latitude)
      const lngs = vertices.map((v) => v.longitude)
      const avgLat = (Math.max(...lats) + Math.min(...lats)) / 2
      const widthM =
        (Math.max(...lngs) - Math.min(...lngs)) * 111_320 * Math.cos((avgLat * Math.PI) / 180)
      const heightM = (Math.max(...lats) - Math.min(...lats)) * 110_540
      const areaKm2 = Math.abs((widthM * heightM) / 1_000_000)
      const area: TaskArea = {
        id: `local-area-${Date.now()}`,
        // 命名沿用列表既有格式（01区域名称/02区域名称…），按当前列表长度递增编号
        name: `${String(s.areas.length + 1).padStart(2, '0')}区域名称`,
        // 后端暂无类型选择入口，默认「集聚侦察」（与列表行展示类型一致）
        type: 'TeamReconnaissance',
        areaKm2,
        priority: '2',
        createTime: Date.now(),
        vertices,
      }
      return { areas: [...s.areas, area] }
    }),
}))
