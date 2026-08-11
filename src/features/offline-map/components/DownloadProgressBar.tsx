/**
 * DownloadProgressBar —— 地图区悬浮下载进度条。
 *
 * 设计依据：docs/离线地图下载方案.md §3.3「下载中」态。
 *
 * 仅当存在进行中的下载任务时渲染，浮于地图之上，不阻断地图浏览。
 * 数据来自 OfflineMapContext 的 activeTaskId + tasks。
 */
import { useOfflineMap } from '../useOfflineMap'
import { formatBytes, formatNumber } from '../format'
import './OfflineMapDialog.css'

export function DownloadProgressBar() {
  const { activeTaskId, tasks } = useOfflineMap()

  // 选取当前活跃任务；若无活跃任务则不渲染
  const task = activeTaskId
    ? tasks.find((t) => t.id === activeTaskId)
    : undefined

  if (!task || task.status !== 'downloading') return null

  const percent =
    task.totalTiles > 0
      ? Math.min(100, Math.round((task.completedTiles / task.totalTiles) * 100))
      : 0

  return (
    <div
      className="download-progress-float"
      role="status"
      aria-live="polite"
      aria-label="离线地图下载进度"
    >
      <div className="download-progress-float__head">
        <span className="download-progress-float__title">
          正在下载：{task.regionName}（{task.basemap === 'dark' ? '矢量暗色' : '卫星影像'}）
        </span>
        <span>{percent}%</span>
      </div>
      <div className="offline-progress__bar">
        <div className="offline-progress__fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="offline-progress__text">
        {formatNumber(task.completedTiles)} / {formatNumber(task.totalTiles)} 块
        ，已下载 {formatBytes(task.bytesDownloaded)}
        {task.failedTiles > 0 ? ` ，失败 ${task.failedTiles}` : ''}
      </div>
    </div>
  )
}
