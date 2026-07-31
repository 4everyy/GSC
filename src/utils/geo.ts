/**
 * 地理空间通用计算工具。
 *
 * 独立于具体业务（航线、比例尺、定位等均可复用）：
 * - {@link distanceMeters}：两点间球面距离（Haversine，米）
 * - {@link bearingDeg}：从 p1 到 p2 的航向角（正北为 0，顺时针，度）
 * - {@link formatDistance}：距离格式化（m / km）
 *
 * 所有方法仅依赖经纬度数值，不依赖地图 SDK，便于单测与跨场景复用。
 */

/** 地球赤道半径（米），WGS84 */
const EARTH_RADIUS_M = 6378137

const toRad = (deg: number): number => (deg * Math.PI) / 180
const toDeg = (rad: number): number => (rad * 180) / Math.PI

export interface LatLng {
  lng: number
  lat: number
}

/**
 * 计算两点间球面距离（Haversine 公式），单位：米。
 * 误差在短距离（城市/航线尺度）下可忽略，满足模拟与展示需求。
 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * 计算从 a 到 b 的航向角（初始方位角），单位：度，范围 [-180, 180]。
 * 正北为 0、顺时针递增（东 90、南 180/-180、西 -90）。
 * 用于驱动无人机图标旋转。
 */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const dLng = toRad(b.lng - a.lng)

  const y = Math.sin(dLng) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return toDeg(Math.atan2(y, x))
}

/**
 * 将距离格式化为可读文本：< 1000m 用 m，否则用 km（保留 1 位小数）。
 * 与 MapScale 中的格式化保持一致，统一抽离到此处便于复用。
 */
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000
    return `${km % 1 === 0 ? km : km.toFixed(1)}km`
  }
  return `${Math.round(meters)}m`
}