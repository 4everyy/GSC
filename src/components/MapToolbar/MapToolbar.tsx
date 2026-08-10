import { useEffect, useRef, useState } from 'react'
import { toolbarItems } from '../../config/toolbar'
import { DeviceManagementPanel } from '../DeviceManagementPanel/DeviceManagementPanel'
import './MapToolbar.css'

const FADE_MS = 500

export function MapToolbar() {
  const [active, setActive] = useState(-1)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // 预加载 hover / active 背景图：首次 hover/click 时浏览器才开始下载这些图片，
  // 下载完成前会闪现空白，产生"背景图片替换"的闪烁感。
  // 组件挂载时用 Image() 提前拉取，后续切换即从缓存秒读。
  useEffect(() => {
    const urls = new Set<string>()
    toolbarItems.forEach((item) => {
      urls.add(item.background.hover)
      urls.add(item.background.active)
    })
    const imgEls: HTMLImageElement[] = []
    urls.forEach((url) => {
      const img = new Image()
      img.src = url
      imgEls.push(img)
    })
    return () => {
      imgEls.length = 0
    }
  }, [])

  // 设备面板：mounted 控制 DOM 是否存在；visible 控制淡入/淡出 class
  const [deviceMounted, setDeviceMounted] = useState(false)
  const [deviceVisible, setDeviceVisible] = useState(false)
  const unmountTimer = useRef<number | null>(null)

  const clearUnmountTimer = () => {
    if (unmountTimer.current) {
      window.clearTimeout(unmountTimer.current)
      unmountTimer.current = null
    }
  }

  // active 切换 → 驱动挂载/卸载 + 淡入/淡出
  useEffect(() => {
    clearUnmountTimer()
    if (active === 0) {
      // 打开：先挂载，下一帧再加 visible 触发淡入
      setDeviceMounted(true)
      const raf = window.requestAnimationFrame(() => {
        // 双 rAF 确保浏览器先把 opacity:0 渲染出来
        window.requestAnimationFrame(() => setDeviceVisible(true))
      })
      return () => window.cancelAnimationFrame(raf)
    } else {
      // 关闭：移除 visible 触发淡出，延迟卸载
      setDeviceVisible(false)
      unmountTimer.current = window.setTimeout(() => setDeviceMounted(false), FADE_MS)
      return clearUnmountTimer
    }
  }, [active])

  return (
    <div className="map-toolbar-wrapper">
      <aside className="map-toolbar" aria-label="地图工具栏">
        {toolbarItems.map((item, index) => {
          let bgImage = item.background.normal
          if (active === index) {
            bgImage = item.background.active
          } else if (hoveredIndex === index) {
            bgImage = item.background.hover
          }

          return (
            <button
              className={active === index ? 'is-active' : ''}
              key={item.label}
              onClick={() => setActive(active === index ? -1 : index)}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              title={item.label}
              type="button"
              style={{ backgroundImage: `url(${bgImage})` }}
            >
              <img className={`toolbar-icon toolbar-icon--${index + 1}`} src={item.icon} alt="" />
            </button>
          )
        })}
      </aside>
      {deviceMounted && (
        <DeviceManagementPanel visible={deviceVisible} onClose={() => setActive(-1)} />
      )}
    </div>
  )
}