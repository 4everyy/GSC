/**
 * @file podControl.ts
 * @description podControl（自 api/index.ts 拆出）—— 单机操控指令域：起飞/降落/航点/环绕/一键创建。
 * @author 4everyy
 * @date 2026-10-07
 */
import { apiPost } from './http'
import { type TaskAreaVertex } from './taskArea'

/** 单机操控指令（POST /api/v1/control/podControl，2026-09-23 接入）。 */

/** podControl 指令类型枚举（按后端联调文档逐步补充） */
export const POD_CONTROL_ACTION = {
  /** 起飞（componentcontrol: { height }，高度由起飞面板输入框指定） */
  takeoff: 40,
  /** 降落（无指令参数，载荷仅 { data: { actionType: 41 } */
  land: 41,
  /** 环绕飞行（circlepoint: { height, radius, longitude */
  orbit: 47,
  /** 航点飞行（geopoint: { height, longitude, latitude }） */
  waypoint: 48,
  /** 一键创建任务… */
  oneClickCreate: 77,
} as const

/** 下发起飞指令：actionType=40，height 为起飞高度（m）。 */
export async function podControlTakeoff(planeId: string, height: number): Promise<void> {
  await apiPost<unknown>('/v1/control/podControl', {
    data: {
      actionType: POD_CONTROL_ACTION.takeoff,
      componentcontrol: { height },
    },
    planeId,
  })
}

/** 下发降落指令：actionType=41，无指令参数（2026-09-24 后端确认与起飞同接口/v1/control/podControl */
export async function podControlLand(planeId: string): Promise<void> {
  await apiPost<unknown>('/v1/control/podControl', {
    data: {
      actionType: POD_CONTROL_ACTION.land,
    },
    planeId,
  })
}

/** 航点飞行地理参数（WGS84 经纬度 + 相对起飞点飞行高度 m，2026-09-24 后端确认） */
export interface PodGeoPoint {
  /** 飞行高度（m，相对起飞点） */
  height: number
  /** 经度（WGS84） */
  longitude: number
  /** 纬度（WGS84） */
  latitude: number
}

/** 环绕飞行盘旋参数（航点地理参数 + 盘旋半径 m） */
export interface PodCirclePoint extends PodGeoPoint {
  /** 盘旋半径（m） */
  radius: number
}

/** 下发航点飞行指令：actionType=48，geopoint 承载飞行高度与目标点 WGS84 经纬度… */
export async function podControlWaypoint(planeId: string, point: PodGeoPoint): Promise<void> {
  await apiPost<unknown>('/v1/control/podControl', {
    data: {
      actionType: POD_CONTROL_ACTION.waypoint,
      geopoint: point,
    },
    planeId,
  })
}

/** 下发环绕飞行指令：actionType=47，circlepoint 承载盘旋高度/半径与环绕中心WGS84 经纬度… */
export async function podControlOrbit(planeId: string, point: PodCirclePoint): Promise<void> {
  await apiPost<unknown>('/v1/control/podControl', {
    data: {
      actionType: POD_CONTROL_ACTION.orbit,
      circlepoint: point,
    },
    planeId,
  })
}

/** 一键创建任务指令（actionType=77，2026-09-29 接入，创建任务面板「一键创建」按钮触发）。 */

/** 一键创建任务固定飞行高度（m，后端当前约定固定 200） */
export const POD_ONE_CLICK_CREATE_HEIGHT = 200

/** 1→['1']、2→['1','2']、4→['1… */
export function planeIdsByCount(count: number): string[] {
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, i) => String(i + 1))
}

/** 巡检航线点（WGS84；与 TaskAreaVertex 同构，独立命名以区分「航线点」语义） */
export interface RouteLinePoint {
  latitude: number
  longitude: number
}

/** 一键创建接口原始响应（宽容信封直接载荷）：data 为回执文案，plane_line 为预设航线 */
interface OneClickCreateRaw {
  data?: string
  plane_line?: number[][][]
}

/** 剔除非法点与不足… */
export function parsePlaneLines(planeLine: number[][][] | undefined): RouteLinePoint[][] {
  if (!Array.isArray(planeLine)) return []
  return planeLine
    .map((line) =>
      Array.isArray(line)
        ? line.filter(
            (pt): pt is [number, number] =>
              Array.isArray(pt) &&
              pt.length >= 2 &&
              Number.isFinite(pt[0]) &&
              Number.isFinite(pt[1]),
          )
        : [],
    )
    .filter((line) => line.length >= 2)
    .map((line) => line.map(([lat, lng]) => ({ latitude: lat, longitude: lng })))
}

/** 下发一键创建任务指令：vertex 为任务区顶点二维数组（每个任务区一组顶点） */
export async function podControlOneClickCreate(
  planeIds: string[],
  vertex: TaskAreaVertex[][],
): Promise<RouteLinePoint[][]> {
  const raw = await apiPost<OneClickCreateRaw>('/v1/control/podControl', {
    data: {
      actionType: POD_CONTROL_ACTION.oneClickCreate,
      height: POD_ONE_CLICK_CREATE_HEIGHT,
      vertex,
    },
    planeId: planeIds,
  })
  return parsePlaneLines(raw?.plane_line)
}

