/**
 * @file index.ts
 * @description geoAnchor 舞台百分比与地理坐标换算等通用工具
 * @author 4everyy
 * @date 2026-10-07
 */
import { type LngLat, type MapAdapter } from '../map-engines/types'

/** geoAnchor —— 舞台百分比坐标 ↔ 地理坐标换算工具。 */

/** 舞台投影器：持有一次快照的容器几何，做百分比↔地理坐标互转 */
export interface StageProjector {
  /** 舞台百分比 → 地理坐标（WGS84） */
  stagePctToLngLat(xPct: number, yPct: number): LngLat
  /** 地理坐标 → 舞台百分比 */
  lngLatToStagePct(lngLat: LngLat): { x: number; y: number }
}

/** 基于当前布局快照创建舞台投影器。 */
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

/** 校验单个锚点对象形状（lng/lat 均为有限数）。 */
function isValidLngLat(v: unknown): v is LngLat {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as LngLat).lng === 'number' && Number.isFinite((v as LngLat).lng) &&
    typeof (v as LngLat).lat === 'number' && Number.isFinite((v as LngLat).lat)
  )
}

/** 读取按包作用域持久化的锚点表。 */
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

/** 持久化锚点表（按包作用域）。 */
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

/** htmlToElement —— 将 HTML 字符串转换为 DOM 元素。 */
export function htmlToElement(html: string): HTMLElement {
  const template = document.createElement('template')
  template.innerHTML = html.trim()
  const node = template.content.firstElementChild
  if (!node || !(node instanceof HTMLElement)) {
    throw new Error('htmlToElement: 解析失败，输入 HTML 无有效根元素')
  }
  return node
}

/** panelPlacement —— hover 面板边缘自适应定位工具。 */

export interface PanelThreshold {
  /** 右侧空间不足该百分比时，面板改为向左展开 */
  rightEdge: number
  /** 左侧空间不足该百分比时，面板改为向右展开（兜底，通常不会触发） */
  leftEdge: number
  /** 下方空间不足该百分比时，面板改为向上展开 */
  bottomEdge: number
  /** 上方空间不足该百分比时，面板改为向下展开 */
  topEdge: number
}

export const DEFAULT_PANEL_THRESHOLD: PanelThreshold = {
  // 在线面板宽度 max-content 自适应（约 229-280px），在 1280px 视口约占 18-22%；留 4% 余量
  rightEdge: 26,
  leftEdge: 8,
  // 面板高度约 69-117px，在 720px 视口约占 10-16%；留 4% 余量
  bottomEdge: 18,
  topEdge: 10,
}

export interface PanelPlacement {
  /** 水平方向：面板向右展开（默认）还是向左 */
  horizontal: 'right' | 'left'
  /** 垂直方向：面板向上展开（默认）还是向下 */
  vertical: 'up' | 'down'
}

/** 根据宿主元素的百分比位置，计算 hover 面板的安全展开方向。 */
export function computePanelPlacement(
  x: number,
  y: number,
  threshold: PanelThreshold = DEFAULT_PANEL_THRESHOLD,
): PanelPlacement {
  return {
    horizontal: x > 100 - threshold.rightEdge ? 'left' : 'right',
    vertical: y < threshold.topEdge ? 'down' : 'up',
  }
}

/** 将展开方向转换为 CSS 修饰类名数组，便于附加到宿主元素 className。 */
export function placementToClasses(placement: PanelPlacement): string[] {
  const classes: string[] = []
  if (placement.horizontal === 'left') classes.push('panel-left')
  if (placement.vertical === 'down') classes.push('panel-down')
  return classes
}
