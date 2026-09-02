/**
 * WaypointFlightPanels —— 航点飞行面板组：航点飞行 + 滑动二次确认弹窗（自 HomePage.tsx 拆出）。
 * 纯展示组件：面板状态经 panels/anims 分组传入，按需解构。
 */
import { SlideConfirmDialog } from '../../../../components/SlideConfirmDialog/SlideConfirmDialog'
import { WaypointFlightPanel } from '../../../../components/WaypointFlightPanel/WaypointFlightPanel'
import { aircraft } from '../../../../config/aircraft'
import { homeImages } from '../../../../assets/images/home'
import type { useExclusivePanels } from '../../hooks/useExclusivePanels'
import type { useFlightAnimations } from '../../hooks/useFlightAnimations'

interface WaypointFlightPanelsProps {
  panels: ReturnType<typeof useExclusivePanels>
  anims: ReturnType<typeof useFlightAnimations>
  aircraft: typeof aircraft
  selectedDevices: Set<number>
  areaLandingSpots: { x: number; y: number }[]
  aircraftPositions: { x: number; y: number }[]
}

export function WaypointFlightPanels({ panels, anims, aircraft, selectedDevices, areaLandingSpots, aircraftPositions }: WaypointFlightPanelsProps) {
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
              console.info(`[takeoff] 确认起飞，高度 ${takeoffSlide.height}m`)
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
              console.info('[landing] 确认降落')
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
              console.info(`[waypoint-flight] 确认航点飞行，高度 ${waypointSlide.height}m`)
              // 确认后启动循环模拟飞行：无人机沿已生成实线航线飞向航点图钉并无限循环；
              // 面板保持展开，「取消」或重新「航线生成」取点可随时终止
              if (waypointPoint) {
                const flyIdx = aircraft.findIndex((a) => selectedDevices.has(a.deviceIndex))
                const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
                if (flyIdx !== -1 && stage) {
                  startWaypointFlight(
                    {
                      x1: stage.left + (aircraftPositions[flyIdx].x / 100) * stage.width + 24,
                      y1: stage.top + (aircraftPositions[flyIdx].y / 100) * stage.height + 24,
                      x2: waypointPoint.x,
                      y2: waypointPoint.y,
                    },
                    aircraft[flyIdx].src,
                  )
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
                    routeFlightPoints.map((pt) => ({ x: pt.x, y: pt.y })),
                    aircraft[flyIdx].src,
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