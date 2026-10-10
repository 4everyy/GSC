/**
 * @file TargetMarkerLayer.tsx
 * @description TargetMarkerLayer —— 首页态势图上的目标图标层。（原「手动拖拽目标图标」能力已移除，单击=勾选联动，位置完全由地理锚点投影驱动）
 * @author 4everyy
 * @date 2026-10-07
 */
import { useEffect, useRef, type CSSProperties } from 'react'
import { deviceImages } from '../../../assets/device'
import { useTargetLinkStore, type TargetMarkerItem } from '../../../stores/targetLinkStore'
import { type TargetType } from '../../../config/index'
import { type LngLat, type MapAdapter } from '../../../map-engines/types'
import { createStageProjector, queryStageEl } from '../../../utils/index'
import './TargetMarkerLayer.css'

/** 目标类型 → 前景图标（车辆 → tank / 人员 → people） */
const typeIcon: Record<TargetType, string> = {
  '车辆': deviceImages.tank,
  '人员': deviceImages.people,
}

/** 目标 id → 0..3 稳定哈希：随机化运动轨迹朝向（右下/左下/左上/右上，每档 90°） */
const hashIdToTrailDir = (id: string): number => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h) % 4
}

const clampPct = (v: number) => Math.min(100, Math.max(0, v))

interface TargetMarkerLayerProps {
  /** 地图适配器（null = 引擎未就绪，目标图标按初始/恢复位置静态显示） */
  adapter: MapAdapter | null
  /** 种子地理锚点（id → LngLat，由 HomePage 按当前离线地图包派生：localStorage 按包恢复优先 */
  seedAnchors: Record<string, LngLat> | null
}

export function TargetMarkerLayer({
  adapter,
  seedAnchors,
}: TargetMarkerLayerProps) {
  const targets = useTargetLinkStore((s) => s.targets)
  const hoveredTargetId = useTargetLinkStore((s) => s.hoveredTargetId)
  const clickedTargetId = useTargetLinkStore((s) => s.clickedTargetId)
  const markedIds = useTargetLinkStore((s) => s.markedIds)
  const setHoveredTargetId = useTargetLinkStore((s) => s.setHoveredTargetId)
  // 单击图标 = 勾选联动（与设备面板 onAircraftClick 同模式）：切换勾选集合 + 请求打开目标列表面板
  const selectedTargetIds = useTargetLinkStore((s) => s.selectedTargetIds)
  const toggleTarget = useTargetLinkStore((s) => s.toggleTarget)
  const requestOpenTargetPanel = useTargetLinkStore((s) => s.requestOpenTargetPanel)
  // 列表聚焦请求：单击图标后目标列表自动展开对应行详情并滚动到可视中心
  const requestFocusTarget = useTargetLinkStore((s) => s.requestFocusTarget)
  // 「假删除」（软删除）目标 id 集合：图标层过滤隐藏（刷新可恢复）
  const deletedIds = useTargetLinkStore((s) => s.deletedTargetIds)
  // 地理锚定：锚点批量固化 / 地图移动批量重投影
  const setTargetAnchors = useTargetLinkStore((s) => s.setTargetAnchors)
  const applyTargetPositions = useTargetLinkStore((s) => s.applyTargetPositions)

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

    // 首个 moveend：视图首次稳定。
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

  /** 单击图标：勾选联动 + 请求开面板 + 列表聚焦展开/收起（原「拖拽/单击判定」简化为纯 click） */
  const handleClick = (t: TargetMarkerItem) => {
    // 点击前已选中 → 本次点击是取消选中：列表收起该行详情（expand=false）
    const willSelect = !selectedTargetIds.has(t.id)
    toggleTarget(t.id)
    requestOpenTargetPanel()
    requestFocusTarget(t.id, willSelect)
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
            onClick={() => handleClick(t)}
            onMouseEnter={() => setHoveredTargetId(t.id)}
            onMouseLeave={() => setHoveredTargetId(null)}
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
      {/* 运动轨迹：target-motion-arrows.svg 三枚条纹箭头仅作 CSS mask 形状
                模板，内部填充沿 135°（右下 45°，即箭头指向 = 目标运动
                方向）流动的金色光带渐变（见 CSS .target-marker__trail：
                repeating-linear-gradient + background-position + opacity blink 无缝循环
                动画），以"光带流向"指示目标运行线路；依附朝向按目标
                id 哈希随机取四方向之一（右下/左下/左上/右上，每档 90°，
                确定性哈希保证刷新后不跳变），贴身外挂、绘制在背景图
                之下。位置依附：作为 .target-marker
                子元素自动继承图标的全部位置更新——地理锚定每帧重投影、
                初始播种——轨迹随图标同步移动（保持
                既定方位偏移），无需单独锚定。--trail-angle 暂由随机
                哈希赋值，接入真实航向后替换为航向角 */}
            <span
              className="target-marker__trail"
              style={{ '--trail-angle': `${hashIdToTrailDir(t.id) * 90}deg` } as CSSProperties}
              aria-hidden="true"
            />
            <img className="target-marker__bg" src={bgImage} alt="" draggable={false} />
            <img className="target-marker__icon" src={typeIcon[t.type]} alt={t.type} draggable={false} />
            {/* hover 环绕操作按钮：orbit-segment.svg 单段扇环按弧长三等分，
                打击/跟踪/跟随各占一段（-76.67°/0°/+76.67°，段中心等距
                76.67°，三段拼回完整马蹄、底部开口朝下），顺时针漩涡式展开
                （角度/延迟详见 CSS 变量；背景图 orbit-segment.svg + 楔形
                clip-path 命中区）。click/keydown 在容器统一阻止冒泡——
                不触发图标的单击勾选与键盘 Enter 联动 */}
            <div
              className="target-marker__actions"
              role="toolbar"
              aria-label={`${t.name}操作`}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="target-marker__action target-marker__action--strike"
                title="打击"
              >
                <span>打击</span>
              </button>
              <button
                type="button"
                className="target-marker__action target-marker__action--track"
                title="跟踪"
              >
                <span>跟踪</span>
              </button>
              <button
                type="button"
                className="target-marker__action target-marker__action--follow"
                title="跟随"
              >
                <span>跟随</span>
              </button>
            </div>

            {/* hover 提示浮层：图标底部居中显示目标类型（白字 14px，
                毛玻璃圆角浮层，不参与指针事件）；标记重点目标右侧附红色小旗 */}
            <div className="target-marker__tip" role="tooltip">
              <span className="target-marker__tip-text">目标类型：{t.type}</span>
              {isMarked && (
                <span className="target-marker__tip-flag" aria-hidden="true">
                  <i />
                  <i />
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}