/**
* 目标状态 HTTP API。
 *
 * POST /api/v1/control/queryTargetStatus —— 目标列表面板 + 态势图目标图标层数据源。
 * 后端地址：http://192.168.120.30:8080（开发环境经 Vite /api 代理）。
 *
 * 后端返回目标数组（实测字段）：id/name/typeCode(car|truck|person|fire)/经纬度/
 * height/worth(1低|2中|3高)/status/planeNum(发现源)/strikeMethodName/typeRadius(米)/
 * createTime(epoch ms) 等；实测存在重复 id（含脏数据行），拉取后按 id 首次出现去重。
 */
import { apiPost } from './http'
import type { TargetItem, TargetType } from '../config/targets'
import type { LngLat } from '../map-engines/types'

/** 单个目标原始数据（后端字段，原样保留） */
export interface TargetRaw {
  id: string
  name: string
  /** 类型码：car / truck / person / fire */
  typeCode: string
  latitude: number
  longitude: number
  /** 高度（米） */
  height: number
  /** 价值字典：'1' 低 / '2' 中 / '3' 高 */
  worth: string
  /** 状态码（字典待后端补充，前端统一展示「默认侦察」） */
  status: string
  danger_level: string
  /** 发现源（无人机编号） */
  planeNum: string
  strikeMethod: string
  /** 打击方式名称，如「未识别」 */
  strikeMethodName: string
  /** 置信度 */
  confidenceLevel: string
  /** 朝向（度） */
  toward: string
  /** 威胁半径（米，字符串数值） */
  typeRadius: string
  /** 首次发现时间（epoch ms 字符串） */
  createTime: string
}

/** 拉取目标状态原始列表（请求参数为空对象） */
export function fetchTargetStatus(): Promise<TargetRaw[]> {
  return apiPost<TargetRaw[]>('/v1/control/queryTargetStatus', {})
}

/** 装载到 targetLinkStore 的目标（TargetItem + 真实经纬度锚点） */
export interface MappedTarget extends TargetItem {
  lngLat: LngLat
}

/** typeCode → 前端类型（person → 人员；car/truck/fire 及未知 → 车辆） */
function mapType(typeCode: string): TargetType {
  return typeCode === 'person' ? '人员' : '车辆'
}

/** worth → 价值文字（'3' 高 / '2' 中 / '1' 低，未知按「高」兜底与 mock 一致） */
function mapWorth(worth: string): string {
  switch (worth) {
    case '3':
      return '高'
    case '2':
      return '中'
    case '1':
      return '低'
    default:
      return '高'
  }
}

/** 格式化为 'YYYY/MM/DD HH:mm:ss'（与 mock config/targets.ts 格式一致） */
function formatTime(ms: number): string {
  const d = new Date(ms)
  const pad = (v: number) => String(v).padStart(2, '0')
  return (
    d.getFullYear() +
    '/' +
    pad(d.getMonth() + 1) +
    '/' +
    pad(d.getDate()) +
    ' ' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes()) +
    ':' +
    pad(d.getSeconds())
  )
}

/** typeCode → 目标型号（与 mock targets.ts 展示口径一致的通用文案） */
function mapModel(typeCode: string): string {
  switch (typeCode) {
    case 'person':
      return '人员目标'
    case 'fire':
      return '火情目标'
    case 'car':
    case 'truck':
      return '车辆目标'
    default:
      return '未知目标'
  }
}

/** TargetRaw → 前端 TargetItem（详情字段已格式化，可直接用于面板展示） */
export function mapTargetToItem(raw: TargetRaw, fetchedAt: number): MappedTarget {
  const created = Number(raw.createTime)
  const planeNum = raw.planeNum?.trim() ?? ''
  return {
    id: raw.id,
    name: raw.name || `目标-${raw.id}`,
    type: mapType(raw.typeCode),
    status: '默认侦察', // TODO: 后端状态字典补充后按 status 码映射文案
    value: mapWorth(raw.worth),
    source: planeNum ? `无人机${planeNum.padStart(2, '0')}` : '未知平台',
    model: mapModel(raw.typeCode),
    strikeMode: raw.strikeMethodName?.trim() || '暂无',
    position: `经度:${raw.longitude}°, 纬度:${raw.latitude}°`,
    coordinates: 'X:000m, Y:000m', // TODO: 后端暂无直角坐标字段，占位与 mock 格式一致
    firstSeenAt: formatTime(Number.isFinite(created) && created > 0 ? created : fetchedAt),
    lastUpdatedAt: formatTime(fetchedAt),
    lngLat: { lng: raw.longitude, lat: raw.latitude },
  }
}

/** 拉取 + 按 id 去重（首次出现优先，剔除后端重复/脏数据行）+ 映射 */
export async function fetchAndMapTargets(): Promise<MappedTarget[]> {
  const rawList = await fetchTargetStatus()
  const fetchedAt = Date.now()
  const seen = new Map<string, MappedTarget>()
  for (const raw of rawList ?? []) {
    if (!raw || !raw.id || seen.has(raw.id)) continue
    seen.set(raw.id, mapTargetToItem(raw, fetchedAt))
  }
  return [...seen.values()]
}