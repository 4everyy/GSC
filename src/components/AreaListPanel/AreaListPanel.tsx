/**
 * AreaListPanel —— 区域列表面板（工具栏「区域规划」按钮，index 1）。
 *
 * 数据源：taskAreaStore（/api/v1/control/queryTaskAreaList，与态势图
 * TaskAreaLayer 渲染的是同一份数据）——列表与地图多边形天然一致。
 * 交互：
 * - 区域类型下拉筛选（集群侦察 / 禁飞区 / 围困区 / 集结区，「请选择」显示全部）；
 * - 行点击 / 行尾箭头展开详情（区域中心 / 顶点数量 / 创建时间，手风琴模式）；
 * - 底部「刷新」重拉区域列表（loading 期间按钮图标旋转）；
 * - 加载失败展示错误与「重试」，空数据展示「暂无区域」。
 * 外观与 TargetListPanel / DeviceManagementPanel 同一套视觉语言
 * （渐变底、切角装饰、行背景图 hover 橙 / 普通灰）。
 */
import { useEffect, useState } from 'react'
import { useTaskAreaStore } from '../../stores/taskAreaStore'
import { TASK_AREA_TYPE_META, taskAreaTypeMeta, type TaskArea } from '../../api/taskArea'
import { deviceImages } from '../../assets/images/device'
import './AreaListPanel.css'

interface AreaListPanelProps {
  onClose: () => void
  visible?: boolean
}

/** 区域类型筛选选项（「请选择」= 显示全部） */
const typeOptions = ['请选择', ...Object.values(TASK_AREA_TYPE_META).map((m) => m.label)]

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

  const [typeFilter, setTypeFilter] = useState('请选择')
  const [openDropdown, setOpenDropdown] = useState(false)
  // 手风琴模式：同一时刻至多一行展开详情
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // 兜底加载：态势图区域层通常已触发过 load（store 内部 loading 防重入），
  // 地图层未挂载场景下直接打开面板也能拉到数据
  useEffect(() => {
    if (useTaskAreaStore.getState().status === 'idle') void load()
  }, [load])

  // 类型筛选（按类型中文名匹配；未知类型走兜底配置同样可筛）
  const filteredAreas = areas.filter(
    (a) => typeFilter === '请选择' || taskAreaTypeMeta(a.type).label === typeFilter,
  )

  /** 切换行内详情展开/收起（手风琴：展开新行自动收起其他行） */
  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  /** 清除类型筛选：恢复「请选择」占位（显示全部区域） */
  const clearTypeFilter = () => {
    setTypeFilter('请选择')
    setOpenDropdown(false)
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

      {/* 筛选栏：区域类型下拉（右侧对齐） */}
      <div className="area-panel__filters">
        <span className="area-panel__filter-label">区域类型</span>
        <div
          className={`area-panel__select${openDropdown ? ' area-panel__select--open' : ''}`}
          onClick={() => setOpenDropdown((v) => !v)}
        >
          <span className={typeFilter === '请选择' ? 'area-panel__select-placeholder' : ''}>
            {typeFilter}
          </span>
          {/* × 快速清除按钮：已选类型时显示，一键恢复「请选择」（显示全部区域） */}
          {typeFilter !== '请选择' && (
            <button
              type="button"
              className="area-panel__select-clear"
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
            <div className="area-panel__dropdown">
              {typeOptions.map((opt) => (
                <div
                  key={opt}
                  className={`area-panel__dropdown-item${typeFilter === opt ? ' area-panel__dropdown-item--active' : ''}`}
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
          ) : filteredAreas.length === 0 ? (
            /* 空列表 / 筛选无结果 */
            <div className="area-panel__state">
              <img src={deviceImages.noData} alt="暂无区域" draggable={false} />
              <span>暂无区域</span>
            </div>
          ) : (
            filteredAreas.map((a) => {
              const meta = taskAreaTypeMeta(a.type)
              const isExpanded = expandedId === a.id
              return (
                <div className="area-row-wrapper" key={a.id}>
                  <div
                    className="area-row"
                    onClick={() => toggleExpand(a.id)}
                    onMouseEnter={() => setHoveredId(a.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <img
                      className="area-row__bg"
                      src={hoveredId === a.id ? deviceImages.rowBgOrange : deviceImages.rowBgGray}
                      alt=""
                      draggable={false}
                    />
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