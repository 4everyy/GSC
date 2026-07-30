import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { loadBMapGL } from '../../utils/loadBMapGL'
import { wgs84ToBd09 } from '../../utils/coordTransform'
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_OPTIONS,
  DEFAULT_MAP_TYPE,
  DEFAULT_MAP_ZOOM,
} from '../../config/map'
import './BMapContainer.css'

/** "我的位置"标注图标（蓝色光点 + 光晕），使用内联 SVG 无需图片资源 */
const LOCATION_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
  <circle cx="22" cy="22" r="18" fill="#1e90ff" fill-opacity="0.15"/>
  <circle cx="22" cy="22" r="11" fill="#1e90ff" fill-opacity="0.3"/>
  <circle cx="22" cy="22" r="7" fill="#1e90ff" stroke="#fff" stroke-width="2.5"/>
</svg>`

/** 在地图上添加"我的位置"标注：精度圆 + 蓝色光点 Marker */
function addLocationMarker(map: BMapGL.Map, point: BMapGL.Point, accuracy: number) {
  // 精度圆：直观展示定位误差范围
  map.addOverlay(
    new BMapGL.Circle(point, accuracy, {
      strokeColor: '#1e90ff',
      strokeWeight: 1,
      strokeOpacity: 0.4,
      fillColor: '#1e90ff',
      fillOpacity: 0.12,
    }),
  )

  // 蓝色光点标注
  const icon = new BMapGL.Icon(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOCATION_ICON_SVG)}`,
    new BMapGL.Size(44, 44),
    { anchor: new BMapGL.Size(22, 22) },
  )
  map.addOverlay(new BMapGL.Marker(point, { icon }))
}

/** 地图中心点坐标 */
interface MapCenter {
  lng: number
  lat: number
}

/** BMapContainer 组件属性 */
interface BMapContainerProps {
  /** 自定义容器类名 */
  className?: string
  /** 地图初始中心点，默认深圳 */
  center?: MapCenter
  /** 地图初始缩放级别，默认 14 */
  zoom?: number
  /** 地图实例就绪回调，父级可借此添加覆盖物或绑定事件 */
  onReady?: (map: BMapGL.Map) => void
  /** 叠加在地图之上的 DOM 覆盖物（如飞行器、限制区） */
  children?: ReactNode
}

/**
 * 百度地图 GL 容器组件。
 *
 * 职责：
 * - 动态加载百度地图 SDK 并在容器内初始化 `BMapGL.Map` 实例；
 * - 暴露加载中 / 加载失败状态，便于上层展示空态或重试；
 * - 通过 `onReady` 将地图实例交给父级，供其添加覆盖物或监听事件；
 * - 组件卸载时销毁地图实例，避免内存泄漏。
 */
export function BMapContainer({
  className,
  center = DEFAULT_MAP_CENTER,
  zoom = DEFAULT_MAP_ZOOM,
  onReady,
  children,
}: BMapContainerProps) {
  // 地图渲染容器 DOM 引用
  const containerRef = useRef<HTMLDivElement>(null)
  // 地图实例引用，用于卸载时销毁
  const mapRef = useRef<BMapGL.Map | null>(null)
  // onReady 回调的最新引用，避免闭包过期
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  // 加载状态：loading / success / error
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    // 容器尚未挂载，无法初始化地图
    if (!containerRef.current) return

    // 标记 effect 是否已清理，防止异步回调在卸载后操作实例
    let cancelled = false

    // 1. 加载 SDK -> 2. 初始化地图实例 -> 3. 通知父级
    loadBMapGL()
      .then(() => {
        if (cancelled || !containerRef.current) return

        // 语义标识 -> BMapGL 全局常量映射
        const mapTypeMap: Record<string, number | undefined> = {
          normal: BMapGL.BMAP_NORMAL_MAP,
          satellite: BMapGL.BMAP_SATELLITE_MAP,
          hybrid: BMapGL.BMAP_HYBRID_MAP,
        }
        const mapType = mapTypeMap[DEFAULT_MAP_TYPE]

        // 创建地图实例并设置中心点、缩放级别与地图类型（卫星图）
        const map = new BMapGL.Map(containerRef.current, DEFAULT_MAP_OPTIONS)
        const point = new BMapGL.Point(center.lng, center.lat)
        map.centerAndZoom(point, zoom)
        if (mapType !== undefined) map.setMapType(mapType)
        mapRef.current = map

        // GL 版默认未开启滚轮缩放，显式启用各项交互以确保生效
        map.enableScrollWheelZoom(true)
        map.enableDragging()
        map.enableDoubleClickZoom()
        map.enableKeyboard()
        map.enableInertialDragging()
        map.enableRotate()
        map.enableTilt()

        setStatus('success')
        // 通知父级地图已就绪
        onReadyRef.current?.(map)

        // ============ 定位逻辑（带回退机制） ============
        // 方案 A：百度地图 SDK 定位（直接返回 BD09 坐标，国内精度优）
        // 方案 B：浏览器原生 Geolocation（WGS84 → BD09 转换），作为回退
        // 两者均失败时保留默认中心点，不影响地图正常使用

        /** 浏览器原生定位回退：WGS84 坐标转换为 BD09 后添加标注 */
        const fallbackToBrowser = () => {
          if (typeof navigator === 'undefined' || !navigator.geolocation) return
          navigator.geolocation.getCurrentPosition(
            (position) => {
              if (cancelled || !mapRef.current) return
              const { longitude, latitude } = position.coords
              const bd = wgs84ToBd09(longitude, latitude)
              const target = new BMapGL.Point(bd.lng, bd.lat)
              mapRef.current.panTo(target)
              addLocationMarker(mapRef.current, target, position.coords.accuracy ?? 80)
            },
            () => {
              /* 浏览器定位也失败，保留默认中心点 */
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
          )
        }

        // 优先尝试百度 SDK 定位
        const geo = new BMapGL.Geolocation()
        geo.enableHighAccuracy = true
        geo.getCurrentPosition(
          function (result) {
            if (cancelled || !mapRef.current) return
            if (this.getStatus() !== BMapGL.BMAP_STATUS_SUCCESS) {
              // 百度定位失败，回退到浏览器原生定位
              fallbackToBrowser()
              return
            }
            const target = result.point
            mapRef.current.panTo(target)
            addLocationMarker(mapRef.current, target, result.accuracy ?? 50)
          },
          () => {
            // 百度定位异常，回退到浏览器原生定位
            fallbackToBrowser()
          },
        )
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setStatus('error')
        setErrorMsg(err instanceof Error ? err.message : '地图加载失败')
      })

    // 清理：销毁地图实例，释放资源
    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.destroy()
        mapRef.current = null
      }
    }
    // center/zoom 仅作为初始值，不放入依赖，避免地图重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={`bmap-container ${className ?? ''}`}>
      {/* 地图渲染容器 */}
      <div ref={containerRef} className="bmap-canvas" />

      {/* 加载态遮罩 */}
      {status === 'loading' && <div className="bmap-status bmap-status--loading">地图加载中…</div>}

      {/* 错误态遮罩 */}
      {status === 'error' && (
        <div className="bmap-status bmap-status--error">
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 叠加在地图之上的 DOM 覆盖物层 */}
      {status === 'success' && <div className="bmap-overlay">{children}</div>}
    </div>
  )
}