import { AreaLandingPanel } from '../../AreaPanels/AreaPanels'
import { HoverPanel, SlideConfirmDialog, PanelShell } from '../../PanelKit/PanelKit'
import { LandingPanel, ReturnHomePanel, TakeoffPanel, TapReturnPanel, WaypointFlightPanel } from '../../FlightActionPanels/FlightActionPanels'
import { aircraft } from '../../../config/index'
import { type useExclusivePanels } from '../../../hooks/useExclusivePanels'
import { type useFlightAnimations } from '../../../hooks/useFlightAnimations'
import { homeImages } from '../../../assets/images/home/index'
import '../../PanelKit/PanelKit.css'
import { deviceImages } from '../../../assets/images/device/index'
import { podControlLand, podControlTakeoff, podControlWaypoint } from '../../../api/index'
import { observeDownlink } from '../../../features/realtime/wsClient'
import { usePlaneStatusStore } from '../../../stores/index'
import { type useMapEngine } from '../../../hooks/index'

/**
 * FlightCommandPanels —— 飞行指令面板组：起飞/降落/返航/指点返航/区域降落/悬停（自 HomePage.tsx 拆出）。
 * 纯展示组件：面板状态经 panels/anims 分组传入，按需解构。
 */

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
                // DOM measured anchors (viewport coords) instead or hard-coded offsets:
                // aircraft icon center -> each selected plane's return marker bottom edge.
                // getBoundingClientRect() matches the fixed full-viewport SVG
                // (.tap-return-route) user space, so the lines always connect the icons
                // regardless or CSS spacing/drag state.
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
              // 返航高度支持手动键入；面板族默认不设上限（TapReturnPanel 内置，最低 1m）
              editable
              confirmMuted={!tapReturnRouteReady || tapReturnConfirmed}
              // 缃伆鏉′欢锛氳埅绾垮凡鐢熸垚 鎴?钀界偣鏈‘璁わ紙灏氭湭鐐瑰嚮鍥鹃拤涓嬫柟銆岀‘瀹氥€嶆寜閽潯锛夋椂
              // Muted when route already generated or landing point not yet confirmed
              middleMuted={tapReturnRouteReady || !tapReturnPointConfirmed}
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

/**
 * WaypointFlightPanels —— 航点飞行面板组：航点飞行 + 滑动二次确认弹窗（自 HomePage.tsx 拆出）。
 * 纯展示组件：面板状态经 panels/anims 分组传入，按需解构。
 */

interface WaypointFlightPanelsProps {
  panels: ReturnType<typeof useExclusivePanels>
  anims: ReturnType<typeof useFlightAnimations>
  aircraft: typeof aircraft
  selectedDevices: Set<number>
  areaLandingSpots: { x: number; y: number }[]
  aircraftPositions: { x: number; y: number }[]
  /** 地图适配器：航点飞行动效按 WS 遥测经纬度每帧重投影（跟随地图平移/缩放） */
  adapter: ReturnType<typeof useMapEngine>['adapter']
}

export function WaypointFlightPanels({ panels, anims, aircraft, selectedDevices, areaLandingSpots, aircraftPositions, adapter }: WaypointFlightPanelsProps) {
  // 接口原始设备列表（保留无人机主键 id）：起飞指令按选中设备 id 逐架下发
  const rawPlanes = usePlaneStatusStore((s) => s.rawPlanes)
  const {
    waypointFlightOpen,
    setTakeoffOpen,
    setLandingOpen,
    setHoverOpen,
    setWaypointFlightOpen,
    returnHomeLines,
    setReturnHomeConfirmed,
    setTapReturnConfirmed,
    tapReturnLine,
    areaLandingRect,
    areaLandingRouteGenerated,
    setAreaLandingConfirmed,
    waypointHover,
    setWaypointHover,
    waypointPoint,
    setWaypointPoint,
    setWaypointPickingActive,
    waypointRouteGenerated,
    setWaypointRouteGenerated,
    waypointFlightConfirmed,
    setWaypointFlightConfirmed,
    routeFlightPoints,
    setRouteFlightConfirmed,
    takeoffSlide,
    setTakeoffSlide,
    landingSlide,
    setLandingSlide,
    returnHomeSlide,
    setReturnHomeSlide,
    tapReturnSlide,
    setTapReturnSlide,
    areaLandingSlide,
    setAreaLandingSlide,
    hoverSlide,
    setHoverSlide,
    waypointSlide,
    setWaypointSlide,
    routeSlide,
    setRouteSlide,
  } = panels
  const {
    startTapReturnFlight,
    startWaypointFlight,
    stopWaypointFlight,
    startRouteFlightAnimation,
    startReturnHomeFlights,
    startAreaLandingFlights,
  } = anims
  return (
    <>

          {/* 航点飞行面板（与其他功能面板互斥）：参数设置区块头 + 飞行高度步进 + 航点信息坐标 + 确认（置灰）/航线生成/取消三按钮，
              点击「航线生成」后地图光标变航点图钉，图钉实时跟随鼠标并与选中飞机虚线连线（1px #00FF95），
              左键点击定格航点（保持虚线）后恢复光标，点击「航线生成」后虚线定格为实线；确认/取消均收起面板并清除图钉连线 */}
          {waypointFlightOpen && (
            <WaypointFlightPanel
              waypoint={waypointPoint ?? waypointHover}
              confirmMuted={!waypointRouteGenerated || waypointFlightConfirmed}
              middleMuted={waypointRouteGenerated}
              onConfirm={(height) => {
                // 置灰守卫：未生成实线航线或指令已确认过时不弹确认弹窗（按钮视觉置灰兜底拦截）
                if (!waypointRouteGenerated || waypointFlightConfirmed) return
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                setWaypointSlide({ open: true, height })
              }}
              onGenerateRoute={() => {
                // 置灰守卫：航线已生成时按钮置灰，点击兜底拦截（保持已生成航线不变）；
                // 需重新生成时先「取消」收起面板再重开（关闭时航线自动清除）
                if (waypointRouteGenerated) return
                // 航线生成：已定格航点（虚线）→ 虚线定格为实线；
                // 左键定格航点后退出取点，面板保留可继续确认/取消
                if (waypointPoint) {
                  setWaypointRouteGenerated(true)
                } else {
                  setWaypointPoint(null)
                  setWaypointHover(null)
                  setWaypointPickingActive(true)
                }
              }}
              onCancel={() => setWaypointFlightOpen(false)}
            />
          )}

          {/* 起飞滑动二次确认弹窗（复用 SlideConfirmDialog）：滑到最右松手执行确认并收起面板，
              点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={takeoffSlide.open}
            title="起飞"
            message="执行起飞指令"
            onConfirm={() => {
              // 起飞指令下发（POST /api/v1/control/podControl）：对设备管理面板选中的
              // 每架无人机下发 actionType=40，height 取起飞面板高度步进器设定值；
              // fire-and-forget：成功/失败记录日志（toast 反馈待后续接入）
              const height = takeoffSlide.height ?? 0
              const planeIds = [...selectedDevices]
                .sort((a, b) => a - b)
                .map((index) => rawPlanes[index]?.id)
                .filter((id): id is string => !!id)
              // 指令发出即开 15s 下行观测窗口：检验后端是否通过 WS 推送回执/状态变更
              // （窗口结束输出分频道结论：cmd=指令回执、device=设备状态回执，见 observeDownlink）
              void observeDownlink(15_000, `takeoff×${planeIds.length}`)
              // REST 下发结果计数：全部失败时飞机根本未进入起飞流程，device 频道无状态推送属预期
              // （避免 WS 观测结论误判为服务端推送问题——先排查 REST 链路）
              let restFailCount = 0
              planeIds.forEach((planeId) => {
                podControlTakeoff(planeId, height)
                  .then(() => console.info(`[takeoff] 起飞指令已发送：${planeId}，高度 ${height}m`))
                  .catch((err) => {
                    restFailCount += 1
                    console.error(`[takeoff] 起飞指令下发失败：${planeId}`, err)
                    if (restFailCount === planeIds.length) {
                      console.warn(
                        '[takeoff] ⚠ 全部起飞指令 REST 下发失败——指令未进入后端执行流程，观测窗口内 device 频道无推送属预期，请先排查 REST 链路',
                      )
                    }
                  })
              })
              setTakeoffSlide((s) => ({ ...s, open: false }))
              setTakeoffOpen(false)
            }}
            onCancel={() => setTakeoffSlide((s) => ({ ...s, open: false }))}
          />

          {/* 降落滑动二次确认弹窗（复用 SlideConfirmDialog）：滑到最右松手执行确认并收起面板，
              点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={landingSlide.open}
            title="降落"
            message="执行降落指令"
            onConfirm={() => {
              // 降落指令下发（POST /api/v1/control/podControl）：对设备管理面板选中的
              // 每架无人机下发 actionType=41（与起飞同接口，无指令参数）；
              // fire-and-forget：成功/失败记录日志（toast 反馈待后续接入）
              const planeIds = [...selectedDevices]
                .sort((a, b) => a - b)
                .map((index) => rawPlanes[index]?.id)
                .filter((id): id is string => !!id)
              // 中断航点飞行动效状态机（climbing/following → idle）：降落指令与航点
              // 跟飞互斥，动效图标随状态清空立即消失，位置交还 AircraftLayer 遥测渲染
              stopWaypointFlight()
              // 指令发出即开 15s 下行观测窗口：检验后端是否通过 WS 推送回执/状态变更
              //（窗口结束输出分频道结论：cmd=指令回执、device=设备状态回执，见 observeDownlink）
              void observeDownlink(15_000, `land×${planeIds.length}`)
              // REST 下发结果计数：全部失败时指令未进入后端执行流程，device 频道
              // 无状态推送属预期（避免 WS 观测结论误判为服务端推送问题——先排查 REST 链路）
              let restFailCount = 0
              planeIds.forEach((planeId) => {
                podControlLand(planeId)
                  .then(() => console.info(`[landing] 降落指令已发送：${planeId}`))
                  .catch((err) => {
                    restFailCount += 1
                    console.error(`[landing] 降落指令下发失败：${planeId}`, err)
                    if (restFailCount === planeIds.length) {
                      console.warn(
                        '[landing] ⚠ 全部降落指令 REST 下发失败——指令未进入后端执行流程，观测窗口内 device 频道无推送属预期，请先排查 REST 链路',
                      )
                    }
                  })
              })
              setLandingSlide({ open: false })
              setLandingOpen(false)
            }}
            onCancel={() => setLandingSlide({ open: false })}
          />

          {/* 返航滑动二次确认弹窗（复用 SlideConfirmDialog）：滑到最右松手执行确认并启动循环模拟飞行
              （面板保持展开），点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={returnHomeSlide.open}
            title="返航"
            message="执行返航指令"
            onConfirm={() => {
              console.info(`[return-home] 确认返航，高度 ${returnHomeSlide.height}m`)
              // 中断航点飞行动效状态机（climbing/following → idle）：返航与航点跟飞
              // 互斥，动效图标随状态清空立即消失，位置交还 AircraftLayer 遥测渲染
              stopWaypointFlight()
              // 确认后启动循环模拟飞行：各选中无人机沿已生成航线飞向对应 H 返航标记
              // 并无限循环（多机并行）；面板保持展开，「取消」按钮可随时手动终止循环。
              // 航线与飞行图标同源配对：均按 aircraft 数组顺序过滤选中设备
              if (returnHomeLines && returnHomeLines.length > 0) {
                const icons = aircraft
                  .filter((item) => selectedDevices.has(item.deviceIndex))
                  .map((item) => item.src)
                startReturnHomeFlights(returnHomeLines, icons)
              }
              // 确认成功：置灰「确认」按钮（防止重复下发返航指令）；面板关闭时自动复位
              setReturnHomeConfirmed(true)
              setReturnHomeSlide((s) => ({ ...s, open: false }))
            }}
            onCancel={() => setReturnHomeSlide((s) => ({ ...s, open: false }))}
          />

          {/* 指点返航滑动二次确认弹窗（复用 SlideConfirmDialog）：滑到最右松手执行确认并启动循环模拟飞行
              （面板保持展开），点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={tapReturnSlide.open}
            title="指点返航"
            message="执行指点返航指令"
            onConfirm={() => {
              console.info(`[tap-return] 确认指点返航，高度 ${tapReturnSlide.height}m`)
              // 确认后启动循环模拟飞行：无人机沿已生成航线飞向落点图钉并无限循环；
              // 面板保持展开，「取消」按钮可随时手动终止循环
              if (tapReturnLine) {
                const flyIdx = aircraft.findIndex((a) => selectedDevices.has(a.deviceIndex))
                startTapReturnFlight(
                  tapReturnLine,
                  flyIdx !== -1 ? aircraft[flyIdx].src : homeImages.aircraftRed,
                )
              }
              // 确认成功：置灰「确认」按钮（防止重复下发指点返航指令）；面板关闭/重新取点时自动复位
              setTapReturnConfirmed(true)
              setTapReturnSlide((s) => ({ ...s, open: false }))
            }}
            onCancel={() => setTapReturnSlide((s) => ({ ...s, open: false }))}
          />

          {/* 区域降落滑动二次确认弹窗（复用 SlideConfirmDialog）：滑到最右松手执行确认并启动循环模拟飞行
              （面板保持展开），点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={areaLandingSlide.open}
            title="区域降落"
            message="执行区域降落指令"
            onConfirm={() => {
              console.info(
                '[area-landing] 确认区域降落，速度 ' +
                  areaLandingSlide.speed +
                  'm/s，编队 ' +
                  areaLandingSlide.formation +
                  (areaLandingRect
                    ? '，选区 ' +
                      areaLandingRect.width +
                      'x' +
                      areaLandingRect.height +
                      '@(' +
                      areaLandingRect.left +
                      ',' +
                      areaLandingRect.top +
                      ')'
                    : '，未框选区域'),
              )
              // 确认后启动循环模拟飞行：各选中无人机沿已生成航线飞向对应降落坪并无限循环；
              // 面板保持展开，「取消」按钮/删除重绘可随时手动终止循环。
              // 航线端点与降落坪连线渲染同源：飞机图标中心（+24）→ 第 i 个降落坪
              if (areaLandingRouteGenerated && areaLandingSpots.length > 0) {
                const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
                if (stage) {
                  // 选中飞机按设备序号升序与降落坪一一对应（与航线渲染的 picked 完全一致）
                  const pickedFlights = aircraft
                    .map((item, index) => ({ item, index }))
                    .filter(({ item }) => selectedDevices.has(item.deviceIndex))
                    .sort((a, b) => a.item.deviceIndex - b.item.deviceIndex)
                  const routes = pickedFlights
                    .map(({ index }, i) =>
                      areaLandingSpots[i]
                        ? {
                            x1: stage.left + (aircraftPositions[index].x / 100) * stage.width + 24,
                            y1: stage.top + (aircraftPositions[index].y / 100) * stage.height + 24,
                            x2: areaLandingSpots[i].x,
                            y2: areaLandingSpots[i].y,
                          }
                        : null,
                    )
                    .filter(
                      (r): r is { x1: number; y1: number; x2: number; y2: number } => r !== null,
                    )
                  startAreaLandingFlights(routes, pickedFlights.map(({ item }) => item.src))
                }
              }
              // 确认成功：置灰「确认」按钮（防止重复下发区域降落指令）；面板关闭/选区失效时自动复位
              setAreaLandingConfirmed(true)
              setAreaLandingSlide((s) => ({ ...s, open: false }))
            }}
            onCancel={() => setAreaLandingSlide((s) => ({ ...s, open: false }))}
          />

          {/* 悬停滑动二次确认弹窗（复用 SlideConfirmDialog）：滑到最右松手执行确认并收起面板，
              点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={hoverSlide.open}
            title="悬停"
            message="执行悬停指令"
            onConfirm={() => {
              console.info('[hover] 确认悬停')
              setHoverSlide({ open: false })
              setHoverOpen(false)
            }}
            onCancel={() => setHoverSlide({ open: false })}
          />

          {/* 航点飞行滑动二次确认弹窗（可复用 SlideConfirmDialog）：滑到最右松手执行确认并收起面板，
              点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={waypointSlide.open}
            title="航点飞行"
            message="执行航点飞行指令"
            onConfirm={() => {
              // 航点指令下发（POST /v1/control/podControl）：对设备管理面板选中的每架
              // 无人机下发 actionType=48，geopoint = 地图定格航点的 WGS84 经纬度
              //（waypointPoint 取点时经 adapter.unproject 换算）+ 面板飞行高度；
              // fire-and-forget：成功/失败记录日志（toast 反馈待后续接入）
              const height = waypointSlide.height
              if (waypointPoint) {
                const planeIds = [...selectedDevices]
                  .sort((a, b) => a - b)
                  .map((index) => rawPlanes[index]?.id)
                  .filter((id): id is string => !!id)
                // 指令发出即开 15s 下行观测窗口：检验后端是否通过 WS 推送回执/状态变更
                void observeDownlink(15_000, `waypoint×${planeIds.length}`)
                planeIds.forEach((planeId) => {
                  podControlWaypoint(planeId, {
                    height,
                    longitude: waypointPoint.lng,
                    latitude: waypointPoint.lat,
                  })
                    .then(() =>
                      console.info(
                        `[waypoint-flight] 航点飞行指令已发送：${planeId} → (${waypointPoint.lng.toFixed(6)}, ${waypointPoint.lat.toFixed(6)}) 高度 ${height}m`,
                      ),
                    )
                    .catch((err) =>
                      console.error(`[waypoint-flight] 航点飞行指令下发失败：${planeId}`, err),
                    )
                })
              }
              // 确认后启动两阶段连贯动效：①高度过渡——自当前遥测高度匀速爬升/下降
              // 至面板设定飞行高度；②航点平飞——按 WS 遥测经纬度（telemetry[planeId]）
              // 经地图适配器每帧重投影驱动图标实时飞向航点（报文驱动、平滑插值）。
              // 面板保持展开，「取消」或重新「航线生成」取点可随时终止
              if (waypointPoint) {
                const flyIdx = aircraft.findIndex((a) => selectedDevices.has(a.deviceIndex))
                const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
                if (flyIdx !== -1 && stage) {
                  const firstPlaneId = [...selectedDevices]
                    .sort((a, b) => a - b)
                    .map((index) => rawPlanes[index]?.id)
                    .filter((id): id is string => !!id)[0]
                  startWaypointFlight({
                    planeId: firstPlaneId,
                    icon: aircraft[flyIdx].src,
                    adapter,
                    waypoint: {
                      x: waypointPoint.x,
                      y: waypointPoint.y,
                      lng: waypointPoint.lng,
                      lat: waypointPoint.lat,
                    },
                    targetHeight: height,
                    aircraftX: stage.left + (aircraftPositions[flyIdx].x / 100) * stage.width + 24,
                    aircraftY: stage.top + (aircraftPositions[flyIdx].y / 100) * stage.height + 24,
                  })
                }
              }
              // 确认成功：置灰「确认」按钮（防止重复下发航点飞行指令）；面板关闭时自动复位
              setWaypointFlightConfirmed(true)
              setWaypointSlide((s) => ({ ...s, open: false }))
            }}
            onCancel={() => setWaypointSlide((s) => ({ ...s, open: false }))}
          />

          {/* 航线飞行滑动二次确认弹窗（复用 SlideConfirmDialog）：滑到最右松手执行确认并收起面板，
              点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={routeSlide.open}
            title="航线飞行"
            message="执行航线飞行指令"
            onConfirm={() => {
              console.info(
                `[route-flight] 确认航线飞行，高度 ${routeSlide.height}m，航点 ${routeFlightPoints.length} 个`,
              )
              // 确认后启动循环模拟飞行：无人机沿已生成实线航线依次飞过各航点并无限循环；
              // 面板保持展开，「取消」或重新「航线生成」取点/删除航点可随时终止
              if (routeFlightPoints.length > 0) {
                const flyIdx = aircraft.findIndex((a) => selectedDevices.has(a.deviceIndex))
                if (flyIdx !== -1) {
                  startRouteFlightAnimation(
                    routeFlightPoints.map((pt) => ({
                      x: pt.x,
                      y: pt.y,
                      lng: pt.lng,
                      lat: pt.lat,
                    })),
                    aircraft[flyIdx].src,
                    adapter,
                  )
                }
              }
              // 确认成功：置灰「确认」按钮（防止重复下发航线飞行指令）；面板关闭/航点清空时自动复位
              setRouteFlightConfirmed(true)
              setRouteSlide((s) => ({ ...s, open: false }))
            }}
            onCancel={() => setRouteSlide((s) => ({ ...s, open: false }))}
          />

    </>
  )
}

/**
 * AircraftListPanel —— 飞机列表面板（公共组件，降落/返航等同类指令面板共用）。
 *
 * 结构（对应设计稿 box_5，260×469）：
 * - 外壳（深色玻璃背景/右上切角/标题/底部确认取消按钮）复用 PanelShell；
 * - 内部「飞机列表」区块复用 AircraftListSection（区块头 + 列表行 + 行删除）。
 */

export interface AircrartListPanelProps {
  /** 面板标题（如「降落」） */
  title: string
  /** 无障碍名称，缺省为「{title}面板」 */
  ariaLabel?: string
  /** 页面级定位钩子类名（如 landing-panel） */
  className?: string
  /** 区块标题，默认「飞机列表」 */
  sectionTitle?: string
  /** 飞机列表，缺省使用设计稿示例数据 */
  aircraft?: AircraftListItem[]
  /** 行删除回调（取消选中该机）；传入后行尾显示删除图标 */
  onRemove?: (id: string) => void
  /** 确认指令（确认降落） */
  onConfirm: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function AircraftListPanel({
  title,
  ariaLabel,
  className,
  sectionTitle = '飞机列表',
  aircraft = DEFAULT_AIRCRAFT,
  onRemove,
  onConfirm,
  onCancel,
}: AircrartListPanelProps) {
  return (
    <PanelShell
      title={title}
      ariaLabel={ariaLabel}
      className={className}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <AircraftListSection sectionTitle={sectionTitle} aircraft={aircraft} onRemove={onRemove} />
    </PanelShell>
  )
}

/**
 * AircraftListSection —— 「飞机列表」区块（从 AircraftListPanel 抽取的公共子组件）。
 *
 * 包含区块头（渐变底 + 下划青色渐隐线，可隐藏）+ 可滚动列表行（名称/高度/电量/信号/删除）。
 * 供 AircraftListPanel（降落等列表面板）、ReturnHomePanel（返航面板的飞机列表 tab）
 * 及 TakeoffPanel（起飞面板的飞机列表 tab）共用。
 *
 * 传入 onRemove 时行尾渲染删除图标（取消该机选中）；未传入则不渲染，
 * 默认示例数据场景（无联动）不受影响。
 */

export interface AircraftListItem {
  /** 唯一标识 */
  id: string
  /** 显示名称，如「01中科曙光」 */
  name: string
  /** 当前高度（米） */
  altitude: number
  /** 电量百分比（0~100） */
  battery: number
}

export interface AircrartListSectionProps {
  /** 区块标题，默认「飞机列表」 */
  sectionTitle?: string
  /** 是否显示区块头标题（起飞面板等 tab 下不需要重复标题时置 false） */
  showSectionTitle?: boolean
  /** 飞机列表，缺省使用设计稿示例数据 */
  aircraft?: AircraftListItem[]
  /** 行删除回调（取消选中该机）；传入后行尾显示删除图标 */
  onRemove?: (id: string) => void
}


export function AircraftListSection({
  sectionTitle = '飞机列表',
  showSectionTitle = true,
  aircraft = DEFAULT_AIRCRAFT,
  onRemove,
}: AircrartListSectionProps) {
  return (
    <>
      {/* 区块头「飞机列表」（group_3/group_4）：渐变底 + 下划青色渐隐线（可隐藏） */}
      {showSectionTitle && (
        <div className="aircraft-list-panel__section">
          <span className="aircraft-list-panel__section-title">{sectionTitle}</span>
        </div>
      )}

      {/* 列表区（group_5）：244px 静态行，行多时可滚动 */}
      <div className="aircraft-list-panel__list">
        <div className="aircraft-list-panel__scrollwrap">
          <div className="aircraft-list-panel__rows">
            {aircraft.map((item) => {
              // 电量填充宽度按百分比折算（电池内框最大 9px 宽）
              const batteryFill = Math.max(2, Math.round((item.battery / 100) * 9))
              return (
                <div className="aircraft-list-panel__row" key={item.id}>
                  <span className="aircraft-list-panel__name">{item.name}</span>

                  {/* 高度：↑ 切图（14×14）+ 数值 */}
                  <span className="aircraft-list-panel__metric">
                    <img
                      className="aircraft-list-panel__metric-icon"
                      src={deviceImages.altitudeIcon}
                      alt=""
                      draggable={false}
                    />
                    <span className="aircraft-list-panel__metric-value">{item.altitude}m</span>
                  </span>

                  {/* 电量：电池图标（18×18）+ 百分比 */}
                  <span className="aircraft-list-panel__metric">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                      <rect x="0.5" y="5.5" width="13" height="7" rx="1" stroke="#fff" />
                      <rect x="14.5" y="7.5" width="2.5" height="3" rx="0.5" fill="#fff" />
                      <rect x="2.5" y="7.5" width={batteryFill} height="3" rx="0.5" fill="#fff" />
                    </svg>
                    <span className="aircraft-list-panel__metric-value">{item.battery}%</span>
                  </span>

                  {/* 删除（行尾图标）：传入 onRemove 时渲染为可点击删除按钮 */}
                  {onRemove ? (
                    <button
                      type="button"
                      className="aircraft-list-panel__signal aircraft-list-panel__signal-btn"
                      aria-label={`取消选中 ${item.name}`}
                      title={`取消选中 ${item.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemove(item.id)
                      }}
                    >
                    <img
                      className="aircraft-list-panel__signal-img"
                      src={homeImages.iconDelete}
                      alt=""
                      draggable={false}
                    />
                    </button>
                  ) : (
                    <img className="aircraft-list-panel__signal aircraft-list-panel__signal-img" src={homeImages.iconDelete} alt="" draggable={false} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}


/** 设计稿示例数据（group_6/7/8） */
export const DEFAULT_AIRCRAFT: AircraftListItem[] = [
  { id: '01', name: '01中科曙光', altitude: 40, battery: 100 },
  { id: '02', name: '02中科曙光', altitude: 40, battery: 100 },
  { id: '03', name: '03中科曙光', altitude: 40, battery: 100 },
]
