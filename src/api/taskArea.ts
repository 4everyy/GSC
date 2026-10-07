/**
 * @file taskArea.ts
 * @description taskArea（自 api/index.ts 拆出）—— 任务区域域接口与模型（增删改查 + 类型元数据）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { apiPost } from './http'
import { MOCK_TASK_AREA_LIST } from './mock-data'

/** 区域顶点（WGS84） */
export interface TaskAreaVertex {
  latitude: number
  longitude: number
}

/** 前端消费的任务区域模型 */
export interface TaskArea {
  id: string
  name: string
  /** 区域类型… */
  type: string
  /** 面积（km²，数值） */
  areaKm2: number
  priority: string
  createTime: number
  /** 多边形顶点（WGS84，顺序保持绘制顺序） */
  vertices: TaskAreaVertex[]
}

/** 单个任务区域原始数据（后端字段，原样保留） */
export interface TaskAreaRaw {
  id: string
  name: string
  /** 面积（平方千米，字符串数值） */
  area: string
  /** 优先级 */
  priority: string
  /** 形状字典（目前均为 'square'，即多边形顶点序列） */
  shapeDict: string
  /** 区域类型字典：TeamReconnaissance / NoFlyArea / enclos… */
  typeDict: string
  /** 逻辑删除标记：'1' 已删除 / '0' 正常 */
  del: string
  /** 创建时间（epoch ms 字符串） */
  createTime: string
  /** 顶点序列（JSON 字符串：[{latitude, longitude}, ...]） */
  vertex: string
}

/** 解析后端 vertex JSON 字符串为顶点数组（容错：非法 JSON / 非法点返回 []） */
export function parseTaskAreaVertex(vertex: string): TaskAreaVertex[] {
  try {
    const arr = JSON.parse(vertex) as TaskAreaVertex[]
    if (!Array.isArray(arr)) return []
    return arr.filter((v) => v && typeof v.latitude === 'number' && typeof v.longitude === 'number')
  } catch {
    return []
  }
}

/** 拉取任务区域列表（请求参数为空对象）。 */
export async function fetchTaskAreaList(): Promise<TaskAreaRaw[]> {
  let data: TaskAreaRaw[] | { dataList?: TaskAreaRaw[] }
  try {
    data = await apiPost<TaskAreaRaw[] | { dataList?: TaskAreaRaw[] }>(
      '/v1/control/queryTaskAreaList',
      {},
    )
  } catch (err) {
    // 离线兜底（mock-data.ts 2026-09-23 联调快照）：后端不可达（网络不通/HTTP/业务错误）时返回区域 mock
    console.warn('[api] queryTaskAreaList 请求失败，使用离线 mock 兜底：', err)
    return MOCK_TASK_AREA_LIST
  }
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.dataList)) return data.dataList
  return []
}

/** 新增任务区域（POST /api/v1/control/addNewTaskArea，2026-09-28 接入）。 */

/** addNewTaskArea 请求体 */
export interface AddTaskAreaPayload {
  /** 区域面积（m²，字符串数值，与列表 TaskAreaRaw.area 口径一致） */
  area: string
  /** 区域名称 */
  name: string
  /** 区域类型字典（按枚举值传，见 toTaskAreaTypeDict） */
  typeDict: string
  /** 多边形顶点（WGS84 经纬度，顺序保持绘制顺序） */
  vertex: TaskAreaVertex[]
}

/** 本地旧类型值 → 后端 typeDict 枚举映射… */
const TASK_AREA_TYPE_DICT_MAP: Record<string, string> = {
  taskArea: 'TeamReconnaissance',
  landingArea: 'TeamLand',
}

/** 区域类型值归一化为后端 typeDict 枚举（未知值原样透传） */
export function toTaskAreaTypeDict(type: string): string {
  return TASK_AREA_TYPE_DICT_MAP[type] ?? type
}

/** 新增任务区域：绘制遮罩「选择区域类型」面板点「确定」后调用 */
export async function createTaskArea(payload: AddTaskAreaPayload): Promise<void> {
  await apiPost<unknown>('/v1/control/addNewTaskArea', payload)
}

/** 更新任务区域（POST /api/v1/control/updTaskArea，2026-09-29 接入）。 */

/** updTaskArea 请求体（全量字段：id 定位区域，其余字段整体覆盖） */
export interface UpdateTaskAreaPayload {
  /** 区域面积（m²，字符串数值，与列表 TaskAreaRaw.area 口径一致） */
  area: string
  /** 区域 ID（通过区域 ID 更新相应区域的其他字段） */
  id: string
  /** 区域名称 */
  name: string
  /** 区域类型字典（按枚举值传字符串） */
  typeDict: string
  /** 多边形顶点（WGS84 经纬度，顺序保持绘制顺序） */
  vertex: TaskAreaVertex[]
}

/** 更新任务区域：编辑区域（顶点拖拽/删点/重命名/改类型）提交时调用 */
export async function updateTaskArea(payload: UpdateTaskAreaPayload): Promise<void> {
  await apiPost<unknown>('/v1/control/updTaskArea', payload)
}

/** 删除任务区域（POST /api/v1/control/delTaskArea，2026-09-23 接入）。 */
export async function deleteTaskArea(ids: string[]): Promise<void> {
  await apiPost<unknown>('/v1/control/delTaskArea', { id: ids })
}

/** TaskAreaRaw -> 前端 TaskArea… */
export function mapTaskArea(raw: TaskAreaRaw): TaskArea | null {
  const vertices = parseTaskAreaVertex(raw.vertex ?? '')
  if (raw.del === '1' || vertices.length < 3) return null
  return {
    id: raw.id,
    name: raw.name,
    type: raw.typeDict,
    areaKm2: Number(raw.area) || 0,
    priority: raw.priority,
    createTime: Number(raw.createTime) || 0,
    vertices,
  }
}

/** 区域类型 -> 展示配置（主题色 / 中文名） */
export interface TaskAreaTypeMeta {
  label: string
  color: string
}

export const TASK_AREA_TYPE_META: Record<string, TaskAreaTypeMeta> = {
  // TeamReconnaissance-任务区 / NoFly…
  TeamReconnaissance: { label: '任务区', color: '#40a9ff' },
  NoFlyArea: { label: '禁飞区', color: '#f32c30' },
  assembleArea: { label: '集结区', color: '#7160f2' },
  enclosureArea: { label: '围栏区', color: '#ffa940' },
  TeamLand: { label: '降落区', color: '#7bff00' },
  // 旧类型键兼容（本地绘制「选择区域类型」面板仍写入 taskArea/landingArea 值）
  taskArea: { label: '任务区', color: '#2084ba' },
  landingArea: { label: '降落区', color: '#7bff00' },
}

/** 未知类型兜底配置 */
export const TASK_AREA_TYPE_FALLBACK: TaskAreaTypeMeta = { label: '任务区域', color: '#b37feb' }

/** 读取类型展示配置（未知类型返回兜底配置） */
export function taskAreaTypeMeta(type: string): TaskAreaTypeMeta {
  return TASK_AREA_TYPE_META[type] ?? TASK_AREA_TYPE_FALLBACK
}
