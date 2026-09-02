/**
 * FlightMissionPanels —— 航迹任务面板组：航线飞行/环绕飞行/集结点/编队飞行 + 确认弹窗（自 HomePage.tsx 拆出）。
 * 纯展示组件：面板状态经 panels/anims 分组传入，按需解构。
 */
import { FormationFlightPanel } from '../../../../components/FormationFlightPanel/FormationFlightPanel'
import { OrbitFlightPanel } from '../../../../components/OrbitFlightPanel/OrbitFlightPanel'
import { RallyPointPanel } from '../../../../components/RallyPointPanel/RallyPointPanel'
import { RouteFlightPanel } from '../../../../components/RouteFlightPanel/RouteFlightPanel'
import { SlideConfirmDialog } from '../../../../components/SlideConfirmDialog/SlideConfirmDialog'
import { aircraft } from '../../../../config/aircraft'
import { getRallyPointSpots } from '../../formationLayout'
import type { useExclusivePanels } from '../../hooks/useExclusivePanels'
import type { useFlightAnimations } from '../../hooks/useFlightAnimations'
import type { useMapEngine } from '../../../../hooks/useMapEngine'
import type { AircraftListItem } from '../../../../components/AircraftListPanel/AircraftListSection'
import type { FormationFlightFormation } from '../../../../components/FormationFlightPanel/FormationFlightPanel'
import { computeFormationFlightGeometry } from '../../formationLayout'

interface FlightMissionPanelsProps {
  panels: ReturnType<typeof useExclusivePanels>
  anims: ReturnType<typeof useFlightAnimations>
  adapter: ReturnType<typeof useMapEngine>['adapter']
  aircraft: typeof aircraft
  selectedDevices: Set<number>
  aircraftPositions: { x: number; y: number }[]
  rallyPointSpots: { x: number; y: number }[]
  getFormationFlightGeometry: (formation?: FormationFlightFormation) => ReturnType<typeof computeFormationFlightGeometry>
  selectedAircraft: AircraftListItem[]
  handleRemoveAircraft: (id: string) => void
}

export function FlightMissionPanels({ panels, anims, adapter, aircraft, selectedDevices, aircraftPositions, rallyPointSpots, getFormationFlightGeometry, selectedAircraft, handleRemoveAircraft }: FlightMissionPanelsProps) {
  const {
    routeFlightOpen,
    orbitFlightOpen,
    rallyPointOpen,
    formationFlightOpen,
    setRouteFlightOpen,
    setOrbitFlightOpen,
    setRallyPointOpen,
    setFormationFlightOpen,
    setAreaSelectMode,
    setAreaSelectSource,
    setRouteFlightPicking,
    routeFlightPoints,
    setRouteFlightPoints,
    setRouteFlightHover,
    routeFlightFinished,
    setRouteFlightFinished,
    routeFlightGenerated,
    setRouteFlightGenerated,
    routeFlightConfirmed,
    orbitPoint,
    setOrbitPoint,
    orbitRadius,
    setOrbitRadius,
    orbitRouteGenerated,
    setOrbitRouteGenerated,
    orbitFlightConfirmed,
    setOrbitFlightConfirmed,
    rallyPointRect,
    setRallyPointRect,
    rallyPointRouteGenerated,
    setRallyPointRouteGenerated,
    rallyPointConfirmed,
    setRallyPointConfirmed,
    rallyPointFormation,
    setRallyPointFormation,
    formationFlightPoint,
    formationFlightRouteGenerated,
    setFormationFlightRouteGenerated,
    formationFlightConfirmed,
    setFormationFlightConfirmed,
    formationFlightFormation,
    setFormationFlightFormation,
    setRouteSlide,
    orbitSlide,
    setOrbitSlide,
    rallyPointSlide,
    setRallyPointSlide,
    formationFlightSlide,
    setFormationFlightSlide,
  } = panels
  const {
    formationFlightFlights,
    startRallyPointFlights,
    stopRallyPointFlights,
    startFormationFlightFlights,
    stopFormationFlightFlights,
    startOrbitFlight,
    rallyPointFlyingRef,
  } = anims
  return (
    <>
          {/* 航线飞行面板（与其他功能面板互斥）：参数设置区块头 + 飞行高度步进 + 确认（置灰）/航线生成（置灰）/取消三按钮，无航点信息行，
              点击「航线生成」后地图光标变带编号的航线图钉，左键逐点追加航点并连线
              （1px #00FF95，标记全程保持虚线），点击「航线生成」后定格为实线、右键/Esc 结束后确认解除置灰（确认走滑动二次确认弹窗）；
              确认/取消均收起面板并清除航线 */}
          {routeFlightOpen && (
            <RouteFlightPanel
              confirmReady={routeFlightFinished && !routeFlightConfirmed}
              routeMuted={routeFlightGenerated}
              waypoints={routeFlightPoints}
              onConfirm={(height) => {
                // 置灰守卫：未定格航线或指令已确认过时不弹确认滑窗（按钮视觉置灰兜底拦截）
                if (!routeFlightFinished || routeFlightConfirmed) return
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                setRouteSlide({ open: true, height })
              }}
              onGenerateRoute={() => {
                // 置灰守卫：航线已生成时按钮置灰，点击兜底拦截（保持已生成航线不变）；
                // 需重新生成时先「取消」收起面板再重开（关闭时航线自动清除）
                if (routeFlightGenerated) return
                // 航线生成：已标记航点（右键/Esc 结束，虚线）→ 虚线定格为实线；
                // 左键逐点追加航点，右键/Esc 结束取点，面板保留可继续操作
                if (routeFlightPoints.length > 0) {
                  setRouteFlightPicking(false)
                  setRouteFlightFinished(true)
                  setRouteFlightGenerated(true)
                } else {
                  setRouteFlightPoints([])
                  setRouteFlightHover(null)
                  setRouteFlightFinished(false)
                  setRouteFlightPicking(true)
                }
              }}
              onCancel={() => setRouteFlightOpen(false)}
            />
          )}

          {/* 环绕飞行面板（与其他功能面板互斥）：参数设置区块头 + 盘旋高度步进 + 盘旋半径步进 + 航点信息坐标 + 确认（置灰）/航线生成/取消三按钮，
              打开后地图光标变指点标记，图钉实时跟随鼠标，左键点击定格环绕中心（盘旋圆+最近点连线保持虚线）；
              点击「航线生成」后虚线定格为实线并解除确认置灰，确认走滑动二次确认弹窗并启动循环模拟飞行
              （先沿直线切入盘旋圆再绕圆持续盘旋，面板保持展开，取消/重新取点时终止）；取消收起面板并清除图钉连线 */}
          {orbitFlightOpen && (
            <OrbitFlightPanel
              waypoint={orbitPoint ? { lat: orbitPoint.lat, lng: orbitPoint.lng } : null}
              confirmMuted={!orbitRouteGenerated || orbitFlightConfirmed}
              middleMuted={orbitRouteGenerated}
              onConfirm={(height, radius) => {
                // 置灰守卫：未生成实线航线或指令已确认过时不弹确认滑窗（按钮视觉置灰兜底拦截）
                if (!orbitRouteGenerated || orbitFlightConfirmed) return
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                setOrbitSlide({ open: true, height, radius })
              }}
              onRadiusChange={setOrbitRadius}
              onGenerateRoute={() => {
                // 置灰守卫：航线已生成时按钮置灰，点击兜底拦截（保持已生成航线不变）；
                // 地图重新取点会自动回到虚线待生成态（解除置灰），取消收起面板亦可复位
                if (orbitRouteGenerated) return
                // 航线生成：已定格环绕中心（虚线）→ 虚线定格为实线并解除「确认」置灰；
                // 未取点 → 保持置灰等待地图取点
                if (orbitPoint) {
                  setOrbitRouteGenerated(true)
                }
              }}
              onCancel={() => {
                setOrbitPoint(null)
                setOrbitRouteGenerated(false)
                setOrbitFlightOpen(false)
              }}
            />
          )}

          {/* 环绕飞行滑动二次确认弹窗（复用 SlideConfirmDialog）：滑到最右松手执行确认并启动循环模拟飞行
              （先沿直线切入盘旋圆再绕圆持续盘旋，面板保持展开），点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={orbitSlide.open}
            title="环绕飞行"
            message="执行环绕飞行指令"
            onConfirm={() => {
              console.info(
                `[orbit-flight] 确认环绕飞行，高度 ${orbitSlide.height}m，半径 ${orbitSlide.radius}m`,
              )
              // 确认后启动循环模拟飞行：无人机先沿绿色直线（飞机中心 → 圆周最近点）切入，
              // 再绕绿色盘旋圆无限盘旋；切入段约 120px/s，整圈时长按半径自适应（3~12s）。
              // 几何与盘旋圆渲染完全同源（orbitRadius/mpp 换算），动画路径与绿色轨迹精确重合；
              // 面板保持展开，「取消」/重新取点/取消重绘可随时手动终止
              if (orbitPoint && adapter) {
                const idx = aircraft.findIndex((a) => selectedDevices.has(a.deviceIndex))
                const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
                if (idx !== -1 && stage) {
                  const mpp = adapter.getMetersPerPixel()
                  const rPx = Math.max(2, orbitRadius / mpp)
                  startOrbitFlight(
                    {
                      x: stage.left + (aircraftPositions[idx].x / 100) * stage.width + 24,
                      y: stage.top + (aircraftPositions[idx].y / 100) * stage.height + 24,
                    },
                    { x: orbitPoint.x, y: orbitPoint.y },
                    rPx,
                    aircraft[idx].src,
                  )
                }
              }
              // 确认成功：置灰「确认」按钮（防止重复下发环绕飞行指令）；面板关闭/重新取点时自动复位
              setOrbitFlightConfirmed(true)
              setOrbitSlide((s) => ({ ...s, open: false }))
            }}
            onCancel={() => setOrbitSlide((s) => ({ ...s, open: false }))}
          />

          {/* 集结点滑动二次确认弹窗（复用 SlideConfirmDialog）：滑到最右松手执行确认并收起面板，
              点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={rallyPointSlide.open}
            title="集结点"
            message="执行集结指令"
            onConfirm={() => {
              console.info(
                `[rally-point] 确认集结，高度 ${rallyPointSlide.height}m，速度 ${rallyPointSlide.speed}m/s，队形 ${rallyPointSlide.formation}` +
                  (rallyPointRect
                    ? `，区域 @(${rallyPointRect.left},${rallyPointRect.top}) ${rallyPointRect.width}x${rallyPointRect.height}`
                    : '，未框选区域'),
              )
              setRallyPointSlide((s) => ({ ...s, open: false }))
              // 面板保持展开：启动多机循环模拟飞行——各选中无人机沿已生成航线飞向
              // 对应集结坪并无限循环，直至取消面板/删除重绘/重新生成终止
              const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
              if (rallyPointRouteGenerated && rallyPointSpots.length > 0 && stage) {
                // 选中飞机按设备序号升序与集结坪一一对应（与航线渲染的 picked 完全一致）
                const pickedFlights = aircraft
                  .map((item, index) => ({ item, index }))
                  .filter(({ item }) => selectedDevices.has(item.deviceIndex))
                  .sort((a, b) => a.item.deviceIndex - b.item.deviceIndex)
                startRallyPointFlights(
                  pickedFlights.flatMap(({ item, index }, i) =>
                    rallyPointSpots[i]
                      ? [
                          {
                            x1: stage.left + (aircraftPositions[index].x / 100) * stage.width + 24,
                            y1: stage.top + (aircraftPositions[index].y / 100) * stage.height + 24,
                            x2: rallyPointSpots[i].x,
                            y2: rallyPointSpots[i].y,
                            icon: item.src,
                          },
                        ]
                      : [],
                  ),
                )
              }
              setRallyPointConfirmed(true)
            }}
            onCancel={() => setRallyPointSlide((s) => ({ ...s, open: false }))}
          />

          {/* 编队飞行滑动二次确认弹窗（复用 SlideConfirmDialog）：滑到最右松手执行确认并收起面板，
              点遮罩取消后返回面板可再次操作 */}
          <SlideConfirmDialog
            open={formationFlightSlide.open}
            title="编队飞行"
            message="执行编队飞行指令"
            onConfirm={() => {
              console.info(
                `[formation-flight] 确认编队飞行，高度 ${formationFlightSlide.height}m，队形 ${formationFlightSlide.formation}`,
              )
              // 确认成功：置灰「确认」按钮（防止重复下发编队飞行指令）；面板关闭时自动复位
              setFormationFlightConfirmed(true)
              setFormationFlightSlide((s) => ({ ...s, open: false }))
              // 面板保持展开：启动多机循环模拟飞行——各选中无人机沿已生成航线飞向队形中
              // 对应降落点并无限循环，直至取消面板/重新生成终止
              const geo = getFormationFlightGeometry()
              if (formationFlightRouteGenerated && geo) {
                startFormationFlightFlights(
                  geo.planes.flatMap((p, i) =>
                    geo.spots[i]
                      ? [
                          {
                            x1: p.x,
                            y1: p.y,
                            x2: geo.spots[i].x,
                            y2: geo.spots[i].y,
                            icon: geo.icons[i],
                          },
                        ]
                      : [],
                  ),
                )
              }
            }}
            onCancel={() => setFormationFlightSlide((s) => ({ ...s, open: false }))}
          />

          {/* 集结点面板（与其他功能面板互斥）：参数设置 tab（起飞高度/集结速度步进 + 集结队形下拉）/ 飞机列表 tab，
              确认（生成航线前置灰）/航线生成/取消三按钮；「航线生成」在已确认集结区域内按当前队形布置集结坪
              并绘制绿色实线航线；「确认」弹滑窗并启动循环模拟飞行（面板保持展开）；「取消」终止动画并收起面板 */}
          {rallyPointOpen && (
            <RallyPointPanel
              aircraft={selectedAircraft}
              onRemove={handleRemoveAircraft}
              // 置灰条件：未确认集结区域 或 航线已生成时「航线生成」按钮置灰（防重复生成，
              // 守卫已在 onGenerateRoute 兜底）；需重新绘制时先「取消」收起面板再重进框选
              routeMuted={!rallyPointRect || rallyPointRouteGenerated}
              confirmMuted={!rallyPointRouteGenerated || rallyPointConfirmed}
              formation={rallyPointFormation}
              onFormationChange={(f) => {
                setRallyPointFormation(f)
                // 队形变更即时重排集结坪；若模拟飞行进行中，以新布局重启动画
                if (!rallyPointFlyingRef.current) return
                const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
                if (!stage) return
                const picked = aircraft
                  .map((item, index) => ({ item, index }))
                  .filter(({ item }) => selectedDevices.has(item.deviceIndex))
                  .sort((a, b) => a.item.deviceIndex - b.item.deviceIndex)
                const spots = getRallyPointSpots(rallyPointRect, f, picked.length)
                startRallyPointFlights(
                  picked.flatMap(({ item, index }, i) =>
                    spots[i]
                      ? [
                          {
                            x1: stage.left + (aircraftPositions[index].x / 100) * stage.width + 24,
                            y1: stage.top + (aircraftPositions[index].y / 100) * stage.height + 24,
                            x2: spots[i].x,
                            y2: spots[i].y,
                            icon: item.src,
                          },
                        ]
                      : [],
                  ),
                )
              }}
              onConfirm={(height, speed, formation) => {
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                if (!rallyPointRouteGenerated || rallyPointConfirmed) return
                setRallyPointSlide({ open: true, height, speed, formation })
              }}
              onGenerateRoute={() => {
                // 未确认集结区域：进入截图框选模式（兜底，正常流程打开面板时已自动进入）
                if (!rallyPointRect) {
                  setAreaSelectSource('rally-point')
                  setAreaSelectMode(true)
                  return
                }
                // 已生成时再次点击：保持面板展开与已生成航线不变（与区域降落一致，防误点）
                if (rallyPointRouteGenerated) return
                // 区域已确认：按当前集结队形布置集结坪并绘制绿色实线，解除「确认」置灰
                stopRallyPointFlights()
                setRallyPointRouteGenerated(true)
              }}
              onCancel={() => {
                // 取消面板：终止循环动画并清理全部集结点状态（含已确认区域）
                stopRallyPointFlights()
                setRallyPointRouteGenerated(false)
                setRallyPointRect(null)
                setRallyPointOpen(false)
              }}
            />
          )}

          {/* 编队飞行面板（与其他功能面板互斥）：参数设置区块头 + 飞行高度步进 + 编队队形下拉 + 航点信息坐标，
              确认（置灰，航线生成后解除）/航线生成/取消三按钮；「航线生成」在最左选中飞机图标上方按当前
              队形布置降落点并绘制绿色实线航线；「确认」弹滑窗并启动循环模拟飞行（面板保持展开）；
              「取消」终止动画并收起面板 */}
          {formationFlightOpen && (
            <FormationFlightPanel
              waypoint={formationFlightPoint}
              confirmMuted={!formationFlightRouteGenerated || formationFlightConfirmed}
              middleMuted={formationFlightRouteGenerated}
              formation={formationFlightFormation}
              onFormationChange={(f) => {
                setFormationFlightFormation(f)
                // 队形变更即时重排降落点；若模拟飞行进行中，则以新队形重启动画
                if (formationFlightFlights.length === 0) return
                const geo = getFormationFlightGeometry(f)
                if (!geo) return
                startFormationFlightFlights(
                  geo.planes.flatMap((p, i) =>
                    geo.spots[i]
                      ? [
                          {
                            x1: p.x,
                            y1: p.y,
                            x2: geo.spots[i].x,
                            y2: geo.spots[i].y,
                            icon: geo.icons[i],
                          },
                        ]
                      : [],
                  ),
                )
              }}
              onConfirm={(height, formation) => {
                // 置灰守卫：未生成航线或指令已确认过时不弹确认滑窗（按钮视觉置灰兜底拦截）
                if (!formationFlightRouteGenerated || formationFlightConfirmed) return
                // 先弹出滑动二次确认弹窗，滑到最右松手后才真正执行（见下方 SlideConfirmDialog）
                setFormationFlightSlide({ open: true, height, formation })
              }}
              onGenerateRoute={() => {
                // 置灰守卫：航线已生成时按钮置灰，点击兜底拦截（保持已生成航线不变）；
                // 需重新生成时先「取消」收起面板再重开（关闭时航线自动清除）
                if (formationFlightRouteGenerated) return
                // 未选中飞机：无可布置降落点，忽略（与返航线生成的守卫一致）
                if (!getFormationFlightGeometry()) return
                // 航线生成：在最左选中飞机图标上方按当前队形布置降落点并绘制绿色实线航线，
                // 解除「确认」置灰
                stopFormationFlightFlights()
                setFormationFlightRouteGenerated(true)
              }}
              onCancel={() => {
                // 取消面板：终止循环动画并清理航线生成态（关闭 effect 统一处理）
                setFormationFlightOpen(false)
              }}
            />
          )}
    </>
  )
}