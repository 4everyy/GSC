import { Map as MLMap, type StyleSpecification, type MapSourceDataEvent } from 'maplibre-gl'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MapLibreAdapter } from '../../map-engines/MapLibreAdapter'
import { type MapEngineInstance, type MapStyleSpec } from '../../map-engines/types'
import { MAPLIBRE_DEFAULT_CENTER, MAPLIBRE_DEFAULT_ZOOM, MAPLIBRE_MAP_OPTIONS } from '../../config/index'
import { createOfflineTransformRequest, registerOfflineNetworkGuard } from '../../features/offline-map/index'
import { htmlToElement } from '../../utils/index'
import 'maplibre-gl/dist/maplibre-gl.css'
import './MapLibreContainer.css'
import { Progress } from 'antd'

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
  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])
  // 运行时样式覆盖的 ref 镜像：供 init 读取最新值，避免闭包陈旧
  const styleSpecRef = useRef<MapStyleSpec | null | undefined>(styleSpec)
  useEffect(() => {
    styleSpecRef.current = styleSpec
  }, [styleSpec])

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
      // 异步上报错误状态：规避 effect 内同步 setState（React Compiler 规则）
      const message =
        '地图初始化失败' + (err instanceof Error ? `：${err.message}` : '')
      queueMicrotask(() => {
        if (cancelled) return
        setStatus('error')
        setErrorMsg(message)
      })
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
  // styleSpec 变化时切换样式，不重建实例，保留视图与业务 DOM 覆盖物。
  // 首次加载（map 未就绪）由 Effect 1 的初始化直接使用 styleSpecRef。
  // adapter 就绪后经 adapter.setStyle：setStyle 会清空运行期动态添加的
  // source/layer（任务区域多边形、定位精度圈等——启动期在占位样式上先行
  // 渲染的覆盖物），adapter 内部在新样式数据就绪后按创建参数重放恢复；
  // adapter 未就绪（load 未完成）时此时尚无业务覆盖物，直接切换即可。
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleSpec) return
    const adapter = adapterRef.current
    if (adapter) {
      adapter.setStyle(styleSpec)
    } else {
      map.setStyle(styleSpec as StyleSpecification)
    }
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

/**
 * MapLoadProgress —— 地图加载进度指示器（首页右下角）。
 *
 * 样式参考 antd「自定义进度条渐变色」示例：
 * <Progress type="dashboard" percent={93} strokeColor={conicColors} />
 *
 * 覆盖「应用启动 → 离线包就绪 → 瓦片渲染完毕」全流程（修复两类问题）：
 * 1. 进度条出现太晚 / 一出来就 95%：engineInstance 在地图 load（首批瓦片
 *    已渲染完）之后才暴露，真实瓦片事件早已错过。因此本组件挂载即显示，
 *    分阶段驱动：
 *    - 阶段 A（占位等待）：样式未注入（reloadKey 为空）或引擎未就绪，
 *      用时间曲线缓升假进度（上限 30%；引擎初始化带样式时上限 80%），
 *      保证黑底等待期始终有提示；
 *    - 阶段 B（真实统计）：样式已注入且引擎就绪（setStyle 进行中），
 *      监听 sourcedataloading / sourcedata(content) 的「已完成/总数」实时
 *      比值（35%~95% 单调递增）；若 onReady 时已 loaded（首次初始化路径，
 *      首批瓦片在监听前完成）直接收尾；
 *    - 阶段 C（收尾）：跳 100% → 停留 700ms → 淡出隐藏。
 * 2. 结束条件（任一先满足）：最后一批瓦片完成后 450ms 无新请求 / idle /
 *    兜底超时（占位等待 10s、瓦片统计 30s）。
 * - reloadKey（activeStyle 引用）变化 = 离线地图包热切换 setStyle，
 *   重置为可见并重新统计新一轮加载（进度从 0 重新走起）。
 */

/** conic 渐变色：项目主色系提亮提饱和（亮青 #00e5ff → 天蓝 #35c8fb → 冰青 #8df3ff），
 *  配合 CSS drop-shadow 发光，避免与深色背景撞色 */
const CONIC_COLORS = {
  '0%': '#00e5ff',
  '50%': '#35c8fb',
  '100%': '#8df3ff',
}

/** 组件属性 */
interface MapLoadProgressProps {
  /** MapLibre 原始地图实例（MapEngineInstance.raw，未就绪时为 undefined） */
  map?: unknown
  /** 热切换标识：引用变化时视为新一轮加载（离线地图包切换 setStyle） */
  reloadKey?: unknown
}

/** 展示阶段：active 展示中 / leaving 淡出中 / hidden 已隐藏 */
type Phase = 'active' | 'leaving' | 'hidden'

// ============ 阶段 A：占位等待（假进度） ============
/** 假进度上限：普通等待（占位底图 / 引擎初始化） */
const IDLE_CAP = 30
/** 假进度上限：引擎正以离线样式初始化（load 后 onReady 即收尾） */
const INIT_CAP = 80
/** 时间常数：假进度按 1 - e^(-t/τ) 缓升，约 4.5s 接近上限 */
const IDLE_TAU_MS = 1500
/** 假进度刷新间隔 */
const TICK_MS = 100

// ============ 阶段 B：真实瓦片统计 ============
/** 真实进度区间（与阶段 A 的 30% 平滑衔接） */
const REAL_MIN = 35
const REAL_MAX = 95
/** 最后一批瓦片完成后静默多久即视为加载结束 */
const SETTLE_MS = 450

// ============ 兜底与收尾 ============
/** 占位等待兜底：迟迟没有离线包激活时完成收尾（纯色底图本身已可用） */
const IDLE_TIMEOUT_MS = 10000
/** 真实统计兜底：事件流异常（如样式彻底失败）时强制结束 */
const SAFETY_MS = 30000
/** 结束动作：100% 停留 700ms 后开始淡出，1200ms 彻底隐藏 */
const FADE_DELAY_MS = 700
const HIDE_DELAY_MS = 1200

/** 跨渲染存续的流程状态（组件级 ref，effect 重跑保持连续） */
interface ProgressState {
  /** 本轮开始时间戳（performance.now） */
  startedAt: number
  /** 已展示进度（0~100，全程单调递增，抵消阶段切换回跳） */
  shown: number
  /** 已完成瓦片数（失败也算走完，避免卡住） */
  done: number
  /** 进行中瓦片数 */
  inflight: number
  /** 是否已进入真实瓦片统计（阶段 B） */
  tracking: boolean
  /** 全部瓦片归零后已启动静默收尾定时器 */
  settled: boolean
  /** 是否已收尾（阶段 C 已触发） */
  finished: boolean
  /** 最近一轮见过的非空 reloadKey（识别热切换新一轮） */
  lastKey: unknown
  /** lastKey 是否已赋值（区分首轮 null → style，不重置进度） */
  lastKeySet: boolean
}

function makeState(): ProgressState {
  return {
    startedAt: performance.now(),
    shown: 0,
    done: 0,
    inflight: 0,
    tracking: false,
    settled: false,
    finished: false,
    lastKey: undefined,
    lastKeySet: false,
  }
}

export function MapLoadProgress({ map, reloadKey }: MapLoadProgressProps) {
  const [percent, setPercent] = useState(0)
  // 挂载即显示：覆盖启动初期的黑底等待阶段
  const [phase, setPhase] = useState<Phase>('active')

  // 进度状态对象：ref 惰性初始化并持有：渲染期不读写，effect/事件回调内修改
  //（重置 = Object.assign 覆写；ref 是可变逃生舱，不触发 immutability 规则）
  const stRef = useRef<ProgressState | null>(null)
  const settleTimer = useRef(0)
  const fadeTimer = useRef(0)
  const hideTimer = useRef(0)
  const globalTimer = useRef(0)
  const safetyTimer = useRef(0)

  // 主流程：map / reloadKey 任一就绪或变化时推进
  useEffect(() => {
    const s = stRef.current ?? (stRef.current = makeState())
    const mlMap = (map ?? null) as MLMap | null

    // —— 热切换新一轮检测：reloadKey 引用变化（且非首轮注入）→ 全量重置 ——
    if (reloadKey != null) {
      if (s.lastKeySet && reloadKey !== s.lastKey) {
        window.clearTimeout(settleTimer.current)
        window.clearTimeout(fadeTimer.current)
        window.clearTimeout(hideTimer.current)
        window.clearTimeout(globalTimer.current)
        window.clearTimeout(safetyTimer.current)
        Object.assign(s, makeState())
        // 显示归零走 microtask：effect 体内同步 setState 会级联渲染（react-hooks
        // 规则禁止）。phase 无需同步恢复——新一轮 finished=false，上一轮的
        // leaving/hidden 由微任务重置为 active（旧收尾定时器已清理，不会覆盖）
        queueMicrotask(() => {
          setPercent(0)
          setPhase('active')
        })
      }
      s.lastKey = reloadKey
      s.lastKeySet = true
    }
    if (s.finished) return

    /** 单调发布进度 */
    const publish = (p: number) => {
      if (p > s.shown) {
        s.shown = p
        setPercent(p)
      }
    }

    /** 阶段 C：收尾——跳 100%、停留后淡出隐藏 */
    const finish = () => {
      if (s.finished) return
      s.finished = true
      window.clearTimeout(settleTimer.current)
      window.clearTimeout(globalTimer.current)
      window.clearTimeout(safetyTimer.current)
      setPercent(100)
      fadeTimer.current = window.setTimeout(() => setPhase('leaving'), FADE_DELAY_MS)
      hideTimer.current = window.setTimeout(() => setPhase('hidden'), HIDE_DELAY_MS)
    }

    // —— 阶段 B：真实瓦片统计（引擎就绪 + 样式已注入） ——
    let detach: (() => void) | null = null
    if (mlMap && reloadKey) {
      if (mlMap.loaded()) {
        // 首次初始化路径：onReady 暴露实例时首批瓦片已渲染完（事件已错过），
        // 无加载过程可统计，直接收尾
        finish()
      } else {
        s.tracking = true
        window.clearTimeout(globalTimer.current)
        const minReal = Math.max(s.shown, REAL_MIN)

        const publishReal = () => {
          const total = s.done + s.inflight
          if (total <= 0) return
          publish(minReal + (s.done / total) * (REAL_MAX - minReal))
        }

        // 瓦片开始加载（content）：进行中 +1，取消静默收尾（新瓦片陆续被发现）。
        // metadata 事件（source 元数据就绪）不算瓦片，必须过滤
        const onTileLoading = (e: MapSourceDataEvent) => {
          if (e.dataType !== 'source' || e.sourceDataType !== 'content') return
          if (s.finished) return
          s.settled = false
          window.clearTimeout(settleTimer.current)
          s.inflight += 1
          publishReal()
        }

        // 计入一枚已完成瓦片：全部归零后静默 SETTLE_MS 即收尾。
        // maplibre 约定：每个 sourcedataloading(content) 之后必跟 sourcedata /
        // sourcedataabort / error 之一，三处都计数才能保证 inflight 归零
        const completeTile = () => {
          if (s.finished) return
          if (s.inflight > 0) s.inflight -= 1
          s.done += 1
          publishReal()
          if (s.inflight === 0 && !s.settled) {
            s.settled = true
            settleTimer.current = window.setTimeout(finish, SETTLE_MS)
          }
        }

        // 瓦片结束（成功 sourcedata / 中止 sourcedataabort），同样只认 content
        const onTileDone = (e: MapSourceDataEvent) => {
          if (e.dataType !== 'source' || e.sourceDataType !== 'content') return
          completeTile()
        }

        // 瓦片失败（error 无 sourceDataType 字段）：仅在有进行中瓦片时计数，
        // 避免与瓦片无关的 error 虚增 done 抬高进度
        const onTileError = () => {
          if (s.inflight > 0) completeTile()
        }

        mlMap.on('sourcedataloading', onTileLoading)
        mlMap.on('sourcedata', onTileDone)
        mlMap.on('sourcedataabort', onTileDone)
        mlMap.on('error', onTileError)
        // idle = 全部瓦片渲染完毕且无进行中的相机动画，作为收尾的权威兜底
        mlMap.on('idle', finish)
        // 兜底：极端情况下事件流异常（如样式彻底失败），超时强制结束避免常驻
        safetyTimer.current = window.setTimeout(finish, SAFETY_MS)

        detach = () => {
          mlMap.off('sourcedataloading', onTileLoading)
          mlMap.off('sourcedata', onTileDone)
          mlMap.off('sourcedataabort', onTileDone)
          mlMap.off('error', onTileError)
          mlMap.off('idle', finish)
          window.clearTimeout(safetyTimer.current)
        }
      }
    }

    // —— 阶段 A：占位等待假进度（未进入真实统计时缓升，保证黑底期有提示） ——
    let tickId = 0
    tickId = window.setInterval(() => {
      if (s.finished || s.tracking) {
        window.clearInterval(tickId)
        return
      }
      const t = performance.now() - s.startedAt
      // 引擎正以离线样式初始化（load 后 onReady 即收尾）→ 上限 80%；
      // 其余等待（占位底图 / 引擎初始化）→ 上限 30%
      const cap = reloadKey && !mlMap ? INIT_CAP : IDLE_CAP
      publish(cap * (1 - Math.exp(-t / IDLE_TAU_MS)))
    }, TICK_MS)

    // —— 阶段 A 兜底：迟迟没有离线包激活（无包极端场景）时完成收尾 ——
    window.clearTimeout(globalTimer.current)
    if (!s.tracking && !s.finished) {
      globalTimer.current = window.setTimeout(finish, IDLE_TIMEOUT_MS)
    }

    return () => {
      detach?.()
      window.clearInterval(tickId)
      // 注意：settle/global/safety/fade/hide 属于流程状态，effect 重跑不清理
      // （保持进度连续），仅在新一轮重置或组件卸载时清理
    }
  }, [map, reloadKey])

  // 组件卸载：清理所有挂起定时器
  useEffect(
    () => () => {
      window.clearTimeout(settleTimer.current)
      window.clearTimeout(fadeTimer.current)
      window.clearTimeout(hideTimer.current)
      window.clearTimeout(globalTimer.current)
      window.clearTimeout(safetyTimer.current)
    },
    [],
  )

  if (phase === 'hidden') return null

  return (
    <div
      className={`map-load-progress${phase === 'leaving' ? ' map-load-progress--leaving' : ''}`}
      role="status"
      aria-label="地图加载进度"
    >
      <Progress
        type="dashboard"
        percent={Math.round(percent)}
        strokeColor={CONIC_COLORS}
        railColor="rgba(148, 163, 184, 0.18)"
        strokeWidth={10}
        size={96}
        /* 百分比文字用 antd6 语义化 styles.indicator 内联注入：内联样式优先级
           高于 antd CSS-in-JS 的 class 规则（默认 colorText 黑色），任何注入
           顺序下都必定生效；配合 CSS 文件中的同名规则作双保险 */
        styles={{
          indicator: {
            background:
              'linear-gradient(180deg, #ffffff 0%, #c8f8ff 50%, #5ee7ff 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
            fontWeight: 700,
            fontSize: '20px',
            lineHeight: 1,
          },
        }}
      />
      <span className="map-load-progress__label">
        {percent >= 100 ? '加载完成' : '地图加载中'}
      </span>
    </div>
  )
}
