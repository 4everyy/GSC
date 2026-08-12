/**
 * DownloadTab —— 「下载离线地图」Tab。
 *
 * 设计依据：docs/离线地图下载方案.md §3.2 Tab1。
 *
 * 交互流程：
 * 1. 选择区域（预设/自定义 bbox）、zoom 范围（底图固定卫星影像）；
 * 2. 实时计算预估瓦片数与磁盘占用，超阈值（2GB）给出二次确认（§3.2 步骤2）；
 * 3. 点击「开始下载」→ 解析 style.json 获取瓦片模板 → 调用 startDownload；
 * 4. 下载成功/失败通过任务列表与状态标签反馈。
 */

import { useEffect, useMemo, useState } from 'react'
import { MAPLIBRE_BASEMAPS } from '../../../config/mapLibre'
import {
  buildLocalRasterTemplate,
  buildLocalVectorTemplate,
  fetchSourceCoverage,
  resolveRasterTemplateFromTileJson,
  resolveTileSource,
} from '../tileTemplateResolver'
import { estimateDownload, lonLatToTile, probeTileSource } from '../tileDownload'
import { useOfflineMap } from '../useOfflineMap'
import { formatBytes, formatNumber } from '../format'
import {
  LARGE_DOWNLOAD_THRESHOLD,
  MAX_ZOOM_LIMIT_SATELLITE,
  MIN_ZOOM_LIMIT,
  PRESET_REGIONS,
} from '../constants'
import { CITY_DATABASE, findCityBbox, findCityKey } from '../cityDatabase'
import {
  SATELLITE_SOURCE_KEY,
  basemapNeedsLocalSource,
  fetchAvailableRasterSources,
} from '../tileSourceAvailability'
import type { Basemap, BBox, DownloadTask } from '../types'
import './OfflineMapDialog.css'

const CUSTOM_REGION = '__custom__'

export function DownloadTab() {
  const { startDownload, cancelDownload, tasks, activeTaskId, isOffline } =
    useOfflineMap()

  const basemap: Basemap = 'satellite'
  const [regionKey, setRegionKey] = useState<string>(PRESET_REGIONS[0].name)
  const [customBbox, setCustomBbox] = useState<BBox>(PRESET_REGIONS[0].bbox)
  const [minZoom, setMinZoom] = useState(8)
  const [maxZoom, setMaxZoom] = useState(14)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [availableSources, setAvailableSources] = useState<Set<string> | null>(
    null,
  )
  const [availabilityLoading, setAvailabilityLoading] = useState(true)
  /** 卫星数据源实际缩放覆盖（来自 TileJSON，钳制下载层级范围的真值） */
  const [sourceCoverage, setSourceCoverage] = useState<{
    minzoom: number
    maxzoom: number
  } | null>(null)

  // 当前生效的 bbox（本地预设 / 城市库 / 自定义经纬度）
  const bbox: BBox = useMemo(() => {
    const preset = PRESET_REGIONS.find((r) => r.name === regionKey)
    if (preset) return preset.bbox
    const cityBbox = findCityBbox(regionKey)
    if (cityBbox) return cityBbox
    return customBbox
  }, [regionKey, customBbox])

  /** 当前选中区域对应的数据源 key（预设/城市）；自定义区域为 undefined */
  const selectedSourceKey = useMemo(() => {
    const preset = PRESET_REGIONS.find((r) => r.name === regionKey)
    if (preset) return preset.sourceKey
    return findCityKey(regionKey)
  }, [regionKey])

  const regionName = regionKey === CUSTOM_REGION ? '自定义区域' : regionKey

  // 卫星影像底图的最大层级上限
  const maxZoomCap = MAX_ZOOM_LIMIT_SATELLITE

  // 数据源实际缩放覆盖（严格离线下为下载的真实边界，来自 TileJSON）。
  // 用户选择的层级必须与数据源覆盖取交集，否则越界层级全部 204（无瓦片）
  // 被计为「跳过」，造成「下载不完整」的误导。
  const sourceMinZoom = sourceCoverage?.minzoom
  const sourceMaxZoom = sourceCoverage?.maxzoom
  // 有效下载层级 = [minZoom, maxZoom] ∩ [sourceMin, sourceMax] ∩ [MIN_ZOOM_LIMIT, maxZoomCap]
  const effMinZoom = Math.max(minZoom, sourceMinZoom ?? MIN_ZOOM_LIMIT)
  const effMaxZoom = Math.min(maxZoom, sourceMaxZoom ?? maxZoomCap)
  const rangeEmpty = effMinZoom > effMaxZoom

  // 预估（实时，按有效层级范围）
  const estimate = useMemo(
    () =>
      rangeEmpty
        ? { tileCount: 0, estimatedBytes: 0 }
        : estimateDownload(bbox, effMinZoom, effMaxZoom, basemap),
    [bbox, effMinZoom, effMaxZoom, basemap, rangeEmpty],
  )

  // 切换底图时钳制层级到合法范围
  useEffect(() => {
    setMinZoom((z) => Math.min(z, maxZoomCap))
    setMaxZoom((z) => Math.min(z, maxZoomCap))
  }, [maxZoomCap])

  // 探测 tileserver-gl 可用栅格数据源（卫星底图依赖本地 satellite mbtiles，依据 §3.2）
  // 并在卫星源可用时拉取其实际缩放覆盖（钳制下载层级，避免越界层级全 204 跳过）
  useEffect(() => {
    let cancelled = false
    void (async () => {
      setAvailabilityLoading(true)
      const r = await fetchAvailableRasterSources()
      if (!cancelled) {
        setAvailableSources(r)
        setAvailabilityLoading(false)
        if (r?.has(SATELLITE_SOURCE_KEY)) {
          const cov = await fetchSourceCoverage(SATELLITE_SOURCE_KEY)
          if (!cancelled) setSourceCoverage(cov)
        } else {
          setSourceCoverage(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const overLarge = estimate.estimatedBytes >= LARGE_DOWNLOAD_THRESHOLD
  const zoomInvalid = minZoom > maxZoom || minZoom < MIN_ZOOM_LIMIT || rangeEmpty

  // 卫星底图依赖本地 tileserver-gl 栅格数据源（satellite mbtiles）
  const needsLocalSource = basemapNeedsLocalSource(basemap)
  const sourceDetectionFailed =
    !availabilityLoading && availableSources === null
  /**
   * 当前底图的数据源 key：卫星固定为 'satellite' 栅格源；矢量为预设/城市 key。
   * 卫星源是否可用决定能否下载（satellite mbtiles 未准备则灰显「开始下载」）。
   */
  const sourceKey = basemap === 'satellite' ? SATELLITE_SOURCE_KEY : selectedSourceKey
  const selectedSourceUnavailable =
    needsLocalSource &&
    sourceKey !== undefined &&
    !(availableSources?.has(sourceKey) ?? false)
  const availableCount = availableSources?.size ?? 0
  /**
   * 下拉项是否可选：卫星底图所有区域共用同一 satellite 源（一可用全可用）；
   * 矢量底图按城市 key 过滤。
   */
  const optionAvailable = (key: string): boolean => {
    if (!needsLocalSource) return true
    if (basemap === 'satellite') {
      return availableSources?.has(SATELLITE_SOURCE_KEY) ?? false
    }
    return availableSources?.has(key) ?? false
  }

  const handleStart = async () => {
    setError('')
    if (zoomInvalid) {
      setError('层级范围无效：最小层级不能大于最大层级。')
      return
    }
    if (selectedSourceUnavailable) {
      setError(
        'tileserver-gl 中暂无卫星栅格数据（satellite.mbtiles）。卫星影像须由运维离线准备：在服务端运行 tileserver/bin/prepare-satellite.py（自有 GeoTIFF / GDAL）生成 satellite.mbtiles 后重启 tileserver。',
      )
      return
    }
    if (estimate.tileCount === 0) {
      setError('所选区域在当前层级下无瓦片，请调整区域或层级。')
      return
    }
    if (overLarge) {
      const ok = window.confirm(
        `预估将下载约 ${formatNumber(estimate.tileCount)} 块瓦片（${formatBytes(
          estimate.estimatedBytes,
        )}），可能占用较大空间且耗时较长，是否继续？`,
      )
      if (!ok) return
    }
    setSubmitting(true)
    try {
      let tileUrlTemplate: string
      let resolvedBasemap: Basemap = basemap
      if (basemap === 'satellite') {
        // 卫星底图：从 tilejson 动态解析栅格瓦片模板（扩展名随 mbtiles format
        // 变化 png/jpg/webp，tileserver 仅在该扩展名提供瓦片）。tilejson 不可达时
        // 回退静态模板，保证缓存键与运行时 transformRequest 拦截键空间一致。
        tileUrlTemplate =
          (await resolveRasterTemplateFromTileJson(SATELLITE_SOURCE_KEY)) ??
          buildLocalRasterTemplate(SATELLITE_SOURCE_KEY)
      } else if (needsLocalSource && selectedSourceKey) {
        // 矢量 + 已知城市/预设源：按数据源 key 直接构造本地模板
        // （style.json 通常只引用单一源，无法覆盖多城市）
        tileUrlTemplate = buildLocalVectorTemplate(selectedSourceKey)
      } else {
        // 自定义矢量区域：回退到 style.json 解析。
        // 注意：basemap 当前硬编码为 'satellite'（const 字面量窄化），此分支为
        // 预留扩展；as Basemap 还原联合类型避免 TS 将其窄化为 never。
        const resolved = await resolveTileSource(
          MAPLIBRE_BASEMAPS[basemap as Basemap].url,
          basemap,
        )
        tileUrlTemplate = resolved.tileUrlTemplate
        resolvedBasemap = resolved.basemap
      }

      // ── 下载前探测：采样中心瓦片，检测数据源是否为空（如占位 mbtiles 无实际影像瓦片） ──
      const centerLon = (bbox.west + bbox.east) / 2
      const centerLat = (bbox.south + bbox.north) / 2
      const probeZ1 = effMinZoom
      const probeZ2 = Math.min(effMaxZoom, Math.floor((effMinZoom + effMaxZoom) / 2))
      const sourceHasData = await probeTileSource(tileUrlTemplate, [
        { z: probeZ1, ...lonLatToTile(probeZ1, centerLon, centerLat) },
        { z: probeZ2, ...lonLatToTile(probeZ2, centerLon, centerLat) },
      ])
      if (!sourceHasData) {
        setError(
          '数据源采样瓦片均返回空响应（204 No Content）。' +
            'satellite.mbtiles 疑似占位文件（仅含元数据无影像瓦片），请替换为真实卫星影像 mbtiles 后重试。',
        )
        return
      }

      await startDownload({
        basemap: resolvedBasemap,
        regionName,
        bbox,
        minZoom: effMinZoom,
        maxZoom: effMaxZoom,
        tileUrlTemplate,
      })
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      setError(`无法解析底图瓦片模板：${detail}`)
    } finally {
      setSubmitting(false)
    }
  }

  const activeTask = activeTaskId
    ? tasks.find((t) => t.id === activeTaskId)
    : undefined
  const percent = activeTask
    ? activeTask.totalTiles > 0
      ? Math.min(
          100,
          Math.round(
            ((activeTask.completedTiles +
              activeTask.failedTiles +
              (activeTask.skippedTiles ?? 0)) /
              activeTask.totalTiles) *
              100,
          ),
        )
      : 0
    : 0

  return (
    <div>
      {/* 区域 */}
      <div className="offline-form-row">
        <span className="offline-form-row__label">区域</span>
        <div className="offline-form-row__control">
          <select
            className="offline-select"
            value={regionKey}
            onChange={(e) => setRegionKey(e.target.value)}
          >
            <optgroup label="苏州（本地预设）">
              {PRESET_REGIONS.map((r) => {
                const ok = optionAvailable(r.sourceKey)
                return (
                  <option key={r.name} value={r.name} disabled={!ok}>
                    {r.name}
                    {!ok ? '（未准备数据）' : ''}
                  </option>
                )
              })}
            </optgroup>
            {CITY_DATABASE.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.cities.map((c) => {
                  const ok = optionAvailable(c.key)
                  return (
                    <option key={c.name} value={c.name} disabled={!ok}>
                      {c.name}
                      {!ok ? '（未准备数据）' : ''}
                    </option>
                  )
                })}
              </optgroup>
            ))}
            <option value={CUSTOM_REGION}>自定义区域（手动输入经纬度）</option>
          </select>
        </div>
      </div>

      {/* 数据源可用性提示（仅矢量底图依赖本地 mbtiles） */}
      {needsLocalSource && (
        <div
          className="offline-estimate"
          style={{ padding: '6px 12px', fontSize: 12 }}
        >
          {availabilityLoading
            ? '正在检测本地矢量数据源…'
            : sourceDetectionFailed
              ? '⚠️ 无法连接瓦片服务（tileserver-gl 可能未启动）。请启动后刷新，或改用卫星底图。'
              : availableCount === 0
                ? '⚠️ tileserver-gl 暂无矢量数据。请运行 tileserver/prepare-data.ps1 准备城市数据。'
                : `✓ 已检测到 ${availableCount} 个可用矢量数据源`}
        </div>
      )}

      {regionKey === CUSTOM_REGION && (
        <div className="offline-form-row">
          <span className="offline-form-row__label">边界</span>
          <div className="offline-form-row__control">
            <div className="offline-bbox-grid">
              {(['west', 'east', 'south', 'north'] as const).map((edge) => (
                <label key={edge} className="offline-bbox-field">
                  <span>
                    {edge === 'west' && '西经'}
                    {edge === 'east' && '东经'}
                    {edge === 'south' && '南纬'}
                    {edge === 'north' && '北纬'}
                  </span>
                  <input
                    className="offline-input"
                    type="number"
                    step="0.0001"
                    value={customBbox[edge]}
                    onChange={(e) =>
                      setCustomBbox((b) => ({ ...b, [edge]: Number(e.target.value) }))
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 当前区域坐标回显（预设/城市选中后展示覆盖范围，自定义经纬度模式不显示） */}
      {regionKey !== CUSTOM_REGION && (
        <div className="offline-estimate" style={{ padding: '8px 12px', fontSize: 12 }}>
          覆盖范围：西经 {bbox.west.toFixed(2)}°，东经 {bbox.east.toFixed(2)}°，南纬 {bbox.south.toFixed(2)}°，北纬 {bbox.north.toFixed(2)}°
        </div>
      )}

      {/* 层级 */}
      <div className="offline-form-row">
        <span className="offline-form-row__label">层级</span>
        <div className="offline-form-row__control">
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>最小</span>
          <input
            className="offline-input"
            type="number"
            min={sourceMinZoom ?? MIN_ZOOM_LIMIT}
            max={maxZoomCap}
            value={minZoom}
            onChange={(e) => setMinZoom(Number(e.target.value))}
          />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>最大</span>
          <input
            className="offline-input"
            type="number"
            min={MIN_ZOOM_LIMIT}
            max={sourceMaxZoom ?? maxZoomCap}
            value={maxZoom}
            onChange={(e) => setMaxZoom(Number(e.target.value))}
          />
        </div>
      </div>
      {/* 卫星数据源实际缩放覆盖提示（钳制下载层级，避免越界层级全 204 跳过） */}
      {sourceCoverage && (
        <div className="offline-estimate" style={{ padding: '6px 12px', fontSize: 12 }}>
          {rangeEmpty ? (
            <>
              ⚠️ 所选层级 z{minZoom}-z{maxZoom} 与卫星数据覆盖 z
              {sourceCoverage.minzoom}-z{sourceCoverage.maxzoom} 无交集，请调整层级至覆盖范围内。
            </>
          ) : (
            <>
              卫星数据源实际覆盖层级 z{sourceCoverage.minzoom}-z{sourceCoverage.maxzoom}
              {effMinZoom > minZoom || effMaxZoom < maxZoom
                ? `，已自动限定下载区间为 z${effMinZoom}-z${effMaxZoom}（其余层级无离线数据）`
                : ''}
              。
            </>
          )}
        </div>
      )}

      {/* 预估 */}
      <div className={`offline-estimate ${overLarge ? 'offline-estimate--warn' : ''}`}>
        预估瓦片数：<strong>{formatNumber(estimate.tileCount)}</strong>
        {' '}块，约需空间：<strong>{formatBytes(estimate.estimatedBytes)}</strong>
        {overLarge && '（超大下载，点击开始后将二次确认）'}
      </div>

      {/* 下载进度（活跃任务） */}
      {activeTask && (
        <div className="offline-progress">
          <div className="offline-progress__bar">
            <div className="offline-progress__fill" style={{ width: `${percent}%` }} />
          </div>
          <div className="offline-progress__text">
            下载中… {formatNumber(activeTask.completedTiles)} / {formatNumber(activeTask.totalTiles)} 块
            ，约 {formatBytes(activeTask.bytesDownloaded)}
            {activeTask.failedTiles > 0 ? ` ，失败 ${activeTask.failedTiles}` : ''}
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="offline-estimate offline-estimate--warn">{error}</div>
      )}

      {/* 已完成任务的成功/失败反馈 */}
      <TaskFeedback />

      {/* 操作按钮 */}
      <div className="offline-actions">
        <button
          type="button"
          className="offline-btn offline-btn--primary"
          disabled={
            submitting ||
            !!activeTask ||
            zoomInvalid ||
            isOffline ||
            selectedSourceUnavailable
          }
          onClick={handleStart}
          title={
            isOffline
              ? '断网状态下无法预下载，请恢复网络后重试'
              : selectedSourceUnavailable
                ? '暂无卫星栅格数据，请在服务端离线准备 satellite.mbtiles（自有影像/GDAL）'
                : undefined
          }
        >
          {activeTask ? '下载中…' : '开始下载'}
        </button>
        {activeTask && (
          <button
            type="button"
            className="offline-btn offline-btn--ghost"
            onClick={() => cancelDownload(activeTask.id)}
          >
            取消
          </button>
        )}
      </div>

      {/* 断点续传：最近一个 paused/failed 任务可恢复 */}
      <ResumeActions tasks={tasks} activeTaskId={activeTaskId} />
    </div>
  )
}


/** 最近任务成功/失败反馈条 */
function TaskFeedback() {
  const { tasks } = useOfflineMap()
  const last = tasks[tasks.length - 1]
  if (!last) return null
  if (last.status === 'completed') {
    // 全部瓦片返回空响应（占位/空 mbtiles）时不算成功，显示警告而非绿色 ✅
    const noData = last.completedTiles === 0 && last.totalTiles > 0
    if (noData) {
      return (
        <div className="offline-estimate offline-estimate--warn">
          ⚠️ 下载结束但未获取任何有效瓦片：全部 {formatNumber(last.totalTiles)} 块返回空响应（204 No Content）。
          satellite.mbtiles 疑似占位文件（仅含元数据无影像瓦片），请替换为真实卫星影像 mbtiles 后重试。
        </div>
      )
    }
    return (
      <div
        className="offline-estimate"
        style={{
          color: '#4ade80',
          background: 'rgba(74,222,128,0.08)',
          borderColor: 'rgba(74,222,128,0.3)',
        }}
      >
        ✅ 离线瓦片下载完成（共 {formatNumber(last.completedTiles)} 块{last.skippedTiles ? `，跳过 ${formatNumber(last.skippedTiles)} 块无数据` : ''}，{formatBytes(last.bytesDownloaded)}）
      </div>
    )
  }
  if (last.status === 'failed') {
    return (
      <div className="offline-estimate offline-estimate--warn">
        ❌ 下载失败：{last.error ?? '未知错误'}（已完成 {formatNumber(last.completedTiles)} 块已保留，可续传）
      </div>
    )
  }
  return null
}

/** 断点续传：展示可恢复的 paused/failed 任务 */
function ResumeActions({
  tasks,
  activeTaskId,
}: {
  tasks: DownloadTask[]
  activeTaskId: string | null
}) {
  const { resumeDownload } = useOfflineMap()
  const resumable = tasks.filter(
    (t) => (t.status === 'paused' || t.status === 'failed') && t.id !== activeTaskId,
  )
  if (resumable.length === 0) return null
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
        可续传任务：
      </div>
      {resumable.slice(-3).map((t) => (
        <div key={t.id} className="offline-task-item">
          <div className="offline-task-item__head">
            <span className="offline-task-item__title">
              {t.regionName}（{t.basemap === 'dark' ? '矢量暗色' : '卫星影像'}）
            </span>
            <span
              className={`offline-status-tag ${
                t.status === 'paused'
                  ? 'offline-status-tag--paused'
                  : 'offline-status-tag--failed'
              }`}
            >
              {t.status === 'paused' ? '已暂停' : '失败'}
            </span>
          </div>
          <div className="offline-task-item__meta">
            z{t.minZoom}-z{t.maxZoom} · 已完成 {formatNumber(t.completedTiles)}/{formatNumber(t.totalTiles)} 块
          </div>
          <div className="offline-task-item__actions" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="offline-btn offline-btn--primary"
              onClick={() => resumeDownload(t.id)}
            >
              续传
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

