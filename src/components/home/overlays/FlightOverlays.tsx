import { type useExclusivePanels } from '../../../hooks/useExclusivePanels'
import { type useFlightAnimations } from '../../../hooks/useFlightAnimations'
import { type useMapEngine } from '../../../hooks/index'
import { type FormationFlightFormation } from '../../FlightActionPanels/FlightActionPanels'
import { computeFormationFlightGeometry } from '../../../lib/formationLayout'
import { FlightSimulationOverlays } from './FlightSimulationOverlays'
import { DroneFlightIcon } from './DroneFlightIcon'
import { homeImages } from '../../../assets/images/home/index'
import { aircraft } from '../../../config/index'
import { useFlightAnimStore } from '../../../stores/index'
import { HexagonAreaOverlay } from './HexagonAreaOverlay'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * FlightOverlays —— HomePage 飞行航线与图形覆盖层总装（自 HomePage.tsx 拆出）。
 *
 * 按渲染顺序组合 FlightMarkerOverlays（返航线/指点返航/编队/环绕取点/航点取点）
 * 与 FlightSimulationOverlays（模拟飞行图标/区域降落/集结点）；props 分组传递，
 * 子组件按需解构。类型定义见本文件导出的 FlightOverlaysProps。
 */

export type Panels = ReturnType<typeof useExclusivePanels>
export type Anims = ReturnType<typeof useFlightAnimations>

export interface FlightOverlaysProps {
  panels: Panels
  anims: Anims
  adapter: ReturnType<typeof useMapEngine>['adapter']
  aircraftPositions: { x: number; y: number }[]
  selectedDevices: Set<number>
  getFormationFlightGeometry: (
    formation?: FormationFlightFormation,
  ) => ReturnType<typeof computeFormationFlightGeometry>
  areaLandingSpots: { x: number; y: number }[]
  rallyPointSpots: { x: number; y: number }[]
  handleDeleteRoutePoint: (index: number) => void
}

export function FlightOverlays(props: FlightOverlaysProps) {
  return (
    <>
      <FlightMarkerOverlays {...props} />
      <FlightSimulationOverlays {...props} />
    </>
  )
}

/**
 * FlightMarkerOverlays —— 飞行标记覆盖层：返航航线/指点返航/编队飞行/环绕取点定格/航点取点（自 FlightOverlays 拆出）。
 * 面板/连线状态经 props 传入；模拟飞行动画状态经 flightAnimStore 选择器订阅——
 * rAF 每帧只重渲染本覆盖层，不再波及 HomePage 主体与各面板。
 */

export function FlightMarkerOverlays(props: FlightOverlaysProps) {
  const { panels, adapter, aircraftPositions, selectedDevices, getFormationFlightGeometry } = props
  const {
    tapReturnOpen,
    waypointFlightOpen,
    orbitFlightOpen,
    formationFlightOpen,
    returnHomeLines,
    tapReturnPoint,
    setTapReturnPoint,
    tapReturnPointConfirmed,
    setTapReturnPointConfirmed,
    tapReturnHover,
    tapReturnLine,
    waypointHover,
    waypointPoint,
    waypointRouteGenerated,
    orbitFlightHover,
    orbitPoint,
    setOrbitPoint,
    orbitRadius,
    orbitRouteGenerated,
    setOrbitRouteGenerated,
    orbitPinMenuOpen,
    setOrbitPinMenuOpen,
    formationFlightHover,
    formationFlightPoint,
    formationFlightRouteGenerated,
  } = panels
  // 模拟飞行动画状态（store 订阅）：本组件是动画 tick 的唯一重渲染面
  const tapReturnFlight = useFlightAnimStore((s) => s.tapReturnFlight)
  const returnHomeFlights = useFlightAnimStore((s) => s.returnHomeFlights)
  const orbitFlight = useFlightAnimStore((s) => s.orbitFlight)
  const formationFlightFlights = useFlightAnimStore((s) => s.formationFlightFlights)
  // 定格点地理锚定（航点/环绕中心）：地图拖动/旋转/缩放的每一帧都触发 move 事件，
  // 驱动本覆盖层重渲染，使定格图钉/连线/盘旋圆经 project 重投影持续钉在原地理位置
  const [, setMoveTick] = useState(0)
  useEffect(() => {
    if (!adapter) return
    return adapter.onMove(() => setMoveTick((t) => t + 1))
  }, [adapter])
  return (
    <>
          {/* 已确认的区域降落范围：半透明紫色填充（rgba(113,96,242,0.3)）、直角，
              正中心圆形徽章（100×100、rgba(113,96,242,0.1) 填充、8px 白 0.2 描边）内含设计稿降落坪图标（iconAreaLandingCenter 44×52）；
              再次进入框选（重绘）、面板取消或点击左上角「删除重绘」按钮时清除 */}
          {/* 返航航线连线：各选中飞机图标中心 → 各自正上方 H 返航标记底部（3px #00FF95 实线）；
              点击「航线生成」绘制/清除，面板关闭时清除；「确认」随连线生成解除置灰 */}
          {returnHomeLines && returnHomeLines.length > 0 && (
            <svg className="tap-return-route" aria-hidden="true">
              {returnHomeLines.map((line, i) => (
                <line
                  key={i}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke="#00FF95"
                  strokeWidth={3}
                />
              ))}
            </svg>
          )}
          {/* 返航模拟飞行无人机：确认后各机沿各自航线连线循环飞向对应 H 返航标记
              （fixed 视口定位 + 航向旋转，多机并行无限循环播放，面板取消/切换后消失） */}
          {returnHomeFlights.map((flight, i) => (
            <DroneFlightIcon
              key={i}
              x={flight.x}
              y={flight.y}
              angle={flight.angle}
              icon={flight.icon}
            />
          ))}

          {/* 指点返航连线：飞机图标中心 → 落点图钉（SVG 视口屏幕空间，3px #00FF95）；
              两端锚定不随地图移动的 DOM 图标，地图缩放/平移时保持连接不断开；
              重新取点/取消面板时清除，「航线生成」后重画 */}
          {tapReturnLine && (
            <svg className="tap-return-route" aria-hidden="true">
              <line
                x1={tapReturnLine.x1}
                y1={tapReturnLine.y1}
                x2={tapReturnLine.x2}
                y2={tapReturnLine.y2}
                stroke="#00FF95"
                strokeWidth={3}
              />
            </svg>
          )}
          {/* 模拟飞行无人机：确认后沿连线循环飞向落点（fixed 视口定位 + 航向旋转，
              无限循环播放，手动点击「取消」后消失） */}
          {tapReturnFlight && (
            <DroneFlightIcon
              x={tapReturnFlight.x}
              y={tapReturnFlight.y}
              angle={tapReturnFlight.angle}
              icon={tapReturnFlight.icon}
            />
          )}
          {/* 指点返航落点图钉标记（32×56 切图）：钉尖对准点击点
              （translate(-50%, -100%)），确认后保留、取消面板时清除 */}
          {tapReturnPoint && (
            <>
              <img
                className="tap-return-marker"
                src={homeImages.tapReturnMarker}
                style={{ left: tapReturnPoint.x, top: tapReturnPoint.y }}
                alt="指点返航点"
                draggable={false}
              />
              {/* 落点正下方返航区域圆圈（设计稿 image-wrapper_4）：
                  48×48 白 2px 描边半透明圆 + 内含 20×24 停机坪图标 */}
              <div
                className="tap-return-zone"
                style={{ left: tapReturnPoint.x, top: tapReturnPoint.y }}
                aria-hidden="true"
              >
                <img src={homeImages.tapReturnZoneIcon} alt="" draggable={false} />
              </div>
              {/* 落点「确定 | 取消」按钮条（未确认时显示于圆圈正下方）：
                  确定保留落点并隐藏按钮条；取消清除落点恢复取点——光标变标记
                  （tap-return-mode 隐藏原生光标 + 跟随图钉），可继续点选新落点。
                  按钮条位于 .map-base 之外，点击不会被地图取点监听误捕为重新取点 */}
              {!tapReturnPointConfirmed && !tapReturnFlight && (
                <div
                  className="tap-return-confirm-bar"
                  style={{ left: tapReturnPoint.x, top: tapReturnPoint.y + 92 }}
                >
                  <span
                    className="area-select-confirm-bar__label"
                    onClick={() => setTapReturnPointConfirmed(true)}
                  >
                    确定
                  </span>
                  <div className="area-select-confirm-bar__divider" />
                  <span
                    className="area-select-confirm-bar__label area-select-confirm-bar__label--cancel"
                    onClick={() => {
                      setTapReturnPoint(null)
                      setTapReturnPointConfirmed(false)
                    }}
                  >
                    取消
                  </span>
                </div>
              )}
            </>
          )}

          {/* 指点返航取点图钉（跟随鼠标）：仅取点阶段（面板打开且尚未定格落点）替代原生
              取点光标——原 54×54 切图超出浏览器 32×32 光标上限会回退成十字准线，改为隐藏
              光标 + 图钉钉尖对准鼠标；落点定格后鼠标恢复正常样式（便于点「确定/取消」），
              点「取消」删点恢复取点后标记光标随之回来；鼠标移出地图（UI 上）时隐藏 */}
          {tapReturnOpen && !tapReturnPoint && tapReturnHover && (
            <img
              className="tap-return-marker"
              src={homeImages.tapReturnMarker}
              style={{ left: tapReturnHover.x, top: tapReturnHover.y }}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          )}

          {/* 环绕飞行取点图钉（跟随鼠标）：取点期间（未定格环绕中心）替代原生取点光标——
              与指点返航同方案（tap-return-marker 切图 32×56 超 32×32 光标上限），
              钉尖对准鼠标；鼠标移出地图（UI 上）时隐藏跟随图钉 */}
          {orbitFlightOpen && !orbitPoint && orbitFlightHover && (
            <img
              className="tap-return-marker"
              src={homeImages.tapReturnMarker}
              style={{ left: orbitFlightHover.x, top: orbitFlightHover.y }}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          )}

          {/* 编队飞行取点图钉（跟随鼠标）：与指点返航/环绕飞行同方案——
              tap-return-marker 切图 32×56 超出浏览器 32×32 光标上限，
              钉尖对准鼠标；仅在未定格航点时跟随（定格后光标恢复正常样式，
              右键取消标记后恢复跟随），鼠标移出地图（UI 上）时隐藏跟随图钉 */}
          {formationFlightOpen && !formationFlightPoint && formationFlightHover && (
            <img
              className="tap-return-marker"
              src={homeImages.tapReturnMarker}
              style={{ left: formationFlightHover.x, top: formationFlightHover.y }}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          )}

          {/* 编队飞行定格图钉：左键点击地图定格航点后原地保留（钉尖对准点击点），
              回填面板「航点信息」坐标；再次点击覆盖，取消/关闭面板时清除。
              定格航点按经纬度地理锚定（与航点/环绕定格点同方案）：每次渲染经 project
              重投影到当前视口（容器原点偏移换算），配合上方 move 订阅触发的重渲染，
              地图拖动/旋转/缩放后图钉仍钉在同一地理位置不漂移 */}
          {formationFlightOpen &&
            formationFlightPoint &&
            (() => {
              let anchor = formationFlightPoint
              if (adapter) {
                const container = adapter.getContainer()
                if (container) {
                  const bounds = container.getBoundingClientRect()
                  const p = adapter.project({ lng: formationFlightPoint.lng, lat: formationFlightPoint.lat })
                  anchor = { ...formationFlightPoint, x: bounds.left + p.x, y: bounds.top + p.y }
                }
              }
              return (
                <img
                  className="tap-return-marker"
                  src={homeImages.tapReturnMarker}
                  style={{ left: anchor.x, top: anchor.y }}
                  alt="编队飞行航点"
                  draggable={false}
                />
              )
            })()}

          {/* 编队飞行降落点编队 + 航线（点击「航线生成」后）：在最左选中飞机图标上方按所选
              编队队形布置「数量=选中飞机数」的降落点图标（area-landing-spot），并用
              1px #00FF95 绿色实线连接各选中飞机中心与其对应降落点；队形/选中飞机数/拖拽
              位置变化时联动重排，取消/关闭面板时随状态清除 */}
          {formationFlightOpen &&
            formationFlightRouteGenerated &&
            (() => {
              const geo = getFormationFlightGeometry()
              if (!geo) return null
              return (
                <>
                  <svg className="area-landing-route" aria-hidden="true">
                    {geo.planes.map((p, i) =>
                      geo.spots[i] ? (
                        <line
                          key={i}
                          x1={p.x}
                          y1={p.y}
                          x2={geo.spots[i].x}
                          y2={geo.spots[i].y}
                          stroke="#00FF95"
                          strokeWidth={1}
                        />
                      ) : null,
                    )}
                  </svg>
                  {geo.spots.map((spot, i) => (
                    <img
                      key={i}
                      className="area-landing-spot"
                      src={homeImages.areaLandingSpot}
                      style={{ left: spot.x, top: spot.y }}
                      alt="编队飞行降落点"
                      draggable={false}
                    />
                  ))}
                </>
              )
            })()}

          {/* 编队飞行模拟飞行无人机：滑窗确认后各机沿航线连线同步循环飞向队形中对应
              降落点（fixed 视口定位 + 航向旋转，多机并行无限循环播放，
              直至取消面板/重新生成后消失） */}
          {formationFlightFlights.map((flight, i) => (
            <DroneFlightIcon
              key={i}
              x={flight.x}
              y={flight.y}
              angle={flight.angle}
              icon={flight.icon}
            />
          ))}

          {/* 环绕飞行定格图钉 + 盘旋圆 + 最近点连线：左键点击地图定格环绕中心后，
              以盘旋半径（米）按当前缩放（getMetersPerPixel）换算像素半径绘制绿色虚线圆，
              并从选中飞机图标中心沿连线方向取圆周最近点画绿色虚线直线；
              半径步进/缩放/重新取点时联动刷新；确认/取消面板时清除 */}
          {orbitFlightOpen &&
            orbitPoint &&
            (() => {
              if (!adapter) return null
              const idx = aircraft.findIndex((a) => selectedDevices.has(a.deviceIndex))
              const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
              if (idx === -1 || !stage) return null
              const mpp = adapter.getMetersPerPixel()
              const rPx = Math.max(2, orbitRadius / mpp)
              // 定格环绕中心按经纬度重投影为当前视口坐标（容器原点偏移换算）：
              // 地图拖动/旋转/缩放后图钉与盘旋圆仍钉在同一地理位置不漂移
              const container = adapter.getContainer()
              const bounds = container.getBoundingClientRect()
              const p = adapter.project({ lng: orbitPoint.lng, lat: orbitPoint.lat })
              const center = { ...orbitPoint, x: bounds.left + p.x, y: bounds.top + p.y }
              // 飞机图标按百分比挂在 .map-stage 上，换算视口像素取图标中心（+24）
              const planeX = stage.left + (aircraftPositions[idx].x / 100) * stage.width + 24
              const planeY = stage.top + (aircraftPositions[idx].y / 100) * stage.height + 24
              // 圆周最近点：圆心沿「飞机→圆心」方向回退半径像素（无人机恰在圆心时取正右方）
              const dx = center.x - planeX
              const dy = center.y - planeY
              const dist = Math.hypot(dx, dy)
              const ux = dist > 1e-6 ? dx / dist : 1
              const uy = dist > 1e-6 ? dy / dist : 0
              return (
                <>
                  <svg className="orbit-flight-graphics" aria-hidden="true">
                    <circle
                      cx={center.x}
                      cy={center.y}
                      r={rPx}
                      fill="none"
                      stroke="#00FF95"
                      strokeWidth={1}
                      strokeDasharray={orbitRouteGenerated ? undefined : '16 10'}
                    />
                    <line
                      x1={planeX}
                      y1={planeY}
                      x2={center.x - ux * rPx}
                      y2={center.y - uy * rPx}
                      stroke="#00FF95"
                      strokeWidth={1}
                      strokeDasharray={orbitRouteGenerated ? undefined : '16 10'}
                    />
                  </svg>
                  <span
                    className="tap-return-marker tap-return-marker--pin"
                    style={{ left: center.x, top: center.y }}
                    onMouseEnter={() => setOrbitPinMenuOpen(true)}
                    onMouseLeave={() => setOrbitPinMenuOpen(false)}
                    onClick={(e) => {
                      // 阻止冒泡触发地图点击；点击图钉同样展示「取消重绘」
                      e.stopPropagation()
                      setOrbitPinMenuOpen(true)
                    }}
                  >
                    <img src={homeImages.tapReturnMarker} alt="环绕中心" draggable={false} />
                    {orbitPinMenuOpen && (
                      <button
                        type="button"
                        className="route-flight-marker__delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          // 取消重绘：清除环绕中心与实线，恢复取点跟随图钉继续标记
                          setOrbitPinMenuOpen(false)
                          setOrbitPoint(null)
                          setOrbitRouteGenerated(false)
                        }}
                      >
                        取消重绘
                      </button>
                    )}
                  </span>
                </>
              )
            })()}

          {/* 航点飞行取点：图钉实时跟随鼠标（仅航点图钉，无 H 停机坪圈），
              选中飞机中心 → 鼠标 1px #00FF95 虚线实时连线；
              左键点击后定格航点（保持虚线），点击「航线生成」后虚线定格为实线；取消/切换面板时随状态清除。
              定格航点按经纬度地理锚定：每次渲染经 project 重投影到当前视口
              （容器原点偏移换算），配合上方 move 订阅触发的重渲染，地图拖动/旋转/缩放后
              图钉与连线仍钉在同一地理位置不漂移；取点跟随阶段保持视口坐标直接跟随鼠标 */}
          {waypointFlightOpen &&
            (() => {
              const pt = waypointPoint ?? waypointHover
              if (!pt) return null
              const idx = aircraft.findIndex((a) => selectedDevices.has(a.deviceIndex))
              const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
              if (idx === -1 || !stage) return null
              // 定格航点：经纬度 → 容器像素（project）→ 视口像素（加容器原点偏移）；
              // 未定格（跟随鼠标）：直接用鼠标视口坐标
              let anchor = pt
              if (waypointPoint && adapter) {
                const container = adapter.getContainer()
                if (container) {
                  const bounds = container.getBoundingClientRect()
                  const p = adapter.project({ lng: waypointPoint.lng, lat: waypointPoint.lat })
                  anchor = { ...waypointPoint, x: bounds.left + p.x, y: bounds.top + p.y }
                }
              }
              return (
                <>
                  <svg className="waypoint-flight-route" aria-hidden="true">
                    <line
                      x1={stage.left + (aircraftPositions[idx].x / 100) * stage.width + 24}
                      y1={stage.top + (aircraftPositions[idx].y / 100) * stage.height + 24}
                      x2={anchor.x}
                      y2={anchor.y}
                      stroke="#00FF95"
                      strokeWidth={2}
                      strokeDasharray={waypointRouteGenerated ? undefined : '16 10'}
                    />
                  </svg>
                  {/* 图钉 DOM 跟随鼠标/定格点：取点阶段原生光标由 .waypoint-picking 隐藏
                      （32×56 图钉超出系统光标 32×32 上限，CSS cursor 无法呈现），左键定格后
                      钉在重投影后的地理位置（随地图拖动/旋转/缩放联动） */}
                  <img
                    className="waypoint-flight-marker"
                    src={homeImages.tapReturnMarker}
                    style={{ left: anchor.x, top: anchor.y }}
                    alt="航点"
                    draggable={false}
                  />
                </>
              )
            })()}

          {/* 环绕飞行模拟飞行无人机：确认后先沿直线切入盘旋圆，再绕圆持续盘旋
              （fixed 视口定位 + 航向旋转，无限循环播放，面板取消/重新取点后消失） */}
          {orbitFlight && (
            <DroneFlightIcon
              x={orbitFlight.x}
              y={orbitFlight.y}
              angle={orbitFlight.angle}
              icon={orbitFlight.icon}
            />
          )}
    </>
  )
}

/**
 * AreaSelectOverlay —— HomePage 区域降落/集结点框选遮罩（全屏遮罩 + 拖拽紫色虚线框 + 跟随光标停机坪图标 + 定格后确认/取消按钮条，createPortal 挂载 body）（自 HomePage.tsx 拆出）。
 *
 * 纯展示组件：所有状态经 props 传入（Panels/Anims 字段类型直接取自对应 hook 的 ReturnType，
 * 与 HomePage 内联实现完全同源）；不含任何 hooks，便于独立维护。
 * 'area-list' 来源（区域列表「添加区域」）改走六边形绘制交互，本组件挂载时已路由到
 * HexagonAreaOverlay，矩形框选仅服务区域降落/集结点。
 */


interface AreaSelectOverlayProps extends
  Pick<Panels, 'setAreaLandingOpen' | 'setRallyPointOpen' | 'setAreaLandingRect' | 'setAreaLandingCorners' | 'setAreaLandingRouteGenerated' | 'setAreaLandingConfirmed' | 'areaSelectMode' | 'setAreaSelectMode' | 'areaSelectAnchor' | 'setAreaSelectAnchor' | 'areaSelectEnd' | 'setAreaSelectEnd' | 'areaSelectDragging' | 'setAreaSelectDragging' | 'areaSelectHover' | 'setAreaSelectHover' | 'areaSelectSource' | 'setRallyPointRect' | 'setRallyPointRouteGenerated'>,
  Pick<Anims, 'stopRallyPointFlights'> {
  adapter: ReturnType<typeof useMapEngine>['adapter']
}

export function AreaSelectOverlay(props: AreaSelectOverlayProps) {
  const {
    setAreaLandingOpen,
    setRallyPointOpen,
    setAreaLandingRect,
    setAreaLandingCorners,
    setAreaLandingRouteGenerated,
    setAreaLandingConfirmed,
    areaSelectMode,
    setAreaSelectMode,
    areaSelectAnchor,
    setAreaSelectAnchor,
    areaSelectEnd,
    setAreaSelectEnd,
    areaSelectDragging,
    setAreaSelectDragging,
    areaSelectHover,
    setAreaSelectHover,
    areaSelectSource,
    setRallyPointRect,
    setRallyPointRouteGenerated,
    stopRallyPointFlights,
    adapter,
  } = props

  // 区域列表「添加区域」：六边形绘制交互——进入仅停机坪图标光标，按下左键自光标
  // 点拉出对称正六边形（按住拖动放大/缩小），松开定格「确认/取消」，确认后按 6 顶点
  // 经纬度本地新增区域；Esc/绘制阶段右键直接退出（无对应功能面板）
  if (areaSelectSource === 'area-list') {
    return (
      areaSelectMode && (
        <HexagonAreaOverlay
          adapter={adapter}
          onExit={() => {
            setAreaSelectMode(false)
            setAreaSelectAnchor(null)
            setAreaSelectEnd(null)
            setAreaSelectDragging(false)
          }}
        />
      )
    )
  }

  return (
    <>
          {/* 区域降落/集结点框选模式（航线生成）：截图式拖拽选区——按下左键确定起点，
              按住拖动实时拉伸出自定义大小的矩形（框内清晰、框外遮罩变暗），
              松开定格；定格后右键/选区「取消」等效清选区回到绘制态可重绘，
              绘制阶段右键等效面板「取消」——收起面板（按钮弹回）并清理取点状态 */}
          {areaSelectMode &&
            createPortal(
              <div
                className="area-select-overlay"
                style={{
                  // 绘制阶段（未定格）隐藏原生光标：area-landing-cursor 切图 54×54 超出
                  // 浏览器 32×32 光标上限，cursor:url() 会回退成十字准线，改由下方 DOM
                  // 图片跟随鼠标；选区定格（松开左键）后恢复默认光标便于点击
                  // 「确定/取消」，点击「取消」或定格后右键取消回到绘制态后再次隐藏
                  cursor: areaSelectAnchor && !areaSelectDragging ? 'default' : 'none',
                }}
                onMouseDown={(e) => {
                  if (e.button !== 0) return
                  // 已有定格选区：锁定状态，左键点击不再开启新框选，
                  // 仅「确认/取消」按钮或右键/Esc 可继续
                  if (areaSelectAnchor && !areaSelectDragging) return
                  setAreaSelectAnchor({ x: e.clientX, y: e.clientY })
                  setAreaSelectEnd({ x: e.clientX, y: e.clientY })
                  setAreaSelectDragging(true)
                }}
                onMouseMove={(e) => {
                  // 拖动中实时更新选区终点；绘制阶段同步更新跟随光标位置
                  if (areaSelectDragging) setAreaSelectEnd({ x: e.clientX, y: e.clientY })
                  setAreaSelectHover({ x: e.clientX, y: e.clientY })
                }}
                onMouseUp={() => setAreaSelectDragging(false)}
                /* 鼠标离开窗口：隐藏跟随光标（回到窗口内由 mousemove 恢复） */
                onMouseLeave={() => setAreaSelectHover(null)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  // 已定格选区：右键等效「取消」按钮——仅清除定格选区回到绘制态
                  // （光标恢复停机坪图标）可重新绘制；框选模式与面板均保持展开，不退出
                  if (areaSelectAnchor && !areaSelectDragging) {
                    setAreaSelectAnchor(null)
                    setAreaSelectEnd(null)
                    setAreaSelectDragging(false)
                  if (areaSelectSource === 'rally-point') {
                    setRallyPointRect(null)
                    setRallyPointRouteGenerated(false)
                    stopRallyPointFlights()
                  } else if (areaSelectSource === 'area-landing') {
                    setAreaLandingRect(null)
                    setAreaLandingCorners(null)
                    setAreaLandingRouteGenerated(false)
                  }
                  return
                }
                // 绘制阶段（未定格）：右键等效对应面板「取消」按钮——退出框选模式并
                // 收起面板（底部功能按钮随之弹回），清理各自全部取点状态
                // （与 FlightCommandPanels/FlightMissionPanels 的 onCancel 动作一致）
                setAreaSelectMode(false)
                setAreaSelectAnchor(null)
                setAreaSelectEnd(null)
                if (areaSelectSource === 'rally-point') {
                  stopRallyPointFlights()
                  setRallyPointRouteGenerated(false)
                  setRallyPointRect(null)
                  setRallyPointOpen(false)
                } else if (areaSelectSource === 'area-landing') {
                  setAreaLandingRect(null)
                  setAreaLandingCorners(null)
                  setAreaLandingRouteGenerated(false)
                  setAreaLandingConfirmed(false)
                  setAreaLandingOpen(false)
                }
                }}
              >
                {/* 框选模式全程跟随光标：停机坪图标图片（54×54，中心对准鼠标）替代原生
                    光标，选区定格后同样保持（不恢复系统箭头）；pointer-events:none
                    不拦截框选拖拽与「确认/取消」按钮点击 */}
                {areaSelectHover && !(areaSelectAnchor && !areaSelectDragging) && (
                  <img
                    className="area-select-cursor"
                    src={homeImages.areaLandingCursor}
                    style={{ left: areaSelectHover.x, top: areaSelectHover.y }}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                  />
                )}
                {areaSelectAnchor &&
                  areaSelectEnd &&
                  (() => {
                    // 起终点归一化为左上角 + 尺寸（支持任意方向拖拽）
                    const left = Math.min(areaSelectAnchor.x, areaSelectEnd.x)
                    const top = Math.min(areaSelectAnchor.y, areaSelectEnd.y)
                    const width = Math.abs(areaSelectAnchor.x - areaSelectEnd.x)
                    const height = Math.abs(areaSelectAnchor.y - areaSelectEnd.y)
                    return (
                      <>
                        <div
                          className="area-select-frame"
                          style={{ left, top, width, height }}
                        />
                        {/* 松开定格后显示「确认 | 取消」按钮条：右对齐选区右缘、
                            位于选区下方 8px；onMouseDown 阻止冒泡，
                            避免点击按钮触发 overlay 的重新框选 */}
                        {!areaSelectDragging && (
                          <div
                            className="area-select-confirm-bar"
                            style={{ left: left + width - 121, top: top + height + 8 }}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <span
                              className="area-select-confirm-bar__label"
                              onClick={() => {
                                // 存储定格选区（视口坐标）到当前来源的已确认区域，
                                // 供后续航线生成业务使用
                                if (areaSelectSource === 'rally-point') {
                                  setRallyPointRect({ left, top, width, height })
                                  // 重绘新区域后旧航线/集结坪失效，需重新点「航线生成」
                                  setRallyPointRouteGenerated(false)
                                  stopRallyPointFlights()
                                } else {
                                  // 计算选区四角经纬度（视口坐标 → 地图容器坐标 → WGS84）：
                                  // 区域降落供面板「区域信息」实时显示，
                                  // 区域列表「添加区域」作为新区域顶点
                                  let corners: { lat: number; lng: number }[] | null = null
                                   if (adapter) {
                                     const bounds = adapter
                                       .getContainer()
                                       .getBoundingClientRect()
                                     const corner = (x: number, y: number) => {
                                       const ll = adapter.unproject({
                                         x: x - bounds.left,
                                         y: y - bounds.top,
                                       })
                                       return { lat: ll.lat, lng: ll.lng }
                                     }
                                     corners = [
                                       corner(left, top),
                                       corner(left + width, top),
                                       corner(left + width, top + height),
                                       corner(left, top + height),
                                     ]
                                   }
                                   // 选区四角经纬度（区域降落专用）：
                                   // 供面板「区域信息」实时显示
                                   setAreaLandingRect({ left, top, width, height })
                                   setAreaLandingRouteGenerated(false)
                                   setAreaLandingCorners(corners)
                                 }
                                 // TODO: 接入航线生成业务
                                 setAreaSelectMode(false)
                                 setAreaSelectAnchor(null)
                                 setAreaSelectEnd(null)
                                 // 重新展示对应面板（信息已提升保留）
                                 if (areaSelectSource === 'rally-point') setRallyPointOpen(true)
                                 else if (areaSelectSource === 'area-landing')
                                   setAreaLandingOpen(true)
                              }}
                            >
                              确认
                            </span>
                            <div className="area-select-confirm-bar__divider" />
                            <span
                              className="area-select-confirm-bar__label area-select-confirm-bar__label--cancel"
                              onClick={() => {
                                // 取消本次绘制：仅清除定格选区回到绘制态（光标恢复停机坪
                                // 图标）可重新绘制；框选模式与面板均保持展开，不退出
                                setAreaSelectAnchor(null)
                                setAreaSelectEnd(null)
                                setAreaSelectDragging(false)
                                if (areaSelectSource === 'rally-point') {
                                  setRallyPointRect(null)
                                  setRallyPointRouteGenerated(false)
                                  stopRallyPointFlights()
                                } else if (areaSelectSource === 'area-landing') {
                                  setAreaLandingRect(null)
                                  setAreaLandingCorners(null)
                                  setAreaLandingRouteGenerated(false)
                                }
                              }}
                            >
                              取消
                            </span>
                          </div>
                        )}
                      </>
                    )
                  })()}
              </div>,
              document.body,
            )}
    </>
  )
}
