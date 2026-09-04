/**
 * TargetMarkerLayer —— 首页态势图上的目标图标层。
 *
 * 目标列表每一行在态势图上对应一个图标（车辆 → tank.png / 人员 → people.png），
 * 图标底衬三种状态背景（状态判定优先级：标记重点 > 点击联动 > hover > 正常）：
 * - 正常状态：device/targetBgNormal（target-bg-normal.png）
 * - hover 态与点击目标列表行联动态：device/targetBgHighlight（target-bg-highlight.png）
 * - 标记重点：device/targetBgMarked（target-bg-marked.png）
 *
 * 与目标列表面板通过 targetLinkStore 双向联动：
 * - 列表行 hover / 点击 → 地图图标背景切换
 * - 地图图标 hover / 单击 → 列表行背景同步高亮（hover 橙 / 选中蓝）；
 *   单击行为与设备面板一致：切换该目标的勾选态并请求打开目标列表面板
 *   （勾选集合 selectedTargetIds 双向同步，列表勾选框同步勾上/取消），
 *   同时发出列表聚焦请求（requestFocusTarget）：目标列表对应行详情自动展开
 *   并滚动到列表可视中心，便于用户一眼查看
 *
 * 拖拽（Pointer Events 统一鼠标/触屏/笔）：
 * - 按下后位移超过 4px 判定为拖拽，图标中心跟随指针实时更新坐标（moveTarget）；
 * - 拖拽不触发单击勾选（不会误开面板、误勾选）；
 * - 松手时若始终未超阈值则视为单击（勾选联动 + 请求打开面板）；
 * - 键盘可达性：Enter/Space 仍等效单击。
 *
 * 地理锚定（adapter 就绪时启用，与飞机层 useMapAnchorSync 同模式）：
 * - 种子锚定（seedAnchors 提供，离线地图包就绪时启用）：引擎就绪即刻播种
 *   地理锚点并投影一次，不等首个 moveend——初始 flyTo 动画期间 move 每帧
 *   重投影，图标随视口一起移动（地理锚定的正确表现）；锚点按包 id 持久化
 *   （localStorage），刷新页面后恢复到相同地理位置不漂移；
 * - 屏幕固化（seedAnchors 为 null 的降级路径）：首个 moveend（初始 flyTo
 *   结束/用户打断）按当前屏幕位置批量固化 targetAnchors（此前 move 不重投影，
 *   避免被飞行动画带偏）；
 * - 之后地图 move（拖动/缩放/惯性/飞行动画）每帧按锚点重投影全部 x/y
 *   （applyTargetPositions 单次 set，N 个图标只触发一次渲染）——图标随地图移动；
 * - 图标拖拽松手后按最终屏幕位置反算刷新该目标锚点并按包持久化（地图未动，显示不变）；
 * - adapter 为 null（引擎未就绪）时退化为纯拖放，不随地图移动。
 */
import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { deviceImages } from '../../../../assets/images/device'
import { useTargetLinkStore, type TargetMarkerItem } from '../../../../stores/targetLinkStore'
import type { TargetType } from '../../../../config/targets'
import type { LngLat, MapAdapter } from '../../../../map-engines/types'
import {
  createStageProjector,
  queryStageEl,
  saveScopedAnchors,
} from '../../../../utils/geoAnchor'
import './TargetMarkerLayer.css'

/** 目标类型 → 前景图标（车辆 → tank / 人员 → people） */
const typeIcon: Record<TargetType, string> = {
  '车辆': deviceImages.tank,
  '人员': deviceImages.people,
}

/** 按下后位移超过该像素数判定为拖拽（小于则视为单击） */
const DRAG_THRESHOLD_PX = 4

/** 目标锚点按包持久化的存储键前缀（最终键为 `前缀:包id`） */
const TARGET_ANCHOR_STORAGE_KEY = 'gcs:target-anchors'

const clampPct = (v: number) => Math.min(100, Math.max(0, v))

interface TargetMarkerLayerProps {
  /** 地图适配器（null = 引擎未就绪，目标图标退化为纯拖放不随地图移动） */
  adapter: MapAdapter | null
  /**
   * 种子地理锚点（id → LngLat，由 HomePage 按当前离线地图包派生：
   * localStorage 按包恢复优先，无则包中心 + TARGET_ANCHOR_OFFSETS 播种）。
   * null = 走屏幕固化降级路径（等首个 moveend）。
   */
  seedAnchors: Record<string, LngLat> | null
  /** 锚点持久化作用域（当前离线地图包 id；null = 不持久化） */
  anchorScope: string | null
}

export function TargetMarkerLayer({
  adapter,
  seedAnchors,
  anchorScope,
}: TargetMarkerLayerProps) {
  const targets = useTargetLinkStore((s) => s.targets)
  const hoveredTargetId = useTargetLinkStore((s) => s.hoveredTargetId)
  const clickedTargetId = useTargetLinkStore((s) => s.clickedTargetId)
  const markedIds = useTargetLinkStore((s) => s.markedIds)
  const setHoveredTargetId = useTargetLinkStore((s) => s.setHoveredTargetId)
  // 单击图标 = 勾选联动（与设备面板 onAircraftClick 同模式）：
  // 切换勾选集合 + 请求打开目标列表面板
  const selectedTargetIds = useTargetLinkStore((s) => s.selectedTargetIds)
  const toggleTarget = useTargetLinkStore((s) => s.toggleTarget)
  const requestOpenTargetPanel = useTargetLinkStore((s) => s.requestOpenTargetPanel)
  // 列表聚焦请求：单击图标后目标列表自动展开对应行详情并滚动到可视中心
  const requestFocusTarget = useTargetLinkStore((s) => s.requestFocusTarget)
  // 拖拽更新坐标（map-stage 百分比）
  const moveTarget = useTargetLinkStore((s) => s.moveTarget)
  // 「假删除」（软删除）目标 id 集合：图标层过滤隐藏（刷新可恢复）
  const deletedIds = useTargetLinkStore((s) => s.deletedTargetIds)
  // 地理锚定：锚点批量固化 / 单点刷新 / 地图移动批量重投影
  const setTargetAnchors = useTargetLinkStore((s) => s.setTargetAnchors)
  const setTargetAnchor = useTargetLinkStore((s) => s.setTargetAnchor)
  const applyTargetPositions = useTargetLinkStore((s) => s.applyTargetPositions)

  // 拖拽会话（ref 不触发重渲染）：pointerId 匹配当前指针才处理，
  // moved 标记是否已超过阈值判定为拖拽
  const dragState = useRef<{
    id: string
    pointerId: number
    layerEl: HTMLElement
    startX: number
    startY: number
    moved: boolean
  } | null>(null)

  // adapter 最新引用（供拖拽松手回调读取，避免闭包陈旧）
  const adapterRef = useRef(adapter)
  adapterRef.current = adapter
  // 锚定就绪标志：种子模式播种后置 true；屏幕固化模式首个 moveend 后置 true
  const anchorReadyRef = useRef(false)

  // 地理锚定同步：种子播种（就绪即生效）+ move 每帧按锚点重投影
  useEffect(() => {
    if (!adapter) return

    // 种子锚点非空 → 立即播种并投影一次（不待 moveend，flyTo 动画期间即跟随）
    const hasSeeds = seedAnchors !== null && Object.keys(seedAnchors).length > 0
    if (hasSeeds && seedAnchors) {
      anchorReadyRef.current = true
      setTargetAnchors(seedAnchors)
      const stageEl = queryStageEl('.map-stage')
      if (stageEl) {
        const projector = createStageProjector(adapter, stageEl)
        const positions: Record<string, { x: number; y: number }> = {}
        for (const [id, anchor] of Object.entries(seedAnchors)) {
          const p = projector.lngLatToStagePct(anchor)
          positions[id] = { x: clampPct(p.x), y: clampPct(p.y) }
        }
        applyTargetPositions(positions)
      }
    } else {
      // 屏幕固化模式：等首个 moveend 视图稳定后再固化
      anchorReadyRef.current = false
    }

    // 首个 moveend：视图首次稳定。种子模式已就绪（跳过）；
    // 屏幕固化模式此刻屏幕位置即设计布局位置，固化为锚点
    const offMoveEnd = adapter.onMoveEnd(() => {
      if (anchorReadyRef.current) return
      const stageEl = queryStageEl('.map-stage')
      if (!stageEl) return
      anchorReadyRef.current = true
      const projector = createStageProjector(adapter, stageEl)
      const anchors: Record<string, LngLat> = {}
      for (const t of useTargetLinkStore.getState().targets) {
        anchors[t.id] = projector.stagePctToLngLat(t.x, t.y)
      }
      setTargetAnchors(anchors)
    })
    // 地图移动（拖动/缩放/惯性/飞行动画）：就绪后按锚点重投影所有目标位置
    const offMove = adapter.onMove(() => {
      if (!anchorReadyRef.current) return
      const anchorsMap = useTargetLinkStore.getState().targetAnchors
      const stageEl = queryStageEl('.map-stage')
      if (Object.keys(anchorsMap).length === 0 || !stageEl) return
      const projector = createStageProjector(adapter, stageEl)
      const positions: Record<string, { x: number; y: number }> = {}
      for (const [id, anchor] of Object.entries(anchorsMap)) {
        const p = projector.lngLatToStagePct(anchor)
        positions[id] = { x: clampPct(p.x), y: clampPct(p.y) }
      }
      applyTargetPositions(positions)
    })
    return () => {
      offMoveEnd()
      offMove()
      anchorReadyRef.current = false
    }
  }, [adapter, seedAnchors, setTargetAnchors, applyTargetPositions])

  /** 按下：记录会话（是否拖拽在移动超阈值时才判定） */
  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>, t: TargetMarkerItem) => {
    // 仅主键/触摸/笔；中键右键不参与
    if (e.button !== 0) return
    const layerEl = e.currentTarget.closest('.target-marker-layer') as HTMLElement | null
    if (!layerEl) return
    dragState.current = {
      id: t.id,
      pointerId: e.pointerId,
      layerEl,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    }
    // 阻止图片原生拖拽与触摸滚动，保证拖拽跟手
    e.preventDefault()
  }

  /** 移动：超阈值判定为拖拽，此后图标中心跟随指针（按层容器百分比换算） */
  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const ds = dragState.current
    if (!ds || ds.pointerId !== e.pointerId) return
    if (!ds.moved) {
      const dx = e.clientX - ds.startX
      const dy = e.clientY - ds.startY
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      ds.moved = true
    }
    const rect = ds.layerEl.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    moveTarget(ds.id, x, y)
  }

  /** 松手：若始终未超阈值则视为单击（勾选联动 + 请求开面板 + 列表聚焦展开/收起）；
   *  拖拽结束时按最终屏幕位置反算刷新该目标地理锚点并按包持久化（地图未动，显示不变） */
  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>, t: TargetMarkerItem) => {
    const ds = dragState.current
    if (!ds || ds.pointerId !== e.pointerId) return
    const wasDrag = ds.moved
    dragState.current = null
    if (wasDrag) {
      if (anchorReadyRef.current) {
        const stageEl = queryStageEl('.map-stage')
        const currentAdapter = adapterRef.current
        if (stageEl && currentAdapter) {
          const projector = createStageProjector(currentAdapter, stageEl)
          // store 最新值（拖拽中 moveTarget 已实时写入，渲染闭包 targets 是旧的）
          const latest = useTargetLinkStore.getState().targets.find((tt) => tt.id === ds.id)
          if (latest) {
            setTargetAnchor(ds.id, projector.stagePctToLngLat(latest.x, latest.y))
            // 按包持久化整套锚点（setTargetAnchor 同步完成后 getState 即最新）
            if (anchorScope) {
              saveScopedAnchors(
                TARGET_ANCHOR_STORAGE_KEY,
                anchorScope,
                useTargetLinkStore.getState().targetAnchors,
              )
            }
          }
        }
      }
      return
    }
    // 点击前已选中 → 本次点击是取消选中：列表收起该行详情（expand=false）
    const willSelect = !selectedTargetIds.has(t.id)
    toggleTarget(t.id)
    requestOpenTargetPanel()
    requestFocusTarget(t.id, willSelect)
  }

  /** 指针被系统打断（如触摸被接管）：结束会话，不触发单击 */
  const handlePointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    const ds = dragState.current
    if (!ds || ds.pointerId !== e.pointerId) return
    dragState.current = null
  }

  // 「假删除」目标不渲染图标（软删除标记，刷新恢复后重现）
  const visibleTargets = targets.filter((t) => !deletedIds.has(t.id))

  return (
    <div className="target-marker-layer" aria-label="目标图标层">
      {visibleTargets.map((t: TargetMarkerItem) => {
        const isMarked = markedIds.has(t.id)
        const isSelected = selectedTargetIds.has(t.id)
        const isActive = isSelected || clickedTargetId === t.id || hoveredTargetId === t.id
        // 背景优先级：标记重点 > 勾选 / 点击联动 / hover > 正常
        const bgImage = isMarked
          ? deviceImages.targetBgMarked
          : isActive
            ? deviceImages.targetBgHighlight
            : deviceImages.targetBgNormal
        return (
          <div
            key={t.id}
            className={`target-marker${isMarked ? ' target-marker--marked' : ''}${isActive ? ' target-marker--active' : ''}`}
            style={{ left: `${t.x}%`, top: `${t.y}%` }}
            onPointerDown={(e) => handlePointerDown(e, t)}
            onPointerMove={handlePointerMove}
            onPointerUp={(e) => handlePointerUp(e, t)}
            onPointerCancel={handlePointerCancel}
            onMouseEnter={() => setHoveredTargetId(t.id)}
            onMouseLeave={() => setHoveredTargetId(null)}
            title={t.name}
            role="button"
            tabIndex={0}
            aria-label={`${t.name}（${t.type}）`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                // 点击前已选中 → 本次是取消选中：列表收起该行详情（expand=false）
                const willSelect = !selectedTargetIds.has(t.id)
                toggleTarget(t.id)
                requestOpenTargetPanel()
                requestFocusTarget(t.id, willSelect)
              }
            }}
          >
            <img className="target-marker__bg" src={bgImage} alt="" draggable={false} />
            <img className="target-marker__icon" src={typeIcon[t.type]} alt={t.type} draggable={false} />
          </div>
        )
      })}
    </div>
  )
}