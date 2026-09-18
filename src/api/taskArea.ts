/**
 * 任务区域模型与展示元数据（纯前端）。
 *
 * 后端 HTTP 接口（queryTaskAreaList 等）相关模拟逻辑已移除：任务区域现仅由
 * 本地 mock 数据（config/taskAreas.ts）与用户在态势图上的绘制/编辑产生，
 * 不再发起任何 HTTP 请求；后续需要接回后端时再行恢复。
 */

/** 区域顶点（WGS84） */
export interface TaskAreaVertex {
  latitude: number
  longitude: number
}

/** 前端消费的任务区域模型 */
export interface TaskArea {
  id: string
  name: string
  /** 区域类型（TeamReconnaissance / NoFlyArea / enclosureArea / assembleArea ...） */
  type: string
  /** 面积（km²，数值） */
  areaKm2: number
  priority: string
  createTime: number
  /** 多边形顶点（WGS84，顺序保持绘制顺序） */
  vertices: TaskAreaVertex[]
}

/** 区域类型 -> 展示配置（主题色 / 中文名） */
export interface TaskAreaTypeMeta {
  label: string
  color: string
}

export const TASK_AREA_TYPE_META: Record<string, TaskAreaTypeMeta> = {
  TeamReconnaissance: { label: '集群侦察', color: '#40a9ff' },
  // 禁飞区/集结区色与「选择区域类型」面板设计稿色块（HexagonAreaOverlay
  // AREA_TYPE_OPTIONS）对齐，确认前后颜色一致（地图多边形/列表色点/面板三处统一）
  NoFlyArea: { label: '禁飞区', color: '#f32c30' },
  enclosureArea: { label: '围困区', color: '#ffa940' },
  assembleArea: { label: '集结区', color: '#7160f2' },
  taskArea: { label: '任务区', color: '#2084ba' },
  landingArea: { label: '降落区', color: '#7bff00' },
}

/** 未知类型兜底配置 */
export const TASK_AREA_TYPE_FALLBACK: TaskAreaTypeMeta = { label: '任务区域', color: '#b37feb' }

/** 读取类型展示配置（未知类型返回兜底配置） */
export function taskAreaTypeMeta(type: string): TaskAreaTypeMeta {
  return TASK_AREA_TYPE_META[type] ?? TASK_AREA_TYPE_FALLBACK
}