/**
 * RoutePanel —— 航线规划面板 UI。
 *
 * 职责（单一）：
 * - 展示草稿航线的实时统计（航点数 / 总航程 / 预估时长）与航点列表；
 * - 提供编辑模式开关、航点上下移/删除、清空等操作入口。
 *
 * 非职责：
 * - 不直接操作地图，所有操作通过回调上抛，由父组件协调 RouteEditor / useRouteEditor；
 * - 不持有航线状态，数据源由父组件传入。
 *
 * 设计要点：
 * - 视觉风格与项目其它面板（MissionPanel 等）保持一致：玻璃质感 + 青蓝发光；
 * - 面板可折叠，避免在浏览模式下遮挡地图；
 * - 航点列表使用序号 + 坐标，支持上移/下移改变飞行顺序、单点删除。
 */
import { useState } from 'react'
import { formatDistance } from '../../utils/geo'
import type { RouteStats, Waypoint } from './types'
import './RoutePanel.css'

interface RoutePanelProps {
  /** 编辑模式是否开启（受控） */
  editing: boolean
  /** 切换编辑模式 */
  onToggleEditing: () => void
  /** 航点列表 */
  waypoints: Waypoint[]
  /** 实时统计 */
  stats: RouteStats
  /** 航点名称（用于头部展示） */
  routeName: string
  /** 上移/下移航点 */
  onMove: (id: Waypoint['id'], dir: -1 | 1) => void
  /** 删除航点 */
  onRemove: (id: Waypoint['id']) => void
  /** 清空所有航点 */
  onClear: () => void
  /** 是否正在模拟飞行（受控） */
  simulating?: boolean
  /** 是否允许启动模拟（通常要求航点数 ≥ 2 且非编辑模式） */
  canSimulate?: boolean
  /** 切换模拟飞行（开始/暂停） */
  onToggleSimulate?: () => void
}

/** 动作类型 → 中文标签 */
const ACTION_LABELS: Record<Waypoint['action'], string> = {
  pass: '飞越',
  hover: '悬停',
  photo: '拍照',
}

export function RoutePanel({
  editing,
  onToggleEditing,
  waypoints,
  stats,
  routeName,
  onMove,
  onRemove,
  onClear,
  simulating = false,
  canSimulate = false,
  onToggleSimulate,
}: RoutePanelProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside className={`route-panel ${collapsed ? 'route-panel--collapsed' : ''}`} aria-label="航线规划面板">
      <header className="route-panel__header">
        <div className="route-panel__title">
          <span className="route-panel__icon" aria-hidden />
          <span>{routeName}</span>
        </div>
        <div className="route-panel__header-actions">
          <button
            type="button"
            className={`route-panel__edit-btn ${editing ? 'route-panel__edit-btn--active' : ''}`}
            onClick={onToggleEditing}
            title={editing ? '退出编辑' : '开始编辑'}
          >
            {editing ? '完成' : '编辑航线'}
          </button>
          <button
            type="button"
            className="route-panel__collapse-btn"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? '展开' : '折叠'}
            aria-expanded={!collapsed}
          >
            {collapsed ? '▾' : '▴'}
          </button>
        </div>
      </header>

      {!collapsed && (
        <>
          <section className="route-panel__stats">
            <div className="route-panel__stat">
              <span className="route-panel__stat-label">航点</span>
              <span className="route-panel__stat-value">{stats.waypointCount}</span>
            </div>
            <div className="route-panel__stat">
              <span className="route-panel__stat-label">总航程</span>
              <span className="route-panel__stat-value">{formatDistance(stats.totalDistance)}</span>
            </div>
            <div className="route-panel__stat">
              <span className="route-panel__stat-label">预估时长</span>
              <span className="route-panel__stat-value">{formatDuration(stats.totalTime)}</span>
            </div>
          </section>

          <ul className="route-panel__list">
            {waypoints.length === 0 && (
              <li className="route-panel__empty">
                {editing ? '点击地图添加航点' : '暂无航点，点击"编辑航线"开始规划'}
              </li>
            )}
            {waypoints.map((wp, i) => (
              <li key={wp.id} className="route-panel__item">
                <span className="route-panel__index">{i + 1}</span>
                <div className="route-panel__coord">
                  <span className="route-panel__coord-line">经 {wp.lng.toFixed(6)}</span>
                  <span className="route-panel__coord-line">纬 {wp.lat.toFixed(6)}</span>
                </div>
                <span className="route-panel__action">{ACTION_LABELS[wp.action]}</span>
                <div className="route-panel__item-actions">
                  <button type="button" title="上移" disabled={i === 0} onClick={() => onMove(wp.id, -1)}>
                    ↑
                  </button>
                  <button
                    type="button"
                    title="下移"
                    disabled={i === waypoints.length - 1}
                    onClick={() => onMove(wp.id, 1)}
                  >
                    ↓
                  </button>
                  <button type="button" title="删除" className="route-panel__del-btn" onClick={() => onRemove(wp.id)}>
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {waypoints.length > 0 && (
            <footer className="route-panel__footer">
              {onToggleSimulate && (
                <button
                  type="button"
                  className={`route-panel__sim-btn ${simulating ? 'route-panel__sim-btn--active' : ''}`}
                  onClick={onToggleSimulate}
                  disabled={!canSimulate}
                  title={
                    !canSimulate
                      ? '至少需要 2 个航点，且需退出编辑模式'
                      : simulating
                        ? '暂停模拟'
                        : '开始模拟飞行'
                  }
                >
                  {simulating ? '暂停模拟' : '模拟飞行'}
                </button>
              )}
              <button type="button" className="route-panel__clear-btn" onClick={onClear} disabled={simulating}>
                清空航线
              </button>
            </footer>
          )}
        </>
      )}
    </aside>
  )
}

/** 将秒数格式化为可读时长（mm:ss 或 hh:mm:ss） */
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s'
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}