/**
 * @file WaypointFlightPanels.tsx
 * @description 航点飞行面板与滑动确认（含 podControl 起降/航点指令下发）
 * @author 4everyy
 * @date 2026-10-07
 */
import { SlideConfirmDialog } from '../../PanelKit/PanelKit'
import { WaypointFlightPanel } from '../../FlightActionPanels/FlightActionPanels'
import { aircraft } from '../../../config/index'
import { type useExclusivePanels } from '../../../hooks/useExclusivePanels'
import { type useFlightAnimations } from '../../../hooks/useFlightAnimations'
import { homeImages } from '../../../assets/home/index'
import { podControlLand, podControlTakeoff, podControlWaypoint } from '../../../api/index'
import { observeDownlink, waitForCommandReceipt } from '../../../features/realtime/downlinkObserve'
import { usePlaneStatusStore } from '../../../stores/index'
import { resolvePlaneSrc } from '../../../lib/planeIcons'
import { type useMapEngine } from '../../../hooks/index'
import '../../PanelKit/PanelKit.css'

/** WaypointFlightPanels —— 航点飞行面板组：航点飞行 + 滑动二次确认弹窗（自 HomePage.tsx 拆出）。 */

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

export function WaypointFlightPanels({
  panels,
  anims,
  aircraft,
  selectedDevices,
  areaLandingSpots,
  aircraftPositions,
  adapter,
}: WaypointFlightPanelsProps) {
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
            // 置灰守卫：航线已生成时按钮置灰，点击兜底拦截（保持已生成航线不变）
            if (waypointRouteGenerated) return
            // 航线生成：已定格航点（虚线）→ 虚线定格为实线
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
          // 起飞指令下发（POST /api/v1/control/podControl）：对设备管理面板选中的每架无人机下发 actionType=40
          const height = takeoffSlide.height ?? 0
          const planeIds = [...selectedDevices]
            .sort((a, b) => a - b)
            .map((index) => rawPlanes[index]?.id)
            .filter((id): id is string => !!id)
          // 检验后端是否通过 WS 推送回执/状态变更…
          void observeDownlink(15_000, `takeoff×${planeIds.length}`)
          // REST 下发结果计数：全部失败时飞机根本未进入起飞流程，device 频道无状态推送属预期…
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
          // 对设备管理面板选中的每架无人机下发 actionType=4…
          const planeIds = [...selectedDevices]
            .sort((a, b) => a - b)
            .map((index) => rawPlanes[index]?.id)
            .filter((id): id is string => !!id)
          // 中断航点飞行动效状态机（climbing/following → idle）：降落指令与航点跟飞互斥
          stopWaypointFlight()
          // 检验后端是否通过 WS 推送回执/状态变更…
          void observeDownlink(15_000, `land×${planeIds.length}`)
          // REST 下发结果计数：全部失败时指令未进入后端执行流程，device 频道无状态推送属预期…
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
          // 中断航点飞行动效状态机（climbing/following → idle）：返航与航点跟飞互斥
          stopWaypointFlight()
          // 确认后启动循环模拟飞行：各选中无人机沿已生成航线飞向对应 H 返航标记并无限循环（多机并行）
          if (returnHomeLines && returnHomeLines.length > 0) {
            const devices = usePlaneStatusStore.getState().devices
            const icons = aircraft
              .filter((item) => selectedDevices.has(item.deviceIndex))
              .map((item) => resolvePlaneSrc(devices, item.deviceIndex, item.src))
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
          // 确认后启动循环模拟飞行：无人机沿已生成航线飞向落点图钉并无限循环
          if (tapReturnLine) {
            const flyIdx = aircraft.findIndex((a) => selectedDevices.has(a.deviceIndex))
            startTapReturnFlight(
              tapReturnLine,
              flyIdx !== -1
                ? resolvePlaneSrc(
                    usePlaneStatusStore.getState().devices,
                    aircraft[flyIdx].deviceIndex,
                    aircraft[flyIdx].src,
                  )
                : homeImages.aircraftRed,
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
          // 确认后启动循环模拟飞行：各选中无人机沿已生成航线飞向对应降落坪并无限循环
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
                .filter((r): r is { x1: number; y1: number; x2: number; y2: number } => r !== null)
              startAreaLandingFlights(
                routes,
                pickedFlights.map(({ item }) =>
                  resolvePlaneSrc(
                    usePlaneStatusStore.getState().devices,
                    item.deviceIndex,
                    item.src,
                  ),
                ),
              )
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
          // 航点飞行指令下发（POST /v1/control/podControl，与起飞同 URL）：对设备管理面板选中的每架无人机下发 actionType=48
          const height = waypointSlide.height
          if (waypointPoint) {
            const planeIds = [...selectedDevices]
              .sort((a, b) => a - b)
              .map((index) => rawPlanes[index]?.id)
              .filter((id): id is string => !!id)
            // 指令发出即开 15s 下行观测窗口：检验后端是否通过 WS 推送回执/状态变更
            void observeDownlink(15_000, `waypoint×${planeIds.length}`)
            // 动效参数快照（弹窗即将关闭）：首机索引与主键先行解析
            const flyIdx = aircraft.findIndex((a) => selectedDevices.has(a.deviceIndex))
            const firstPlaneId = planeIds[0]
            planeIds.forEach((planeId) => {
              podControlWaypoint(planeId, {
                height,
                longitude: waypointPoint.lng,
                latitude: waypointPoint.lat,
              })
                .then(async () => {
                  console.info(
                    `[waypoint-flight] 航点飞行指令已发送：${planeId} → (${waypointPoint.lng.toFixed(6)}, ${waypointPoint.lat.toFixed(6)}) 高度 ${height}m`,
                  )
                  // 仅首机走「回执门控 → 动效」链路（动效图标为单机）
                  if (planeId !== firstPlaneId) return
                  // ② 等待服务端 WS 回执：cmdAck（宽口径匹配，REST podControl 无reqId，单机场景可接受）或该机遥测帧
                  const receipt = await waitForCommandReceipt(planeId, 10_000)
                  if (receipt === null) {
                    console.warn(
                      `[waypoint-flight] ${planeId} 10s 内未收到服务端回执（cmdAck/遥测），动效不启动（指令已发出，不重复下发）`,
                    )
                    return
                  }
                  console.info(
                    `[waypoint-flight] ${planeId} 收到服务端回执（${receipt}），启动遥测驱动动效`,
                  )
                  if (flyIdx === -1) {
                    console.warn('[waypoint-flight] 未找到选中飞机图标，动效未启动')
                    return
                  }
                  // ③ 两阶段连贯动效（先到高度再平飞）：阶段一「高度调整」——垂直于初始态无人机图标向上/向下移动（水平钉住起飞点）
                  const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
                  if (!stage) {
                    console.warn('[waypoint-flight] 未找到 .map-stage，动效未启动')
                    return
                  }
                  startWaypointFlight({
                    planeId: firstPlaneId,
                    icon: resolvePlaneSrc(
                      usePlaneStatusStore.getState().devices,
                      aircraft[flyIdx].deviceIndex,
                      aircraft[flyIdx].src,
                    ),
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
                })
                .catch((err) =>
                  console.error(`[waypoint-flight] 航点飞行指令下发失败：${planeId}`, err),
                )
            })
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
          // ①高度调整——自当前高度…
          if (routeFlightPoints.length > 0) {
            const flyIdx = aircraft.findIndex((a) => selectedDevices.has(a.deviceIndex))
            const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
            if (flyIdx !== -1 && stage) {
              const firstPlaneId = [...selectedDevices]
                .sort((a, b) => a - b)
                .map((index) => rawPlanes[index]?.id)
                .filter((id): id is string => !!id)[0]
              startRouteFlightAnimation(
                routeFlightPoints.map((pt) => ({
                  x: pt.x,
                  y: pt.y,
                  lng: pt.lng,
                  lat: pt.lat,
                })),
                resolvePlaneSrc(
                  usePlaneStatusStore.getState().devices,
                  aircraft[flyIdx].deviceIndex,
                  aircraft[flyIdx].src,
                ),
                adapter,
                {
                  planeId: firstPlaneId,
                  targetHeight: routeSlide.height,
                  aircraftX: stage.left + (aircraftPositions[flyIdx].x / 100) * stage.width + 24,
                  aircraftY: stage.top + (aircraftPositions[flyIdx].y / 100) * stage.height + 24,
                },
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
