/**
 * FlightSimulationOverlays —— 模拟飞行覆盖层：航点/航线模拟飞行、区域降落与集结点编队航线（自 FlightOverlays 拆出）。
 * 纯展示组件：状态经 props 分组传入，不含任何 hooks。
 */
import type { FlightOverlaysProps } from './FlightOverlays'
import { RoutePinMarker } from './RoutePinMarker'
import { homeImages } from '../../../../assets/images/home'
import { aircraft } from '../../../../config/aircraft'

export function FlightSimulationOverlays(props: FlightOverlaysProps) {
  const { panels, anims, aircraftPositions, selectedDevices, areaLandingSpots, rallyPointSpots, handleDeleteRoutePoint } = props
  const {
    routeFlightOpen,
    areaLandingRect,
    setAreaLandingRect,
    setAreaLandingCorners,
    areaLandingRouteGenerated,
    setAreaLandingRouteGenerated,
    routeFlightPicking,
    routeFlightPoints,
    routeFlightHover,
    routeFlightGenerated,
    routePinMenu,
    setRoutePinMenu,
    routePinPinned,
    setRoutePinPinned,
    rallyPointRect,
    setRallyPointRect,
    rallyPointRouteGenerated,
    setRallyPointRouteGenerated,
  } = panels
  const {
    waypointFlight,
    routeFlightFlight,
    areaLandingFlights,
    rallyPointFlights,
    stopRallyPointFlights,
  } = anims
  return (
    <>

          {/* 航点飞行模拟飞行无人机：确认后沿已生成航线循环飞向航点图钉
              （fixed 视口定位 + 航向旋转，无限循环播放，面板取消/重新取点后消失） */}
          {waypointFlight && (
            <img
              className="tap-return-drone"
              src={waypointFlight.icon}
              alt=""
              draggable={false}
              style={{
                left: waypointFlight.x,
                top: waypointFlight.y,
                transform: `translate(-50%, -50%) rotate(${waypointFlight.angle}deg)`,
              }}
            />
          )}

          {/* 航线飞行航线：航点1 → 航点2 → …（1px #00FF95，不与飞机连线），
              取点中全部连线保持虚线，点击「航线生成」后定格为实线；
              各航点渲染带编号的航线图钉（32×56，钉尖对准取点位置），
              取消/切换面板时随状态清除 */}
          {routeFlightOpen &&
            (() => {
              if (routeFlightPoints.length === 0 && !routeFlightHover) return null
              // 不与飞机连线：last 仅取最新航点（无航点时为 null，鼠标跟随虚线不渲染）
              const last =
                routeFlightPoints.length > 0
                  ? routeFlightPoints[routeFlightPoints.length - 1]
                  : null
              return (
                <>
                  <svg className="route-flight-route" aria-hidden="true">
                    <polyline
                      points={routeFlightPoints
                        .map((p) => `${p.x},${p.y}`)
                        .join(' ')}
                      fill="none"
                      stroke="#00FF95"
                      strokeWidth={routeFlightGenerated ? 3 : 1}
                      strokeDasharray={routeFlightGenerated ? undefined : '16 10'}
                    />
                    {routeFlightPicking && routeFlightHover && last && (
                      <line
                        x1={last.x}
                        y1={last.y}
                        x2={routeFlightHover.x}
                        y2={routeFlightHover.y}
                        stroke="#00FF95"
                        strokeWidth={1}
                        strokeDasharray="16 10"
                      />
                    )}
                  </svg>
                  {routeFlightPoints.map((p, i) => (
                    <RoutePinMarker
                      key={`${p.x}-${p.y}-${i}`}
                      num={i + 1}
                      x={p.x}
                      y={p.y}
                      interactive={!routeFlightPicking}
                      menuOpen={!routeFlightPicking && routePinMenu === i}
                      onHoverEnter={() => setRoutePinMenu(i)}
                      onHoverLeave={() => {
                        // 双击固定的菜单不移出即收起；其余图钉离开即隐藏
                        if (routePinPinned !== i) setRoutePinMenu((m) => (m === i ? null : m))
                      }}
                      onToggleMenu={() => {
                        setRoutePinPinned((prev) => (prev === i ? null : i))
                        setRoutePinMenu(i)
                      }}
                      onDelete={() => handleDeleteRoutePoint(i)}
                    />
                  ))}
                  {/* 取点中：设计稿橙色航线图钉切图（32×56）跟随鼠标——
                      原生光标由 .route-flight-picking 隐藏（超系统光标尺寸上限），钉尖对准鼠标 */}
                  {routeFlightPicking && routeFlightHover && (
                    <img
                      className="route-flight-cursor-pin"
                      src={homeImages.routeFlightPin}
                      style={{ left: routeFlightHover.x, top: routeFlightHover.y }}
                      alt=""
                      draggable={false}
                    />
                  )}
                </>
              )
            })()}

          {/* 航线飞行模拟飞行无人机：确认后沿已生成航线依次飞过各航点图钉
              （fixed 视口定位 + 航向旋转，到达末航点停留后回到首航点无限循环，
              面板取消/重新取点/删除航点后消失） */}
          {routeFlightFlight && (
            <img
              className="tap-return-drone"
              src={routeFlightFlight.icon}
              alt=""
              draggable={false}
              style={{
                left: routeFlightFlight.x,
                top: routeFlightFlight.y,
                transform: `translate(-50%, -50%) rotate(${routeFlightFlight.angle}deg)`,
              }}
            />
          )}

          {areaLandingRect && (
            <div
              className="area-landing-confirmed"
              style={{
                left: areaLandingRect.left,
                top: areaLandingRect.top,
                width: areaLandingRect.width,
                height: areaLandingRect.height,
              }}
            >
              <div className="area-landing-confirmed__badge">
                <img
                  className="area-landing-confirmed__icon"
                  src={homeImages.iconAreaLandingCenter}
                  alt="区域降落中心点"
                  draggable={false}
                />
              </div>
              <div
                className="area-landing-confirmed__delete-btn"
                onClick={() => {
                  setAreaLandingRect(null)
                  setAreaLandingCorners(null)
                  setAreaLandingRouteGenerated(false)
                }}
              >
                删除重绘
              </div>
            </div>
          )}

          {/* 区域降落降落坪编队（点击「航线生成」后）：在已确认区域内按所选降落编队
              布置「数量=选中飞机数」的降落坪图标，并用 1px #00FF95 绿色实线连接各
              选中飞机中心与其对应降落坪；编队/选区/选中飞机数变化时联动重排，
              再次航线生成（重绘）/取消/删除重绘时随状态清除 */}
          {areaLandingRect &&
            areaLandingRouteGenerated &&
            areaLandingSpots.length > 0 &&
            (() => {
              const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
              if (!stage) return null
              // 选中飞机按设备序号升序与降落坪一一对应（第 i 架 → 第 i 个降落坪）
              const picked = aircraft
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => selectedDevices.has(item.deviceIndex))
                .sort((a, b) => a.item.deviceIndex - b.item.deviceIndex)
              return (
                <>
                  <svg className="area-landing-route" aria-hidden="true">
                    {picked.map(({ index }, i) =>
                      areaLandingSpots[i] ? (
                        <line
                          key={index}
                          x1={stage.left + (aircraftPositions[index].x / 100) * stage.width + 24}
                          y1={stage.top + (aircraftPositions[index].y / 100) * stage.height + 24}
                          x2={areaLandingSpots[i].x}
                          y2={areaLandingSpots[i].y}
                          stroke="#00FF95"
                          strokeWidth={1}
                        />
                      ) : null,
                    )}
                  </svg>
                  {areaLandingSpots.map((spot, i) => (
                    <img
                      key={i}
                      className="area-landing-spot"
                      src={homeImages.areaLandingSpot}
                      style={{ left: spot.x, top: spot.y }}
                      alt="降落坪"
                      draggable={false}
                    />
                  ))}
                </>
              )
            })()}

          {/* 区域降落模拟飞行无人机：确认后各机沿航线连线循环飞向对应降落坪
              （fixed 视口定位 + 航向旋转，多机并行无限循环播放，面板取消/删除重绘后消失） */}
          {areaLandingFlights.map((flight, i) => (
            <img
              key={i}
              className="tap-return-drone"
              src={flight.icon}
              alt=""
              draggable={false}
              style={{
                left: flight.x,
                top: flight.y,
                transform: `translate(-50%, -50%) rotate(${flight.angle}deg)`,
              }}
            />
          ))}

          {/* 集结点集结坪编队 + 航线（点击「航线生成」后）：在已确认集结区域内按所选
              集结队形布置「数量=选中飞机数」的集结坪图标（area-landing-spot），并用
              1px #00FF95 绿色实线连接各选中飞机中心与其对应集结坪；队形/选区/选中
              飞机数变化时联动重排，重绘区域/取消/删除重绘时随状态清除 */}
          {rallyPointRect &&
            rallyPointRouteGenerated &&
            rallyPointSpots.length > 0 &&
            (() => {
              const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
              if (!stage) return null
              // 选中飞机按设备序号升序与集结坪一一对应（第 i 架 → 第 i 个集结坪）
              const picked = aircraft
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => selectedDevices.has(item.deviceIndex))
                .sort((a, b) => a.item.deviceIndex - b.item.deviceIndex)
              return (
                <>
                  <svg className="area-landing-route" aria-hidden="true">
                    {picked.map(({ index }, i) =>
                      rallyPointSpots[i] ? (
                        <line
                          key={index}
                          x1={stage.left + (aircraftPositions[index].x / 100) * stage.width + 24}
                          y1={stage.top + (aircraftPositions[index].y / 100) * stage.height + 24}
                          x2={rallyPointSpots[i].x}
                          y2={rallyPointSpots[i].y}
                          stroke="#00FF95"
                          strokeWidth={1}
                        />
                      ) : null,
                    )}
                  </svg>
                  {rallyPointSpots.map((spot, i) => (
                    <img
                      key={i}
                      className="area-landing-spot"
                      src={homeImages.areaLandingSpot}
                      style={{ left: spot.x, top: spot.y }}
                      alt="集结坪"
                      draggable={false}
                    />
                  ))}
                </>
              )
            })()}

          {/* 集结点模拟飞行无人机：确认后各机沿航线连线循环飞向对应集结坪
              （fixed 视口定位 + 航向旋转，多机并行无限循环播放，取消面板/删除重绘后消失） */}
          {rallyPointFlights.map((flight, i) => (
            <img
              key={i}
              className="tap-return-drone"
              src={flight.icon}
              alt=""
              draggable={false}
              style={{
                left: flight.x,
                top: flight.y,
                transform: `translate(-50%, -50%) rotate(${flight.angle}deg)`,
              }}
            />
          ))}

          {/* 集结点已确认区域：与区域降落同款截图式矩形（半透明紫色填充 + 删除重绘），
              但不渲染中心圆形徽章与降落坪地面标记图标；重绘/面板取消/点击删除时清除 */}
          {rallyPointRect && (
            <div
              className="area-landing-confirmed"
              style={{
                left: rallyPointRect.left,
                top: rallyPointRect.top,
                width: rallyPointRect.width,
                height: rallyPointRect.height,
              }}
            >
              <div
                className="area-landing-confirmed__delete-btn"
                onClick={() => {
                  // 删除重绘：终止循环动画并清除航线生成态与已确认区域
                  stopRallyPointFlights()
                  setRallyPointRouteGenerated(false)
                  setRallyPointRect(null)
                }}
              >
                删除重绘
              </div>
            </div>
          )}
    </>
  )
}

