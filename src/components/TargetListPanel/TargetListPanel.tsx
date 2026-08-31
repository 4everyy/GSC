import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { targetTypeOptions, type TargetItem } from '../../config/targets'
import { deviceImages } from '../../assets/images/device'
import { homeImages } from '../../assets/images/home'
import { useTargetLinkStore } from '../../stores/targetLinkStore'
import './TargetListPanel.css'
import './TargetListPanel.clear.css'
import './TargetListPanel.add.css'

interface TargetListPanelProps {
  onClose: () => void
  visible?: boolean
}

/** 目标类型 → 行首图标（车辆 → tank / 人员 → people） */
const typeIcon: Record<TargetItem['type'], string> = {
  '车辆': deviceImages.tank,
  '人员': deviceImages.people,
}

/** 刷新动画持续时长（毫秒），与 CSS 中 animation 时长保持一致 */
const REFRESH_SPIN_MS = 1200

/** 「刷新完成」提示停留时长（毫秒），到时后提示条自动消失 */
const REFRESH_DONE_MS = 1600

export function TargetListPanel({ onClose, visible = true }: TargetListPanelProps) {
  const [typeFilter, setTypeFilter] = useState('请选择')
  const [openDropdown, setOpenDropdown] = useState(false)
  // 展开详情的目标 id 集合（行尾箭头切换）
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  // ===== 态势图目标图标联动（targetLinkStore 全局共享，与地图图标双向同步）=====
  // 重点标记的目标 id 集合（旗标图标切换 + 地图图标标记背景同步）
  const markedIds = useTargetLinkStore((s) => s.markedIds)
  const toggleMarked = useTargetLinkStore((s) => s.toggleMarked)
  const setStoreMarkedIds = useTargetLinkStore((s) => s.setMarkedIds)
  const setStoreTargets = useTargetLinkStore((s) => s.setTargets)
  // hover 中的目标 id（行背景三态与设备管理面板一致：选中蓝 > hover 橙 > 普通灰）
  const hoveredId = useTargetLinkStore((s) => s.hoveredTargetId)
  const setHoveredId = useTargetLinkStore((s) => s.setHoveredTargetId)
  // 点击行联动态目标 id（行与地图图标双向同步，再次点击解除）
  const clickedTargetId = useTargetLinkStore((s) => s.clickedTargetId)
  const toggleClickedTarget = useTargetLinkStore((s) => s.toggleClickedTarget)
  const clearClickedTarget = useTargetLinkStore((s) => s.clearClickedTarget)
  // 行勾选状态迁移至全局 store（与设备面板 selectedDevices 同模式）：
  // 地图图标单击与列表勾选框共用 toggleTarget，首页图标选中态双向同步
  const selectedIds = useTargetLinkStore((s) => s.selectedTargetIds)
  const toggleTarget = useTargetLinkStore((s) => s.toggleTarget)
  const replaceSelectedIds = useTargetLinkStore((s) => s.setSelectedTargetIds)
  // 刷新流程状态：idle 无提示 / refreshing 刷新中 / done 刷新完成（列表顶部提示条）
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'refreshing' | 'done'>('idle')
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
  }, [])

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

  /** 点击刷新：按钮图标旋转 1.2 秒，列表顶部提示「刷新中」→「刷新完成」，停留 1.6 秒后自动消失 */
  const handleRefresh = () => {
    if (refreshStatus === 'refreshing') return
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
    if (refreshDoneTimer.current !== null) window.clearTimeout(refreshDoneTimer.current)
    // 刷新时取消所有行的选中状态（走 store，同步取消地图图标选中态）
    replaceSelectedIds(new Set())
    setRefreshStatus('refreshing')
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null
      setRefreshStatus('done')
      refreshDoneTimer.current = window.setTimeout(() => {
        refreshDoneTimer.current = null
        setRefreshStatus('idle')
      }, REFRESH_DONE_MS)
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

  /** 确认删除：移除弹窗指定的目标集合（store 单一数据源，地图图标同步消失），
   *  同步清理勾选/标记/展开集合与点击联动态，并关闭弹窗 */
  const handleDeleteConfirm = () => {
    const ids = new Set(pendingDeleteIds)
    if (ids.size > 0) {
      setStoreTargets(targets.filter((t) => !ids.has(t.id)))
      // 勾选集合走 store，同步清理地图图标的选中态
      const nextSelected = new Set(selectedIds)
      ids.forEach((id) => nextSelected.delete(id))
      replaceSelectedIds(nextSelected)
      setExpandedIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
      const nextMarked = new Set(markedIds)
      ids.forEach((id) => nextMarked.delete(id))
      setStoreMarkedIds(nextMarked)
      // 删除的是当前联动目标时清除联动态
      if (clickedTargetId !== null && ids.has(clickedTargetId)) {
        clearClickedTarget()
      }
    }
    closeDeleteDialog()
  }

  const filteredTargets = targets.filter(
    (t) => typeFilter === '请选择' || t.type === typeFilter,
  )

  const isAllSelected =
    filteredTargets.length > 0 &&
    filteredTargets.every((t) => selectedIds.has(t.id))
  const isIndeterminate =
    filteredTargets.some((t) => selectedIds.has(t.id)) && !isAllSelected

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
    toggleTarget(id)
  }

  /** 切换行内详情展开/收起（行尾箭头） */
  const toggleExpand = (id: string) => {
    const next = new Set(expandedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setExpandedIds(next)
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
            <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="2,6 5,9 10,3" />
            </svg>
          )}
          {isIndeterminate && (
            <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
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
              <svg viewBox="0 0 12 12" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
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
          className={`target-panel__refresh-bar${refreshStatus === 'done' ? ' target-panel__refresh-bar--done' : ''}`}
        >
          <span className="target-panel__refresh-badge">
            {refreshStatus === 'refreshing' ? (
              <img
                className="target-panel__refresh-spinner"
                src={deviceImages.iconRefresh}
                alt=""
                draggable={false}
              />
            ) : (
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
            )}
          </span>
          <span className="target-panel__refresh-text">
            {refreshStatus === 'refreshing' ? '刷新中' : '刷新完成'}
          </span>
        </div>
      )}

      {/* 目标列表 */}
      <div className="target-panel__body">
        <div className="target-panel__list">
          {filteredTargets.length === 0 ? (
            <div className="target-panel__list-empty">
              <img src={deviceImages.noData} alt="暂无目标" draggable={false} />
              <span>暂无目标</span>
            </div>
          ) : (
            filteredTargets.map((t) => {
              const isSelected = selectedIds.has(t.id)
              const isExpanded = expandedIds.has(t.id)
              const isClicked = clickedTargetId === t.id
              // 行背景多态与设备管理面板一致：
              // 选中(蓝) > 点击联动(蓝) > hover(橙) > 普通(灰)
              const bgImage = isSelected || isClicked
                ? deviceImages.rowBgBlue
                : hoveredId === t.id
                  ? deviceImages.rowBgOrange
                  : deviceImages.rowBgGray
              return (
                <div
                  className={`target-row-wrapper${isExpanded ? ' target-row-wrapper--expanded' : ''}`}
                  key={t.id}
                >
                <div
                  className={`target-row${isSelected ? ' target-row--selected' : ''}${clickedTargetId === t.id ? ' target-row--clicked' : ''}`}
                  onMouseEnter={() => setHoveredId(t.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => toggleClickedTarget(t.id)}
                >
                  <img
                    className="target-row__bg"
                    src={bgImage}
                    alt=""
                    draggable={false}
                  />
                  <div
                    className={`target-row__checkbox${isSelected ? ' target-row__checkbox--checked' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleSelect(t.id)
                    }}
                    role="checkbox"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === ' ' && (e.preventDefault(), toggleSelect(t.id))}
                  >
                    {isSelected && (
                      <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="2,6 5,9 10,3" />
                      </svg>
                    )}
                  </div>
                  <img className="target-row__icon" src={typeIcon[t.type]} alt={t.type} title={t.type} draggable={false} />
                  <span className="target-row__name" title={t.name}>{t.name}</span>
                  <span className="target-row__status">{`状态:${t.status}`}</span>
                  <img
                    className="target-row__action target-row__action--locate"
                    src={markedIds.has(t.id) ? deviceImages.flagMarked : deviceImages.flag}
                    alt={markedIds.has(t.id) ? '取消重点标记' : '标记为重点'}
                    title={markedIds.has(t.id) ? '取消重点标记' : '标记为重点'}
                    draggable={false}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleMark(t.id)
                    }}
                  />
                  <img
                    className="target-row__action target-row__action--delete"
                    src={homeImages.iconDelete}
                    alt="删除"
                    title="删除"
                    draggable={false}
                    onClick={(e) => {
                      e.stopPropagation()
                      openDeleteDialog([t.id])
                    }}
                  />
                  <img
                    className="target-row__action target-row__action--more"
                    src={isExpanded ? deviceImages.upArrow : deviceImages.downArrow}
                    alt={isExpanded ? '收起详情' : '展开详情'}
                    title={isExpanded ? '收起详情' : '展开详情'}
                    draggable={false}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleExpand(t.id)
                    }}
                  />
                </div>

                  {/* ====== 行内目标详情（设计稿 group_9） ====== */}
                  {isExpanded && (
                    <div className="target-row__detail">
                      {/* 信息行 1：发现源 / 威胁半径（六列 grid，第二组竖条跨行对齐 x≈273/434） */}
                      <div className="target-row__detail-row">
                        <span className="target-row__detail-bar" />
                        <span className="target-row__detail-label">发现源</span>
                        <span className="target-row__detail-value">{t.source}</span>
                        <span className="target-row__detail-bar" />
                        <span className="target-row__detail-label">威胁半径</span>
                        <span className="target-row__detail-value">{t.threatRadius}</span>
                      </div>

                      {/* 信息行 2：目标高度 / 打击方式 */}
                      <div className="target-row__detail-row">
                        <span className="target-row__detail-bar" />
                        <span className="target-row__detail-label">目标高度</span>
                        <span className="target-row__detail-value">{t.altitude}</span>
                        <span className="target-row__detail-bar" />
                        <span className="target-row__detail-label">打击方式</span>
                        <span className="target-row__detail-value">{t.strikeMode}</span>
                      </div>

                      {/* 信息行 3：目标位置（单组，占前三列） */}
                      <div className="target-row__detail-row target-row__detail-row--single">
                        <span className="target-row__detail-bar" />
                        <span className="target-row__detail-label">目标位置</span>
                        <span className="target-row__detail-value">{t.position}</span>
                      </div>


                      {/* 图片预览区：宽度与信息行一致、高 146px，四角放置角标图（原图为右上角预设，通过 rotate 旋转适配四角） */}
                      <div className="target-row__detail-preview">
                        {/* 预览图：宽度=顶部虚线整体长度（左右各 28px 内缩），高度自适应垂直居中 */}
                        <img className="target-row__detail-preview-img" src={deviceImages.previewImage} alt="目标预览图" draggable={false} />
                        {/* 四角连接线：取角标 45° 斜线中点，垂直于斜线（135° 方向）实线连到预览图 */}
                        <div className="target-row__detail-preview-link target-row__detail-preview-link--tl" />
                        <div className="target-row__detail-preview-link target-row__detail-preview-link--tr" />
                        <div className="target-row__detail-preview-link target-row__detail-preview-link--bl" />
                        <div className="target-row__detail-preview-link target-row__detail-preview-link--br" />
                        <img className="target-row__detail-preview-corner target-row__detail-preview-corner--tl" src={deviceImages.previewCorner} alt="" draggable={false} />
                        <img className="target-row__detail-preview-corner target-row__detail-preview-corner--tr" src={deviceImages.previewCorner} alt="" draggable={false} />
                        <img className="target-row__detail-preview-corner target-row__detail-preview-corner--bl" src={deviceImages.previewCorner} alt="" draggable={false} />
                        <img className="target-row__detail-preview-corner target-row__detail-preview-corner--br" src={deviceImages.previewCorner} alt="" draggable={false} />
                        {/* 四边同色系虚线：衔接四角角标的线条端点 */}
                        <div className="target-row__detail-preview-edge target-row__detail-preview-edge--top" />
                        <div className="target-row__detail-preview-edge target-row__detail-preview-edge--right" />
                        <div className="target-row__detail-preview-edge target-row__detail-preview-edge--bottom" />
                        <div className="target-row__detail-preview-edge target-row__detail-preview-edge--left" />
                      </div>

                      {/* 分隔线 */}
                      <div className="target-row__detail-divider" />

                      {/* 时间行 1：首次发现时间（青色） */}
                      <div className="target-row__detail-footer">
                        <span className="target-row__detail-label target-row__detail-label--teal">首次发现时间</span>
                        <span className="target-row__detail-time target-row__detail-time--teal">{t.firstSeenAt}</span>
                      </div>

                      {/* 时间行 2：最后更新时间（白色） */}
                      <div className="target-row__detail-footer">
                        <span className="target-row__detail-label">最后更新时间</span>
                        <span className="target-row__detail-time">{t.lastUpdatedAt}</span>
                      </div>

                      {/* 底部装饰图 */}
                      <img
                        className="target-row__detail-deco"
                        src={deviceImages.detailDeco}
                        alt=""
                        draggable={false}
                      />
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* 删除确认弹窗（设计稿 box_27）：portal 到 body 的全局弹窗，遮罩覆盖整个页面并打断底层操作，视口正中 */}
      {deleteDialogOpen && createPortal(
        <div className="target-panel__delete-overlay" onClick={closeDeleteDialog}>
          <div
            className="target-panel__delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="删除目标确认"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="target-panel__delete-dialog-accent" aria-hidden="true" />
            <span className="target-panel__delete-dialog-title">删除</span>
            <span className="target-panel__delete-dialog-message">
              {pendingDeleteIds.length > 1
                ? `是否删除选中的 ${pendingDeleteIds.length} 个目标`
                : '是否删除该目标'}
            </span>
            <div className="target-panel__delete-dialog-actions">
              <button
                className="target-panel__delete-dialog-btn target-panel__delete-dialog-btn--confirm"
                type="button"
                onClick={handleDeleteConfirm}
              >
                确认
              </button>
              <button
                className="target-panel__delete-dialog-btn target-panel__delete-dialog-btn--cancel"
                type="button"
                onClick={closeDeleteDialog}
              >
                取消
              </button>
            </div>
          </div>
        </div>,
        document.body,
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