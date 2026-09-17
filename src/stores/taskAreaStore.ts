/**
 * taskAreaStore —— 任务区域全局状态。
 *
 * 承载 /api/v1/control/queryTaskAreaList 拉取的任务区域（多边形）列表，
 * 供 TaskAreaLayer 渲染到态势图。区域数据低频变化，采用「一次加载」策略：
 * 首次需要渲染时 load()，成功后 status='ready'；失败 status='error'，
 * 可再次调用 load() 重试（loading 期间防重入）。
 * 初始以 mock 数据填充（config/taskAreas.ts）：后端未开启或接口失败时
 * 静默保留 mock（与目标列表策略一致），成功后整体替换为真实数据；
 * 本地新增（addArea）时若仍处 mock 兜底则先整体清空（isMockFallback 标记），
 * 避免 mock 区域随「任务区域」图层自动开启一并涌上态势图。
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
  /**
   * 当前 areas 是否仍为初始 mock 兜底（真实接口成功加载前置 true）。
   * addArea 时若仍为 true 则先整体清空 mock 再写入新区域——否则「添加区域」
   * 确认后自动开启「任务区域」图层时，mock 兜底区域会一并涌上态势图/列表
   * （表现为「只添加 1 个区域，地图却多出好几个区域」）
   */
  isMockFallback: boolean
  /**
   * 本地隐藏的区域 id 集合（区域列表面板「显示」图标维护，TaskAreaLayer 渲染时过滤）。
   * 产品约定：列表区域默认不在态势图上显示——mock 初始化与接口加载成功均默认
   * 全部隐藏（id 全量入集合），用户经行内眼睛/底部批量「显示」逐个放出
   * （显示方向自动开启「任务区域」图层，见 AreaListPanel）；本地新增（addArea）
   * 的区域不进集合——刚绘制完立即以持久样式可见。
   */
  hiddenIds: Set<string>
  /**
   * 编辑中的区域 id（绘制遮罩「编辑 | 删除」面板点「编辑」时写入；null 表示无）。
   * TaskAreaLayer 读取后对编辑中区域切换专属视觉：去填充、白描边 6px、
   * 顶点/边中点挂图标（Ellipse 59/64.svg）；退出编辑（确定/取消/删除/退出
   * 绘制模式）时置回 null 恢复持久样式。
   */
  editingAreaId: string | null
  /** 进入/退出某区域的编辑态（绘制遮罩编辑按钮联动 TaskAreaLayer 编辑视觉） */
  setEditingArea: (id: string | null) => void
  /** 拉取并解析任务区域列表（loading 防重入；成功/失败均收敛状态；成功时默认全部隐藏） */
  load: () => Promise<void>
  /** 切换单个区域在态势图上的显隐（区域列表面板「显示」图标） */
  toggleHidden: (id: string) => void
  /** 本地移除单个区域（后端暂无删除接口；刷新 load() 后恢复） */
  removeArea: (id: string) => void
  /**
   * 本地新增区域（区域列表「添加区域」六边形绘制「确定」后调用）；
   * type 为「选择区域类型」面板所选类型字典值（禁飞区/任务区/集结区/降落区），
   * 未传时默认「集群侦察」；后端暂无新增接口，仅写入本地状态（刷新 load() 后消失）；
   * 仍处 mock 兜底时先清空 mock 仅保留本次新增（见 isMockFallback 注释），
   * 列表（AreaListPanel）与态势图（TaskAreaLayer）即时同步展示
   * （TaskAreaLayer 立即以持久样式渲染新区域）。
   * 返回新建区域 id（顶点不足 3 个时返回 null）
   */
  addArea: (vertices: TaskAreaVertex[], type?: string) => string | null
  /** 修改区域类型（绘制遮罩「编辑」后再次「确定」时仅更新类型，不重复建区） */
  updateAreaType: (id: string, type: string) => void
  /**
   * 修改区域顶点（编辑态拖拽节点结束时提交：顶点/中点手柄拖拽改变绘制区域，
   * mouseup 时一次性写入最新顶点数组并重算面积；拖拽全程零 store 更新保证丝滑）
   */
  updateAreaVertices: (id: string, vertices: TaskAreaVertex[]) => void
  /**
   * 「添加区域」请求计数器：区域列表面板（挂载于 MapToolbar 内，与 HomePage 平级，
   * 无法经 props 传递）点击「添加区域」按钮时 +1；HomePage 监听计数变化进入
   * 地图六边形绘制模式（与 deviceLinkStore.devicePanelOpenRequests 同款跨层级信号）
   */
  addAreaRequests: number
  /** 请求进入「添加区域」六边形绘制模式（AreaListPanel 按钮触发） */
  requestAddArea: () => void
  /**
   * 「编辑区域」跨层级请求：区域列表面板行内「编辑」按钮触发（面板挂载于
   * MapToolbar 内、与 HomePage 平级无法经 props 传递）；HomePage 监听变化进入
   * area-list 绘制模式挂载 HexagonAreaOverlay，遮罩消费请求后直接进入该区域的
   * 确认+编辑态，随后 clearEditAreaRequest 置回 null。nonce 每次自增，
   * 保证连续编辑同一区域也能触发订阅者（对象引用必然变化）。
   */
  editAreaRequest: { id: string; nonce: number } | null
  /** 请求编辑指定区域（AreaListPanel 行内「编辑」按钮触发） */
  requestEditArea: (id: string) => void
  /** 消费完毕清除「编辑区域」请求（HexagonAreaOverlay 进入编辑态后调用） */
  clearEditAreaRequest: () => void
}

export const useTaskAreaStore = create<TaskAreaState>((set, get) => ({
  // 初始填充 mock（load() 成功后整体替换为接口数据）
  areas: [...MOCK_TASK_AREAS],
  status: 'idle',
  error: null,
  isMockFallback: true,
  // mock 兜底数据同样默认全部隐藏（列表显隐按钮控制放出）
  hiddenIds: new Set(MOCK_TASK_AREAS.map((a) => a.id)),
  editingAreaId: null,
  setEditingArea: (id) => set({ editingAreaId: id }),
  updateAreaType: (id, type) =>
    set((s) => ({ areas: s.areas.map((a) => (a.id === id ? { ...a, type } : a)) })),
  updateAreaVertices: (id, vertices) =>
    set((s) => ({
      areas: s.areas.map((a) => {
        if (a.id !== id || vertices.length < 3) return a
        // 面积按经纬度包围盒估算（米），与 addArea 同口径
        const lats = vertices.map((v) => v.latitude)
        const lngs = vertices.map((v) => v.longitude)
        const avgLat = (Math.max(...lats) + Math.min(...lats)) / 2
        const widthM =
          (Math.max(...lngs) - Math.min(...lngs)) * 111_320 * Math.cos((avgLat * Math.PI) / 180)
        const heightM = (Math.max(...lats) - Math.min(...lats)) * 110_540
        return { ...a, vertices, areaKm2: Math.abs((widthM * heightM) / 1_000_000) }
      }),
    })),
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
      set({
        areas,
        status: 'ready',
        error: null,
        // 接口数据默认全部隐藏：显隐由区域列表逐个控制（与 mock 初始化同款约定）
        hiddenIds: new Set(areas.map((a) => a.id)),
        isMockFallback: false,
      })
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
  // 「编辑区域」跨层级请求信号（与 addAreaRequests 同款方案，但携带目标 id）：
  // AreaListPanel 行内「编辑」按钮 -> HomePage 监听进入 area-list 绘制模式 ->
  // HexagonAreaOverlay 挂载后消费请求，直接进入该区域确认+编辑态；
  // nonce 自增保证连续编辑同一区域也能触发订阅者
  editAreaRequest: null,
  requestEditArea: (id) =>
    set({ editAreaRequest: { id, nonce: (get().editAreaRequest?.nonce ?? 0) + 1 } }),
  clearEditAreaRequest: () => set({ editAreaRequest: null }),
  addArea: (vertices, type) => {
    // 在 set 闭包外捕获新建 id，返回给调用方（绘制遮罩记录为确认态区域）
    let createdId: string | null = null
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
      const id = `local-area-${Date.now()}`
      createdId = id
      // 仍处 mock 兜底（真实接口未成功加载）时整体清空，仅保留本地新增区域：
      // 确认新区域会自动开启「任务区域」图层，若不清空 mock 兜底将一并渲染，
      // 出现「只添加 1 个区域、态势图却多出好几个区域」的问题
      const base = s.isMockFallback ? [] : s.areas
      const area: TaskArea = {
        id,
        // 命名沿用列表既有格式（01区域名称/02区域名称…），按当前列表长度递增编号
        name: `${String(base.length + 1).padStart(2, '0')}区域名称`,
        // 「选择区域类型」面板所选类型（未传时默认「集群侦察」）
        type: type ?? 'TeamReconnaissance',
        areaKm2,
        priority: '2',
        createTime: Date.now(),
        vertices,
      }
      return {
        areas: [...base, area],
        isMockFallback: false,
        // mock 的隐藏标记随兜底数据一并作废（避免残留指向已不存在区域的 id）
        hiddenIds: s.isMockFallback ? new Set<string>() : s.hiddenIds,
      }
    })
    return createdId
  },
}))