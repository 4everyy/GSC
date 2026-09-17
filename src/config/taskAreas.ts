/**
 * 任务区域 mock 数据（config/taskAreas.ts）。
 *
 * - 区域列表（AreaListPanel）与态势图任务区域层（TaskAreaLayer）的兜底数据源：
 *   taskAreaStore 初始即填充本 mock，后端 queryTaskAreaList 成功后整体替换为
 *   真实数据；接口失败/后端未开启时静默保留 mock（表现与目标列表一致）；
 * - 4 条数据均为正六边形（与「添加区域」绘制交互同款 pointy-top 朝向），
 *   各对应一种可选区域类型（禁飞区/任务区/集结区/降落区），面积给 km² 数值
 *   （与 addArea 包围盒估算同口径）；
 * - 中心分布于苏州市中心（MAPLIBRE_DEFAULT_CENTER 120.6/31.3）附近，
 *   保证态势图默认视野内可见（与离线瓦片覆盖范围匹配）。
 */
import type { TaskArea } from '../api/taskArea'
import { MAPLIBRE_DEFAULT_CENTER } from './mapLibre'

/** 正六边形顶点方位角（度，pointy-top：自正上方起每 60°，
 *  与 HexagonAreaOverlay 绘制朝向一致） */
const HEX_ANGLES = [90, 30, -30, -90, -150, 150]

/** 以 (cx, cy) 为圆心、外接圆半径 r（度）的正六边形顶点（WGS84） */
function hexagon(cx: number, cy: number, r: number) {
  return HEX_ANGLES.map((deg) => {
    const rad = (deg * Math.PI) / 180
    return { longitude: cx + r * Math.cos(rad), latitude: cy + r * Math.sin(rad) }
  })
}

const CX = MAPLIBRE_DEFAULT_CENTER.lng
const CY = MAPLIBRE_DEFAULT_CENTER.lat

/** 任务区域 mock 列表（4 条六边形，各对应一种区域类型） */
export const MOCK_TASK_AREAS: TaskArea[] = [
  {
    id: 'mock-area-01',
    name: '01区域名称',
    type: 'NoFlyArea',
    areaKm2: 2.3,
    priority: '1',
    createTime: 1756000000000,
    vertices: hexagon(CX - 0.03, CY + 0.02, 0.008),
  },
  {
    id: 'mock-area-02',
    name: '02区域名称',
    type: 'taskArea',
    areaKm2: 0.9,
    priority: '2',
    createTime: 1756000100000,
    vertices: hexagon(CX + 0.025, CY + 0.03, 0.005),
  },
  {
    id: 'mock-area-03',
    name: '03区域名称',
    type: 'assembleArea',
    areaKm2: 1.8,
    priority: '3',
    createTime: 1756000200000,
    vertices: hexagon(CX - 0.035, CY - 0.025, 0.007),
  },
  {
    id: 'mock-area-04',
    name: '04区域名称',
    type: 'landingArea',
    areaKm2: 0.7,
    priority: '2',
    createTime: 1756000300000,
    vertices: hexagon(CX + 0.04, CY - 0.02, 0.0045),
  },
]