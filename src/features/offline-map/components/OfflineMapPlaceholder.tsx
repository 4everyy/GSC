/**
 * OfflineMapPlaceholder —— 「离线瓦片未下载」灰显提示覆盖层。
 *
 * 设计依据：docs/离线地图下载方案.md §3.3「未下载且无网络」态 + §7.2 offline 状态。
 *
 * 当无缓存 + 断网时，由 MapLibreContainer 切换到 'offline' 状态并渲染本组件，
 * 提示用户前往「系统配置 → 下载离线地图」预取瓦片。
 */
import './OfflineMapDialog.css'

interface OfflineMapPlaceholderProps {
  /** 点击「立即下载」按钮回调（打开离线地图弹窗） */
  onDownload?: () => void
}

export function OfflineMapPlaceholder({ onDownload }: OfflineMapPlaceholderProps) {
  return (
    <div className="maplibre-status maplibre-status--offline">
      <div className="offline-card">
        <div className="offline-card__icon" aria-hidden>
          ⚠
        </div>
        <div>
          <div className="offline-card__text">
            离线瓦片未下载，当前为断网状态，地图无法呈现。
          </div>
          <div className="offline-card__hint">
            请前往「系统配置 → 下载离线地图」预取瓦片，下载完成后断网亦可正常显示。
          </div>
        </div>
        {onDownload && (
          <button
            type="button"
            className="offline-btn offline-btn--primary"
            onClick={onDownload}
          >
            立即下载离线地图
          </button>
        )}
      </div>
    </div>
  )
}
