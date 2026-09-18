import { useEffect, useRef, useState } from 'react'
import { targetTypeOptions } from '../../config/targets'
import { deviceImages } from '../../assets/images/device'
import { homeImages } from '../../assets/images/home'
import { useTargetLinkStore } from '../../stores/targetLinkStore'
import { TargetRow, typeIcon } from './TargetRow'
import { TargetDeleteDialog } from './TargetDeleteDialog'
import './TargetListPanel.css'

interface TargetListPanelProps {
  onClose: () => void
  visible?: boolean
}

/** 刷新动画持续时长（毫秒），与 CSS 中 animation 时长保持一致 */
const REFRESH_SPIN_MS = 1200

/** 「刷新完成」提示停留时长（毫秒），到时后提示条自动消失 */
const REFRESH_DONE_MS = 1600

/** 「刷新失败」提示停留时长（毫秒），到时后提示条自动消失 */
const REFRESH_FAIL_MS = 2500

/** 聚焦滚动：行位置连续两帧位移小于该值视为布局已稳定 */
const FOCUS_STABLE_DELTA_PX = 0.5

/** 聚焦滚动：稳定前最多重试的帧数（60 帧 ≈ 1 秒），超时放弃本次居中 */
const FOCUS_MAX_ATTEMPTS = 60

export function TargetListPanel({ onClose, visible = true }: TargetListPanelProps) {
  const [typeFilter, setTypeFilter] = useState('请选择')
  const [openDropdown, setOpenDropdown] = useState(false)
  // 当前展开详情的目标 id（手风琴模式：同一时刻至多一行展开，
  // 首页图标聚焦切换目标时自动收起上一行，只展示最新点击目标的详情）
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // ===== 态势图目标图标联动（targetLinkStore 全局共享，与地图图标双向同步）=====
  // 重点标记的目标 id 集合（旗标图标切换 + 地图图标标记背景同步）
  const toggleMarked = useTargetLinkStore((s) => s.toggleMarked)
  // 「假删除」（软删除）：确认删除仅打标记（mock 数据保留，刷新可恢复）
  const softDeleteTargets = useTargetLinkStore((s) => s.softDeleteTargets)
  const restoreTargets = useTargetLinkStore((s) => s.restoreTargets)
  const deletedIds = useTargetLinkStore((s) => s.deletedTargetIds)
  // hover 中的目标 id（行背景三态与设备管理面板一致：选中蓝 > hover 橙 > 普通灰）
  const setHoveredId = useTargetLinkStore((s) => s.setHoveredTargetId)
  // 点击行联动态目标 id（行与地图图标双向同步，再次点击解除）
  // 行勾选状态迁移至全局 store（与设备面板 selectedDevices 同模式）：
  // 地图图标单击与列表勾选框共用 toggleTarget，首页图标选中态双向同步
  const selectedIds = useTargetLinkStore((s) => s.selectedTargetIds)
  const toggleTarget = useTargetLinkStore((s) => s.toggleTarget)
  const replaceSelectedIds = useTargetLinkStore((s) => s.setSelectedTargetIds)
  // 地图聚焦请求：单行勾上时飞转地图到该目标（全选走整体替换不触发）
  const requestMapFocusTarget = useTargetLinkStore((s) => s.requestMapFocusTarget)
  // 刷新流程状态：idle 无提示 / refreshing 刷新中 / done 刷新完成 / failed 刷新失败（列表顶部提示条）
  const [refreshStatus, setRefreshStatus] = useState<
    'idle' | 'refreshing' | 'done' | 'failed'
  >('idle')
  // 删除确认弹窗（设计稿 box_27）：点击底部「删除」或行内删除按钮时弹出
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  // 待删除目标 id 集合：底部按钮为全部选中项；行内删除按钮仅该行目标
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([])
  // 新增类型抽屉开关：点击底部「新增」按钮时从其上方划出（人员 / 车辆两个选项）
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  // 目标列表数据源：直接读 targetLinkStore（单一数据源），
  // 与态势图目标图标层共享——删除目标后面板重开不会与地图不一致
  const targets = useTargetLinkStore((s) => s.targets)
  const refreshTimer = useRef<number | null>(null)
  const refreshDoneTimer = useRef<number | null>(null)
  // 列表滚动容器 ref：聚焦定位时把展开行滚动到可视中心
  const listRef = useRef<HTMLDivElement>(null)
  // 首页目标图标单击的聚焦请求：自动展开对应行详情并滚动到列表可视中心
  const focusTargetRequest = useTargetLinkStore((s) => s.focusTargetRequest)
  const clearFocusTargetRequest = useTargetLinkStore((s) => s.clearFocusTargetRequest)

  // 组件卸载时清理定时器与残留 hover 状态，避免内存泄漏与图标残留高亮
  useEffect(() => {
    return () => {
      if (refreshTimer.current !== null) {
        window.clearTimeout(refreshTimer.current)
      }
      if (refreshDoneTimer.current !== null) {
        window.clearTimeout(refreshDoneTimer.current)
      }
      setHoveredId(null)
    }
  }, [setHoveredId])

  // 新增抽屉打开期间：点击面板外任意处或按 Escape 收起抽屉（按钮/选项自身事件已 stopPropagation，不会误触发）
  useEffect(() => {
    if (!addMenuOpen) return
    const closeOnOutsideClick = () => setAddMenuOpen(false)
    const closeOnKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAddMenuOpen(false)
    }
    document.addEventListener('click', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnKeyDown)
    return () => {
      document.removeEventListener('click', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnKeyDown)
    }
  }, [addMenuOpen])

  // ===== 首页目标图标单击 → 列表自动聚焦 =====
  // 收到聚焦请求时（expand 标记区分选中/取消选中）：
  // - expand=true（选中）：确保行可见（必要时重置筛选）→ 手风琴式仅展开该行详情
  //   （其余行收起）→ 滚动到列表可视中心；rAF 稳定帧检测后再计算居中，
  //   规避首次挂载时详情划入动画（0.2s translateY）、字体加载与图片解码
  //   导致的行位置头几帧持续变化（过早计算会滚动偏差甚至不生效的根因）；
  // - expand=false（再次点击取消选中）：收起该行详情，不滚动；
  // 完成后消费请求，避免之后手动重开面板时重复聚焦；超时（≈1s）兜底消费。
  useEffect(() => {
    if (!focusTargetRequest) return
    const { id, expand } = focusTargetRequest
    // 整体处理放入 rAF 异步执行：规避 effect 内同步 setState（React Compiler 规则）
    let raf = 0
    const run = () => {
      // 取消选中：收起该行详情（仅当展开的正是该行），无需滚动，直接消费
      if (!expand) {
        setExpandedId((prev) => (prev === id ? null : prev))
        clearFocusTargetRequest()
        return
      }
      const target = targets.find((t) => t.id === id)
      // 目标不存在或已被「假删除」：仅消费请求，不展开不滚动
      if (!target || deletedIds.has(id)) {
        clearFocusTargetRequest()
        return
      }
      // 当前类型筛选会隐藏该行时重置为「请选择」，保证目标行可见
      if (typeFilter !== '请选择' && target.type !== typeFilter) {
        setTypeFilter('请选择')
      }
      // 手风琴式展开：仅该行展开，其余行收起（已是该行则保持）
      setExpandedId(id)
      // rAF 重试循环：行进入 DOM 且几何位置连续两帧稳定后才计算居中滚动
      let lastTop = Number.NaN
      let stableFrames = 0
      let attempts = 0
      const tick = () => {
        const list = listRef.current
        const row = list?.querySelector<HTMLElement>(`[data-target-id="${CSS.escape(id)}"]`)
        if (list && row && row.offsetHeight > 0) {
          const top = row.getBoundingClientRect().top
          if (Number.isFinite(lastTop) && Math.abs(top - lastTop) < FOCUS_STABLE_DELTA_PX) {
            stableFrames += 1
          } else {
            stableFrames = 0
          }
          lastTop = top
          if (stableFrames >= 2) {
            // 布局已稳定：行中心对齐列表可视区中心（rect 差值换算，不受嵌套定位影响）
            const listRect = list.getBoundingClientRect()
            const rowRect = row.getBoundingClientRect()
            list.scrollTop +=
              rowRect.top + rowRect.height / 2 - (listRect.top + list.clientHeight / 2)
            // 居中完成后消费请求
            clearFocusTargetRequest()
            return
          }
        }
        attempts += 1
        if (attempts >= FOCUS_MAX_ATTEMPTS) {
          // 兜底：超时仍未稳定则放弃本次居中，仅消费请求避免悬挂
          clearFocusTargetRequest()
          return
        }
        raf = window.requestAnimationFrame(tick)
      }
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(run)
    return () => window.cancelAnimationFrame(raf)
  }, [focusTargetRequest, targets, deletedIds, typeFilter, clearFocusTargetRequest])

  /** 刷新收尾：切「刷新完成/失败」提示，停留 REFRESH_DONE_MS/REFRESH_FAIL_MS 后自动消失 */
  const finishRefresh = (status: 'done' | 'failed') => {
    setRefreshStatus(status)
    const stayMs = status === 'done' ? REFRESH_DONE_MS : REFRESH_FAIL_MS
    if (refreshDoneTimer.current !== null) window.clearTimeout(refreshDoneTimer.current)
    refreshDoneTimer.current = window.setTimeout(() => {
      refreshDoneTimer.current = null
      setRefreshStatus('idle')
    }, stayMs)
  }

  /** 点击刷新：纯前端 mock 刷新（取消全选 + 恢复「假删除」目标）；
   *  按钮图标旋转 1.2 秒，之后提示「刷新完成」停留片刻自动消失 */
  const handleRefresh = () => {
    if (refreshStatus === 'refreshing') return
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
    if (refreshDoneTimer.current !== null) window.clearTimeout(refreshDoneTimer.current)
    // 刷新时取消所有行的选中状态（走 store，同步取消地图图标选中态）
    replaceSelectedIds(new Set())
    // 恢复全部「假删除」的目标（mock 数据保留在 store，刷新恢复显示）
    restoreTargets()
    setRefreshStatus('refreshing')
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null
      finishRefresh('done')
    }, REFRESH_SPIN_MS)
  }

  /** 打开删除确认弹窗：行内删除按钮传单个 id，底部按钮传全部选中 id */
  const openDeleteDialog = (ids: string[]) => {
    setPendingDeleteIds(ids)
    setDeleteDialogOpen(true)
  }

  /** 关闭删除确认弹窗并清空待删除集合 */
  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false)
    setPendingDeleteIds([])
  }

  /** 确认删除：目标「假删除」（store 打软删除标记，mock 数据保留、刷新可恢复），
   *  列表与地图图标随过滤同步消失；勾选/标记集合与点击联动态由 store action 清理 */
  const handleDeleteConfirm = () => {
    if (pendingDeleteIds.length > 0) {
      softDeleteTargets(pendingDeleteIds)
      // 收起被删目标行内展开的详情（展开的行被删时清空展开态）
      setExpandedId((prev) => (prev !== null && pendingDeleteIds.includes(prev) ? null : prev))
    }
    closeDeleteDialog()
  }

  // 「假删除」目标从列表过滤隐藏（软删除标记，mock 数据仍在 store 中，刷新恢复）
  const filteredTargets = targets.filter(
    (t) => !deletedIds.has(t.id) && (typeFilter === '请选择' || t.type === typeFilter),
  )

  const isAllSelected =
    filteredTargets.length > 0 && filteredTargets.every((t) => selectedIds.has(t.id))
  const isIndeterminate = filteredTargets.some((t) => selectedIds.has(t.id)) && !isAllSelected

  const toggleSelectAll = () => {
    const next = new Set(selectedIds)
    if (isAllSelected) {
      filteredTargets.forEach((t) => next.delete(t.id))
    } else {
      filteredTargets.forEach((t) => next.add(t.id))
    }
    replaceSelectedIds(next)
  }

  /** 切换重点标记：旗标图标在 flag / flag-marked 间切换
   *  （走 store，同步切换态势图图标底衬的「标记」背景） */
  const toggleMark = (id: string) => {
    toggleMarked(id)
  }

  /** 切换行勾选（走 store，与地图图标单击共用同一入口，选中态双向同步） */
  const toggleSelect = (id: string) => {
    // 勾上（原未选中）时请求地图飞转聚焦该目标；取消勾选不触发
    if (!selectedIds.has(id)) requestMapFocusTarget(id)
    toggleTarget(id)
  }

  /** 切换行内详情展开/收起（行尾箭头，手风琴：展开新行自动收起其他行） */
  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  /** 清除类型筛选：恢复「请选择」占位（显示全部目标） */
  const clearTypeFilter = () => {
    setTypeFilter('请选择')
    setOpenDropdown(false)
  }

  return (
    <div className={`target-panel${visible ? ' target-panel--visible' : ''}`}>
      {/* 标题栏 */}
      <div className="target-panel__header">
        <div className="target-panel__header-icon">
          <img src={deviceImages.headerIcon} alt="" />
        </div>
        <span className="target-panel__title">目标列表</span>
        <button
          className="target-panel__close"
          type="button"
          onClick={onClose}
          aria-label="关闭目标列表面板"
        >
          <img src={deviceImages.closeBtn} alt="" />
        </button>
      </div>

      {/* 分隔线 */}
      <div className="target-panel__separator">
        <span className="target-panel__separator-dot" />
        <span className="target-panel__separator-line" />
      </div>

      {/* 筛选栏：全选 + 目标类型下拉 */}
      <div className="target-panel__filters">
        <div
          className={`target-panel__checkbox${isAllSelected ? ' target-panel__checkbox--checked' : ''}${isIndeterminate ? ' target-panel__checkbox--indeterminate' : ''}`}
          onClick={toggleSelectAll}
          role="checkbox"
          aria-checked={isAllSelected ? 'true' : isIndeterminate ? 'mixed' : 'false'}
          tabIndex={0}
          onKeyDown={(e) => e.key === ' ' && (e.preventDefault(), toggleSelectAll())}
        >
          {isAllSelected && (
            <svg
              viewBox="0 0 12 12"
              width="10"
              height="10"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="2,6 5,9 10,3" />
            </svg>
          )}
          {isIndeterminate && (
            <svg
              viewBox="0 0 12 12"
              width="10"
              height="10"
              fill="none"
              stroke="#fff"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="2" y1="6" x2="10" y2="6" />
            </svg>
          )}
        </div>
        <span className="target-panel__filter-label">目标类型</span>
        <div
          className={`target-panel__select${openDropdown ? ' target-panel__select--open' : ''}`}
          onClick={() => setOpenDropdown((v) => !v)}
        >
          <span className={typeFilter === '请选择' ? 'target-panel__select-placeholder' : ''}>
            {typeFilter}
          </span>
          {/* × 快速清除按钮：已选类型时显示，一键恢复「请选择」（显示全部目标） */}
          {typeFilter !== '请选择' && (
            <button
              type="button"
              className="target-panel__select-clear"
              aria-label="清除类型筛选"
              title="清除类型筛选"
              onClick={(e) => {
                e.stopPropagation()
                clearTypeFilter()
              }}
            >
              <svg
                viewBox="0 0 12 12"
                width="8"
                height="8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              >
                <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" />
                <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" />
              </svg>
            </button>
          )}
          <img src={deviceImages.dropdown} alt="" />
          {openDropdown && (
            <div className="target-panel__dropdown">
              {/* 「请选择」= 清除筛选项：恢复显示全部目标（与 × 按钮等效） */}
              <div
                className={`target-panel__dropdown-item target-panel__dropdown-item--clear${typeFilter === '请选择' ? ' target-panel__dropdown-item--active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  clearTypeFilter()
                }}
              >
                请选择
              </div>
              {targetTypeOptions.map((opt) => (
                <div
                  key={opt}
                  className={`target-panel__dropdown-item${typeFilter === opt ? ' target-panel__dropdown-item--active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setTypeFilter(opt)
                    setOpenDropdown(false)
                  }}
                >
                  {opt}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 刷新状态提示条：刷新中 → 刷新完成（参考设计稿 box_5：青色渐变条 + 圆形徽标） */}
      {refreshStatus !== 'idle' && (
        <div
          className={`target-panel__refresh-bar${refreshStatus === 'refreshing' ? '' : ` target-panel__refresh-bar--${refreshStatus}`}`}
        >
          <span className="target-panel__refresh-badge">
            {refreshStatus === 'refreshing' ? (
              <img
                className="target-panel__refresh-spinner"
                src={deviceImages.iconRefresh}
                alt=""
                draggable={false}
              />
            ) : refreshStatus === 'done' ? (
              <svg
                viewBox="0 0 12 12"
                width="12"
                height="12"
                fill="none"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="2,6.5 4.8,9.3 10,3.2" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 12 12"
                width="12"
                height="12"
                fill="none"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="6" y1="2.6" x2="6" y2="7.2" />
                <circle cx="6" cy="9.7" r="0.2" fill="#fff" stroke="none" />
              </svg>
            )}
          </span>
          <span className="target-panel__refresh-text">
            {refreshStatus === 'refreshing'
              ? '刷新中'
              : refreshStatus === 'failed'
                ? '刷新失败'
                : '刷新完成'}
          </span>
        </div>
      )}

      {/* 目标列表 */}
      <div className="target-panel__body">
        <div className="target-panel__list" ref={listRef}>
          {filteredTargets.length === 0 ? (
            <div className="target-panel__list-empty">
              <img src={deviceImages.noData} alt="暂无目标" draggable={false} />
              <span>暂无目标</span>
            </div>
          ) : (
            filteredTargets.map((t) => (
              <TargetRow
                key={t.id}
                target={t}
                isExpanded={expandedId === t.id}
                onToggleSelect={toggleSelect}
                onToggleMark={toggleMark}
                onToggleExpand={toggleExpand}
                onDeleteRequest={openDeleteDialog}
              />
            ))
          )}
        </div>
      </div>

      {/* 删除确认弹窗（设计稿 box_27）：portal 到 body 的全局弹窗，遮罩覆盖整个页面并打断底层操作，视口正中 */}
      {deleteDialogOpen && (
          <TargetDeleteDialog
            count={pendingDeleteIds.length}
            onConfirm={handleDeleteConfirm}
            onClose={closeDeleteDialog}
          />
        )}

      {/* 底部操作：刷新 / 新增 / 删除 */}
      <div className="target-panel__actions">
        <button className="target-panel__action-btn" type="button" onClick={handleRefresh}>
          <img
            src={deviceImages.iconRefresh}
            alt=""
            className={refreshStatus === 'refreshing' ? 'target-panel__icon--spinning' : undefined}
          />
          刷新
        </button>
        {/* 新增：点击后按钮上方划出类型抽屉（人员 / 车辆），再点击按钮或点击面板外收起 */}
        <div className="target-panel__add-wrap">
          <div
            className={`target-panel__add-menu${addMenuOpen ? ' target-panel__add-menu--open' : ''}`}
            role="menu"
            aria-label="新增目标类型"
            aria-hidden={!addMenuOpen}
          >
            {/* TODO: 选项点击后接入真实新增流程，当前仅收起抽屉 */}
            <div
              className="target-panel__add-menu-item"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation()
                setAddMenuOpen(false)
              }}
            >
              <img src={typeIcon['人员']} alt="" draggable={false} />
              <span>人员</span>
            </div>
            <div
              className="target-panel__add-menu-item"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation()
                setAddMenuOpen(false)
              }}
            >
              <img src={typeIcon['车辆']} alt="" draggable={false} />
              <span>车辆</span>
            </div>
          </div>
          <button
            className={`target-panel__action-btn${addMenuOpen ? ' target-panel__action-btn--open' : ''}`}
            type="button"
            aria-expanded={addMenuOpen}
            onClick={(e) => {
              e.stopPropagation()
              setAddMenuOpen((v) => !v)
            }}
          >
            <img src={deviceImages.iconAdd} alt="" />
            新增
          </button>
        </div>
        {/* 未选中任何行时置灰不可点击（disabled 阻断点击 + :disabled 样式置灰） */}
        <button
          className="target-panel__action-btn"
          type="button"
          disabled={selectedIds.size === 0}
          aria-disabled={selectedIds.size === 0}
          onClick={() => openDeleteDialog(Array.from(selectedIds))}
        >
          <img src={homeImages.iconDelete} alt="" />
          删除
        </button>
      </div>
    </div>
  )
}
