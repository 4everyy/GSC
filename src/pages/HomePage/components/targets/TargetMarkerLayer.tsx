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
 */
import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { deviceImages } from '../../../../assets/images/device'
import { useTargetLinkStore, type TargetMarkerItem } from '../../../../stores/targetLinkStore'
import type { TargetType } from '../../../../config/targets'
import './TargetMarkerLayer.css'

/** 目标类型 → 前景图标（车辆 → tank / 人员 → people） */
const typeIcon: Record<TargetType, string> = {
  '车辆': deviceImages.tank,
  '人员': deviceImages.people,
}

/** 按下后位移超过该像素数判定为拖拽（小于则视为单击） */
const DRAG_THRESHOLD_PX = 4

export function TargetMarkerLayer() {
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

   /** 松手：若始终未超阈值则视为单击（勾选联动 + 请求开面板 + 列表聚焦展开/收起） */
   const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>, t: TargetMarkerItem) => {
     const ds = dragState.current
     if (!ds || ds.pointerId !== e.pointerId) return
     const wasDrag = ds.moved
     dragState.current = null
     if (wasDrag) return
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