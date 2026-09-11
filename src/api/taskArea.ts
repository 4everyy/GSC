/**
 * 任务区域 HTTP API。
 *
 * POST /api/v1/control/queryTaskAreaList  —— 任务区域（多边形）列表。
 * 后端地址：http://192.168.120.30:8080（开发环境经 Vite /api 代理）。
 */
import { apiPost } from './http'

/** 区域顶点（WGS84） */
export interface TaskAreaVertex {
  latitude: number
  longitude: number
}

/** 单个任务区域原始数据（后端字段，原样保留） */
export interface TaskAreaRaw {
  id: string
  name: string
  /** 面积（平方千米，字符串数值） */
  area: string
  /** 优先级 */
  priority: string
  /** 形状字典（目前均为 square，即多边形顶点序列） */
  shapeDict: string
  /** 区域类型字典：TeamReconnaissance / NoFlyArea / enclosureArea / assembleArea */
  typeDict: string
  /** 逻辑删除标记：'1' 已删除 / '0' 正常 */
  del: string
  /** 创建时间（epoch ms 字符串） */
  createTime: string
  /** 顶点序列（JSON 字符串：[{latitude, longitude}, ...]） */
  vertex: string
}

/** 前端消费的任务区域模型 */
export interface TaskArea {
  id: string
  name: string
  /** 区域类型（后端 typeDict 原值） */
  type: string
  /** 面积（km²，数值） */
  areaKm2: number
  priority: string
  createTime: number
  /** 解析后的顶点（WGS84，顺序与后端一致） */
  vertices: TaskAreaVertex[]
}

/** 解析后端 vertex JSON 字符串为顶点数组（容错：非法 JSON / 非法点返回 []） */
export function parseTaskAreaVertex(vertex: string): TaskAreaVertex[] {
  try {
    const arr = JSON.parse(vertex) as TaskAreaVertex[]
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (v) => v && typeof v.latitude === 'number' && typeof v.longitude === 'number',
    )
  } catch {
    return []
  }
}

/** 拉取任务区域列表（请求参数为空对象，响应 data 为数组） */
export async function fetchTaskAreaList(): Promise<TaskAreaRaw[]> {
  return apiPost<TaskAreaRaw[]>('/v1/control/queryTaskAreaList', {})
}

/** TaskAreaRaw -> 前端 TaskArea（已删除 del='1' 或有效顶点 < 3 的记录返回 null） */
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
  TeamReconnaissance: { label: '集群侦察', color: '#40a9ff' },
  NoFlyArea: { label: '禁飞区', color: '#ff4d4f' },
  enclosureArea: { label: '围困区', color: '#ffa940' },
  assembleArea: { label: '集结区', color: '#73d13d' },
}

/** 未知类型兜底配置 */
export const TASK_AREA_TYPE_FALLBACK: TaskAreaTypeMeta = { label: '任务区域', color: '#b37feb' }

/** 读取类型展示配置（未知类型返回兜底配置） */
export function taskAreaTypeMeta(type: string): TaskAreaTypeMeta {
  return TASK_AREA_TYPE_META[type] ?? TASK_AREA_TYPE_FALLBACK
}