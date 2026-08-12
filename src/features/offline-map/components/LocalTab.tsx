/**
 * LocalTab —— 「本地缓存」Tab。
 *
 * 设计依据：docs/离线地图下载方案.md §3.2 Tab2。
 *
 * 展示内容：
 * - 已下载瓦片统计（块数 / 占用空间）；
 * - 任务列表：每个任务显示区域、层级、块数、状态、占用空间，并提供删除；
 * - 浏览器存储配额（navigator.storage.estimate）：已用 / 总量 进度条；
 * - 「清除所有离线缓存」一键清空。
 */
import { useOfflineMap } from '../useOfflineMap'
import { BASEMAP_LABELS } from '../constants'
import { formatBytes, formatNumber, formatTime } from '../format'
import type { DownloadTaskStatus } from '../types'
import './OfflineMapDialog.css'

const STATUS_LABEL: Record<DownloadTaskStatus, string> = {
  pending: '等待中',
  downloading: '下载中',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
}

const STATUS_CLASS: Record<DownloadTaskStatus, string> = {
  pending: 'offline-status-tag--pending',
  downloading: 'offline-status-tag--downloading',
  paused: 'offline-status-tag--paused',
  completed: 'offline-status-tag--completed',
  failed: 'offline-status-tag--failed',
}

export function LocalTab() {
  const {
    tasks,
    cacheSummary,
    storageQuota,
    removeTask,
    deleteTaskCache,
    clearAllCache,
  } = useOfflineMap()

  const hasTasks = tasks.length > 0

  // 配额进度
  const quotaUsed = storageQuota?.usage ?? cacheSummary.totalBytes
  const quotaTotal = storageQuota?.quota
  const quotaPercent =
    quotaTotal && quotaTotal > 0
      ? Math.min(100, Math.round((quotaUsed / quotaTotal) * 100))
      : null

  const handleClearAll = () => {
    if (!hasTasks) return
    const ok = window.confirm('确定要清除所有离线地图缓存及下载任务吗？此操作不可撤销。')
    if (!ok) return
    void clearAllCache()
  }

  return (
    <div>
      {/* 统计概览 */}
      <div className="offline-estimate">
        已缓存瓦片：<strong>{formatNumber(cacheSummary.totalTiles)}</strong> 块
        ，占用空间：<strong>{formatBytes(cacheSummary.totalBytes)}</strong>
        {cacheSummary.sourceCount > 0 && `（共 ${cacheSummary.sourceCount} 个数据源）`}
      </div>

      {/* 任务列表 */}
      {!hasTasks ? (
        <div className="offline-empty">暂无离线地图数据，请前往「下载离线地图」预取。</div>
      ) : (
        tasks
          .slice()
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map((task) => (
            <div key={task.id} className="offline-task-item">
              <div className="offline-task-item__head">
                <span className="offline-task-item__title">
                  {task.regionName}
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 400, marginLeft: 6 }}>
                    （{BASEMAP_LABELS[task.basemap]}）
                  </span>
                </span>
                <span className={`offline-status-tag ${STATUS_CLASS[task.status]}`}>
                  {STATUS_LABEL[task.status]}
                </span>
              </div>
              <div className="offline-task-item__meta">
                层级 z{task.minZoom}-z{task.maxZoom}
                {' '}· {formatNumber(task.completedTiles)} / {formatNumber(task.totalTiles)} 块{task.skippedTiles ? `（跳过 ${formatNumber(task.skippedTiles)} 无数据）` : ''}
                {' '}· {formatBytes(task.bytesDownloaded)}
                {' '}· {formatTime(task.updatedAt)}
                {task.error ? ` · ${task.error}` : ''}
              </div>
              <div className="offline-task-item__actions" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="offline-btn offline-btn--danger"
                  onClick={() => {
                    if (window.confirm(`删除「${task.regionName}」的下载任务记录？`)) {
                      void removeTask(task.id)
                    }
                  }}
                >
                  删除任务
                </button>
                {task.status === 'completed' && (
                  <button
                    type="button"
                    className="offline-btn offline-btn--danger"
                    onClick={() => {
                      if (
                        window.confirm(
                          `清除「${task.regionName}」已缓存的瓦片数据？该任务记录将一并删除。`,
                        )
                      ) {
                        void deleteTaskCache(task)
                      }
                    }}
                  >
                    清除瓦片
                  </button>
                )}
              </div>
            </div>
          ))
      )}

      {/* 浏览器存储配额 */}
      {quotaTotal !== undefined && (
        <div className="offline-quota">
          <div className="offline-quota__head">
            <span>浏览器存储配额</span>
            <span>
              {formatBytes(quotaUsed)} / {formatBytes(quotaTotal)}
            </span>
          </div>
          <div className="offline-progress__bar">
            <div
              className="offline-progress__fill"
              style={{ width: `${quotaPercent ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {/* 清空全部 */}
      <div className="offline-actions">
        <button
          type="button"
          className="offline-btn offline-btn--danger"
          disabled={!hasTasks}
          onClick={handleClearAll}
        >
          清除所有离线缓存
        </button>
      </div>
    </div>
  )
}
