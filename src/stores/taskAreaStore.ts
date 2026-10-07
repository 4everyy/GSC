/**
 * @file taskAreaStore.ts
 * @description taskAreaStore.ts（自 stores/index.ts 拆出）—— 任务区域全局状态：列表加载、显隐切换、编辑态、 区域增删改、聚焦请求。变更频率与其它 store 独立（独立变化）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { create } from 'zustand'
import { message } from 'antd'
import {
  fetchTaskAreaList,
  mapTaskArea,
  deleteTaskArea,
  createTaskArea,
  updateTaskArea,
  toTaskAreaTypeDict,
  type TaskArea,
  type TaskAreaVertex,
} from '../api/index'

/** taskAreaStore —— 任务区域全局状态。 */

interface TaskAreaState {
  /** 任务区域列表 */
  areas: TaskArea[]
  /** 首帧是否已加载完成 */
  loaded: boolean
  /** 最近一次请求是否成功（失败保留上一帧数据） */
  lastError: string | null
  /** 拉取并应用最新区域列表（首帧加载 Hook 调用；失败时仅记录错误） */
  refresh: () => Promise<void>
  /** 本地隐藏的区域 id 集合（区域列表面板「显示」图标维护，TaskAreaLayer 渲染时过滤）。 */
  hiddenIds: Set<string>
  /** 编辑中的区域 id（绘制遮罩「编辑 | 删除」面板点「编辑」时写入；null 表示无）。 */
  editingAreaId: string | null
  /** 进入/退出某区域的编辑态（绘制遮罩编辑按钮联动 TaskAreaLayer 编辑视觉） */
  setEditingArea: (id: string | null) => void
  /** 切换单个区域在态势图上的显隐（区域列表面板「显示」图标） */
  toggleHidden: (id: string) => void
  /** 删除单个区域（POST /api/v1/control/delTaskArea，2026-09-23 接入）：先调后端逻辑删除接口 */
  removeArea: (id: string) => Promise<boolean>
  /** POST /api/v1/control/addNe… */
  addArea: (vertices: TaskAreaVertex[], type?: string) => Promise<string | null>
  /** 修改区域类型（绘制遮罩「编辑」后再次「确定」时仅更新类型，不重复建区） */
  updateAreaType: (id: string, type: string) => void
  /** 修改区域顶点（编辑态拖拽节点结束时提交：顶点/中点手柄拖拽改变绘制区域 */
  updateAreaVertices: (id: string, vertices: TaskAreaVertex[]) => void
  /** 确认提交区域编辑（编辑态右键确认/退出编辑等路径调用，2026-09-29 反馈补充）：按该区域最新本地数据（顶点/名称/类型/面积）异步上送 updTaskArea */
  commitAreaEdit: (id: string) => void
  /** 重命名区域（区域列表面板行内名称双击进入编辑、失焦/回车提交时调用）。 */
  renameArea: (id: string, name: string) => void
  /** 「添加区域」请求计数器：区域列表面板（挂载于 MapToolbar 内，与 HomePage 平级 */
  addAreaRequests: number
  /** 请求进入「添加区域」六边形绘制模式（AreaListPanel 按钮触发） */
  requestAddArea: () => void
  /** 「编辑区域」跨层级请求：区域列表面板行内「编辑」按钮触发（面板挂载于MapToolbar 内 */
  editAreaRequest: { id: string; nonce: number } | null
  /** 请求编辑指定区域（AreaListPanel 行内「编辑」按钮触发） */
  requestEditArea: (id: string) => void
  /** 消费完毕清除「编辑区域」请求（HexagonAreaOverlay 进入编辑态后调用） */
  clearEditAreaRequest: () => void
  /** 「区域聚焦」跨层级请求：区域列表面板行复选框勾选时触发（面板挂载于MapToolbar 内 */
  areaFocusRequest: { id: string; nonce: number } | null
  /** 请求地图聚焦到指定区域（AreaListPanel 行复选框勾选触发，仅显示中的区域） */
  requestFocusArea: (id: string) => void
  /** 消费完毕清除「区域聚焦」请求（HomePage flyTo 后调用） */
  clearAreaFocusRequest: () => void
}

export const useTaskAreaStore = create<TaskAreaState>((set, get) => ({
  // 初始空列表：首帧数据由 useTaskAreaInit（MainApp 挂载）拉取接口填充
  areas: [],
  loaded: false,
  lastError: null,
  // 接口数据默认全部显示（列表显隐按钮控制隐藏）
  hiddenIds: new Set<string>(),
  editingAreaId: null,
  setEditingArea: (id) => set({ editingAreaId: id }),
  refresh: async () => {
    try {
      const rawList = await fetchTaskAreaList()
      const areas = (Array.isArray(rawList) ? rawList : [])
        .map((raw) => mapTaskArea(raw))
        .filter((a): a is TaskArea => a !== null)
      set({ areas, loaded: true, lastError: null })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // 不清空已有数据（接口暂不可用时保留上一帧），仅记录错误
      set({ lastError: message })
      console.warn('[taskArea] queryTaskAreaList 请求失败：', message)
    }
  },
  // 编辑持久化策略（2026-09-29 反馈调整）：renameArea/updateAreaType 乐观更新本地后立即 pushAreaUpdate 上送
  updateAreaType: (id, type) => {
    set((s) => ({ areas: s.areas.map((a) => (a.id === id ? { ...a, type } : a)) }))
    void pushAreaUpdate(id)
  },
  renameArea: (id, name) => {
    const trimmed = name.trim()
    // 空名（纯空格/未输入）不写入，保留原名称（列表行失焦保存的回退约定）
    if (!trimmed) return
    set((s) => ({ areas: s.areas.map((a) => (a.id === id ? { ...a, name: trimmed } : a)) }))
    void pushAreaUpdate(id)
  },
  updateAreaVertices: (id, vertices) => {
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
    }))
    // 不在此处上送：一次编辑可能连续多次拖点/插点/删点，持久化统一延迟到编辑
    // 「确认」时（右键退出编辑等路径）由绘制遮罩调用 commitAreaEdit 上送
  },
  // 确认提交区域编辑：fire-and-forget（上送/成功后刷新/失败提示回滚均在pushAreaUpdate 内处理，见文件末尾）
  commitAreaEdit: (id) => {
    void pushAreaUpdate(id)
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
  removeArea: async (id) => {
    // 先走后端逻辑删除（鉴权头由 apiPost 统一注入），失败时保帧不删本地数据
    try {
      await deleteTaskArea([id])
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ lastError: message })
      console.warn('[taskArea] delTaskArea 请求失败：', message)
      return false
    }
    set((s) => {
      const nextHidden = new Set(s.hiddenIds)
      nextHidden.delete(id)
      return {
        areas: s.areas.filter((a) => a.id !== id),
        hiddenIds: nextHidden,
        // 正在编辑的区域被删除时同步退出编辑态
        editingAreaId: s.editingAreaId === id ? null : s.editingAreaId,
      }
    })
    // 删除成功后再拉一次 queryTaskAreaList，以后端返回为准刷新列表数据
    await get().refresh()
    return true
  },
  addAreaRequests: 0,
  requestAddArea: () => set((s) => ({ addAreaRequests: s.addAreaRequests + 1 })),
  // AreaListPanel 行内「编辑」按钮…
  editAreaRequest: null,
  requestEditArea: (id) =>
    set({ editAreaRequest: { id, nonce: (get().editAreaRequest?.nonce ?? 0) + 1 } }),
  clearEditAreaRequest: () => set({ editAreaRequest: null }),
  // AreaListPanel行复选框勾选（区域处于显示态时）->…
  areaFocusRequest: null,
  requestFocusArea: (id) =>
    set({ areaFocusRequest: { id, nonce: (get().areaFocusRequest?.nonce ?? 0) + 1 } }),
  clearAreaFocusRequest: () => set({ areaFocusRequest: null }),
  addArea: async (vertices, type) => {
    // 顶点不足 3 个无法构成多边形，静默忽略（防御兜底）
    if (vertices.length < 3) return null
    // 面积按经纬度包围盒估算（米）：经度每度 ≈111320·cos(纬度)，纬度每度 ≈110540
    const lats = vertices.map((v) => v.latitude)
    const lngs = vertices.map((v) => v.longitude)
    const avgLat = (Math.max(...lats) + Math.min(...lats)) / 2
    const widthM =
      (Math.max(...lngs) - Math.min(...lngs)) * 111_320 * Math.cos((avgLat * Math.PI) / 180)
    const heightM = (Math.max(...lats) - Math.min(...lats)) * 110_540
    const areaKm2 = Math.abs((widthM * heightM) / 1_000_000)
    // 命名沿用列表既有格式（01区域名称/02区域名称…），按当前列表长度递增编号
    const name = `${String(get().areas.length + 1).padStart(2, '0')}区域名称`
    // 先落库后展示：POST /api/v1/control/addNewTaskArea（鉴权头由 apiPost 统一注入
    try {
      await createTaskArea({
        // 接口 area 单位 m²（估算 areaKm2 为 km²），向上取整后转字符串上送
        area: String(Math.ceil(areaKm2 * 1_000_000)),
        name,
        typeDict: toTaskAreaTypeDict(type ?? 'TeamReconnaissance'),
        vertex: vertices,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ lastError: msg })
      console.warn('[taskArea] addNewTaskArea 请求失败：', msg)
      message.error(`新增区域失败：${msg}`)
      return null
    }
    // 成功后 refresh()（queryTaskAreaList）以后端数据为准刷新列表与态势图（真实 id/名称/面积口径）
    await get().refresh()
    // 按顶点匹配回填新建区域（顶点经 JSON 字符串往返，浮点精确，仍留 1e-9 容差）
    const created = get().areas.find(
      (a) =>
        a.vertices.length === vertices.length &&
        a.vertices.every(
          (v, i) =>
            Math.abs(v.latitude - vertices[i].latitude) < 1e-9 &&
            Math.abs(v.longitude - vertices[i].longitude) < 1e-9,
        ),
    )
    return created?.id ?? null
  },
}))

/** 区域编辑持久化（POST /api/v1/control/updTaskArea，2026-09-29 接入）。 */
async function pushAreaUpdate(id: string): Promise<void> {
  const area = useTaskAreaStore.getState().areas.find((a) => a.id === id)
  // 区域已不存在（删除竞态等）无需上送
  if (!area) return
  try {
    await updateTaskArea({
      id,
      name: area.name,
      typeDict: toTaskAreaTypeDict(area.type),
      area: String(Math.ceil(area.areaKm2 * 1_000_000)),
      vertex: area.vertices,
    })
    // 以后端数据为准刷新区域列表与态势图…
    await useTaskAreaStore.getState().refresh()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    useTaskAreaStore.setState({ lastError: msg })
    console.warn('[taskArea] updTaskArea 请求失败：', msg)
    message.error(`更新区域失败：${msg}`)
    // 以后端数据为准回滚本次乐观修改；刷新失败时 refresh 内部保帧
    await useTaskAreaStore.getState().refresh()
  }
}

