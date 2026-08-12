/**
 * MapDisplayTab —— 「地图切换」Tab。
 *
 * 设置地图显示的城市矢量数据源（底图固定为卫星影像，不再提供矢量暗色选项）。
 * - 城市：下拉选择（来自 CITY_DATABASE），可用性由 /data.json 实时探测。
 *   未准备数据的城市可被选中，选中后弹确认 → 在线调后端 prepare-data.ps1
 *   生成 mbtiles，以 PrepareCityModal 展示进度，完成后自动切换；
 * - 切换城市的 flyTo 由 HomePage 监听 cityKey 变化执行。
 */
import { useCallback, useEffect, useState } from 'react'
import { message, Modal as AntModal } from 'antd'
import { useMapDisplay } from '../useMapDisplay'
import { CITY_DATABASE, findCityName } from '../../offline-map/cityDatabase'
import { fetchAvailableVectorSources } from '../../offline-map/tileSourceAvailability'
import { startPrepareCity } from '../api/prepareCity'
import { PrepareCityModal } from './PrepareCityModal'
import '../../offline-map/components/OfflineMapDialog.css'

export function MapDisplayTab() {
  const {
    cityKey,
    flyToCityOnSwitch,
    setCityKey,
    setFlyToCityOnSwitch,
    specLoading,
    specError,
  } = useMapDisplay()

  // 实时探测可用矢量城市源（null = 探测中或失败）
  const [available, setAvailable] = useState<Set<string> | null>(null)
  const [probing, setProbing] = useState(true)
  const [prepareOpen, setPrepareOpen] = useState(false)

  const refreshAvailable = useCallback(() => {
    setProbing(true)
    fetchAvailableVectorSources()
      .then((set) => {
        setAvailable(set)
        setProbing(false)
      })
      .catch(() => {
        setAvailable(null)
        setProbing(false)
      })
  }, [])

  useEffect(() => {
    refreshAvailable()
  }, [refreshAvailable])

  // 选中未准备数据的城市 → 弹确认 → 在线生成
  const handleCityChange = useCallback(
    (key: string) => {
      if (available && !available.has(key)) {
        const name = findCityName(key) ?? key
        AntModal.confirm({
          title: `生成「${name}」矢量数据？`,
          content:
            '该城市矢量数据尚未准备，需在服务端下载裁剪并生成（首次约 5-15 分钟）。生成完成后将自动切换。是否现在开始？',
          okText: '立即生成',
          cancelText: '取消',
          onOk: async () => {
            try {
              const result = await startPrepareCity({ city: key })
              if (result.status === 'busy') {
                message.info(result.message ?? '已有生成任务在运行，将显示其进度')
              }
              setPrepareOpen(true)
            } catch (e) {
              message.error(
                `无法启动生成：${e instanceof Error ? e.message : String(e)}（请确认后端数据准备服务已启动并配置 GCS_ADMIN_TOKEN）`,
              )
            }
          },
        })
        return
      }
      setCityKey(key)
    },
    [available, setCityKey],
  )

  // 生成完成：刷新可用性并切换到目标城市
  const handleCompleted = useCallback(
    (city: string) => {
      setPrepareOpen(false)
      const name = findCityName(city) ?? city
      message.success(`「${name}」数据已就绪，正在切换…`)
      window.setTimeout(() => {
        refreshAvailable()
        setCityKey(city)
      }, 3000)
    },
    [refreshAvailable, setCityKey],
  )

  return (
    <div>
      <div className="offline-estimate">底图为卫星影像，选择叠加显示的城市矢量数据。</div>

      {/* 矢量城市 */}
      <div className="offline-form-row">
        <span className="offline-form-row__label">矢量城市</span>
        <div className="offline-form-row__control">
          <select
            className="offline-select"
            value={cityKey}
            onChange={(e) => handleCityChange(e.target.value)}
          >
            {CITY_DATABASE.map((region) => (
              <optgroup key={region.label} label={region.label}>
                {region.cities.map((c) => {
                  // 探测完成且不含该 key → 标记未准备（仍可选，选中后在线生成）
                  const notReady = available !== null && !available.has(c.key)
                  return (
                    <option key={c.key} value={c.key}>
                      {c.name}
                      {notReady ? '（未准备数据）' : ''}
                    </option>
                  )
                })}
              </optgroup>
            ))}
          </select>
          {probing && (
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
              检测可用数据…
            </span>
          )}
        </div>
      </div>

      {/* 切换城市飞到中心 */}
      <div className="offline-form-row">
        <span className="offline-form-row__label">切换城市</span>
        <div className="offline-form-row__control">
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              color: 'rgba(255,255,255,0.85)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={flyToCityOnSwitch}
              onChange={(e) => setFlyToCityOnSwitch(e.target.checked)}
            />
            自动飞到该市中心
          </label>
        </div>
      </div>

      {/* 切换状态反馈 */}
      {specLoading && <div className="offline-empty">正在切换地图样式…</div>}
      {specError && (
        <div className="offline-empty" style={{ color: '#ff6b6b' }}>
          切换失败：{specError}
        </div>
      )}

      <div
        className="offline-estimate"
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.5)',
          fontSize: 12,
          lineHeight: 1.7,
        }}
      >
        提示：卫星影像底图为严格离线模式——仅显示已下载的瓦片（在「系统配置 → 下载离线地图」预取），
        未下载区域显示为灰色占位（不会自动联网）；切换城市只影响矢量道路 / POI 叠加层。
        未准备数据的城市选中后会在线生成（需后端数据准备服务运行中）。
      </div>

      <PrepareCityModal
        open={prepareOpen}
        onClose={() => setPrepareOpen(false)}
        onCompleted={handleCompleted}
      />
    </div>
  )
}
