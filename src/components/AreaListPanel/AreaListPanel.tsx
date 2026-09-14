/**
 * AreaListPanel —— 区域列表面板（工具栏「区域规划」按钮，index 1）。
 *
 * 数据源：taskAreaStore（/api/v1/control/queryTaskAreaList，与态势图
 * TaskAreaLayer 渲染的是同一份数据）——列表与地图多边形天然一致。
 * 交互：
 * - 筛选栏「全选」复选框（三态：全选/部分选中/未选，作用于当前列表全部区域）；
 * - 行首复选框勾选区域（选中行背景变蓝，与设备/目标面板一致）；
 * - 行点击 / 行尾箭头展开详情（区域中心 / 顶点数量 / 创建时间，手风琴模式）；
 * - 底部「刷新」重拉区域列表（loading 期间按钮图标旋转）；
 * - 加载失败展示错误与「重试」，空数据展示「暂无区域」。
 * 外观与 TargetListPanel / DeviceManagementPanel 同一套视觉语言
 * （渐变底、切角装饰、行背景图选中蓝 / hover 橙 / 普通灰）。
 */
import { useEffect, useState } from 'react'
import { useTaskAreaStore } from '../../stores/taskAreaStore'
import { taskAreaTypeMeta, type TaskArea } from '../../api/taskArea'
import { deviceImages } from '../../assets/images/device'
import './AreaListPanel.css'

interface AreaListPanelProps {
  onClose: () => void
  visible?: boolean
}

/** epoch ms → YYYY/MM/DD HH:mm:ss（0/非法值返回 —） */
function formatTime(ms: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 区域顶点经纬度均值（地理中心，展示用） */
function formatCentroid(area: TaskArea): string {
  if (area.vertices.length === 0) return '—'
  const n = area.vertices.length
  const lng = area.vertices.reduce((s, v) => s + v.longitude, 0) / n
  const lat = area.vertices.reduce((s, v) => s + v.latitude, 0) / n
  return `经度:${lng.toFixed(4)}°, 纬度:${lat.toFixed(4)}°`
}

export function AreaListPanel({ onClose, visible = true }: AreaListPanelProps) {
  const areas = useTaskAreaStore((s) => s.areas)
  const status = useTaskAreaStore((s) => s.status)
  const error = useTaskAreaStore((s) => s.error)
  const load = useTaskAreaStore((s) => s.load)

  // 勾选的区域 id 集合（面板内局部状态：区域暂无地图图标联动需求）
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // 手风琴模式：同一时刻至多一行展开详情
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // 兜底加载：态势图区域层通常已触发过 load（store 内部 loading 防重入），
  // 地图层未挂载场景下直接打开面板也能拉到数据
  useEffect(() => {
    if (useTaskAreaStore.getState().status === 'idle') void load()
  }, [load])

  /** 全选 / 全不选联动（作用于当前列表全部区域） */
  const isAllSelected = areas.length > 0 && areas.every((a) => selectedIds.has(a.id))
  const isIndeterminate = areas.some((a) => selectedIds.has(a.id)) && !isAllSelected

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (isAllSelected) {
        areas.forEach((a) => next.delete(a.id))
      } else {
        areas.forEach((a) => next.add(a.id))
      }
      return next
    })
  }

  /** 切换行勾选 */
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  /** 切换行内详情展开/收起（手风琴：展开新行自动收起其他行） */
  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <div className={`area-panel${visible ? ' area-panel--visible' : ''}`}>
      {/* 标题栏 */}
      <div className="area-panel__header">
        <div className="area-panel__header-icon">
          <img src={deviceImages.headerIcon} alt="" />
        </div>
        <span className="area-panel__title">区域列表</span>
        <button
          className="area-panel__close"
          type="button"
          onClick={onClose}
          aria-label="关闭区域列表面板"
        >
          <img src={deviceImages.closeBtn} alt="" />
        </button>
      </div>

      {/* 分隔线 */}
      <div className="area-panel__separator">
        <span className="area-panel__separator-dot" />
        <span className="area-panel__separator-line" />
      </div>

      {/* 筛选栏：全选复选框（三态） */}
      <div className="area-panel__filters">
        <div
          className={`area-panel__checkbox${isAllSelected ? ' area-panel__checkbox--checked' : ''}${isIndeterminate ? ' area-panel__checkbox--indeterminate' : ''}`}
          onClick={toggleSelectAll}
          role="checkbox"
          aria-checked={isAllSelected ? 'true' : isIndeterminate ? 'mixed' : 'false'}
          aria-label="全选区域"
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
        <span className="area-panel__filter-label">全选</span>
      </div>

      {/* 区域列表 */}
      <div className="area-panel__body">
        <div className="area-panel__list">
          {status === 'loading' && areas.length === 0 ? (
            /* 首次加载中 */
            <div className="area-panel__state">
              <img
                className="area-panel__state-spinner"
                src={deviceImages.iconRefresh}
                alt=""
                draggable={false}
              />
              <span>正在加载区域</span>
            </div>
          ) : status === 'error' && areas.length === 0 ? (
            /* 加载失败（无缓存数据）：错误提示 + 重试 */
            <div className="area-panel__state area-panel__state--error">
              <span title={error ?? undefined}>区域加载失败</span>
              <button type="button" className="area-panel__retry" onClick={() => void load()}>
                重试
              </button>
            </div>
          ) : areas.length === 0 ? (
            /* 空列表 */
            <div className="area-panel__state">
              <img src={deviceImages.noData} alt="暂无区域" draggable={false} />
              <span>暂无区域</span>
            </div>
          ) : (
            areas.map((a) => {
              const meta = taskAreaTypeMeta(a.type)
              const isExpanded = expandedId === a.id
              const isSelected = selectedIds.has(a.id)
              // 行背景三态与设备/目标面板一致：选中蓝 > hover 橙 > 普通灰
              const bgImage = isSelected
                ? deviceImages.rowBgBlue
                : hoveredId === a.id
                  ? deviceImages.rowBgOrange
                  : deviceImages.rowBgGray
              return (
                <div className="area-row-wrapper" key={a.id}>
                  <div
                    className={`area-row${isSelected ? ' area-row--selected' : ''}`}
                    onClick={() => toggleExpand(a.id)}
                    onMouseEnter={() => setHoveredId(a.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <img className="area-row__bg" src={bgImage} alt="" draggable={false} />
                    <div
                      className={`area-row__checkbox${isSelected ? ' area-row__checkbox--checked' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleSelect(a.id)
                      }}
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-label={`勾选区域 ${a.name}`}
                      tabIndex={0}
                      onKeyDown={(e) =>
                        e.key === ' ' && (e.preventDefault(), toggleSelect(a.id))
                      }
                    >
                      {isSelected && (
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
                    </div>
                    <span className="area-row__name" title={a.name}>
                      {a.name}
                    </span>
                    <span className="area-row__type" title={meta.label}>
                      <span
                        className="area-row__type-dot"
                        style={{ backgroundColor: meta.color }}
                      />
                      {meta.label}
                    </span>
                    <span className="area-row__area" title={`${a.areaKm2} km²`}>
                      {a.areaKm2} km²
                    </span>
                    <span className="area-row__priority" title={a.priority || '—'}>
                      {a.priority || '—'}
                    </span>
                    <img
                      className="area-row__expand"
                      src={isExpanded ? deviceImages.upArrow : deviceImages.downArrow}
                      alt={isExpanded ? '收起详情' : '展开详情'}
                      title={isExpanded ? '收起详情' : '展开详情'}
                      draggable={false}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleExpand(a.id)
                      }}
                    />
                  </div>

                  {/* 行内详情 */}
                  {isExpanded && (
                    <div className="area-row__detail">
                      <div className="area-row__detail-row">
                        <span className="area-row__detail-bar" />
                        <span className="area-row__detail-label">区域中心</span>
                        <span className="area-row__detail-value">{formatCentroid(a)}</span>
                      </div>
                      <div className="area-row__detail-row">
                        <span className="area-row__detail-bar" />
                        <span className="area-row__detail-label">顶点数量</span>
                        <span className="area-row__detail-value">{a.vertices.length} 个</span>
                      </div>
                      <div className="area-row__detail-row">
                        <span className="area-row__detail-bar" />
                        <span className="area-row__detail-label">创建时间</span>
                        <span className="area-row__detail-value">{formatTime(a.createTime)}</span>
                      </div>
                      <div className="area-row__detail-divider" />
                      <img
                        className="area-row__detail-deco"
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

      {/* 底部操作：刷新 */}
      <div className="area-panel__actions">
        <button
          className="area-panel__action-btn"
          type="button"
          disabled={status === 'loading'}
          aria-disabled={status === 'loading'}
          onClick={() => void load()}
        >
          <img
            src={deviceImages.iconRefresh}
            alt=""
            className={status === 'loading' ? 'area-panel__icon--spinning' : undefined}
          />
          刷新
        </button>
      </div>
    </div>
  )
}