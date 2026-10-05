/**
 * 视频监测屏 mock 数据与类型。
 *
 * 当前阶段先以静态数据驱动界面（设备/目标框/侧栏小卡/遥测面板），
 * 后续接入真实图传流时仅需替换此文件的数据来源（WebSocket / REST）。
 */

/** 画面内 AI 检测目标框 */
export interface VideoTargetBox {
  id: string
  /** 左上角百分比坐标（相对画面） */
  left: number
  top: number
  width: number
  height: number
  /** 目标类型标签，如 人员 / 车辆 */
  kind: 'person' | 'vehicle'
  /** 告警色：normal=#6067F2，warn=#FF8400 */
  level: 'normal' | 'warn'
  targetId: string
}

/** 遥测信息面板单行（左上折叠按钮展开显示） */
export interface TelemetryItem {
  label: string
  value: string
}

/** 主视频画面（四宫格中的一路） */
export interface VideoChannel {
  id: string
  name: string
  online: boolean
  /** 电量百分比 */
  battery: number
  /** 画面内检测框 */
  targets: VideoTargetBox[]
  /** 遥测信息面板数据（图传延迟 / 经纬度 / 姿态 / RTK / GPS 等） */
  telemetry: TelemetryItem[]
  /** 底部操作条形态：主目标机显示 跟踪/跟随/打击，其余显示 操作 */
  actionBar: 'track' | 'operate'
}

/** 右侧「其他在线设备」小卡 */
export interface MiniDeviceCard {
  id: string
  name: string
  tracking: boolean
  battery: number
}

/** 按设计稿构造一路遥测面板数据（数值随设备微调，接真实流后由后端推送） */
function buildTelemetry(o: {
  delay: number
  lon: string
  lat: string
  alt: number
  relAlt: number
  yaw: number
  pitch: number
  roll: number
  rtk: string
}): TelemetryItem[] {
  return [
    { label: '图传信号延迟', value: `${o.delay}ms` },
    { label: '经度', value: o.lon },
    { label: '纬度', value: o.lat },
    { label: '海拔高度', value: `${o.alt}m` },
    { label: '相对高度', value: `${o.relAlt}m` },
    { label: '偏航', value: `${o.yaw}°` },
    { label: '俯仰', value: `${o.pitch}°` },
    { label: '横滚', value: `${o.roll}°` },
    { label: 'RTK', value: o.rtk },
    { label: 'GPS', value: '健康' },
    { label: '作业开始时间', value: '00000' },
  ]
}

export const VIDEO_CHANNELS: VideoChannel[] = [
  {
    id: 'cam-01',
    name: '01中科晶锐',
    online: true,
    battery: 100,
    actionBar: 'track',
    telemetry: buildTelemetry({
      delay: 23,
      lon: '116.391',
      lat: '39.907',
      alt: 62,
      relAlt: 32,
      yaw: 18,
      pitch: -12,
      roll: -22,
      rtk: '固定解',
    }),
    targets: [
      { id: 't1', left: 41, top: 38, width: 16.8, height: 59.5, kind: 'person', level: 'normal', targetId: 'P-012' },
      { id: 't2', left: 61.6, top: 40.5, width: 11.5, height: 59.5, kind: 'person', level: 'normal', targetId: 'P-013' },
      { id: 't3', left: 80.5, top: 36.6, width: 12.8, height: 59.9, kind: 'person', level: 'normal', targetId: 'P-014' },
      { id: 't4', left: 69, top: 37, width: 12.8, height: 62.3, kind: 'person', level: 'warn', targetId: 'P-015' },
    ],
  },
  {
    id: 'cam-02',
    name: '02中科晶锐',
    online: true,
    battery: 100,
    actionBar: 'operate',
    telemetry: buildTelemetry({
      delay: 26,
      lon: '116.402',
      lat: '39.911',
      alt: 58,
      relAlt: 28,
      yaw: 205,
      pitch: -8,
      roll: -15,
      rtk: '固定解',
    }),
    targets: [],
  },
  {
    id: 'cam-03',
    name: '03中科晶锐',
    online: true,
    battery: 100,
    actionBar: 'operate',
    telemetry: buildTelemetry({
      delay: 31,
      lon: '116.378',
      lat: '39.896',
      alt: 71,
      relAlt: 45,
      yaw: 112,
      pitch: -15,
      roll: -18,
      rtk: '浮动解',
    }),
    targets: [
      { id: 't5', left: 11.2, top: 8.1, width: 10.9, height: 27.1, kind: 'vehicle', level: 'normal', targetId: 'V-012' },
      { id: 't6', left: 10, top: 43.3, width: 12.8, height: 27.3, kind: 'vehicle', level: 'normal', targetId: 'V-013' },
    ],
  },
  {
    id: 'cam-04',
    name: '04中科晶锐',
    online: true,
    battery: 100,
    actionBar: 'operate',
    telemetry: buildTelemetry({
      delay: 19,
      lon: '116.385',
      lat: '39.921',
      alt: 49,
      relAlt: 21,
      yaw: 328,
      pitch: -5,
      roll: -9,
      rtk: '固定解',
    }),
    targets: [],
  },
]

export const MINI_DEVICES: MiniDeviceCard[] = Array.from({ length: 11 }, (_, i) => ({
  id: `mini-${i + 1}`,
  name: `${String(i + 5).padStart(2, '0')}中科晶锐`,
  tracking: true,
  battery: 100,
}))

/**
 * 平铺视图通道：全部 15 路（4 主通道 + 11 小卡设备升格为完整通道卡）。
 * 小卡设备遥测按序号生成稳定伪数据（接真实流后由后端推送替换）。
 */
export const TILED_CHANNELS: VideoChannel[] = [
  ...VIDEO_CHANNELS,
  ...MINI_DEVICES.map((d, i) => ({
    id: `tiled-${d.id}`,
    name: d.name,
    online: true,
    battery: d.battery,
    actionBar: 'operate' as const,
    telemetry: buildTelemetry({
      delay: 20 + ((i * 7) % 25),
      lon: (116.36 + i * 0.013).toFixed(3),
      lat: (39.88 + i * 0.008).toFixed(3),
      alt: 40 + ((i * 11) % 50),
      relAlt: 20 + ((i * 9) % 40),
      yaw: (i * 37) % 360,
      pitch: -5 - (i % 10),
      roll: -8 - (i % 8),
      rtk: i % 3 === 0 ? '浮动解' : '固定解',
    }),
    targets: [],
  })),
]

/** 在线设备总数：4 路主通道 + 11 张右栏小卡 = 15 */
export const ONLINE_COUNT = 15