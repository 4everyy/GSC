/**
 * taskAreaStore —— 任务区域全局状态（纯前端）。
 *
 * 承载任务区域（多边形）列表，供 TaskAreaLayer 渲染到态势图。
 * 后端 HTTP 接口（queryTaskAreaList）模拟逻辑已移除：区域仅来自本地 mock
 * 数据（config/taskAreas.ts）初始化，以及用户在态势图上的绘制/编辑
 * （addArea / updateAreaVertices / updateAreaType）。
 * 本地新增（addArea）时若仍处初始 mock 数据则先整体清空（isMockFallback 标记），
 * 避免 mock 区域随「任务区域」图层自动开启一并涌上态势图。
 */
import { create } from 'zustand'
import { type TaskArea, type TaskAreaVertex } from '../api/taskArea'
import { MOCK_TASK_AREAS } from '../config/taskAreas'

interface TaskAreaState {
  /** 任务区域列表 */
  areas: TaskArea[]
  /**
   * 当前 areas 是否仍为初始 mock 数据（首次本地新增前置 true）。
   * addArea 时若仍为 true 则先整体清空 mock 再写入新区域——否则「添加区域」
   * 确认后自动开启「任务区域」图层时，mock 区域会一并涌上态势图/列表
   * （表现为「只添加 1 个区域，地图却多出好几个区域」）
   */
  isMockFallback: boolean
  /**
   * 本地隐藏的区域 id 集合（区域列表面板「显示」图标维护，TaskAreaLayer 渲染时过滤）。
   * 区域默认显示：mock 初始化与本地新增均默认全部显示（集合为空），
   * 用户经行内眼睛/底部批量「显示」逐个隐藏；本地新增（addArea）
   * 的区域不进集合——刚绘制完立即以持久样式可见。
   */
  hiddenIds: Set<string>
  /**
   * 编辑中的区域 id（绘制遮罩「编辑 | 删除」面板点「编辑」时写入；null 表示无）。
   * TaskAreaLayer 读取后对编辑中区域切换专属视觉：去填充、白描边 6px、
   * 顶点/边中点挂图标（vertex-handle / midpoint-handle.svg）；退出编辑（确定/取消/删除/退出
   * 绘制模式）时置回 null 恢复持久样式。
   */
  editingAreaId: string | null
  /** 进入/退出某区域的编辑态（绘制遮罩编辑按钮联动 TaskAreaLayer 编辑视觉） */
  setEditingArea: (id: string | null) => void
  /** 切换单个区域在态势图上的显隐（区域列表面板「显示」图标） */
  toggleHidden: (id: string) => void
  /** 本地移除单个区域 */
  removeArea: (id: string) => void
  /**
   * 本地新增区域（区域列表「添加区域」六边形绘制「确定」后调用）；
   * type 为「选择区域类型」面板所选类型字典值（禁飞区/任务区/集结区/降落区），
   * 未传时默认「集群侦察」；仍处初始 mock 数据时先清空 mock 仅保留本次新增
   * （见 isMockFallback 注释），列表（AreaListPanel）与态势图（TaskAreaLayer）
   * 即时同步展示（TaskAreaLayer 立即以持久样式渲染新区域）。
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
  /**
   * 「区域聚焦」跨层级请求：区域列表面板行复选框勾选时触发（面板挂载于
   * MapToolbar 内、与 HomePage 平级无法经 props 传递）；HomePage 监听变化后
   * 将地图平滑飞转、完整框入该区域包围盒，随后 clearAreaFocusRequest 置回
   * null。nonce 每次自增，保证连续勾选同一区域也能触发订阅者。
   */
  areaFocusRequest: { id: string; nonce: number } | null
  /** 请求地图聚焦到指定区域（AreaListPanel 行复选框勾选触发，仅显示中的区域） */
  requestFocusArea: (id: string) => void
  /** 消费完毕清除「区域聚焦」请求（HomePage flyTo 后调用） */
  clearAreaFocusRequest: () => void
}

export const useTaskAreaStore = create<TaskAreaState>((set, get) => ({
  // 初始填充 mock（用户本地新增/编辑在此基础上演进）
  areas: [...MOCK_TASK_AREAS],
  isMockFallback: true,
  // mock 数据同样默认全部显示（列表显隐按钮控制隐藏）
  hiddenIds: new Set<string>(),
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
  // 「区域聚焦」跨层级请求信号（与 editAreaRequest 同款方案）：AreaListPanel
  // 行复选框勾选（区域处于显示态时）-> HomePage 监听 fitBounds 框入区域后清除
  areaFocusRequest: null,
  requestFocusArea: (id) =>
    set({ areaFocusRequest: { id, nonce: (get().areaFocusRequest?.nonce ?? 0) + 1 } }),
  clearAreaFocusRequest: () => set({ areaFocusRequest: null }),
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
      // 仍处初始 mock 数据时整体清空，仅保留本地新增区域：
      // 确认新区域会自动开启「任务区域」图层，若不清空 mock 将一并渲染，
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