/**
 * @file MapToolbar.tsx
 * @description MapToolbar（自 MapChrome.tsx 拆出）—— 左侧工具栏：按钮高亮切换 + 四联面板（设备/区域/任务/目标） 的挂载编排，全部经 useFadeMount 处理淡入淡出（复用共享 hook）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { toolbarItems } from '../../config/index'
import { useDeviceLinkStore } from '../../stores/index'
import { useEffect, useState } from 'react'
import { useTargetLinkStore } from '../../stores/targetLinkStore'
import { DeviceManagementPanel } from '../DeviceManagementPanel/DeviceManagementPanel'
import { AreaListPanel } from '../AreaPanels/AreaPanels'
import { TargetListPanel } from '../TargetListPanel/TargetListPanel'
import { TaskListPanel } from '../TaskListPanel/TaskListPanel'
import { useFadeMount } from './useFadeMount'

export function MapToolbar() {
  const [active, setActive] = useState(-1)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // Open device panel when aircraft icon on home page is clicked (counter…
  const devicePanelOpenRequests = useDeviceLinkStore((s) => s.devicePanelOpenRequests)
  const [lastDevReq, setLastDevReq] = useState(devicePanelOpenRequests)
  if (devicePanelOpenRequests !== lastDevReq) {
    setLastDevReq(devicePanelOpenRequests)
    if (devicePanelOpenRequests > 0) setActive(0)
  }

  // Open target list panel when target icon on hom…
  const targetPanelOpenRequests = useTargetLinkStore((s) => s.targetPanelOpenRequests)
  const [lastTgtReq, setLastTgtReq] = useState(targetPanelOpenRequests)
  if (targetPanelOpenRequests !== lastTgtReq) {
    setLastTgtReq(targetPanelOpenRequests)
    if (targetPanelOpenRequests > 0) setActive(4)
  }

  // 预加载 hover / active 背景图：首次 hover/click 时浏览器才开始下载这些图片
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

  // 第 1 个按钮：设备管理面板
  const [deviceMounted, deviceVisible] = useFadeMount(active === 0)
  const [areaMounted, areaVisible] = useFadeMount(active === 1)
  const [taskMounted, taskVisible] = useFadeMount(active === 3)
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
      {areaMounted && <AreaListPanel visible={areaVisible} onClose={() => setActive(-1)} />}
      {taskMounted && <TaskListPanel visible={taskVisible} onClose={() => setActive(-1)} />}
      {targetMounted && (
        <TargetListPanel visible={targetVisible} onClose={() => setActive(-1)} />
      )}
    </div>
  )
}
