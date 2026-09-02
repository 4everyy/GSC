/**
 * FlightCommandPanels —— 飞行指令面板组：起飞/降落/返航/指点返航/区域降落/悬停（自 HomePage.tsx 拆出）。
 * 纯展示组件：面板状态经 panels/anims 分组传入，按需解构。
 */
import { AreaLandingPanel } from '../../../../components/AreaLandingPanel/AreaLandingPanel'
import { HoverPanel } from '../../../../components/HoverPanel/HoverPanel'
import { LandingPanel } from '../../../../components/LandingPanel/LandingPanel'
import { ReturnHomePanel } from '../../../../components/ReturnHomePanel/ReturnHomePanel'
import { TakeoffPanel } from '../../../../components/TakeoffPanel/TakeoffPanel'
import { TapReturnPanel } from '../../../../components/TapReturnPanel/TapReturnPanel'
import { aircraft } from '../../../../config/aircraft'
import type { useExclusivePanels } from '../../hooks/useExclusivePanels'
import type { useFlightAnimations } from '../../hooks/useFlightAnimations'
import type { AircraftListItem } from '../../../../components/AircraftListPanel/AircraftListSection'

interface FlightCommandPanelsProps {
  panels: ReturnType<typeof useExclusivePanels>
  anims: ReturnType<typeof useFlightAnimations>
  aircraft: typeof aircraft
  selectedAircraft: AircraftListItem[]
  handleRemoveAircraft: (id: string) => void
  selectedDevices: Set<number>
  aircraftPositions: { x: number; y: number }[]
}

export function FlightCommandPanels({ panels, anims, aircraft, selectedAircraft, handleRemoveAircraft, selectedDevices, aircraftPositions }: FlightCommandPanelsProps) {
  const {
    takeoffOpen,
    landingOpen,
    returnHomeOpen,
    tapReturnOpen,
    areaLandingOpen,
    hoverOpen,
    setTakeoffOpen,
    setLandingOpen,
    setReturnHomeOpen,
    setTapReturnOpen,
    setAreaLandingOpen,
    setHoverOpen,
    returnHomeLines,
    setReturnHomeLines,
    returnHomeConfirmed,
    tapReturnConfirmed,
    setTapReturnConfirmed,
    tapReturnPoint,
    tapReturnPointConfirmed,
    setTapReturnPoint,
    tapReturnRouteReady,
    setTapReturnRouteReady,
    setTapReturnLine,
    areaLandingTab,
    setAreaLandingTab,
    areaLandingSpeed,
    setAreaLandingSpeed,
    areaLandingFormation,
    setAreaLandingFormation,
    areaLandingRect,
    setAreaLandingRect,
    areaLandingCorners,
    setAreaLandingCorners,
    areaLandingRouteGenerated,
    setAreaLandingRouteGenerated,
    areaLandingConfirmed,
    setAreaLandingConfirmed,
    setTakeoffSlide,
    setLandingSlide,
    setReturnHomeSlide,
    setTapReturnSlide,
    setAreaLandingSlide,
    setHoverSlide,
  } = panels
  const {
    stopTapReturnFlight,
  } = anims
  return (
    <>
          {/* 起飞参数面板：点击底部「起飞」按钮后在右上角展开，按钮保持弹出状态；
              确认/取消均收起面板（确认暂记录参数，待接入真实指令链路） */}
          {takeoffOpen && (
            <TakeoffPanel
              aircraft={selectedAircraft}
              onRemove={handleRemoveAircraft}
              onConfirm={(height) => {
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                setTakeoffSlide({ open: true, height })
              }}
              onCancel={() => setTakeoffOpen(false)}
            />
          )}

          {/* 降落面板：点击底部「降落」按钮后在右上角展开（与起飞面板互斥），按钮保持弹出状态；
              打开后地图光标变指点标记，图钉实时跟随鼠标并与选中飞机虚线连线（#00FF95），
              左键点击定格航点（虚线变实线）；确认/取消均收起面板并清除图钉连线 */}
          {landingOpen && (
            <LandingPanel
              aircraft={selectedAircraft}
              onRemove={handleRemoveAircraft}
              onConfirm={() => {
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                setLandingSlide({ open: true })
              }}
              onCancel={() => setLandingOpen(false)}
            />
          )}

          {/* 返航面板：点击底部「返航」按钮后在右上角展开（与其他功能面板互斥），按钮保持弹出状态；
              参数设置/飞机列表 tab + 返航高度步进（editable 手动键入）；
              交互状态流：打开面板即可点「航线生成」（高度默认 10m 有效）→
              点击「航线生成」为每架选中飞机画出/重画返航线并解禁「确认」（returnHomeLines 联动），
              确认走滑动二次确认弹窗后启动循环模拟飞行（面板保持展开，取消时终止） */}
          {returnHomeOpen && (
            <ReturnHomePanel
              aircraft={selectedAircraft}
              onRemove={handleRemoveAircraft}
              confirmMuted={returnHomeConfirmed || !returnHomeLines || returnHomeLines.length === 0}
              middleMuted={!!returnHomeLines && returnHomeLines.length > 0}
              onGenerateRoute={() => {
                // 置灰守卫：航线已生成时按钮置灰，点击兜底拦截（保持已生成航线不变）；
                // 需重新生成时先「取消」收起面板再重开（关闭时航线自动清除）
                if (returnHomeLines && returnHomeLines.length > 0) return
                // 航线生成：每架选中飞机均由其图标中心向正上方各自的返航标记画绿色实线；
                // 未选中飞机则忽略（保持「确认」置灰）
                // DOM measured anchors (viewport coords) instead of hard-coded offsets:
                // aircraft icon center -> each selected plane's return marker bottom edge.
                // getBoundingClientRect() matches the fixed full-viewport SVG
                // (.tap-return-route) user space, so the lines always connect the icons
                // regardless of CSS spacing/drag state.
                const aircraftEls = document.querySelectorAll<HTMLElement>('.map-stage .aircraft')
                const lines: { x1: number; y1: number; x2: number; y2: number }[] = []
                aircraft.forEach((item, idx) => {
                  if (!selectedDevices.has(item.deviceIndex)) return
                  const aircraftEl = aircraftEls[idx]
                  const iconEl = aircraftEl?.querySelector('img')
                  const markerEl = aircraftEl?.querySelector('.aircraft-return-indicator__ground')
                  if (!aircraftEl || !iconEl || !markerEl) return
                  const iconRect = iconEl.getBoundingClientRect()
                  const markerRect = markerEl.getBoundingClientRect()
                  lines.push({
                    x1: iconRect.left + iconRect.width / 2,
                    y1: iconRect.top + iconRect.height / 2,
                    x2: markerRect.left + markerRect.width / 2,
                    y2: markerRect.bottom,
                  })
                })
                setReturnHomeLines(lines.length > 0 ? lines : null)
              }}
              onConfirm={(height) => {
                // 置灰守卫：未生成返航航线/已确认过时不弹确认弹窗（按钮视觉置灰兜底拦截）
                if (!returnHomeLines || returnHomeConfirmed) return
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                setReturnHomeSlide({ open: true, height })
              }}
              onCancel={() => setReturnHomeOpen(false)}
            />
          )}

          {/* 指点返航面板（与起飞/降落/返航面板互斥），按钮保持弹出状态；
              参数设置区块头 + 返航高度步进 + 航点信息坐标 + 确认/航线生成/取消三按钮，
              确认启动循环模拟飞行（面板保持展开，直至手动取消）；取消终止动画并收起面板 */}
          {tapReturnOpen && (
            <TapReturnPanel
              waypoint={tapReturnPoint}
              confirmMuted={!tapReturnRouteReady || tapReturnConfirmed}
              // 缃伆鏉′欢锛氳埅绾垮凡鐢熸垚 鎴?钀界偣鏈‘璁わ紙灏氭湭鐐瑰嚮鍥鹃拤涓嬫柟銆岀‘瀹氥€嶆寜閽潯锛夋椂
              // 銆岃埅绾跨敓鎴愩€嶆寜閽疆鐏扳€斺€斿厛鍦ㄥ湴鍥句笂纭钀界偣锛屽啀鍥為潰鏉跨敓鎴愯埅绾?nl              middleMuted={tapReturnRouteReady || !tapReturnPointConfirmed}
              onConfirm={(height) => {
                // 置灰守卫：未生成航线/已确认过时不弹确认弹窗（按钮视觉置灰兜底拦截）
                if (!tapReturnRouteReady || tapReturnConfirmed) return
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                setTapReturnSlide({ open: true, height })
              }}
              onGenerateRoute={() => {
                // 置灰守卫：航线已生成时按钮置灰，点击兜底拦截（保持已生成航线不变）；
                // 需重新生成时先「取消」收起面板再重开（关闭时落点/航线自动清除）
                if (tapReturnRouteReady || !tapReturnPointConfirmed) return
                // 航线生成：由选中飞机图标中心向落点画 1px #00FF95 连线（SVG 视口屏幕坐标）；
                // 连线两端锚定不随地图移动的 DOM 图标，地图缩放/平移不会断开；
                // 确实画出连线后才解除「确认」置灰（未取点/未选中飞机则保持置灰）
                if (!tapReturnPoint) return
                const idx = aircraft.findIndex((a) => selectedDevices.has(a.deviceIndex))
                if (idx === -1) return
                // 飞机图标按百分比挂在 .map-stage 上，换算为视口像素取图标中心（+24）
                const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
                if (!stage) return
                setTapReturnLine({
                  x1: stage.left + (aircraftPositions[idx].x / 100) * stage.width + 24,
                  y1: stage.top + (aircraftPositions[idx].y / 100) * stage.height + 24,
                  x2: tapReturnPoint.x,
                  y2: tapReturnPoint.y,
                })
                setTapReturnRouteReady(true)
              }}
              onCancel={() => {
                // 手动取消：终止循环飞行动画并清除落点/连线/确认标记，收起面板
                stopTapReturnFlight()
                setTapReturnPoint(null)
                setTapReturnConfirmed(false)
                setTapReturnOpen(false)
              }}
            />
          )}

          {/* 区域降落面板（与其他功能面板互斥）：参数设置 tab（降落速度步进 m/s + 降落编队选择）/ 飞机列表 tab，确认（置灰）/ 航线生成/ 取消三按钮，确认/ 取消均收起面板（确认暂记录日志，待接入指令链路） */}
          {areaLandingOpen && (
            <AreaLandingPanel
              aircraft={selectedAircraft}
              onRemove={handleRemoveAircraft}
              // 置灰条件：未框选区域 或 航线已生成时「航线生成」按钮置灰（防重复生成，
              // 守卫已在 onGenerateRoute 兜底）；需重新绘制时先「取消」收起面板再重进框选
              routeMuted={!areaLandingRect || areaLandingRouteGenerated}
              // 置灰条件：未生成航线 或 指令已确认时「确认」按钮置灰（防重复下发指令）
              confirmMuted={!areaLandingRouteGenerated || areaLandingConfirmed}
              tab={areaLandingTab}
              onTabChange={setAreaLandingTab}
              speed={areaLandingSpeed}
              onSpeedChange={setAreaLandingSpeed}
              formation={areaLandingFormation}
              onFormationChange={setAreaLandingFormation}
              corners={areaLandingCorners}
              onConfirm={(speed, formation) => {
                // 置灰守卫：未生成航线/已确认过时不弹确认弹窗（按钮视觉置灰兜底拦截）
                if (!areaLandingRouteGenerated || areaLandingConfirmed) return
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                setAreaLandingSlide({ open: true, speed, formation })
              }}
              onGenerateRoute={() => {
                // 置灰守卫：未确定降落区域时按钮置灰，点击兜底拦截
                if (!areaLandingRect) return
                // 已生成时再次点击：保持面板展开与已生成航线不变（防止误点收起面板）；
                // 需重新绘制区域时先点「取消」收起面板，再点底部「区域降落」按钮重进框选
                if (areaLandingRouteGenerated) return
                // 首次生成：按所选降落编队在已确认区域内布置降落坪（数量=选中飞机数）
                // 并与各飞机绘制绿色实线航线；「确认」按钮随生成成功解除置灰
                setAreaLandingRouteGenerated(true)
              }}
              onCancel={() => {
                setAreaLandingRect(null)
                setAreaLandingCorners(null)
                setAreaLandingRouteGenerated(false)
                // 确认置灰标记随面板取消一并复位，重开面板恢复可确认
                setAreaLandingConfirmed(false)
                setAreaLandingOpen(false)
              }}
            />
          )}

          {/* 悬停面板（与其他功能面板互斥）：标题 + 飞机列表 + 确认/取消，
              打开后地图光标变指点标记，图钉实时跟随鼠标并与选中飞机虚线连线（#00FF95），
              左键点击定格航点（虚线变实线）；确认/取消均收起面板并清除图钉连线 */}
          {hoverOpen && (
            <HoverPanel
              aircraft={selectedAircraft}
              onRemove={handleRemoveAircraft}
              onConfirm={() => {
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                setHoverSlide({ open: true })
              }}
              onCancel={() => setHoverOpen(false)}
            />
          )}
    </>
  )
}
