import { create } from 'zustand'
import { message } from 'antd'
import { type FlightState } from '../hooks/useFlightAnimations'
import { ALARM_COLLAPSE_MS } from '../lib/formationLayout'
import { type Device } from '../config/index'
import {
  fetchPlaneStatus,
  mapPlaneToDevice,
  fetchTaskAreaList,
  mapTaskArea,
  deleteTaskArea,
  createTaskArea,
  updateTaskArea,
  toTaskAreaTypeDict,
  type PlaneRaw,
  type PlaneStatusData,
  type TaskArea,
  type TaskAreaVertex,
} from '../api/index'

/**
 * layerStore —— 首页图层显隐全局状态。
 *
 * LayerControlPanel 挂载于 MapControls 内部，与 HomePage 中的地图元素平级，
 * 无法通过 props 传递开关状态，故用 zustand 全局 store 承载（与 deviceLinkStore 同模式）：
 * - noflyZoneVisible：红色禁飞区显隐（默认关）；
 * - inspectionZoneVisible：01号巡检区显隐（默认关）；
 * - deviceLabelsVisible：无人机设备图标显隐（默认开）。
 */

interface LayerState {
  /** 禁飞区显隐（图层控制面板「禁飞区」开关，默认关） */
  noflyZoneVisible: boolean
  /** 01号巡检区显隐（图层控制面板「巡检区域」开关，默认关） */
  inspectionZoneVisible: boolean
  /** 无人机图标显隐（图层控制面板「设备标签」开关，默认开） */
  deviceLabelsVisible: boolean
  /** 任务区域显隐（图层控制面板「任务区域」开关，默认开；后端 queryTaskAreaList） */
  taskAreaVisible: boolean
  setNoflyZoneVisible: (visible: boolean) => void
  setInspectionZoneVisible: (visible: boolean) => void
  setDeviceLabelsVisible: (visible: boolean) => void
  setTaskAreaVisible: (visible: boolean) => void
}

export const useLayerStore = create<LayerState>((set) => ({
  noflyZoneVisible: false,
  inspectionZoneVisible: false,
  deviceLabelsVisible: true,
  taskAreaVisible: true,
  setNoflyZoneVisible: (visible) => set({ noflyZoneVisible: visible }),
  setInspectionZoneVisible: (visible) => set({ inspectionZoneVisible: visible }),
  setDeviceLabelsVisible: (visible) => set({ deviceLabelsVisible: visible }),
  setTaskAreaVisible: (visible) => set({ taskAreaVisible: visible }),
}))

/**
 * deviceLinkStore —— 首页飞机图标与设备管理面板的联动状态。
 *
 * 设备管理面板挂载于 MapToolbar 内部，与 HomePage 平级，无法通过 props 传递
 * hover/选中状态，故用 zustand 全局 store 承载（设备索引 = planeStatusStore devices 下标）：
 * - hoveredDevice：当前 hover 的设备索引（面板行与首页飞机图标双向同步）；
 * - selectedDevices：已勾选设备索引集合（面板复选框与首页图标单击同步）。
 */

interface DeviceLinkState {
  /** hover 中的设备索引（面板行或首页飞机图标），null 表示无 */
  hoveredDevice: number | null
  /** 已勾选的设备索引集合 */
  selectedDevices: Set<number>
  setHoveredDevice: (index: number | null) => void
  /** 切换指定设备的勾选状态 */
  /** Open-panel request counter: +1 each time an aircraft icon is clicked on home page */
  devicePanelOpenRequests: number
  /** Ask MapToolbar to open the device management panel */
  requestOpenDevicePanel: () => void
  toggleDevice: (index: number) => void
  /** 整体替换勾选集合（面板全选/全不选使用） */
  setSelectedDevices: (devices: Set<number>) => void
  /** 地图聚焦请求（设备管理面板单行勾选时写入）：index=设备索引，seq 递增保证
   *  重复勾选同一设备也能触发监听 effect；HomePage 消费后清除 */
  mapFocusDeviceRequest: { index: number; seq: number } | null
  /** 请求地图飞转聚焦指定设备（面板单行勾选时调用；全选走整体替换不触发） */
  requestMapFocusDevice: (index: number) => void
  /** 清除地图聚焦请求（HomePage 消费后调用，避免重复消费） */
  clearMapFocusDeviceRequest: () => void
}

export const useDeviceLinkStore = create<DeviceLinkState>((set) => ({
  hoveredDevice: null,
  devicePanelOpenRequests: 0,
  selectedDevices: new Set(),
  setHoveredDevice: (index) => set({ hoveredDevice: index }),
  toggleDevice: (index) =>
    set((state) => {
      const next = new Set(state.selectedDevices)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return { selectedDevices: next }
    }),
  setSelectedDevices: (devices) => set({ selectedDevices: devices }),
  requestOpenDevicePanel: () =>
    set((state) => ({ devicePanelOpenRequests: state.devicePanelOpenRequests + 1 })),
  mapFocusDeviceRequest: null,
  requestMapFocusDevice: (index) =>
    set((state) => ({
      mapFocusDeviceRequest: { index, seq: (state.mapFocusDeviceRequest?.seq ?? 0) + 1 },
    })),
  clearMapFocusDeviceRequest: () => set({ mapFocusDeviceRequest: null }),
}))

/**
 * flightAnimStore —— 模拟飞行动画专用 Zustand store（自 useFlightAnimations 的 useState 迁出）。
 *
 * 动画每帧（rAF）写 state，若沿用 HomePage 级 useState 会导致整棵 HomePage 树每帧重渲染
 * （面板/工具栏/地图全覆盖）。迁到全局 store 后，rAF tick 只重渲染订阅了对应飞行状态的
 * 覆盖层叶子组件（FlightMarkerOverlays/FlightSimulationOverlays 内的选择器订阅），
 * HomePage 主体与面板组件不再参与每帧渲染。
 *
 * 结构与 useFlightAnimations 原返回值中的 8 组飞行状态一一对应：
 * - 单机：tapReturnFlight / waypointFlight / routeFlightFlight / orbitFlight；
 * - 多机（数组）：returnHomeFlights / areaLandingFlights / rallyPointFlights / formationFlightFlights。
 *
 * 写入侧仅 useFlightAnimations（rAF 循环内 setState）；读取侧为覆盖层组件与
 * FlightMissionPanels 的事件期守卫（getState 读取，不订阅）。
 */

interface FlightAnimState {
  // ---- 单机动画 ----
  tapReturnFlight: FlightState | null
  waypointFlight: FlightState | null
  routeFlightFlight: FlightState | null
  orbitFlight: FlightState | null
  // ---- 多机动画 ----
  returnHomeFlights: FlightState[]
  areaLandingFlights: FlightState[]
  rallyPointFlights: FlightState[]
  formationFlightFlights: FlightState[]
  // ---- 巡检任务（一键创建，遥测驱动） ----
  /** 巡检任务飞行状态：planeId → 最新快照（经纬度/高度来自实时遥测，视口坐标由
   *  覆盖层按 project 重投影渲染；键为 WS telemetry deviceId） */
  reconFlights: Record<string, FlightState>
  /** 巡检任务进行中的设备主键（一键创建回执到达后写入，驱动巡检渲染循环；空数组=未在巡检） */
  reconFlightIds: string[]
  // ---- 写入器（rAF tick 调用） ----
  setTapReturnFlight: (s: FlightState | null) => void
  setWaypointFlight: (s: FlightState | null) => void
  setRouteFlightFlight: (s: FlightState | null) => void
  setOrbitFlight: (s: FlightState | null) => void
  setReturnHomeFlights: (s: FlightState[]) => void
  setAreaLandingFlights: (s: FlightState[]) => void
  setRallyPointFlights: (s: FlightState[]) => void
  setFormationFlightFlights: (s: FlightState[]) => void
  /** 巡检任务：整体写入全部飞行快照（每帧遥测驱动） */
  setReconFlights: (s: Record<string, FlightState>) => void
  /** 巡检任务：清除单机快照（落地/指令超时/面板关闭时） */
  clearReconFlight: (planeId: string) => void
  /** 巡检任务：清空全部巡检飞行（取消任务/面板关闭时） */
  clearReconFlights: () => void
  /** 巡检任务：回执到达后启动（写入 ids 并清空旧快照） */
  startReconFlights: (ids: string[]) => void
  /** 巡检任务：停止巡检（清空 ids 与快照，取消任务/重新创建时调用） */
  stopReconFlights: () => void
}

export const useFlightAnimStore = create<FlightAnimState>((set) => ({
  tapReturnFlight: null,
  waypointFlight: null,
  routeFlightFlight: null,
  orbitFlight: null,
  returnHomeFlights: [],
  areaLandingFlights: [],
  rallyPointFlights: [],
  formationFlightFlights: [],
  reconFlights: {},
  reconFlightIds: [],
  setTapReturnFlight: (s) => set({ tapReturnFlight: s }),
  setWaypointFlight: (s) => set({ waypointFlight: s }),
  setRouteFlightFlight: (s) => set({ routeFlightFlight: s }),
  setOrbitFlight: (s) => set({ orbitFlight: s }),
  setReturnHomeFlights: (s) => set({ returnHomeFlights: s }),
  setAreaLandingFlights: (s) => set({ areaLandingFlights: s }),
  setRallyPointFlights: (s) => set({ rallyPointFlights: s }),
  setFormationFlightFlights: (s) => set({ formationFlightFlights: s }),
  setReconFlights: (s) => set({ reconFlights: s }),
  clearReconFlight: (planeId) =>
    set((state) => {
      if (!(planeId in state.reconFlights)) return state
      const next = { ...state.reconFlights }
      delete next[planeId]
      return { reconFlights: next }
    }),
  clearReconFlights: () => set({ reconFlights: {} }),
  startReconFlights: (ids) => set({ reconFlightIds: ids, reconFlights: {} }),
  stopReconFlights: () => set({ reconFlightIds: [], reconFlights: {} }),
}))

/**
 * alarmPanelStore —— 告警面板状态机（WB-PF-002 修复：自 HomePage 根组件抽离）。
 *
 * 原实现：4 个 useState（activeAlarm/pendingAlarm/prevAlarm/alarmCollapsing）+ 渲染期
 * setState 对比 + 2 个定时器 effect 全部挂在 HomePage 根部，任一变化都令整树重渲染。
 * 现迁移至 Zustand store：StatusHeader / AlarmPanels 各自按选择器订阅，
 * 告警切换/收起只重渲染这两个消费组件，HomePage 与地图/面板子树不再参与。
 *
 * 语义与原实现完全一致：
 * - activeAlarm：当前展开的告警级别（null = 未展开）；
 * - pendingAlarm：级别切换中转——已展开 A 时点击另一徽标，先收起（activeAlarm=null）
 *   播放收起动画，ALARM_COLLAPSE_MS 后再展开目标级别；收起期间可改点/取消；
 * - alarmCollapsing：收起衔接标记——activeAlarm 非 null → null 的瞬间置 true，
 *   常驻面板缺口在收起动画全程保持补齐，ALARM_COLLAPSE_MS 后复位；展开时立即清除。
 *
 * 定时器在 actions 内以模块级句柄管理（store 无组件生命周期，无需 effect）。
 */

interface AlarmPanelState {
  /** 当前展开的告警级别（下标），null = 未展开 */
  activeAlarm: number | null
  /** 收起动画期间待展开的目标级别，null = 无中转 */
  pendingAlarm: number | null
  /** 收起衔接态：收起动画播放全程保持 true（面板缺口补齐），定时器复位 */
  alarmCollapsing: boolean
  /** 顶栏徽标点击（展开/toggle/中转切换，见函数内注释） */
  handleAlarmClick: (index: number) => void
  /** 常驻告警面板行点击：直接展开该级别详情面板（非 toggle；已在展开其它级别时立即切换，不播收起中转动画） */
  openAlarm: (index: number) => void
  /** 面板组外部点击收起：取消待展开目标并收起当前面板 */
  collapseFromOutside: () => void
}

/** 收起动画复位定时器（alarmCollapsing → false） */
let collapseTimer: number | null = null
/** 待展开定时器（收起动画播完后展开 pendingAlarm 目标级别） */
let pendingTimer: number | null = null

const clearCollapseTimer = () => {
  if (collapseTimer !== null) {
    window.clearTimeout(collapseTimer)
    collapseTimer = null
  }
}

const clearPendingTimer = () => {
  if (pendingTimer !== null) {
    window.clearTimeout(pendingTimer)
    pendingTimer = null
  }
}

export const useAlarmPanelStore = create<AlarmPanelState>((set, get) => {
  /** 挂收起动画复位定时器（开始收起时调用） */
  const armCollapseTimer = () => {
    clearCollapseTimer()
    collapseTimer = window.setTimeout(() => {
      collapseTimer = null
      set({ alarmCollapsing: false })
    }, ALARM_COLLAPSE_MS)
  }

  /** 挂待展开定时器：收起动画播完后展开目标级别（并立即清除 collapsing） */
  const armPendingTimer = (target: number) => {
    clearPendingTimer()
    pendingTimer = window.setTimeout(() => {
      pendingTimer = null
      set({ activeAlarm: target, pendingAlarm: null, alarmCollapsing: false })
    }, ALARM_COLLAPSE_MS)
  }

  /** 开始收起：置 collapsing 并挂复位定时器 */
  const startCollapse = () => {
    set({ alarmCollapsing: true })
    armCollapseTimer()
  }

  return {
    activeAlarm: null,
    pendingAlarm: null,
    alarmCollapsing: false,

    /** 顶栏徽标点击：
     *  - 收起中转期间点击：点待展开徽标本身＝取消（保持收起），点其他徽标＝改目标；
     *  - 已展开同一徽标：toggle 收起（挂 collapsing 定时器）；
     *  - 已展开另一级别：先收起 + 记录 pendingAlarm，动画播完后展开新级别；
     *  - 未展开：直接展开。 */
    handleAlarmClick: (index) => {
      const { pendingAlarm, activeAlarm } = get()
      if (pendingAlarm !== null) {
        const next = pendingAlarm === index ? null : index
        clearPendingTimer()
        set({ pendingAlarm: next })
        if (next !== null) armPendingTimer(next)
        return
      }
      if (activeAlarm === index) {
        startCollapse()
        set({ activeAlarm: null })
        return
      }
      if (activeAlarm !== null) {
        set({ pendingAlarm: index, activeAlarm: null })
        startCollapse()
        armPendingTimer(index)
        return
      }
      set({ activeAlarm: index })
    },

    /** 常驻面板行点击：直接展开指定级别（收起中转/收起动画期间也立即切换，不播收起动画） */
    openAlarm: (index) => {
      clearPendingTimer()
      set({ activeAlarm: index, pendingAlarm: null, alarmCollapsing: false })
    },

    /** 面板组外部点击：收起当前面板并取消待展开目标（无展开/无中转时不动作） */
    collapseFromOutside: () => {
      const { activeAlarm, pendingAlarm } = get()
      if (activeAlarm === null && pendingAlarm === null) return
      clearPendingTimer()
      if (activeAlarm !== null) {
        startCollapse()
        set({ activeAlarm: null, pendingAlarm: null })
      } else {
        set({ pendingAlarm: null })
      }
    },
  }
})

/**
 * 无人机状态 Store —— 承载 /api/v1/control/queryPlaneStatus 接口真实数据。
 *
 * 数据流：usePlaneStatusInit（MainApp 挂载，首页加载时调用一次）→ fetchPlaneStatus →
 * applyPlaneStatus（映射为 Device 模型整体写入）→ 设备管理面板 / 首页
 * AircraftFocusPanel 按选择器订阅。store 初始为空列表（不做 mock 兜底，
 * 设备只来自后端 queryPlaneStatus）；refresh 成功后整体写入真实数据，
 * 失败时保留上一帧并记录 lastError。
 *
 * 设备索引（deviceLinkStore 的 hoveredDevice/selectedDevices、首页 aircraft
 * 联动）直接使用 planeList 数组下标；列表长度变化（设备增删）时越界索引
 * 由消费端过滤（HomePage selectedAircraft 已做 null 过滤）。
 */

/** 集群统计（queryPlaneStatus data 顶层字段） */
export interface PlaneStats {
  planeOnline: number
  planeInAir: number
  planeTotal: number
}

export interface PlaneStatusState {
  /** 映射后的设备列表（接口 planeList 顺序，下标即设备索引） */
  devices: Device[]
  /** 接口原始设备列表（保留平台/载荷等未映射字段，供后续功能使用） */
  rawPlanes: PlaneRaw[]
  /** 集群统计 */
  stats: PlaneStats
  /** 首帧是否已加载完成（面板空态判断依据） */
  loaded: boolean
  /** 最近一次请求是否成功（失败保留上一帧数据） */
  lastError: string | null
  /** 最近一次成功刷新时间（Unix 毫秒） */
  lastUpdated: number
  /** 拉取并应用最新状态（首帧加载 Hook 调用；失败时仅记录错误） */
  refresh: () => Promise<void>
  /** 直接写入接口数据（测试/调试注入用） */
  applyPlaneStatus: (data: PlaneStatusData) => void
}

/** 默认统计：接口未返回前全 0 */
const EMPTY_STATS: PlaneStats = { planeOnline: 0, planeInAir: 0, planeTotal: 0 }

export const usePlaneStatusStore = create<PlaneStatusState>((set) => ({
  // 初始空列表：首帧数据由 usePlaneStatusInit（MainApp 挂载）拉取接口填充
  devices: [],
  rawPlanes: [],
  stats: EMPTY_STATS,
  loaded: false,
  lastError: null,
  lastUpdated: 0,

  refresh: async () => {
    try {
      const data = await fetchPlaneStatus()
      usePlaneStatusStore.getState().applyPlaneStatus(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // 不清空已有数据（接口暂不可用时面板保留上一帧），仅记录错误
      set({ lastError: message })
      console.warn('[planeStatus] queryPlaneStatus 请求失败：', message)
    }
  },

  applyPlaneStatus: (data) => {
    const list = Array.isArray(data?.planeList) ? data.planeList : []
    set({
      devices: list.map((raw) => mapPlaneToDevice(raw)),
      rawPlanes: list,
      stats: {
        planeOnline: data?.planeOnline ?? 0,
        planeInAir: data?.planeInAir ?? 0,
        planeTotal: data?.planeTotal ?? list.length,
      },
      loaded: true,
      lastError: null,
      lastUpdated: Date.now(),
    })
  },
}))

/** 非组件环境读取最新设备列表（如动画/图层工具函数） */
export function getPlaneDevices(): Device[] {
  return usePlaneStatusStore.getState().devices
}

/**
 * taskAreaStore —— 任务区域全局状态。
 *
 * 承载任务区域（多边形）列表，供 TaskAreaLayer 渲染到态势图。
 * 数据流：useTaskAreaInit（MainApp 挂载，首页加载时调用一次）→
 * fetchTaskAreaList → mapTaskArea 过滤已删除/非法记录 → 整体写入 areas。
 * 接口失败时保留上一帧数据并记录 lastError（不回退 mock）；用户在态势图上的
 * 绘制/编辑（addArea / updateAreaVertices / updateAreaType）在此基础上演进。
 */

interface TaskAreaState {
  /** 任务区域列表 */
  areas: TaskArea[]
  /** 首帧是否已加载完成 */
  loaded: boolean
  /** 最近一次请求是否成功（失败保留上一帧数据） */
  lastError: string | null
  /** 拉取并应用最新区域列表（首帧加载 Hook 调用；失败时仅记录错误） */
  refresh: () => Promise<void>
  /**
   * 本地隐藏的区域 id 集合（区域列表面板「显示」图标维护，TaskAreaLayer 渲染时过滤）。
   * 区域默认显示：接口数据与本地新增均默认全部显示（集合为空），
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
  /**
   * 删除单个区域（POST /api/v1/control/delTaskArea，2026-09-23 接入）：
   * 先调后端逻辑删除接口，成功后再本地移除（含 hiddenIds/编辑态清理），
   * 随后调用 refresh()（queryTaskAreaList）以后端数据为准刷新列表；
   * 删除失败保留本地数据并记录 lastError（与 refresh 同款保帧策略），
   * 返回是否删除成功（调用方均为 fire-and-forget，可不消费返回值）。
   */
  removeArea: (id: string) => Promise<boolean>
  /**
   * 新增区域（区域列表「添加区域」六边形绘制「确定」后调用，2026-09-28 接口化）：
   * POST /api/v1/control/addNewTaskArea 成功后 refresh()（queryTaskAreaList）以后端
   * 数据为准刷新列表与态势图，再按顶点匹配出新建区域并返回其后端 id（供绘制遮罩
   * 进入确认态）；type 为「选择区域类型」面板所选类型字典值（禁飞区/任务区/集结区/
   * 降落区，本地旧值经 toTaskAreaTypeDict 归一化为后端枚举），未传时默认「集群侦察」。
   * 失败保帧（不新增本地数据）+ message.error 提示并记录 lastError，返回 null；
   * 顶点不足 3 个同样返回 null。
   */
  addArea: (vertices: TaskAreaVertex[], type?: string) => Promise<string | null>
  /** 修改区域类型（绘制遮罩「编辑」后再次「确定」时仅更新类型，不重复建区） */
  updateAreaType: (id: string, type: string) => void
  /**
   * 修改区域顶点（编辑态拖拽节点结束时提交：顶点/中点手柄拖拽改变绘制区域，
   * mouseup 时一次性写入最新顶点数组并重算面积；拖拽全程零 store 更新保证丝滑）。
   * 仅本地提交不上送（一次编辑可能连续多次拖点/插点/删点），持久化统一延迟到
   * 编辑「确认」时（右键退出编辑等路径）经 commitAreaEdit 上送 updTaskArea
   */
  updateAreaVertices: (id: string, vertices: TaskAreaVertex[]) => void
  /**
   * 确认提交区域编辑（编辑态右键确认/退出编辑等路径调用，2026-09-29 反馈补充）：
   * 按该区域最新本地数据（顶点/名称/类型/面积）异步上送 updTaskArea，成功后
   * refresh()（queryTaskAreaList）以后端数据刷新区域列表与态势图；失败由
   * pushAreaUpdate 内部 message.error 提示并回滚（fire-and-forget，不抛错）
   */
  commitAreaEdit: (id: string) => void
  /**
   * 重命名区域（区域列表面板行内名称双击进入编辑、失焦/回车提交时调用）。
   * 名称 trim 后为空（纯空格/未输入）时静默忽略、保留原名称。
   */
  renameArea: (id: string, name: string) => void
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
  // 编辑持久化策略（2026-09-29 反馈调整）：renameArea/updateAreaType 乐观更新本地
  // 后立即 pushAreaUpdate 上送；updateAreaVertices 仅本地提交（拖点/删点高频操作
  // 不逐次上送），持久化统一延迟到编辑「确认」时（右键退出编辑等路径）经
  // commitAreaEdit → pushAreaUpdate 上送；上送成功后统一 refresh() 刷新列表
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
  // 确认提交区域编辑：fire-and-forget（上送/成功后刷新/失败提示回滚均在
  // pushAreaUpdate 内处理，见文件末尾）
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
    // 删除成功后再拉一次 queryTaskAreaList，以后端返回为准刷新列表数据；
    // 刷新失败时 refresh 内部保帧（保留已删除状态）并记录 lastError
    await get().refresh()
    return true
  },
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
    // 先落库后展示：POST /api/v1/control/addNewTaskArea（鉴权头由 apiPost 统一注入，
    // typeDict 本地旧值已归一化为后端枚举）；失败保帧（不新增本地数据）+
    // message.error 全局提示并记录 lastError，返回 null 由调用方留在定格态重试。
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
    // 成功后 refresh()（queryTaskAreaList）以后端数据为准刷新列表与态势图
    // （真实 id/名称/面积口径）；刷新失败 refresh 内部保帧并记录 lastError
    await get().refresh()
    // 按顶点匹配回填新建区域（顶点经 JSON 字符串往返，浮点精确，仍留 1e-9 容差），
    // 返回其后端 id 供绘制遮罩进入确认态（顶点相同的多区域取首个，可接受）
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

/**
 * 区域编辑持久化（POST /api/v1/control/updTaskArea，2026-09-29 接入）。
 *
 * 编辑操作（updateAreaType / renameArea 即时触发；顶点编辑经 commitAreaEdit 在
 * 「右键确认」等退出编辑路径统一触发）先乐观更新本地（编辑视觉/列表即时反馈），
 * 再经此函数按最新本地数据组装全量载荷异步上送：
 * - id：区域 ID（后端按 id 更新相应区域的其他字段）；
 * - name / typeDict / vertex：名称 / 类型字典（本地旧值经 toTaskAreaTypeDict
 *   归一化为后端枚举）/ 顶点序列（WGS84，顺序保持绘制顺序）；
 * - area：面积 m² 字符串（本地 areaKm2 为 km² 估算值，×1e6 向上取整转字符串，
 *   与 addNewTaskArea 上送口径一致）。
 * 鉴权头 Authorization: Bearer <token> 由 apiPost 统一注入；上送成功后拉一次
 * queryTaskAreaList（refresh）以后端数据刷新区域列表与态势图（2026-09-29 反馈）；
 * 失败 message.error 提示、记录 lastError 并同样 refresh() 以后端数据回滚本地
 * 乐观修改（refresh 失败时内部保帧并记录 lastError）。函数自身不抛错（调用方
 * fire-and-forget）。
 */
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
    // 上送成功后拉一次 queryTaskAreaList：以后端数据为准刷新区域列表与态势图
    //（刷新失败时 refresh 内部保帧并记录 lastError）
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
