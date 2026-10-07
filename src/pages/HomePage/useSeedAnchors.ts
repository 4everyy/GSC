/**
 * @file useSeedAnchors.ts
 * @description useSeedAnchors（自 HomePage 拆出）—— 地图图标「真实坐标校验 → 持久化恢复 → 默认播种」。 飞机（数组锚点）与目标（按 id 字典锚点）两套同构逻辑收口一处： ① 接口真实经纬度落在离线包 bounds 内 → 直接锚定真实坐标； ② localStorage 分包作用域恢复（loadScopedAnchors）； ③ 回退默认播种（包中心 + 预置偏移网格）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { useMemo } from 'react'
import { aircraft } from '../../config/index'
import {
  AIRCRAFT_ANCHOR_OFFSETS,
  TARGET_NEAR_AIRCRAFT_OFFSETS,
  TARGET_REAL_LNGLAT_MAX_OFFSET,
} from '../../lib/formationLayout'
import { buildTargetAnchors, useTargetLinkStore } from '../../stores/targetLinkStore'
import { usePlaneStatusStore } from '../../stores/index'
import { loadScopedAnchors } from '../../utils/index'
import { type LngLat } from '../../map-engines/types'

/** 在离线包 bounds 内才返回真实坐标（包外投影悬在灰区无底图，回退默认布局保证可见） */
function withinBounds(
  lng: number | undefined,
  lat: number | undefined,
  bounds: [number, number, number, number],
): LngLat | null {
  if (typeof lng !== 'number' || typeof lat !== 'number') return null
  const [west, south, east, north] = bounds
  return lng >= west && lng <= east && lat >= south && lat <= north ? { lng, lat } : null
}

/** 飞机种子锚点（数组，索引对齐 aircraft 配置）：真实 rawPlanes 坐标校验 + v2 持久化 + 偏移网格回退 */
export function useAircraftSeedAnchors(
  activePackage: { id: string; center: LngLat; bounds: [number, number, number, number] } | null,
  planeLngLatKey: string,
): LngLat[] | null {
  return useMemo<LngLat[] | null>(() => {
    if (!activePackage) return null
    const ids = aircraft.map((_, i) => i)
    // 锚点键随布局调整升版本（v2）：使旧集中布局的持久化锚点失效，重新按新偏移播种
    const saved = loadScopedAnchors('gcs:aircraft-anchors:v2', activePackage.id, ids)
    // 全部索引都有持久化锚点才整体采用（loadScopedAnchors 部分缺失时返回 {}）
    const fallback =
      Object.keys(saved).length > 0
        ? ids.map((i) => saved[String(i)])
        : AIRCRAFT_ANCHOR_OFFSETS.map((off) => ({
            lng: activePackage.center.lng + off.lng,
            lat: activePackage.center.lat + off.lat,
          }))
    // 经 getState 读取最新 rawPlanes（签名未变时引用可能更新，坐标不变无需重播种）
    const rawList = usePlaneStatusStore.getState().rawPlanes
    return aircraft.map((entry, i) => {
      const raw = rawList[entry.deviceIndex]
      // 标准语义：longitude=经度、latitude=纬度（2026-09-23 实测确认）
      return withinBounds(raw?.longitude, raw?.latitude, activePackage.bounds) ?? fallback[i]
    })
  }, [activePackage, planeLngLatKey])
}

/** 目标真实经纬度签名（id+经纬度拼接字符串，按值比较）：仅当接口装载/替换目标（id 或经纬度变化）时才变化。 */
export function useTargetLngLatKey(): string {
  return useTargetLinkStore((s) =>
    s.targets
      .map((t) => (t.lngLat ? `${t.id}@${t.lngLat.lng.toFixed(7)},${t.lngLat.lat.toFixed(7)}` : ''))
      .join('|'),
  )
}

/** 目标种子锚点（按 id 字典）：接口目标（t.lngLat 真实经纬度）在初始视口内直接锚定，远方/mock 回退无人机附近网格 */
export function useTargetSeedAnchors(
  activePackage: { id: string; center: LngLat; bounds: [number, number, number, number] } | null,
  targetLngLatKey: string,
): Record<string, LngLat> | null {
  return useMemo<Record<string, LngLat> | null>(() => {
    if (!activePackage) return null
    const seeded = buildTargetAnchors(activePackage.center)
    const saved = loadScopedAnchors('gcs:target-anchors', activePackage.id, Object.keys(seeded))
    const fallback = Object.keys(saved).length > 0 ? saved : seeded
    const anchors: Record<string, LngLat> = {}
    let overflowIndex = 0 // 视口外的接口目标按序取无人机附近网格偏移
    // 经 getState 读取最新 targets（签名未变时引用可能更新，内容 x/y 无关锚点）
    for (const t of useTargetLinkStore.getState().targets) {
      const real = t.lngLat
      if (real) {
        const visible =
          Math.abs(real.lng - activePackage.center.lng) <= TARGET_REAL_LNGLAT_MAX_OFFSET.lng &&
          Math.abs(real.lat - activePackage.center.lat) <= TARGET_REAL_LNGLAT_MAX_OFFSET.lat
        if (visible) {
          anchors[t.id] = real
          continue
        }
        // 远方坐标：无人机附近网格播种，池尽（目标数超 15）回退包中心
        const off = TARGET_NEAR_AIRCRAFT_OFFSETS[overflowIndex++]
        anchors[t.id] = off
          ? { lng: activePackage.center.lng + off.lng, lat: activePackage.center.lat + off.lat }
          : { ...activePackage.center }
      } else {
        // mock 目标：localStorage 恢复 → 默认播种
        anchors[t.id] = fallback[t.id] ?? { ...activePackage.center }
      }
    }
    return anchors
  }, [activePackage, targetLngLatKey])
}