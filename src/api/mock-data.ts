/**
 * @file mock-data.ts
 * @description 离线兜底 Mock 数据：接口不可用时为无人机状态与任务区域提供降级数据
 * @author 4everyy
 * @date 2026-10-07
 */
import type { PlaneRaw, PlaneStatusData, TaskAreaRaw } from './index'

/** 离线兜底 Mock 数据（2026-09-26）。 */

/** 生成六边形顶点序列的 vertex JSON 字符串（与后端 vertex 字段同构） */
function hexRing(lng: number, lat: number, rLatDeg: number): string {
  const K = 1 / Math.cos((31.3 * Math.PI) / 180) // 经度方向按纬度 31.3° 放大，保证六边形视觉等比
  const pts: Array<{ longitude: number; latitude: number }> = []
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i
    pts.push({
      longitude: Number((lng + rLatDeg * K * Math.cos(a)).toFixed(6)),
      latitude: Number((lat + rLatDeg * Math.sin(a)).toFixed(6)),
    })
  }
  return JSON.stringify(pts)
}

/** queryPlaneStatus 全量设备列表… */
const MOCK_PLANE_LIST: PlaneRaw[] = [
  {
    id: '100000000001',
    businessId: 'BIZ-0001',
    name: '01中科晶锐',
    planeName: '01中科晶锐',
    planeCode: 'UAV-001',
    planeIp: 'rtsp://192.168.1.101:8554/live',
    planeStatus: '在线',
    planeStatusCode: '3',
    typeId: '1',
    typeDict: 'drone',
    platform: 'M350 RTK',
    loadId: 'PAY-001',
    remark: '主力侦察机',
    latitude: 31.2761,
    longitude: 120.5823,
    altitude: 8.5,
    height: 0,
    voltage: 25.1,
    battery: 0.92,
    delay: 38,
    velocityNorth: 0,
    angleYaw: 12.5,
    angleRoll: 0.2,
    anglePitch: -0.4,
    usedGPS: 21,
    createTime: '1790121600000',
  },
  {
    id: '100000000002',
    businessId: 'BIZ-0002',
    name: '02中科晶锐',
    planeName: '02中科晶锐',
    planeCode: 'UAV-002',
    planeIp: 'rtsp://192.168.1.102:8554/live',
    planeStatus: '执行中',
    planeStatusCode: '1',
    typeId: '1',
    typeDict: 'drone',
    platform: 'M350 RTK',
    loadId: 'PAY-002',
    remark: '巡检任务中',
    latitude: 31.3142,
    longitude: 120.6218,
    altitude: 45.2,
    height: 120.5,
    voltage: 24.1,
    battery: 0.76,
    delay: 45,
    velocityNorth: 8.3,
    angleYaw: 187.5,
    angleRoll: 1.4,
    anglePitch: -2.1,
    usedGPS: 23,
    createTime: '1790125200000',
  },
  {
    id: '100000000003',
    businessId: 'BIZ-0003',
    name: '03中科晶锐',
    planeName: '03中科晶锐',
    planeCode: 'UAV-003',
    planeIp: 'rtsp://192.168.1.103:8554/live',
    planeStatus: '执行中',
    planeStatusCode: '1',
    typeId: '1',
    typeDict: 'drone',
    platform: 'M300 RTK',
    loadId: 'PAY-003',
    remark: '电量偏低，建议返航',
    latitude: 31.3508,
    longitude: 120.5541,
    altitude: 32.0,
    height: 95.0,
    voltage: 22.3,
    battery: 0.24,
    delay: 52,
    velocityNorth: 6.1,
    angleYaw: 96.0,
    angleRoll: -0.8,
    anglePitch: 1.6,
    usedGPS: 18,
    createTime: '1790128800000',
  },
  {
    id: '100000000004',
    businessId: 'BIZ-0004',
    name: '04中科晶锐',
    planeName: '04中科晶锐',
    planeCode: 'UAV-004',
    planeIp: 'rtsp://192.168.1.104:8554/live',
    planeStatus: '待命',
    planeStatusCode: '0',
    typeId: '1',
    typeDict: 'drone',
    platform: 'M300 RTK',
    loadId: 'PAY-004',
    remark: '地面待命',
    latitude: 31.2895,
    longitude: 120.6092,
    altitude: 6.2,
    height: 0,
    voltage: 25.4,
    battery: 1.0,
    delay: 36,
    velocityNorth: 0,
    angleYaw: 0,
    angleRoll: 0,
    anglePitch: 0,
    usedGPS: 22,
    createTime: '1790121600000',
  },
  {
    id: '100000000005',
    businessId: 'BIZ-0005',
    name: '05中科晶锐',
    planeName: '05中科晶锐',
    planeCode: 'UAV-005',
    planeStatus: '离线',
    planeStatusCode: '2',
    typeId: '1',
    typeDict: 'drone',
    platform: 'M300 RTK',
    remark: '返场检修，链路断开',
    createTime: '1790035200000',
  },
  {
    id: '100000000006',
    businessId: 'BIZ-0006',
    name: '06中科晶锐',
    planeName: '06中科晶锐',
    planeCode: 'UAV-006',
    planeStatus: '待命',
    planeStatusCode: '0',
    typeId: '1',
    typeDict: 'drone',
    platform: 'M350 RTK',
    loadId: 'PAY-006',
    remark: '备用机',
    latitude: 31.2468,
    longitude: 120.6405,
    altitude: 5.8,
    height: 0,
    voltage: 25.0,
    battery: 0.88,
    delay: 41,
    velocityNorth: 0,
    angleYaw: 270.0,
    angleRoll: 0.1,
    anglePitch: 0.3,
    usedGPS: 20,
    createTime: '1790121600000',
  },
]

/** queryPlaneStatus 兜底载荷… */
export const MOCK_PLANE_STATUS: PlaneStatusData = {
  planeOnline: 4,
  planeInAir: 2,
  planeTotal: MOCK_PLANE_LIST.length,
  planeList: MOCK_PLANE_LIST,
  statusName: 'plane_list',
}

/** queryTaskAreaList 区域列表… */
export const MOCK_TASK_AREA_LIST: TaskAreaRaw[] = [
  {
    id: '2001',
    name: '01侦察任务区',
    area: '1.86',
    priority: '1',
    shapeDict: 'square',
    typeDict: 'TeamReconnaissance',
    del: '0',
    createTime: '1790035200000',
    vertex: hexRing(120.582, 31.282, 0.014),
  },
  {
    id: '2002',
    name: '02机场禁飞区',
    area: '0.92',
    priority: '0',
    shapeDict: 'square',
    typeDict: 'NoFlyArea',
    del: '0',
    createTime: '1790035200000',
    vertex: hexRing(120.642, 31.352, 0.01),
  },
  {
    id: '2003',
    name: '03集群集结区',
    area: '0.45',
    priority: '2',
    shapeDict: 'square',
    typeDict: 'assembleArea',
    del: '0',
    createTime: '1790121600000',
    vertex: hexRing(120.552, 31.322, 0.007),
  },
  {
    id: '2004',
    name: '04电子围栏区',
    area: '3.12',
    priority: '1',
    shapeDict: 'square',
    typeDict: 'enclosureArea',
    del: '0',
    createTime: '1790121600000',
    vertex: hexRing(120.618, 31.248, 0.018),
  },
  {
    id: '2005',
    name: '05区域降落场',
    area: '0.28',
    priority: '2',
    shapeDict: 'square',
    typeDict: 'TeamLand',
    del: '0',
    createTime: '1790121600000',
    vertex: hexRing(120.574, 31.356, 0.006),
  },
]

/** 2026-09-24 联调记录：WS alert 频道推送帧（真实报文格式还原，ch:'alert' 信封 + data 单帧）。 */

/** mock 告警帧：与 WS alert 频道推送帧同构（ch 信封 + data 单帧 */
export interface MockAlertFrame {
  ch: 'alert'
  /** 信封时间戳（Unix 毫秒） */
  ts: number
  /** 告警单帧（字段与 2026-09-24 真实推送帧完全同构） */
  data: Record<string, unknown>
}

/** 两条常显告警：一条二级警告（橙，禁飞区，与真实样例帧一致）+ 一条一级紧急（红，低电量） */
export const MOCK_WS_ALERT_FRAMES: MockAlertFrame[] = [
  {
    ch: 'alert',
    ts: 1790233268418,
    data: {
      equipId: '1',
      id: '9ee4ff8c4a061c61',
      isRead: '0',
      level: 2,
      msg: '1飞入禁飞区',
      round: 1,
      time: '2026:09:24 15:01:08',
      title: '禁飞区告警',
      ts: 1790233268418,
      type: '0',
      typeName: 'plane',
    },
  },
  {
    ch: 'alert',
    ts: 1790233473000,
    data: {
      equipId: '3',
      id: 'a7c5e90b2f41d8e3',
      isRead: '0',
      level: 1,
      msg: '3号机电量低于15%，请立即返航',
      round: 1,
      time: '2026:09:24 15:04:33',
      title: '低电量告警',
      ts: 1790233473000,
      type: '0',
      typeName: 'plane',
    },
  },
]
