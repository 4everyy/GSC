/**
 * 任务区域 mock 数据（config/taskAreas.ts）。
 *
 * - 区域列表（AreaListPanel）与态势图任务区域层（TaskAreaLayer）的兜底数据源：
 *   taskAreaStore 初始即填充本 mock，后端 queryTaskAreaList 成功后整体替换为
 *   真实数据；接口失败/后端未开启时静默保留 mock（表现与目标列表一致）；
 * - 7 条数据对齐设计稿（01-07 区域名称），类型覆盖 4 种字典值
 *   （集群侦察/禁飞区/围困区/集结区），面积给 km² 数值；
 * - 顶点为苏州市中心（MAPLIBRE_DEFAULT_CENTER 120.6/31.3）附近的正方形，
 *   保证态势图默认视野内可见（与离线瓦片覆盖范围匹配）。
 */
import type { TaskArea } from '../api/taskArea'
import { MAPLIBRE_DEFAULT_CENTER } from './mapLibre'

/** 以 (cx, cy) 为中心、边长 2×half（度）的正方形顶点（WGS84，逆时针无要求，闭合由渲染层处理） */
function square(cx: number, cy: number, half: number) {
  return [
    { longitude: cx - half, latitude: cy - half },
    { longitude: cx + half, latitude: cy - half },
    { longitude: cx + half, latitude: cy + half },
    { longitude: cx - half, latitude: cy + half },
  ]
}

const CX = MAPLIBRE_DEFAULT_CENTER.lng
const CY = MAPLIBRE_DEFAULT_CENTER.lat

/** 任务区域 mock 列表（初始 7 行） */
export const MOCK_TASK_AREAS: TaskArea[] = [
  {
    id: 'mock-area-01',
    name: '01区域名称',
    type: 'TeamReconnaissance',
    areaKm2: 1.6,
    priority: '1',
    createTime: 1756000000000,
    vertices: square(CX - 0.025, CY + 0.015, 0.006),
  },
  {
    id: 'mock-area-02',
    name: '02区域名称',
    type: 'NoFlyArea',
    areaKm2: 2.4,
    priority: '2',
    createTime: 1756000100000,
    vertices: square(CX + 0.02, CY + 0.02, 0.008),
  },
  {
    id: 'mock-area-03',
    name: '03区域名称',
    type: 'enclosureArea',
    areaKm2: 0.9,
    priority: '1',
    createTime: 1756000200000,
    vertices: square(CX - 0.035, CY - 0.025, 0.005),
  },
  {
    id: 'mock-area-04',
    name: '04区域名称',
    type: 'assembleArea',
    areaKm2: 3.2,
    priority: '3',
    createTime: 1756000300000,
    vertices: square(CX + 0.04, CY - 0.02, 0.009),
  },
  {
    id: 'mock-area-05',
    name: '05区域名称',
    type: 'TeamReconnaissance',
    areaKm2: 1.1,
    priority: '2',
    createTime: 1756000400000,
    vertices: square(CX, CY - 0.045, 0.0055),
  },
  {
    id: 'mock-area-06',
    name: '06区域名称',
    type: 'NoFlyArea',
    areaKm2: 2.0,
    priority: '1',
    createTime: 1756000500000,
    vertices: square(CX - 0.055, CY, 0.007),
  },
  {
    id: 'mock-area-07',
    name: '07区域名称',
    type: 'enclosureArea',
    areaKm2: 1.8,
    priority: '3',
    createTime: 1756000600000,
    vertices: square(CX + 0.06, CY + 0.04, 0.0065),
  },
]