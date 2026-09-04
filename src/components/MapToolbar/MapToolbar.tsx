import { useEffect, useState } from 'react'
import { toolbarItems } from '../../config/toolbar'
import { useDeviceLinkStore } from '../../stores/deviceLinkStore'
import { useTargetLinkStore } from '../../stores/targetLinkStore'
import { DeviceManagementPanel } from '../DeviceManagementPanel/DeviceManagementPanel'
import { TargetListPanel } from '../TargetListPanel/TargetListPanel'
import './MapToolbar.css'

const FADE_MS = 500

/** 面板淡入/淡出：mounted 控制 DOM 是否存在；visible 控制淡入/淡出 class */
function useFadeMount(isOpen: boolean): [boolean, boolean] {
  const [mounted, setMounted] = useState(isOpen)
  const [visible, setVisible] = useState(false)

  // 打开：渲染期直接挂载（visible 仍为 false，先以 opacity:0 入场）
  if (isOpen && !mounted) setMounted(true)
  // 关闭：渲染期立即摘掉 visible 触发淡出（DOM 保留 FADE_MS 播完动画后卸载）
  if (!isOpen && visible) setVisible(false)

  // 淡入：双 rAF 确保浏览器先把 opacity:0 渲染出来，再加 visible 触发过渡
  useEffect(() => {
    if (!isOpen || visible) return
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setVisible(true))
    })
    return () => window.cancelAnimationFrame(raf)
  }, [isOpen, visible])

  // 淡出：isOpen 变 false 后延迟 FADE_MS 卸载 DOM
  useEffect(() => {
    if (isOpen || !mounted) return
    const timer = window.setTimeout(() => setMounted(false), FADE_MS)
    return () => window.clearTimeout(timer)
  }, [isOpen, mounted])

  return [mounted, visible]
}

export function MapToolbar() {
  const [active, setActive] = useState(-1)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // Open device panel when aircraft icon on home page is clicked (counter signal).
  // 计数器变化在渲染期直接派生 active（避免 effect 内同步 setState）。
  const devicePanelOpenRequests = useDeviceLinkStore((s) => s.devicePanelOpenRequests)
  const [lastDevReq, setLastDevReq] = useState(devicePanelOpenRequests)
  if (devicePanelOpenRequests !== lastDevReq) {
    setLastDevReq(devicePanelOpenRequests)
    if (devicePanelOpenRequests > 0) setActive(0)
  }

  // Open target list panel when target icon on home page is clicked (counter signal)
  const targetPanelOpenRequests = useTargetLinkStore((s) => s.targetPanelOpenRequests)
  const [lastTgtReq, setLastTgtReq] = useState(targetPanelOpenRequests)
  if (targetPanelOpenRequests !== lastTgtReq) {
    setLastTgtReq(targetPanelOpenRequests)
    if (targetPanelOpenRequests > 0) setActive(4)
  }

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
