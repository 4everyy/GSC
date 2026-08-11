/**
 * 地图资源切换全局状态 —— React Context。
 *
 * 持有用户对地图显示的选择：
 * - basemap：底图样式（dark 矢量暗色 / satellite 卫星影像）；
 * - cityKey：矢量城市数据源 key（苏州/南京/…，对应 tileserver-gl 的 data 段 key）；
 * - flyToCityOnSwitch：切换城市时是否自动飞到该市中心。
 *
 * 派生：
 * - activeStyleUrl：当前底图的基础 style URL（用于首次加载）；
 * - activeStyleSpec：按 basemap + cityKey 解析并改写后的完整 StyleSpecification
 *   （buildCityStyle 产出），用于运行时热切换（map.setStyle）。
 *
 * 持久化：选择项存 localStorage（键 gcs:map-display），刷新后恢复。
 *
 * 与 OfflineMapContext 分离：后者管下载/缓存（IndexedDB，重数据），
 * 本 Context 管显示偏好（localStorage，轻 UI 偏好），关注点不同。
 */
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { StyleSpecification } from 'maplibre-gl'
import {
  MAPLIBRE_BASEMAPS,
  MAPLIBRE_DEFAULT_BASEMAP,
  MAPLIBRE_DEFAULT_CITY_KEY,
  type MapBasemap,
} from '../../config/mapLibre'
import { buildCityStyle } from './buildCityStyle'

/** 持久化的用户选择 */
export interface MapDisplayState {
  basemap: MapBasemap
  cityKey: string
  flyToCityOnSwitch: boolean
}

/** Context 暴露的值 */
export interface MapDisplayContextValue extends MapDisplayState {
  setBasemap: (b: MapBasemap) => void
  setCityKey: (k: string) => void
  setFlyToCityOnSwitch: (b: boolean) => void
  /** 当前底图基础 style URL（首次加载用） */
  activeStyleUrl: string
  /** 改写后的完整 style spec（运行时热切换用）；未就绪时为 null */
  activeStyleSpec: StyleSpecification | null
  /** spec 异步解析中 */
  specLoading: boolean
  /** spec 解析失败信息 */
  specError: string | null
}

const STORAGE_KEY = 'gcs:map-display'

const DEFAULT_STATE: MapDisplayState = {
  basemap: MAPLIBRE_DEFAULT_BASEMAP,
  cityKey: MAPLIBRE_DEFAULT_CITY_KEY,
  flyToCityOnSwitch: true,
}

/** 从 localStorage 读取并校验（容错：非法值回退默认） */
function loadPersisted(): MapDisplayState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<MapDisplayState>
    return {
      basemap:
        parsed.basemap === 'dark' || parsed.basemap === 'satellite'
          ? parsed.basemap
          : DEFAULT_STATE.basemap,
      cityKey:
        typeof parsed.cityKey === 'string' && parsed.cityKey.trim()
          ? parsed.cityKey
          : DEFAULT_STATE.cityKey,
      flyToCityOnSwitch:
        typeof parsed.flyToCityOnSwitch === 'boolean'
          ? parsed.flyToCityOnSwitch
          : DEFAULT_STATE.flyToCityOnSwitch,
    }
  } catch {
    return DEFAULT_STATE
  }
}

export const MapDisplayContext = createContext<MapDisplayContextValue | null>(null)

export function MapDisplayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MapDisplayState>(loadPersisted)
  const { basemap, cityKey, flyToCityOnSwitch } = state

  const setBasemap = useCallback(
    (b: MapBasemap) => setState((p) => ({ ...p, basemap: b })),
    [],
  )
  const setCityKey = useCallback(
    (k: string) => setState((p) => ({ ...p, cityKey: k })),
    [],
  )
  const setFlyToCityOnSwitch = useCallback(
    (b: boolean) => setState((p) => ({ ...p, flyToCityOnSwitch: b })),
    [],
  )

  // 持久化到 localStorage（隐私模式/不可用时静默）
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* ignore */
    }
  }, [state])

  const activeStyleUrl = MAPLIBRE_BASEMAPS[basemap].url

  // 派生：按 basemap + cityKey 异步构建改写后的 style spec
  const [activeStyleSpec, setActiveStyleSpec] = useState<StyleSpecification | null>(null)
  const [specLoading, setSpecLoading] = useState(false)
  const [specError, setSpecError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSpecLoading(true)
    setSpecError(null)
    buildCityStyle(activeStyleUrl, cityKey)
      .then((spec) => {
        if (cancelled) return
        setActiveStyleSpec(spec)
        setSpecLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setSpecError(err instanceof Error ? err.message : '样式加载失败')
        setActiveStyleSpec(null)
        setSpecLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeStyleUrl, cityKey])

  const value = useMemo<MapDisplayContextValue>(
    () => ({
      basemap,
      cityKey,
      flyToCityOnSwitch,
      setBasemap,
      setCityKey,
      setFlyToCityOnSwitch,
      activeStyleUrl,
      activeStyleSpec,
      specLoading,
      specError,
    }),
    [
      basemap,
      cityKey,
      flyToCityOnSwitch,
      setBasemap,
      setCityKey,
      setFlyToCityOnSwitch,
      activeStyleUrl,
      activeStyleSpec,
      specLoading,
      specError,
    ],
  )

  return (
    <MapDisplayContext.Provider value={value}>{children}</MapDisplayContext.Provider>
  )
}
