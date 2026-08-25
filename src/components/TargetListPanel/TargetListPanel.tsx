import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { targetList, targetTypeOptions, type TargetItem } from '../../config/targets'
import { deviceImages } from '../../assets/images/device'
import { homeImages } from '../../assets/images/home'
import './TargetListPanel.css'

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // 重点标记的目标 id 集合（旗标图标切换）
  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set())
  // 展开详情的目标 id 集合（行尾箭头切换）
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  // hover 中的目标 id（行背景三态与设备管理面板一致：选中蓝 > hover 橙 > 普通灰）
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // 刷新流程状态：idle 无提示 / refreshing 刷新中 / done 刷新完成（列表顶部提示条）
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'refreshing' | 'done'>('idle')
  // 删除确认弹窗（设计稿 box_27）：点击底部「删除」按钮时弹出
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  // 目标列表本地副本：确认删除后移除对应目标（targetList 为静态 mock，删除仅影响当前会话）
  const [targets, setTargets] = useState<TargetItem[]>(targetList)
  const refreshTimer = useRef<number | null>(null)
  const refreshDoneTimer = useRef<number | null>(null)

  // 组件卸载时清理定时器，避免内存泄漏与卸载后 setState
  useEffect(() => {
    return () => {
      if (refreshTimer.current !== null) {
        window.clearTimeout(refreshTimer.current)
      }
      if (refreshDoneTimer.current !== null) {
        window.clearTimeout(refreshDoneTimer.current)
      }
    }
  }, [])

  /** 点击刷新：按钮图标旋转 1.2 秒，列表顶部提示「刷新中」→「刷新完成」，停留 1.6 秒后自动消失 */
  const handleRefresh = () => {
    if (refreshStatus === 'refreshing') return
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
    if (refreshDoneTimer.current !== null) window.clearTimeout(refreshDoneTimer.current)
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

  /** 确认删除：移除所有已勾选目标，同步清理勾选/标记/展开集合并关闭弹窗 */
  const handleDeleteConfirm = () => {
    setTargets((prev) => prev.filter((t) => !selectedIds.has(t.id)))
    setSelectedIds(new Set())
    setExpandedIds(new Set())
    setMarkedIds((prev) => {
      const next = new Set(prev)
      selectedIds.forEach((id) => next.delete(id))
      return next
    })
    setDeleteDialogOpen(false)
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
    setSelectedIds(next)
  }

  /** 切换重点标记：旗标图标在 flag / flag-marked 间切换 */
  const toggleMark = (id: string) => {
    const next = new Set(markedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setMarkedIds(next)
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedIds(next)
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
          <img src={deviceImages.dropdown} alt="" />
          {openDropdown && (
            <div className="target-panel__dropdown">
              {targetTypeOptions.map((opt) => (
                <div
                  key={opt}
                  className="target-panel__dropdown-item"
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
              // 行背景三态与设备管理面板一致：选中(蓝) > hover(橙) > 普通(灰)
              const bgImage = isSelected
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
                  className={`target-row${isSelected ? ' target-row--selected' : ''}`}
                  onMouseEnter={() => setHoveredId(t.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <img
                    className="target-row__bg"
                    src={bgImage}
                    alt=""
                    draggable={false}
                  />
                  <div
                    className={`target-row__checkbox${isSelected ? ' target-row__checkbox--checked' : ''}`}
                    onClick={() => toggleSelect(t.id)}
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
                    onClick={() => toggleMark(t.id)}
                  />
                  <img
                    className="target-row__action target-row__action--detail"
                    src={homeImages.iconDelete}
                    alt="详情"
                    draggable={false}
                  />
                  <img
                    className="target-row__action target-row__action--more"
                    src={isExpanded ? deviceImages.upArrow : deviceImages.downArrow}
                    alt={isExpanded ? '收起详情' : '展开详情'}
                    title={isExpanded ? '收起详情' : '展开详情'}
                    draggable={false}
                    onClick={() => toggleExpand(t.id)}
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
        <div className="target-panel__delete-overlay" onClick={() => setDeleteDialogOpen(false)}>
          <div
            className="target-panel__delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="删除目标确认"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="target-panel__delete-dialog-accent" aria-hidden="true" />
            <span className="target-panel__delete-dialog-title">删除</span>
            <span className="target-panel__delete-dialog-message">是否删除该目标</span>
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
                onClick={() => setDeleteDialogOpen(false)}
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
        <button className="target-panel__action-btn" type="button">
          <img src={deviceImages.iconAdd} alt="" />
          新增
        </button>
        <button
          className="target-panel__action-btn"
          type="button"
          onClick={() => setDeleteDialogOpen(true)}
        >
          <img src={homeImages.iconDelete} alt="" />
          删除
        </button>
      </div>
    </div>
  )
}