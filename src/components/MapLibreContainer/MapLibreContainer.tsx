/**
 * MapLibreContainer —— MapLibre GL JS 地图容器组件（严格离线）。
 *
 * 职责：
 * - 初始化 MapLibre 地图实例并加载样式；
 * - 通过 onReady 暴露 MapEngineInstance（含 MapLibreAdapter），供上层业务使用；
 * - 支持自动定位（浏览器 Geolocation，WGS84 直用，无需坐标转换）；
 * - 组件卸载时调用 map.remove() 销毁实例。
 *
 * 严格离线（无在线兜底）：
 * - 运行时不读取 navigator.onLine，无「在线/离线」分支；
 * - 尚未导入任何离线地图包时，渲染纯色占位底图（PLACEHOLDER_STYLE）；
 * - styleSpec prop 由父组件注入（P1+：来源于已导入的 MBTiles 包），变化时热切换。
 *
 * 实现要点：
 * - 坐标系：WGS84（业务侧统一坐标）；
 * - SDK 加载：直接 import maplibre-gl，无需动态 script 注入。
 */
import { Map as MLMap, type StyleSpecification } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { MapLibreAdapter } from '../../map-engines/MapLibreAdapter'
import type { MapEngineInstance, MapStyleSpec } from '../../map-engines/types'
import {
  MAPLIBRE_DEFAULT_CENTER,
  MAPLIBRE_DEFAULT_ZOOM,
  MAPLIBRE_MAP_OPTIONS,
} from '../../config/mapLibre'
import {
  createOfflineTransformRequest,
  registerOfflineNetworkGuard,
} from '../../features/offline-map/networkGuard'
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
 * 占位底图样式（严格离线）。
 *
 * 尚未导入任何离线地图包时使用：一个纯色背景层，使 MapLibre 能正常初始化、
 * adapter 可用、业务 DOM 覆盖物正常渲染。导入 MBTiles 包后，父组件通过
 * styleSpec prop 注入完整样式（含 gcs-pkg:// 瓦片源），热切换到此占位样式之上。
 */
const PLACEHOLDER_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'placeholder-background',
      type: 'background',
      paint: { 'background-color': '#1a2a3a' },
    },
  ],
}

/**
 * 在 MapLibre 地图上添加"我的位置"标注：精度圆 + 蓝色光点 Marker。
 *
 * 使用 adapter 抽象接口，坐标系为 WGS84。
 */
function addLocationMarker(
  adapter: MapLibreAdapter,
  lng: number,
  lat: number,
  accuracy: number,
) {
  adapter.addCircle('__user_location_accuracy__', { lng, lat }, accuracy, {
    strokeColor: '#1e90ff',
    strokeWeight: 1,
    strokeOpacity: 0.4,
    fillColor: '#1e90ff',
    fillOpacity: 0.12,
  })
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
 * 直接使用浏览器 Geolocation API（WGS84），定位结果可直接传入 MapLibre。
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

/**
 * 地图渲染状态。
 *
 * 严格离线：运行时不读取 navigator.onLine，无「在线/离线」分支。
 * - loading：地图初始化中；
 * - success：地图加载成功（占位底图或离线包样式均可到达此状态）；
 * - error：地图初始化失败。
 */
export type MapStatus = 'loading' | 'success' | 'error'

/** MapLibreContainer 组件属性 */
interface MapLibreContainerProps {
  /** 自定义容器类名 */
  className?: string
  /** 地图初始中心点（WGS84），默认苏州 */
  center?: MapCenter
  /** 地图初始缩放级别，默认 12 */
  zoom?: number
  /** 是否自动定位到用户当前位置（默认 false，受控） */
  autoLocate?: boolean
  /** 地图实例就绪回调，父级接收 MapEngineInstance（含 adapter + raw） */
  onReady?: (engine: MapEngineInstance) => void
  /**
   * 运行时热切换的样式 spec。变化时调用 map.setStyle（不重建实例）。
   * 用于「离线地图包切换」：父组件注入由 MBTiles 包派生的完整样式
   * （含 gcs-pkg:// 瓦片源）；未就绪时为 null / undefined（使用占位底图）。
   */
  styleSpec?: MapStyleSpec | null
  /** 叠加在地图之上的 DOM 覆盖物（如飞行器、限制区） */
  children?: ReactNode
}

/**
 * MapLibre GL JS 地图容器组件。
 *
 * 初始化 MapLibre 地图实例，通过 onReady(MapEngineInstance) 接口
 * 向上层暴露地图能力。
 */
export function MapLibreContainer({
  className,
  center = MAPLIBRE_DEFAULT_CENTER,
  zoom = MAPLIBRE_DEFAULT_ZOOM,
  autoLocate = false,
  onReady,
  styleSpec,
  children,
}: MapLibreContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const adapterRef = useRef<MapLibreAdapter | null>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  // 运行时样式覆盖的 ref 镜像：供 init 读取最新值，避免闭包陈旧
  const styleSpecRef = useRef<MapStyleSpec | null | undefined>(styleSpec)
  styleSpecRef.current = styleSpec

  const [status, setStatus] = useState<MapStatus>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  // 重试计数器：点击"重试"时递增，触发 Effect 1 重新初始化地图
  const [retryKey, setRetryKey] = useState(0)

  // ============ Effect 1：初始化地图（依赖 retryKey，支持重试） ============
  useEffect(() => {
    if (!containerRef.current) return

    let cancelled = false
    setStatus('loading')
    setErrorMsg('')

    try {
      // 严格离线引擎层强制：注册 gcs-block 拦截协议，并通过 transformRequest 把任何
      // 绝对 http(s):// URL（Esri / OSM / tileserver 等在线兜底）重写为 gcs-block:// →
      // 一律拦截（灰显，零网络）。gcs-pkg:// / data: / 同源路径原样放行。幂等，安全。
      registerOfflineNetworkGuard()
      const map = new MLMap({
        container: containerRef.current,
        // 离线地图包未就绪时使用占位底图；已就绪时优先使用其样式（首屏即为选中包）。
        style: styleSpecRef.current
          ? (styleSpecRef.current as StyleSpecification)
          : PLACEHOLDER_STYLE,
        center: [center.lng, center.lat],
        zoom,
        // 严格离线网络守卫：拦截一切在线 http(s) 资源请求（瓦片 / style / glyph / sprite）。
        transformRequest: createOfflineTransformRequest(),
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
        setStatus((prev) => {
          if (prev === 'success') return prev
          setErrorMsg('地图加载失败' + (e?.error ? `：${e.error.message}` : ''))
          return 'error'
        })
      })
    } catch (err) {
      setStatus('error')
      setErrorMsg(
        '地图初始化失败' + (err instanceof Error ? `：${err.message}` : ''),
      )
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
  }, [retryKey])

  // ============ Effect 1.5：运行时样式热切换（离线地图包切换） ============
  // styleSpec 变化时调用 map.setStyle，不重建实例，保留视图与业务 DOM 覆盖物。
  // 首次加载（map 未就绪）由 Effect 1 的初始化直接使用 styleSpecRef。
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleSpec) return
    map.setStyle(styleSpec as StyleSpecification)
  }, [styleSpec])

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
          <div className="maplibre-error-card">
            <span className="maplibre-error-text">{errorMsg}</span>
            <button
              type="button"
              className="maplibre-retry-btn"
              onClick={() => setRetryKey((k) => k + 1)}
            >
              重试
            </button>
          </div>
        </div>
      )}

      {status === 'success' && (
        <div className="maplibre-overlay">{children}</div>
      )}
    </div>
  )
}
