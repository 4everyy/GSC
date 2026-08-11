/**
 * OfflineMapDialog —— 离线地图管理主弹窗。
 *
 * 设计依据：docs/离线地图下载方案.md §3.1 ~ §3.2。
 *
 * 结构：遮罩 → 弹窗容器 → 头部（标题+关闭）→ Tab 切换 → 内容区。
 * 两个 Tab：
 *   - 「下载离线地图」DownloadTab（预取 / 断点续传）
 *   - 「本地」LocalTab（已下载瓦片列表 / 清理）
 *
 * 由 SystemConfigButton 触发 openDialog，由 context.dialogOpen 控制显隐。
 * 点击遮罩或 Esc 关闭（§3.2 步骤5）。
 */
import { useEffect, useState } from 'react'
import { useOfflineMap } from '../useOfflineMap'
import { DownloadTab } from './DownloadTab'
import { LocalTab } from './LocalTab'
import { MapDisplayTab } from '../../map-display/components/MapDisplayTab'
import './OfflineMapDialog.css'

type TabKey = 'display' | 'download' | 'local'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'display', label: '地图切换' },
  { key: 'download', label: '下载离线地图' },
  { key: 'local', label: '本地' },
]

export function OfflineMapDialog() {
  const { dialogOpen, closeDialog, isOffline } = useOfflineMap()
  const [tab, setTab] = useState<TabKey>('download')

  // Esc 关闭
  useEffect(() => {
    if (!dialogOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDialog()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialogOpen, closeDialog])

  if (!dialogOpen) return null

  return (
    <div
      className="offline-map-mask"
      role="dialog"
      aria-modal="true"
      aria-label="离线地图管理"
      onClick={(e) => {
        // 点击遮罩空白处关闭
        if (e.target === e.currentTarget) closeDialog()
      }}
    >
      <div className="offline-map-dialog">
        <div className="offline-map-dialog__header">
          <div className="offline-map-dialog__title">
            离线地图管理
            {isOffline && (
              <span
                className="offline-status-tag offline-status-tag--paused"
                style={{ marginLeft: 10 }}
              >
                离线模式
              </span>
            )}
          </div>
          <button
            type="button"
            className="offline-map-dialog__close"
            aria-label="关闭"
            onClick={closeDialog}
          >
            ✕
          </button>
        </div>

        <div className="offline-map-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`offline-map-tab ${tab === t.key ? 'is-active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="offline-map-dialog__body">
          {tab === 'display' ? (
            <MapDisplayTab />
          ) : tab === 'download' ? (
            <DownloadTab />
          ) : (
            <LocalTab />
          )}
        </div>
      </div>
    </div>
  )
}
