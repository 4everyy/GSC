/**
 * MapLibreContainer —— MapLibre GL JS 地图容器组件。
 *
 * 职责：
 * - 初始化 MapLibre 地图实例并加载样式 JSON；
 * - 通过 onReady 暴露 MapEngineInstance（含 MapLibreAdapter），供上层业务使用；
 * - 支持自动定位（浏览器 Geolocation，WGS84 直用，无需坐标转换）；
 * - 组件卸载时调用 map.remove() 销毁实例。
 *
 * 实现要点：
 * - 坐标系：WGS84（业务侧统一坐标）；
 * - SDK 加载：直接 import maplibre-gl，无需动态 script 注入；
 * - 样式：通过 Style JSON URL 控制，暗色底图由本地 tileserver-gl 提供。
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
  MAPLIBRE_STYLE_URL,
  MAPLIBRE_USE_OFFLINE_TILES,
  TILESERVER_ORIGIN,
} from '../../config/mapLibre'
import {
  CACHE_PROTOCOL,
  matchTilePath,
  registerTileCacheProtocol,
} from '../../features/offline-map/tileProtocol'
import { getStyle, putStyle } from '../../features/offline-map/tileCache'
import { OfflineMapPlaceholder } from '../../features/offline-map/components/OfflineMapPlaceholder'
import { htmlToElement } from '../../utils/htmlToElement'
import 'maplibre-gl/dist/maplibre-gl.css'
import './MapLibreContainer.css'

/** "我的位置"标注图标（蓝色光点 + 光晕），使用内联 SVG 无需图片资源 */
const LOCATION_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
  <circle cx="22" cy="22" r="18" fill="#1e90ff" fill-opacity="0.15"/>
  <circle cx="22" cy="22" r="11" fill="#1e90ff" fill-opacity="0.3"/>
  <circle cx="22" cy="22" r="7" fill="#1e90ff" stroke="#fff" stroke-width="2.5"/>
</svg>`

/** 离线瓦片服务恢复命令提示（tileserver-gl 未启动时展示给用户） */
const OFFLINE_TILES_HINT =
  '离线瓦片服务不可达，请检查 tileserver-gl 是否启动（docker start gcs-tileserver 或 cd tileserver && docker compose up -d）'

/**
 * 同源代理前缀（与 vite.config.ts 中 server.proxy / preview.proxy 对应）。
 *
 * 生产部署时由 Nginx 配置 `location /tiles/ { proxy_pass http://localhost:8081/; }`。
 */
const TILE_PROXY_PREFIX = '/tiles'

/**
 * 创建 MapLibre transformRequest：将指向 tileserver-gl 的绝对 URL 重写为同源代理路径。
 *
 * tileserver-gl 通过 `--public_url http://localhost:8081` 将此 origin 注入到 style.json
 * 内部的 sources.url / glyphs / sprite 字段。浏览器直接请求这些绝对 URL 时，若页面从
 * LAN IP / IPv6 / 其他主机访问，localhost 会指向客户端自身导致 "Failed to fetch (0)"。
 *
 * 重写为 /tiles 同源路径后，开发环境由 Vite proxy 转发，生产环境由 Nginx 转发，
 * 统一解决跨域与 localhost 不可达问题。
 *
 * `useCacheProtocol` 为 true 时，**仅瓦片请求**（匹配 `/{z}/{x}/{y}.{ext}` 坐标模式）包装为
 * `gcs-cache://<path>` 交由 {@link registerTileCacheProtocol} 处理（IndexedDB 缓存，严格离线）：
 *   - 命中 → 零网络返回；未命中 → 栅格灰显 / 矢量抛错，绝不在线回源。
 *
 * 非瓦片资源（source TileJSON `.json` / glyphs / sprite）仍走同源代理，由本地 tileserver-gl
 * 提供——tileserver-gl 作为离线基础设施常驻运行（非 ESRI/在线服务）。若 TileJSON 也走
 * gcs-cache 而又未预下载，source 无法解析瓦片模板，会导致整图空白。
 *
 * 仅当 tileserver origin 有效时返回 transform 函数；若 styleUrl 本身就是同源相对
 * 路径（如 /tiles/styles/dark/style.json），则无需重写，返回 undefined。
 */
function createTileserverTransformRequest(useCacheProtocol = false) {
  try {
    // 验证 origin 可解析
    new URL(TILESERVER_ORIGIN)
  } catch {
    return undefined
  }
  return (url: string) => {
    if (url.startsWith(TILESERVER_ORIGIN)) {
      const proxyPath = url.replace(TILESERVER_ORIGIN, TILE_PROXY_PREFIX)
      // 仅瓦片请求（含 z/x/y 坐标模式）路由到 gcs-cache（IndexedDB 缓存）；
      // 非瓦片资源（TileJSON .json / glyphs / sprite）走同源代理，由本地 tileserver-gl
      // （离线基础设施，非在线服务）提供——否则 TileJSON 未缓存导致 source 无法解析、整图空白。
      if (useCacheProtocol && matchTilePath(proxyPath)) {
        return { url: `${CACHE_PROTOCOL}://${proxyPath}` }
      }
      return { url: proxyPath }
    }
    return { url }
  }
}

/**
 * 注册瓦片缓存自定义协议（幂等）。
 *
 * 仅在使用离线瓦片服务（MAPLIBRE_USE_OFFLINE_TILES）时启用，避免对 demotails 在线
 * 示例产生干扰。注册是模块加载副作用，确保在任何 MapLibre 实例创建前完成。
 */
if (MAPLIBRE_USE_OFFLINE_TILES) {
  registerTileCacheProtocol()
}

/**
 * 自动重试最大次数（不含首次请求）。
 * 总尝试次数 = 1 + MAX_STYLE_FETCH_RETRIES = 4 次。
 */
const MAX_STYLE_FETCH_RETRIES = 3

/** 重试基础延迟（毫秒），实际延迟 = BASE × 2^attempt（指数退避：1s → 2s → 4s） */
const STYLE_FETCH_BASE_DELAY_MS = 1000

/**
 * 带自动重试的 style.json 预取。
 *
 * tileserver-gl 容器重启 / Docker 端口映射建立期间，Vite proxy 上游不可达会产生
 * 502 Bad Gateway。直接传 URL 给 MapLibre 会立即失败并弹出错误面板；此函数在失败时
 * 按指数退避自动重试，覆盖容器启动延迟窗口，成功后将 StyleSpecification 对象返回。
 *
 * @param url 经 transformRequest 重写后的同源代理路径（如 /tiles/styles/dark/style.json）
 * @returns 解析后的 StyleSpecification 对象
 * @throws 所有重试用尽后抛出最后一次错误
 */
async function fetchStyleJsonWithRetry(
  url: string,
): Promise<StyleSpecification> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= MAX_STYLE_FETCH_RETRIES; attempt++) {
    try {
      const resp = await fetch(url)
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} (${resp.statusText})`)
      }
      // 先取文本：既用于 JSON 解析，也用于写入 style 缓存（断网时离线回退）
      const text = await resp.text()
      // 异步写回 style.json 缓存（fire-and-forget），供 getStyle 离线回退
      void putStyle(url, text).catch(() => {
        /* 写缓存失败不影响本次加载 */
      })
      return JSON.parse(text) as StyleSpecification
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < MAX_STYLE_FETCH_RETRIES) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, STYLE_FETCH_BASE_DELAY_MS * 2 ** attempt),
        )
      }
    }
  }
  throw lastError ?? new Error('style.json 加载失败')
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
 * 直接使用浏览器 Geolocation API（WGS84），定位结果可直接传入 MapLibre。
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

/**
 * 地图渲染状态（设计依据：docs/离线地图下载方案.md §7.2）。
 *
 * - loading：style.json 加载中；
 * - success：在线加载成功；
 * - partial：在线失败但命中 IndexedDB 的 style 缓存回退，瓦片层可能部分灰显
 *   （gcs-cache 协议对未命中且离线的瓦片返回灰色占位），不打断用户；
 * - offline：在线失败且无 style 缓存，地图无法渲染，提示前往下载离线地图；
 * - error：其他加载错误（如 tileserver 5xx）。
 */
export type MapStatus = 'loading' | 'success' | 'error' | 'offline' | 'partial'

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
  /**
   * 运行时热切换的样式 spec。
   *
   * 变化时调用 map.setStyle（不重建地图实例，保留中心点 / 缩放 / 业务 DOM 覆盖物）。
   * 用于「地图资源切换」：底图样式与城市矢量源的运行时切换。
   * 由父组件从 useMapDisplay().activeStyleSpec 注入；未就绪时为 null（首次加载用 styleUrl）。
   */
  styleSpec?: MapStyleSpec | null
  /**
   * 「离线无缓存」提示层中「立即下载」按钮的回调。
   *
   * 仅在 status === 'offline'（在线失败 + 无 style 缓存）时该按钮可见。
   * 由父组件传入打开离线地图管理弹窗的逻辑。
   */
  onOfflinePromptClick?: () => void
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
  styleUrl = MAPLIBRE_STYLE_URL,
  styleSpec,
  onOfflinePromptClick,
  children,
}: MapLibreContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const adapterRef = useRef<MapLibreAdapter | null>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  // 运行时样式覆盖的 ref 镜像：供 init 的 load 回调读取最新值，避免闭包陈旧
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

    // transformRequest 将 tileserver-gl 注入的绝对 URL（http://localhost:8081/...）
    // 重写为同源代理路径 /tiles/...，避免 LAN/IPv6/生产环境 localhost 不可达。
    // 开发环境由 Vite proxy 转发，生产环境由 Nginx 转发。
    //
    // style.json 的预取（fetch）不支持自定义协议，故走普通同源代理路径
    // （在线预取并写缓存，失败回退 IndexedDB style 缓存）。运行时仅瓦片请求
    // 走 gcs-cache 协议（IndexedDB 命中返回，未命中灰显——严格离线，绝不回源）；
    // TileJSON / glyphs / sprite 走同源代理由本地 tileserver-gl 提供。
    const styleTransform = createTileserverTransformRequest(false)
    const tileTransform = createTileserverTransformRequest(MAPLIBRE_USE_OFFLINE_TILES)
    const effectiveStyleUrl = styleTransform
      ? styleTransform(styleUrl).url
      : styleUrl

    // 预取 style.json 并在失败时自动重试（指数退避：1s → 2s → 4s）。
    // tileserver-gl 容器重启 / Docker 端口映射建立期间，Vite proxy 上游不可达
    // 会产生瞬时 502 Bad Gateway。直接将 URL 交给 MapLibre 会立即触发 AJAXError；
    // 预取重试可覆盖容器启动延迟窗口，成功后将 StyleSpecification 对象直接传给 MapLibre。
    // 加载 style：在线 fetch（成功写缓存）失败则回退 IndexedDB 缓存（缺口① / §5.4）。
    // 返回 { spec, isPartial }：partial 表示当前靠缓存 style 回退，瓦片层可能部分灰显。
    const loadStyle = async (): Promise<{
      spec: StyleSpecification
      isPartial: boolean
    } | null> => {
      try {
        const spec = await fetchStyleJsonWithRetry(effectiveStyleUrl)
        return { spec, isPartial: false }
      } catch {
        // 在线失败 → 尝试缓存 style 离线回退
        const cachedText = await getStyle(effectiveStyleUrl)
        if (cachedText) {
          try {
            return {
              spec: JSON.parse(cachedText) as StyleSpecification,
              isPartial: true,
            }
          } catch {
            /* 缓存 style 解析失败，按无可用 style 处理 */
          }
        }
        return null
      }
    }

    loadStyle()
      .then((result) => {
        if (cancelled || !containerRef.current) return
        if (!result) {
          // 无可用 style：断网且无缓存 → offline（提示前往下载）；其余 → error
          const offline =
            typeof navigator !== 'undefined' && navigator.onLine === false
          if (offline && MAPLIBRE_USE_OFFLINE_TILES) {
            setStatus('offline')
            return
          }
          const tip = MAPLIBRE_USE_OFFLINE_TILES
            ? OFFLINE_TILES_HINT
            : '地图样式加载失败'
          setStatus('error')
          setErrorMsg(`${tip}：style.json 在线加载失败且无本地缓存`)
          return
        }

        const { spec, isPartial } = result
        const map = new MLMap({
          container: containerRef.current,
          style: spec,
          center: [center.lng, center.lat],
          zoom,
          transformRequest: tileTransform,
          ...MAPLIBRE_MAP_OPTIONS,
        })
        mapRef.current = map

        map.on('load', () => {
          if (cancelled) return
          // 若运行时样式覆盖（底图/城市切换）已就绪，load 后立即应用，
          // 保证首屏即为用户选择的城市（避免默认→选择的闪烁）
          if (styleSpecRef.current) {
            map.setStyle(styleSpecRef.current as StyleSpecification)
          }
          const adapter = new MapLibreAdapter(map)
          adapterRef.current = adapter
          setStatus(isPartial ? 'partial' : 'success')
          onReadyRef.current?.({ adapter, raw: map, engine: 'maplibre' })
        })

        map.on('error', (e: { error?: Error }) => {
          // partial 模式下瓦片未命中属预期灰显，不计入 error；
          // 其余情况样式/瓦片加载失败时给出明确提示（离线瓦片服务未启动时常见）
          setStatus((prev) => {
            if (prev === 'success' || prev === 'partial') return prev
            const tip = MAPLIBRE_USE_OFFLINE_TILES
              ? OFFLINE_TILES_HINT
              : '地图样式加载失败'
            setErrorMsg(tip + (e?.error ? `：${e.error.message}` : ''))
            return 'error'
          })
        })
      })

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

  // ============ Effect 1.5：运行时样式热切换（底图 / 城市） ============
  // styleSpec 变化时调用 map.setStyle，不重建实例，保留视图与业务 DOM 覆盖物。
  // 首次加载（map 未就绪）由 Effect 1 的 load 回调兜底应用 styleSpecRef。
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

      {status === 'offline' && (
        <OfflineMapPlaceholder onDownload={onOfflinePromptClick} />
      )}

      {(status === 'success' || status === 'partial') && (
        <div className="maplibre-overlay">{children}</div>
      )}
    </div>
  )
}