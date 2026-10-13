/**
 * @file geo.ts
 * @description 球面地理基础计算（环绕飞行世界坐标口径共用）：Haversine 距离、
 *              方位角、球面终点。动画（useOrbitFlight）与地图叠加层
 *              （FlightMarkerOverlays 盘旋圆/连线）共用同一套函数，
 *              保证「飞机所飞的地理圆」与「画面所绘的轨迹圆」严格一致。
 * @author 4everyy
 * @date 2026-10-10
 */
import type { LngLat } from '../map-engines'

export const EARTH_R = 6371000 // 地球半径（米）
export const toRad = (deg: number) => (deg * Math.PI) / 180
export const toDeg = (rad: number) => (rad * 180) / Math.PI
/** 归一到 [0, 360) */
export const normDeg = (deg: number) => ((deg % 360) + 360) % 360
/** 归一到 (-180, 180]（屏幕航向角口径，CSS rotate 任意角度等价） */
export const norm180 = (deg: number) => normDeg(deg + 180) - 180

/** 两点球面距离（米，Haversine） */
export function distanceM(a: LngLat, b: LngLat): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat))
  return 2 * EARTH_R * Math.asin(Math.sqrt(h))
}

/** 球面方位角 a→b（度，正北 0 顺时针） */
export function bearingDeg(a: LngLat, b: LngLat): number {
  const φ1 = toRad(a.lat)
  const φ2 = toRad(b.lat)
  const Δλ = toRad(b.lng - a.lng)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return normDeg(toDeg(Math.atan2(y, x)))
}

/** 自 from 沿方位角（度，正北 0 顺时针）前进 dist 米的球面终点 */
export function destinationLL(from: LngLat, bearing: number, dist: number): LngLat {
  const δ = dist / EARTH_R
  const θ = toRad(bearing)
  const φ1 = toRad(from.lat)
  const λ1 = toRad(from.lng)
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2))
  return { lng: toDeg(λ2), lat: toDeg(φ2) }
}
