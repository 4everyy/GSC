import type { LngLat } from '../../map-engines'

/** 生成唯一测距会话标识。适配器按 id 索引覆盖物，id 复用会让旧覆盖物残留且无法移除，
 *  故每次激活测距都用新 session 前缀所有覆盖物 id，确保与已「确定」的测距记录不冲突。 */
export function makeMeasureSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 两点间距离（球面，Haversine 公式）。
 * @param a WGS84 坐标
 * @param b WGS84 坐标
 * @returns 距离（米）
 */
export function haversineDistance(a: LngLat, b: LngLat): number {
  const R = 6371000 // 地球半径（米）
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** 将距离（米）格式化为可读字符串 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters.toFixed(0)} 米`
  return `${(meters / 1000).toFixed(2)} 公里`
}

/** 线段中点：经纬度线性平均（视觉足够准确） */
export function midpoint(a: LngLat, b: LngLat): LngLat {
  return { lng: (a.lng + b.lng) / 2, lat: (a.lat + b.lat) / 2 }
}

/**
 * 求悬停位置到折线各段的最近线段索引（返回 i 对应 points[i-1]→points[i] 段）。
 * 经纬度平面近似 + 点到线段投影距离，用于把光标位置映射到悬停段。
 */
export function findNearestSegmentIndex(points: LngLat[], pos: LngLat): number {
  let bestIdx = -1
  let bestDist = Infinity
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const vx = b.lng - a.lng
    const vy = b.lat - a.lat
    const lenSq = vx * vx + vy * vy
    const t =
      lenSq === 0
        ? 0
        : Math.max(0, Math.min(1, ((pos.lng - a.lng) * vx + (pos.lat - a.lat) * vy) / lenSq))
    const dx = pos.lng - (a.lng + t * vx)
    const dy = pos.lat - (a.lat + t * vy)
    const distSq = dx * dx + dy * dy
    if (distSq < bestDist) {
      bestDist = distSq
      bestIdx = i
    }
  }
  return bestIdx
}