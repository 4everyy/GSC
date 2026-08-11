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
  buildLocalVectorTemplate,
  resolveTileSource,
} from '../tileTemplateResolver'
import { estimateDownload } from '../tileDownload'
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
  basemapNeedsLocalSource,
  fetchAvailableVectorSources,
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

  // 预估（实时）
  const estimate = useMemo(
    () =>
      estimateDownload(
        bbox,
        Math.min(minZoom, maxZoomCap),
        Math.min(maxZoom, maxZoomCap),
        basemap,
      ),
    [bbox, minZoom, maxZoom, maxZoomCap, basemap],
  )

  // 切换底图时钳制层级到合法范围
  useEffect(() => {
    setMinZoom((z) => Math.min(z, maxZoomCap))
    setMaxZoom((z) => Math.min(z, maxZoomCap))
  }, [maxZoomCap])

  // 探测 tileserver-gl 可用矢量数据源（决定哪些城市可选，依据 §3.2）
  useEffect(() => {
    let cancelled = false
    void (async () => {
      setAvailabilityLoading(true)
      const v = await fetchAvailableVectorSources()
      if (!cancelled) {
        setAvailableSources(v)
        setAvailabilityLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const overLarge = estimate.estimatedBytes >= LARGE_DOWNLOAD_THRESHOLD
  const zoomInvalid = minZoom > maxZoom || minZoom < MIN_ZOOM_LIMIT

  // 矢量暗色底图依赖本地 tileserver-gl 数据源；卫星影像走在线源无需探测
  const needsLocalSource = basemapNeedsLocalSource(basemap)
  const sourceDetectionFailed =
    !availabilityLoading && availableSources === null
  /** 选中区域的数据源是否可用（仅矢量 + 有明确源 key 的预设/城市生效；自定义区域不拦截） */
  const selectedSourceUnavailable =
    needsLocalSource &&
    selectedSourceKey !== undefined &&
    !(availableSources?.has(selectedSourceKey) ?? false)
  const availableCount = availableSources?.size ?? 0
  /** 下拉项是否可选（矢量按可用性过滤；卫星全部可选） */
  const optionAvailable = (key: string): boolean =>
    !needsLocalSource || (availableSources?.has(key) ?? false)

  const handleStart = async () => {
    setError('')
    if (zoomInvalid) {
      setError('层级范围无效：最小层级不能大于最大层级。')
      return
    }
    if (selectedSourceUnavailable) {
      setError(
        '所选区域在 tileserver-gl 中暂无矢量数据。请先运行 prepare-data.ps1 准备该城市数据，或切换到卫星底图。',
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
      if (needsLocalSource && selectedSourceKey) {
        // 矢量 + 已知城市/预设源：按数据源 key 直接构造本地模板
        // （style.json 通常只引用单一源，无法覆盖多城市）
        tileUrlTemplate = buildLocalVectorTemplate(selectedSourceKey)
      } else {
        // 卫星（在线源）或自定义矢量区域：回退到 style.json 解析
        const resolved = await resolveTileSource(
          MAPLIBRE_BASEMAPS[basemap].url,
          basemap,
        )
        tileUrlTemplate = resolved.tileUrlTemplate
        resolvedBasemap = resolved.basemap
      }
      await startDownload({
        basemap: resolvedBasemap,
        regionName,
        bbox,
        minZoom: Math.min(minZoom, maxZoomCap),
        maxZoom: Math.min(maxZoom, maxZoomCap),
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
      ? Math.min(100, Math.round((activeTask.completedTiles / activeTask.totalTiles) * 100))
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
            min={MIN_ZOOM_LIMIT}
            max={maxZoomCap}
            value={minZoom}
            onChange={(e) => setMinZoom(Number(e.target.value))}
          />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>最大</span>
          <input
            className="offline-input"
            type="number"
            min={MIN_ZOOM_LIMIT}
            max={maxZoomCap}
            value={maxZoom}
            onChange={(e) => setMaxZoom(Number(e.target.value))}
          />
        </div>
      </div>

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
                ? '该区域暂无矢量数据，请先准备数据或切换底图'
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
    return (
      <div
        className="offline-estimate"
        style={{
          color: '#4ade80',
          background: 'rgba(74,222,128,0.08)',
          borderColor: 'rgba(74,222,128,0.3)',
        }}
      >
        ✅ 离线瓦片下载完成（共 {formatNumber(last.completedTiles)} 块，{formatBytes(last.bytesDownloaded)}）
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

