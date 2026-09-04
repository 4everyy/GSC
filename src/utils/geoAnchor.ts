/**
 * geoAnchor —— 舞台百分比坐标 ↔ 地理坐标换算工具。
 *
 * 首页态势图的 DOM 覆盖物（无人机/目标图标）以舞台容器（.map-stage 等）的
 * 百分比定位，而地图引擎（MapLibre）投影/反投影使用地图容器像素坐标。
 * 两个容器通常不完全重合（地图容器铺满画布含顶栏区域，舞台在顶栏下方），
 * 换算时须用 getBoundingClientRect 做原点偏移修正。
 *
 * 用途：DOM 覆盖物按地理锚点（LngLat）实时跟随地图视口移动（拖动/缩放地图
 * 时图标随之移动），拖拽覆盖物结束后再把新屏幕位置固化为地理锚点。
 */
import type { LngLat, MapAdapter } from '../map-engines/types'

/** 舞台投影器：持有一次快照的容器几何，做百分比↔地理坐标互转 */
export interface StageProjector {
  /** 舞台百分比 → 地理坐标（WGS84） */
  stagePctToLngLat(xPct: number, yPct: number): LngLat
  /** 地理坐标 → 舞台百分比 */
  lngLatToStagePct(lngLat: LngLat): { x: number; y: number }
}

/**
 * 基于当前布局快照创建舞台投影器。
 * 每次换算前重建即可获得最新容器几何（地图/舞台尺寸与位置变化均被覆盖）。
 */
export function createStageProjector(
  adapter: MapAdapter,
  stageEl: HTMLElement,
): StageProjector {
  const stageRect = stageEl.getBoundingClientRect()
  const mapRect = adapter.getContainer().getBoundingClientRect()
  // 地图容器像素 = 舞台像素 + 舞台相对地图容器的原点偏移
  const offX = stageRect.left - mapRect.left
  const offY = stageRect.top - mapRect.top
  return {
    stagePctToLngLat(xPct, yPct) {
      return adapter.unproject({
        x: (xPct / 100) * stageRect.width + offX,
        y: (yPct / 100) * stageRect.height + offY,
      })
    },
    lngLatToStagePct(lngLat) {
      const p = adapter.project(lngLat)
      return {
        x: ((p.x - offX) / stageRect.width) * 100,
        y: ((p.y - offY) / stageRect.height) * 100,
      }
    },
  }
}

/** 在文档中查找舞台元素（找不到返回 null，调用方自行跳过本轮换算） */
export function queryStageEl(selector: string): HTMLElement | null {
  return document.querySelector(selector) as HTMLElement | null
}

// ============ 地理锚点持久化（按离线地图包作用域） ============

/**
 * 校验单个锚点对象形状（lng/lat 均为有限数）。
 * localStorage 中的历史数据可能损坏，读取时逐项校验，坏项回退默认播种。
 */
function isValidLngLat(v: unknown): v is LngLat {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as LngLat).lng === 'number' && Number.isFinite((v as LngLat).lng) &&
    typeof (v as LngLat).lat === 'number' && Number.isFinite((v as LngLat).lat)
  )
}

/**
 * 读取按包作用域持久化的锚点表。
 *
 * @param baseKey 存储键前缀（如 'gcs:aircraft-anchors'，最终键为 `${baseKey}:${pkgId}`）
 * @param pkgId   当前离线地图包 id（不同城市/区域包各自独立保存一套锚点）
 * @param ids     期望的目标 id 列表（校验持久化数据与当前配置一一对应，缺失项不补）
 * @returns id → LngLat 映射；无数据/损坏/长度不符时返回空对象（调用方按默认偏移播种）
 */
export function loadScopedAnchors(
  baseKey: string,
  pkgId: string,
  ids: (string | number)[],
): Record<string, LngLat> {
  try {
    const raw = localStorage.getItem(`${baseKey}:${pkgId}`)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (typeof parsed !== 'object' || parsed === null) return {}
    const result: Record<string, LngLat> = {}
    let matched = 0
    for (const id of ids) {
      const v = parsed[String(id)]
      if (isValidLngLat(v)) {
        result[String(id)] = { lng: v.lng, lat: v.lat }
        matched += 1
      }
    }
    // 全部 id 都有有效锚点才整体采用；部分缺失说明配置已变更，按偏移重播更安全
    return matched === ids.length ? result : {}
  } catch {
    return {}
  }
}

/**
 * 持久化锚点表（按包作用域）。写入失败（隐私模式/配额满）静默忽略，
 * 不影响当次会话的锚定功能。
 */
export function saveScopedAnchors(
  baseKey: string,
  pkgId: string,
  anchors: Record<string, LngLat>,
): void {
  try {
    localStorage.setItem(`${baseKey}:${pkgId}`, JSON.stringify(anchors))
  } catch {
    // 存储不可用：忽略
  }
}
