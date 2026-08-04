/**
 * MapLibreContainer —— MapLibre GL JS 地图容器组件。
 *
 * 与 BMapContainer 平行，职责完全一致：
 * - 初始化 MapLibre 地图实例并加载样式 JSON；
 * - 通过 onReady 暴露 MapEngineInstance（含 MapLibreAdapter），供上层业务使用；
 * - 支持自动定位（浏览器 Geolocation，WGS84 直用，无需坐标转换）；
 * - 组件卸载时调用 map.remove() 销毁实例。
 *
 * 关键差异（相对 BMapContainer）：
 * - 坐标系：WGS84（无需 wgs84ToBd09 转换）；
 * - SDK 加载：直接 import maplibre-gl，无需动态 script 注入；
 * - 样式：通过 Style JSON URL 控制，暗色底图由瓦片服务提供。
 */
import { Map as MLMap } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { MapLibreAdapter } from '../../map-engines/MapLibreAdapter'
import type { MapEngineInstance } from '../../map-engines/types'
import {
  MAPLIBRE_DEFAULT_CENTER,
  MAPLIBRE_DEFAULT_ZOOM,
  MAPLIBRE_MAP_OPTIONS,
  MAPLIBRE_STYLE_URL,
  MAPLIBRE_USE_OFFLINE_TILES,
} from '../../config/mapLibre'
import { htmlToElement } from '../../utils/htmlToElement'
import 'maplibre-gl/dist/maplibre-gl.css'
import './MapLibreContainer.css'

/** "我的位置"标注图标（蓝色光点 + 光晕），使用内联 SVG 无需图片资源 */
const LOCATION_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
  <circle cx="22" cy="22" r="18" fill="#1e90ff" fill-opacity="0.15"/>
  <circle cx="22" cy="22" r="11" fill="#1e90ff" fill-opacity="0.3"/>
  <circle cx="22" cy="22" r="7" fill="#1e90ff" stroke="#fff" stroke-width="2.5"/>
</svg>`

/**
 * 在 MapLibre 地图上添加"我的位置"标注：精度圆 + 蓝色光点 Marker。
 *
 * 与 BMapContainer 的 addLocationMarker 对应，使用 adapter 抽象接口，
 * 保证坐标系一致（WGS84）。
 */
function addLocationMarker(
  adapter: MapLibreAdapter,
  lng: number,
  lat: number,
  accuracy: number,
) {
  // 精度圆
  adapter.addCircle('__user_location_accuracy__', { lng, lat }, accuracy, {
    strokeColor: '#1e90ff',
    strokeWeight: 1,
    strokeOpacity: 0.4,
    fillColor: '#1e90ff',
    fillOpacity: 0.12,
  })
  // 蓝色光点标注
  adapter.addMarker('__user_location__', { lng, lat }, {
    element: htmlToElement(
      `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOCATION_ICON_SVG)}" alt="location" />`,
    ),
    anchor: { x: 22, y: 22 },
    draggable: false,
  })
}

/**
 * 自动定位到用户当前位置。
 *
 * 与 BMapContainer 不同：
 * - 直接使用浏览器 Geolocation API（WGS84），无需百度 SDK 定位；
 * - 无需坐标转换，定位结果可直接传入 MapLibre。
 *
 * 传入 isCancelled 回调，避免异步定位返回时用户已开始编辑航线，
 * 此刻放弃 panTo 防止视野被移走。
 */
function runAutoLocate(adapter: MapLibreAdapter, isCancelled: () => boolean) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return
  navigator.geolocation.getCurrentPosition(
    (position) => {
      if (isCancelled()) return
      const { longitude, latitude } = position.coords
      adapter.panTo({ lng: longitude, lat: latitude })
      addLocationMarker(adapter, longitude, latitude, position.coords.accuracy ?? 80)
    },
    () => {
      /* 浏览器定位失败，保留默认中心点 */
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
  )
}

/** 地图中心点坐标 */
interface MapCenter {
  lng: number
  lat: number
}

/** MapLibreContainer 组件属性 */
interface MapLibreContainerProps {
  /** 自定义容器类名 */
  className?: string
  /** 地图初始中心点（WGS84），默认深圳 */
  center?: MapCenter
  /** 地图初始缩放级别，默认 14 */
  zoom?: number
  /**
   * 是否自动定位到用户当前位置。
   * 默认 false。受控属性：变 false 时会取消尚未完成的定位请求。
   */
  autoLocate?: boolean
  /** 地图实例就绪回调，父级接收 MapEngineInstance（含 adapter + raw） */
  onReady?: (engine: MapEngineInstance) => void
  /**
   * 底图样式 URL。
   *
   * 通过 prop 注入，而非直接读取全局配置，使得父组件可在运行时切换
   * 矢量/卫星底图：父组件改变 styleUrl 即触发本组件重建（配合 key）。
   * 默认读取 MAPLIBRE_STYLE_URL（向后兼容）。
   */
  styleUrl?: string
  /** 叠加在地图之上的 DOM 覆盖物（如飞行器、限制区） */
  children?: ReactNode
}

/**
 * MapLibre GL JS 地图容器组件。
 *
 * 与 BMapContainer 平行实现，保证上层通过统一的 onReady(MapEngineInstance)
 * 接口获取地图能力，无需感知底层引擎差异。
 */
export function MapLibreContainer({
  className,
  center = MAPLIBRE_DEFAULT_CENTER,
  zoom = MAPLIBRE_DEFAULT_ZOOM,
  autoLocate = false,
  onReady,
  styleUrl = MAPLIBRE_STYLE_URL,
  children,
}: MapLibreContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const adapterRef = useRef<MapLibreAdapter | null>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  // ============ Effect 1：初始化地图（仅一次） ============
  useEffect(() => {
    if (!containerRef.current) return

    let cancelled = false

    try {
      if (cancelled || !containerRef.current) return

      const map = new MLMap({
        container: containerRef.current,
        style: styleUrl,
        center: [center.lng, center.lat],
        zoom,
        ...MAPLIBRE_MAP_OPTIONS,
      })
      mapRef.current = map

      map.on('load', () => {
        if (cancelled) return
        const adapter = new MapLibreAdapter(map)
        adapterRef.current = adapter
        setStatus('success')
        onReadyRef.current?.({ adapter, raw: map, engine: 'maplibre' })
      })

      map.on('error', (e: { error?: Error }) => {
        // 样式/瓦片加载失败时给出明确提示（离线瓦片服务未启动时常见）
        setStatus((prev) => {
          if (prev === 'success') return prev
          const tip = MAPLIBRE_USE_OFFLINE_TILES
            ? '离线瓦片服务不可达，请检查 tileserver-gl 是否启动'
            : '地图样式加载失败'
          setErrorMsg(tip + (e?.error ? `：${e.error.message}` : ''))
          return 'error'
        })
      })
    } catch (err: unknown) {
      if (cancelled) return
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : '地图初始化失败')
    }

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      adapterRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ============ Effect 2：自动定位（受控，可取消） ============
  useEffect(() => {
    if (!autoLocate || status !== 'success') return
    const adapter = adapterRef.current
    if (!adapter) return

    let cancelled = false
    runAutoLocate(adapter, () => cancelled)

    return () => {
      cancelled = true
    }
  }, [autoLocate, status])

  return (
    <div className={`maplibre-container ${className ?? ''}`}>
      <div ref={containerRef} className="maplibre-canvas" />

      {status === 'loading' && (
        <div className="maplibre-status maplibre-status--loading">地图加载中…</div>
      )}

      {status === 'error' && (
        <div className="maplibre-status maplibre-status--error">
          <span>{errorMsg}</span>
        </div>
      )}

      {status === 'success' && <div className="maplibre-overlay">{children}</div>}
    </div>
  )
}