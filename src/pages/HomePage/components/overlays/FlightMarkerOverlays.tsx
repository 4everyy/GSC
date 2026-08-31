/**
 * FlightMarkerOverlays —— 飞行标记覆盖层：返航航线/指点返航/编队飞行/环绕取点定格/航点取点（自 FlightOverlays 拆出）。
 * 纯展示组件：状态经 props 分组传入，不含任何 hooks。
 */
import type { FlightOverlaysProps } from './FlightOverlays'
import { homeImages } from '../../../../assets/images/home'
import { aircraft } from '../../../../config/aircraft'

export function FlightMarkerOverlays(props: FlightOverlaysProps) {
  const { panels, anims, adapter, aircraftPositions, selectedDevices, getFormationFlightGeometry } = props
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
  const {
    tapReturnFlight,
    returnHomeFlights,
    orbitFlight,
    formationFlightFlights,
  } = anims
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
            <img
              className="tap-return-drone"
              src={tapReturnFlight.icon}
              alt=""
              draggable={false}
              style={{
                left: tapReturnFlight.x,
                top: tapReturnFlight.y,
                transform: `translate(-50%, -50%) rotate(${tapReturnFlight.angle}deg)`,
              }}
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
              回填面板「航点信息」坐标；再次点击覆盖，取消/关闭面板时清除 */}
          {formationFlightOpen && formationFlightPoint && (
            <img
              className="tap-return-marker"
              src={homeImages.tapReturnMarker}
              style={{ left: formationFlightPoint.x, top: formationFlightPoint.y }}
              alt="编队飞行航点"
              draggable={false}
            />
          )}

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
              // 飞机图标按百分比挂在 .map-stage 上，换算视口像素取图标中心（+24）
              const planeX = stage.left + (aircraftPositions[idx].x / 100) * stage.width + 24
              const planeY = stage.top + (aircraftPositions[idx].y / 100) * stage.height + 24
              // 圆周最近点：圆心沿「飞机→圆心」方向回退半径像素（无人机恰在圆心时取正右方）
              const dx = orbitPoint.x - planeX
              const dy = orbitPoint.y - planeY
              const dist = Math.hypot(dx, dy)
              const ux = dist > 1e-6 ? dx / dist : 1
              const uy = dist > 1e-6 ? dy / dist : 0
              return (
                <>
                  <svg className="orbit-flight-graphics" aria-hidden="true">
                    <circle
                      cx={orbitPoint.x}
                      cy={orbitPoint.y}
                      r={rPx}
                      fill="none"
                      stroke="#00FF95"
                      strokeWidth={1}
                      strokeDasharray={orbitRouteGenerated ? undefined : '16 10'}
                    />
                    <line
                      x1={planeX}
                      y1={planeY}
                      x2={orbitPoint.x - ux * rPx}
                      y2={orbitPoint.y - uy * rPx}
                      stroke="#00FF95"
                      strokeWidth={1}
                      strokeDasharray={orbitRouteGenerated ? undefined : '16 10'}
                    />
                  </svg>
                  <span
                    className="tap-return-marker tap-return-marker--pin"
                    style={{ left: orbitPoint.x, top: orbitPoint.y }}
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
              左键点击后定格航点（保持虚线），点击「航线生成」后虚线定格为实线；取消/切换面板时随状态清除 */}
          {waypointFlightOpen &&
            (() => {
              const pt = waypointPoint ?? waypointHover
              if (!pt) return null
              const idx = aircraft.findIndex((a) => selectedDevices.has(a.deviceIndex))
              const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
              if (idx === -1 || !stage) return null
              return (
                <>
                  <svg className="waypoint-flight-route" aria-hidden="true">
                    <line
                      x1={stage.left + (aircraftPositions[idx].x / 100) * stage.width + 24}
                      y1={stage.top + (aircraftPositions[idx].y / 100) * stage.height + 24}
                      x2={pt.x}
                      y2={pt.y}
                      stroke="#00FF95"
                      strokeWidth={2}
                      strokeDasharray={waypointRouteGenerated ? undefined : '16 10'}
                    />
                  </svg>
                  {/* 图钉 DOM 跟随鼠标/定格点：取点阶段原生光标由 .waypoint-picking 隐藏
                      （32×56 图钉超出系统光标 32×32 上限，CSS cursor 无法呈现），左键定格后原地停留 */}
                  <img
                    className="waypoint-flight-marker"
                    src={homeImages.tapReturnMarker}
                    style={{ left: pt.x, top: pt.y }}
                    alt="航点"
                    draggable={false}
                  />
                </>
              )
            })()}

          {/* 环绕飞行模拟飞行无人机：确认后先沿直线切入盘旋圆，再绕圆持续盘旋
              （fixed 视口定位 + 航向旋转，无限循环播放，面板取消/重新取点后消失） */}
          {orbitFlight && (
            <img
              className="tap-return-drone"
              src={orbitFlight.icon}
              alt=""
              draggable={false}
              style={{
                left: orbitFlight.x,
                top: orbitFlight.y,
                transform: `translate(-50%, -50%) rotate(${orbitFlight.angle}deg)`,
              }}
            />
          )}
    </>
  )
}

