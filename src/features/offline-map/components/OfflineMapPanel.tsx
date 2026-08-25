/**
 * 离线地图管理面板。
 *
 * 功能：
 * - 导入 .mbtiles 文件（自动从文件名识别城市 key，关联 sourceKey）；
 * - 按城市切换激活的离线包（城市下拉 → 匹配已导入包）；
 * - 包列表（激活 / 更新 / 删除）。
 *
 * 严格离线：所有操作仅读写本地 IndexedDB。
 */
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useOfflineMapStore } from '../offlineMapStore'
import { slugifyPackageId } from '../mbtilesLoader'
import { CITY_DATABASE, findCityName } from '../cityDatabase'
import './OfflineMapPanel.css'

/** 格式化瓦片数（1234 → 1.2k，超过万用万） */
function formatTileCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function OfflineMapPanel() {
  const [open, setOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const packages = useOfflineMapStore((s) => s.packages)
  const activePackageId = useOfflineMapStore((s) => s.activePackageId)
  const status = useOfflineMapStore((s) => s.status)
  const error = useOfflineMapStore((s) => s.error)
  const importProgress = useOfflineMapStore((s) => s.importProgress)
  const importPackage = useOfflineMapStore((s) => s.importPackage)
  const removePackage = useOfflineMapStore((s) => s.removePackage)
  const setActivePackage = useOfflineMapStore((s) => s.setActivePackage)
  const ensureCityPackage = useOfflineMapStore((s) => s.ensureCityPackage)
  const refreshCityPackage = useOfflineMapStore((s) => s.refreshCityPackage)

  const isImporting = status === 'importing'
  const activePkg = packages.find((p) => p.id === activePackageId)
  const citySelectValue = activePkg?.sourceKey ?? activePkg?.id ?? ''
  const progressPct =
    importProgress && importProgress.total > 0
      ? Math.min(100, Math.round((importProgress.written / importProgress.total) * 100))
      : 0

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const slug = slugifyPackageId(file.name)
    const sourceKey = findCityName(slug) ? slug : undefined
    await importPackage(file, sourceKey)
    e.target.value = ''
  }

  const handleCityChange = async (e: ChangeEvent<HTMLSelectElement>) => {
    const cityKey = e.target.value
    if (!cityKey) {
      setActivePackage(null)
      return
    }
    // 已导入则直接激活；未导入则自动从 public/maps/{key}.mbtiles 拉取并导入
    await ensureCityPackage(cityKey)
  }

  return (
    <div className="offline-map-panel">
      <button
        type="button"
        className={`offline-map-panel__toggle ${open ? 'offline-map-panel__toggle--active' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span>🗺</span>
        <span>离线地图</span>
        {packages.length > 0 && <span style={{ opacity: 0.6 }}>({packages.length})</span>}
      </button>
      {open && (
        <div className="offline-map-panel__body">
          <div className="offline-map-panel__section">
            <span className="offline-map-panel__label">导入离线地图包</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mbtiles"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <button
              type="button"
              className="offline-map-panel__import-btn"
              onClick={handleImportClick}
              disabled={isImporting}
            >
              {isImporting ? '导入中…' : '+ 选择 .mbtiles 文件'}
            </button>
            <p className="offline-map-panel__hint">
              支持 MBTiles 栅格瓦片（png/jpg/webp）。导入后瓦片存入浏览器本地，离线渲染。
            </p>
            {isImporting && !importProgress && (
              <div className="offline-map-panel__progress-text">正在加载离线数据…</div>
            )}
            {isImporting && importProgress && (
              <div className="offline-map-panel__progress">
                <div className="offline-map-panel__progress-bar">
                  <div
                    className="offline-map-panel__progress-fill"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="offline-map-panel__progress-text">
                  {formatTileCount(importProgress.written)} /{' '}
                  {formatTileCount(importProgress.total)} 瓦片
                  {progressPct > 0 ? ` · ${progressPct}%` : ''}
                </span>
              </div>
            )}
          </div>

          {error && <div className="offline-map-panel__error">{error}</div>}

          <div className="offline-map-panel__section">
            <span className="offline-map-panel__label">切换城市</span>
            <select
              className="offline-map-panel__select"
              value={citySelectValue}
              onChange={handleCityChange}
              disabled={isImporting}
            >
              <option value="">— 选择城市 —</option>
              {CITY_DATABASE.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.cities.map((city) => {
                    const imported = packages.some(
                      (p) => p.sourceKey === city.key || p.id === city.key,
                    )
                    return (
                      <option key={city.key} value={city.key}>
                        {city.name}
                        {imported ? ' ✓' : ''}
                      </option>
                    )
                  })}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="offline-map-panel__section">
            <span className="offline-map-panel__label">已导入包（{packages.length}）</span>
            {packages.length === 0 ? (
              <div className="offline-map-panel__empty">暂无离线地图包</div>
            ) : (
              <div className="offline-map-panel__list">
                {packages.map((pkg) => {
                  const isActive = pkg.id === activePackageId
                  return (
                    <div
                      key={pkg.id}
                      className={`offline-map-panel__pkg ${isActive ? 'offline-map-panel__pkg--active' : ''}`}
                    >
                      <div className="offline-map-panel__pkg-info">
                        <span className="offline-map-panel__pkg-name">{pkg.name}</span>
                        <span className="offline-map-panel__pkg-meta">
                          {pkg.format.toUpperCase()} · z{pkg.minZoom}-{pkg.maxZoom} ·{' '}
                          {formatTileCount(pkg.tileCount)} 块
                        </span>
                      </div>
                      <div className="offline-map-panel__pkg-actions">
                        {!isActive && (
                          <button
                            type="button"
                            className="offline-map-panel__pkg-btn"
                            onClick={() => setActivePackage(pkg.id)}
                          >
                            启用
                          </button>
                        )}
                        {pkg.sourceKey && (
                          <button
                            type="button"
                            className="offline-map-panel__pkg-btn"
                            onClick={() => refreshCityPackage(pkg.sourceKey!)}
                            disabled={isImporting}
                            title="删除旧版并从 public/maps/ 重新拉取最新离线数据"
                          >
                            更新
                          </button>
                        )}
                        <button
                          type="button"
                          className="offline-map-panel__pkg-btn offline-map-panel__pkg-btn--danger"
                          onClick={() => removePackage(pkg.id)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}