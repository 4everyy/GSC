import { type FlightOverlaysProps } from './FlightOverlays'
import { homeImages } from '../../../assets/home/index'
import { aircraft } from '../../../config/index'
import { useFlightAnimStore } from '../../../stores/index'
import { DroneFlightIcon } from './DroneFlightIcon'
import { WaypointAltitudeOverlay } from './WaypointAltitudeOverlay'
import { RallyPointAltitudeOverlay } from './RallyPointAltitudeOverlay'
import { pairRallyPointSpots } from '../../../lib/formationLayout'
import { useEffect, useState } from 'react'

/**
 * FlightSimulationOverlays —— 模拟飞行覆盖层：航点/航线模拟飞行、区域降落与集结点编队航线（自 FlightOverlays 拆出）。
 * 面板状态与启停函数经 props 传入；模拟飞行动画状态经 flightAnimStore 选择器订阅——
 * rAF 每帧只重渲染本覆盖层，不再波及 HomePage 主体与各面板。
 */

export function FlightSimulationOverlays(props: FlightOverlaysProps) {
  const { panels, anims, aircraftPositions, selectedDevices, areaLandingSpots, rallyPointSpots, handleDeleteRoutePoint, adapter } = props
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
    setRallyPointRectGeo,
    rallyPointRouteGenerated,
    setRallyPointRouteGenerated,
    setAreaSelectMode,
    setAreaSelectSource,
  } = panels
  // 模拟飞行动画状态（store 订阅）：本组件是动画 tick 的唯一重渲染面
  const waypointFlight = useFlightAnimStore((s) => s.waypointFlight)
  const routeFlightFlight = useFlightAnimStore((s) => s.routeFlightFlight)
  const areaLandingFlights = useFlightAnimStore((s) => s.areaLandingFlights)
  const rallyPointFlights = useFlightAnimStore((s) => s.rallyPointFlights)
  // 集结任务完成判定：存在飞行快照且全部落地定格（altitude≤0，与
  // drone-flight--landed 同口径）——完成后隐藏绿色航线连线，
  // 仅保留定格飞机与集结坪图标（起飞点原图标自确认执行起即整体隐藏，
  // 见 AircraftLayer rallyActivePlaneIds）
  const rallyPointLanded =
    rallyPointFlights.length > 0 && rallyPointFlights.every((f) => f.landed === true)
  // 编队模拟飞行动画运行中判定（仅取 length 原始值选择器）：rAF 逐帧写入新数组但
  // length 不变，不触发本组件每帧重渲染，仅编队动画启停时变化一次；运行中时
  // 下方集结落坪定格图标整体隐藏（由编队动画图标自落坪位置接管呈现，避免双份叠加）
  const formationFlightCount = useFlightAnimStore((s) => s.formationFlightFlights.length)
  // 集结点「删除重绘」按钮需要终止循环动画（事件期调用，稳定引用）
  const stopRallyPointFlights = anims.stopRallyPointFlights
  // 航线定格航点地理锚定：地图拖动/旋转/缩放的每一帧都触发 move 事件，
  // 驱动本覆盖层重渲染，使已定格航点图钉与折线航线经 project 重投影持续钉在原地理位置
  const [, setRouteMoveTick] = useState(0)
  useEffect(() => {
    if (!adapter || !routeFlightOpen || routeFlightPoints.length === 0) return
    return adapter.onMove(() => setRouteMoveTick((t) => t + 1))
  }, [adapter, routeFlightOpen, routeFlightPoints])
  return (
    <>

          {/* 航点飞行模拟飞行无人机：确认后沿已生成航线循环飞向航点图钉
              （fixed 视口定位 + 航向旋转，无限循环播放，面板取消/重新取点后消失） */}
          {waypointFlight && (
            <DroneFlightIcon
              x={waypointFlight.x}
              y={waypointFlight.y}
              angle={waypointFlight.angle}
              icon={waypointFlight.icon}
            />
          )}
          {/* 航点飞行高度实时标注：高度虚线自飞行图标延伸至地面轨迹点，
              数值随遥测逐帧刷新（mock 起飞/飞行高度默认 20m/s 变化），全程跟随 */}
          <WaypointAltitudeOverlay />
          {/* 集结点多机高度标注：与航点单机标注同款样式，随各机飞行动效
              图标（上方 rallyPointFlights.map）逐帧实时标注（爬升/转场/悬停） */}
          <RallyPointAltitudeOverlay />

          {/* 航线飞行航线：航点1 → 航点2 → …（1px #00FF95，不与飞机连线），
              取点中全部连线保持虚线，点击「航线生成」后定格为实线；
              各航点渲染带编号的航线图钉（32×56，钉尖对准取点位置），
              取消/切换面板时随状态清除。
              定格航点按经纬度地理锚定：每次渲染经 project 重投影到当前视口
              （容器原点偏移换算），配合上方 move 订阅触发的重渲染，地图拖动/旋转/缩放后
              编号图钉与折线航线仍钉在同一地理位置不漂移；鼠标跟随点保持视口坐标 */}
          {routeFlightOpen &&
            (() => {
              if (routeFlightPoints.length === 0 && !routeFlightHover) return null
              // 定格航点：经纬度 → 容器像素（project）→ 视口像素（加容器原点偏移）；
              // 无适配器时退回定格屏幕坐标
              const bounds = adapter ? adapter.getContainer().getBoundingClientRect() : null
              const projected = routeFlightPoints.map((p) => {
                if (adapter && bounds) {
                  const pt = adapter.project({ lng: p.lng, lat: p.lat })
                  return { ...p, x: bounds.left + pt.x, y: bounds.top + pt.y }
                }
                return p
              })
              // 不与飞机连线：last 仅取最新航点（无航点时为 null，鼠标跟随虚线不渲染）
              const last =
                projected.length > 0 ? projected[projected.length - 1] : null
              return (
                <>
                  <svg className="route-flight-route" aria-hidden="true">
                    <polyline
                      points={projected
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
                  {projected.map((p, i) => (
                    <RoutePinMarker
                      key={`${p.lng}-${p.lat}-${i}`}
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

          {/* 航线飞行模拟飞行无人机：确认后三阶段动效（与航点/环绕飞行同口径）——
              ①高度调整：自飞机位置垂直爬升/下降至设定高度（20m/s）；②转场平飞：
              到达设定高度后自飞机位置匀速飞向首航点；③航线巡航：到达首航点后沿
              已生成航线依次飞过各航点图钉（fixed 视口定位 + 航向旋转，到达末航点
              停留后回到首航点无限循环），高度标注逐帧跟随；面板取消/重新取点/
              删除航点后消失 */}
          {routeFlightFlight && (
            <DroneFlightIcon
              x={routeFlightFlight.x}
              y={routeFlightFlight.y}
              angle={routeFlightFlight.angle}
              icon={routeFlightFlight.icon}
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
                  // 删除重绘：清除定型区域后重新进入框选模式（光标恢复停机坪图标
                  // 跟随鼠标），可立即重新绘制降落区域；绘制确认/取消后回到面板
                  setAreaSelectSource('area-landing')
                  setAreaSelectMode(true)
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
            <DroneFlightIcon
              key={i}
              x={flight.x}
              y={flight.y}
              angle={flight.angle}
              icon={flight.icon}
            />
          ))}

          {/* 集结点集结航线（点击「航线生成」后）：按所选集结队形在已确认集结区域内
              排布集结点位（预设无人机图标），并用 1px #00FF95 绿色实线连接各选中
              飞机中心与其对应集结点；队形/选区/选中飞机数变化时联动重排，
              重绘区域/取消/删除重绘时随状态清除；确认执行后原起飞点地面图标
              整体隐藏（AircraftLayer rallyActivePlaneIds 接管）；任务完成（全部
              落地定格）后绿色航线隐藏，仅保留定格飞机与集结坪图标 */}
          {rallyPointRect &&
            rallyPointRouteGenerated &&
            rallyPointSpots.length > 0 &&
            (() => {
              const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
              if (!stage) return null
              // 选中飞机按设备序号升序取出，再按「总航程最小指派」配对集结坪：
              // 飞机与集结坪按欧氏距离求最小总长一一配对，最短总长匹配天然无
              // 几何交叉（三角形不等式保证），多条航线互不相交且总航程最短
              const picked = aircraft
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => selectedDevices.has(item.deviceIndex))
                .sort((a, b) => a.item.deviceIndex - b.item.deviceIndex)
              const planeCenters = picked.map(({ index }) => ({
                x: stage.left + (aircraftPositions[index].x / 100) * stage.width + 24,
                y: stage.top + (aircraftPositions[index].y / 100) * stage.height + 24,
              }))
              const perm = pairRallyPointSpots(planeCenters, rallyPointSpots)
              return (
                <>
                  {/* 任务完成后隐藏绿色航线连线（续飞/取消/删除重绘时随动画状态恢复） */}
                  {!rallyPointLanded && (
                    <svg className="area-landing-route" aria-hidden="true">
                      {picked.map(({ index }, i) =>
                        perm[i] >= 0 && rallyPointSpots[perm[i]] ? (
                          <line
                            key={index}
                            x1={planeCenters[i].x}
                            y1={planeCenters[i].y}
                            x2={rallyPointSpots[perm[i]].x}
                            y2={rallyPointSpots[perm[i]].y}
                            stroke="#00FF95"
                            strokeWidth={1}
                          />
                        ) : null,
                      )}
                    </svg>
                  )}
                  {/* 集结坪预设图标：与区域降落降落坪同素材同尺寸，任务完成后仍保留
                      （与落坪定格飞机同点位叠加，取消/删除重绘时随状态清除） */}
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

          {/* 集结点模拟飞行无人机：确认后各机三阶段飞向对应集结点（爬升/转场/落坪
              对齐 + 终态精准定格）；终态（altitude=0）叠加 drone-flight--landed 类
              提升 z-index 至 1503——定格飞机完整显示在其他飞行中标记之上；
              飞行中保持原层级（1501）不遮挡其他标记。
              编队模拟飞行启动后（自集结落坪位置续飞）本层定格图标整体隐藏，由编队
              动画图标（FlightMarkerOverlays formationFlightFlights）接管呈现，
              避免同一飞机双份叠加；编队取消后随 length 归零恢复定格显示 */}
          {formationFlightCount === 0 &&
            rallyPointFlights.map((flight, i) => (
              <DroneFlightIcon
                key={i}
                x={flight.x}
                y={flight.y}
                angle={flight.angle}
                icon={flight.icon}
                className={flight.landed === true ? 'drone-flight--landed' : undefined}
              />
            ))}

          {/* 集结点已确认区域：与区域降落同款截图式矩形（半透明紫色填充 + 删除重绘），
              但不渲染中心圆形徽章（集结坪预设图标由上方航线生成块渲染）；
              重绘/面板取消/点击删除时清除 */}
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
                  //（Geo 同步清除，防止 HomePage 地理锚定 onMove 重投影复活区域）
                  stopRallyPointFlights()
                  setRallyPointRouteGenerated(false)
                  setRallyPointRect(null)
                  setRallyPointRectGeo(null)
                  // 重新进入框选模式（与区域降落同款交互）：光标恢复停机坪图标
                  // 跟随鼠标，可立即重新绘制集结区域；绘制确认/取消后回到面板
                  setAreaSelectSource('rally-point')
                  setAreaSelectMode(true)
                }}
              >
                删除重绘
              </div>
            </div>
          )}
    </>
  )
}


/** 航线飞行编号航点图钉：设计稿橙色切图（32×56）+ 白色序号叠加，钉尖对准取点位置。
 *  取点结束后（interactive）可交互：悬浮/双击弹出「删除航点」按钮，点击删除该航点，
 *  剩余航点自动重连成航线（序号随之重排）；取点中保持 pointer-events:none 不拦截取点 */
export function RoutePinMarker({
  num,
  x,
  y,
  interactive,
  menuOpen,
  onHoverEnter,
  onHoverLeave,
  onToggleMenu,
  onDelete,
}: {
  num: number
  x: number
  y: number
  /** 取点结束后置 true：图钉接收鼠标事件（悬浮/双击/删除） */
  interactive: boolean
  /** 悬浮/双击触发：显示「删除航点」按钮 */
  menuOpen: boolean
  onHoverEnter: () => void
  onHoverLeave: () => void
  /** 双击：固定/解除固定删除菜单（鼠标移出后仍保留） */
  onToggleMenu: () => void
  onDelete: () => void
}) {
  return (
    <span
      className={`route-flight-marker${interactive ? ' route-flight-marker--interactive' : ''}`}
      style={{ left: x, top: y }}
      aria-hidden={!interactive}
      onMouseEnter={interactive ? onHoverEnter : undefined}
      onMouseLeave={interactive ? onHoverLeave : undefined}
      onDoubleClick={
        interactive
          ? (e) => {
              // 阻止冒泡到地图画布（双击缩放）
              e.stopPropagation()
              onToggleMenu()
            }
          : undefined
      }
    >
      <img src={homeImages.routeFlightPin} alt="" draggable={false} />
      <span className="route-flight-marker__num">{num}</span>
      {menuOpen && (
        <button
          type="button"
          className="route-flight-marker__delete"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          删除航点
        </button>
      )}
    </span>
  )
}