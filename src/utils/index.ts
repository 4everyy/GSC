import { type LngLat, type MapAdapter } from '../map-engines/types'

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

/**
 * htmlToElement —— 将 HTML 字符串转换为 DOM 元素。
 *
 * MapLibre 的 Marker 需要 HTMLElement（而非 HTML 字符串），
 * 而现有业务代码（waypointIcon / DroneSimulator）生成的是 HTML 字符串，
 * 此工具统一桥接两种调用方式。
 *
 * 实现使用 <template> 元素解析 HTML，避免直接 innerHTML 注入的全局污染。
 */
export function htmlToElement(html: string): HTMLElement {
  const template = document.createElement('template')
  template.innerHTML = html.trim()
  const node = template.content.firstElementChild
  if (!node || !(node instanceof HTMLElement)) {
    throw new Error('htmlToElement: 解析失败，输入 HTML 无有效根元素')
  }
  return node
}

/**
 * panelPlacement —— hover 面板边缘自适应定位工具。
 *
 * 问题背景：
 * 飞机图标 / 巡检区域 / 禁飞区等元素可拖动或固定在视口任意位置，
 * 其 hover 信息面板默认向「右侧 + 上方」展开。当宿主元素靠近视口右/上/下边缘时，
 * 面板会溢出可视区域导致内容被裁剪、显示不全。
 *
 * 解决方案：
 * 根据宿主元素在视口中的百分比位置（0-100），判定面板应朝哪个方向展开更安全，
 * 返回一组方向修饰类名（如 `panel-right` / `panel-left`、`panel-up` / `panel-down`），
 * 由 CSS 据此翻转面板的 left/right 与 top/bottom 定位，保证面板始终完整可见。
 *
 * 设计要点：
 * - 输入仅依赖百分比位置，与拖拽 hook 的坐标系一致，无需 DOM 测量，实时性高；
 * - 阈值可配置，默认基于现有面板尺寸（宽约 203-229px、高约 69-117px）
 *   在常见 1280-1920 视口下换算为百分比的安全边距；
 * - 对不同面板类型（窄/宽、矮/高）提供阈值覆盖，避免一刀切。
 */

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
  // 面板宽度约 203-229px，在 1280px 视口约占 16-18%；留 4% 余量
  rightEdge: 20,
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

/**
 * 根据宿主元素的百分比位置，计算 hover 面板的安全展开方向。
 *
 * @param x 宿主元素水平百分比位置（0-100）
 * @param y 宿主元素垂直百分比位置（0-100）
 * @param threshold 判定阈值，可按面板尺寸覆盖
 * @returns 面板应采用的展开方向
 */
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

/**
 * 将展开方向转换为 CSS 修饰类名数组，便于附加到宿主元素 className。
 *
 * 约定：
 * - 默认（无修饰类）= 向右 + 向上
 * - `panel-left` = 向左展开（覆盖默认向右）
 * - `panel-down` = 向下展开（覆盖默认向上）
 *
 * @param placement 展开方向
 * @returns 修饰类名数组
 */
export function placementToClasses(placement: PanelPlacement): string[] {
  const classes: string[] = []
  if (placement.horizontal === 'left') classes.push('panel-left')
  if (placement.vertical === 'down') classes.push('panel-down')
  return classes
}
