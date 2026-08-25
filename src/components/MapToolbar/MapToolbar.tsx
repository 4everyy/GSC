import { useEffect, useRef, useState } from 'react'
import { toolbarItems } from '../../config/toolbar'
import { useDeviceLinkStore } from '../../stores/deviceLinkStore'
import { DeviceManagementPanel } from '../DeviceManagementPanel/DeviceManagementPanel'
import { TargetListPanel } from '../TargetListPanel/TargetListPanel'
import './MapToolbar.css'

const FADE_MS = 500

/** 面板淡入/淡出：mounted 控制 DOM 是否存在；visible 控制淡入/淡出 class */
function useFadeMount(isOpen: boolean): [boolean, boolean] {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const unmountTimer = useRef<number | null>(null)

  const clearTimer = () => {
    if (unmountTimer.current) {
      window.clearTimeout(unmountTimer.current)
      unmountTimer.current = null
    }
  }

  useEffect(() => {
    clearTimer()
    if (isOpen) {
      // 打开：先挂载，下一帧再加 visible 触发淡入
      setMounted(true)
      const raf = window.requestAnimationFrame(() => {
        // 双 rAF 确保浏览器先把 opacity:0 渲染出来
        window.requestAnimationFrame(() => setVisible(true))
      })
      return () => window.cancelAnimationFrame(raf)
    }
    // 关闭：移除 visible 触发淡出，延迟卸载
    setVisible(false)
    unmountTimer.current = window.setTimeout(() => setMounted(false), FADE_MS)
    return clearTimer
  }, [isOpen])

  return [mounted, visible]
}

export function MapToolbar() {
  const [active, setActive] = useState(-1)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // Open device panel when aircraft icon on home page is clicked (counter signal)
  const devicePanelOpenRequests = useDeviceLinkStore((s) => s.devicePanelOpenRequests)
  useEffect(() => {
    if (devicePanelOpenRequests > 0) {
      setActive(0)
    }
  }, [devicePanelOpenRequests])

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

  // 第 1 个按钮：设备管理面板；第 5 个按钮：目标列表面板
  const [deviceMounted, deviceVisible] = useFadeMount(active === 0)
  const [targetMounted, targetVisible] = useFadeMount(active === 4)

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
      {targetMounted && (
        <TargetListPanel visible={targetVisible} onClose={() => setActive(-1)} />
      )}
    </div>
  )
}
