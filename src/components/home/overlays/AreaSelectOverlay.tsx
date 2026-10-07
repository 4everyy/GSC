/**
 * @file AreaSelectOverlay.tsx
 * @description 区域降落/集结点框选遮罩层
 * @author 4everyy
 * @date 2026-10-07
 */
import { type useMapEngine } from '../../../hooks/index'
import { homeImages } from '../../../assets/home/index'
import { HexagonAreaOverlay } from './HexagonAreaOverlay'
import { createPortal } from 'react-dom'
import { type Panels, type Anims } from './FlightOverlays'

/** AreaSelectOverlay —— HomePage 区域降落/集结点框选遮罩… */

interface AreaSelectOverlayProps
  extends
    Pick<
      Panels,
      | 'setAreaLandingOpen'
      | 'setRallyPointOpen'
      | 'setAreaLandingRect'
      | 'setAreaLandingCorners'
      | 'setAreaLandingRouteGenerated'
      | 'setAreaLandingConfirmed'
      | 'areaSelectMode'
      | 'setAreaSelectMode'
      | 'areaSelectAnchor'
      | 'setAreaSelectAnchor'
      | 'areaSelectEnd'
      | 'setAreaSelectEnd'
      | 'areaSelectDragging'
      | 'setAreaSelectDragging'
      | 'areaSelectHover'
      | 'setAreaSelectHover'
      | 'areaSelectSource'
      | 'setRallyPointRect'
      | 'setRallyPointRectGeo'
      | 'setRallyPointRouteGenerated'
    >,
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
    setRallyPointRectGeo,
    setRallyPointRouteGenerated,
    stopRallyPointFlights,
    adapter,
  } = props

  // 区域列表「添加区域」：六边形绘制交互——进入仅停机坪图标光标，按下左键自光标点拉出对称正六边形（按住拖动放大/缩小），松开定格「确认/取消」
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
              // 绘制阶段（未定格）隐藏原生光标：area-landing-cursor 切图 54×54 超出浏览器 32×32 光标上限
              cursor: areaSelectAnchor && !areaSelectDragging ? 'default' : 'none',
            }}
            onMouseDown={(e) => {
              if (e.button !== 0) return
              // 已有定格选区：锁定状态，左键点击不再开启新框选，仅「确认/取消」按钮或右键/Esc 可继续
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
              // 已定格选区：右键等效「取消」按钮——仅清除定格选区回到绘制态（光标恢复停机坪图标）可重新绘制
              if (areaSelectAnchor && !areaSelectDragging) {
                setAreaSelectAnchor(null)
                setAreaSelectEnd(null)
                setAreaSelectDragging(false)
                if (areaSelectSource === 'rally-point') {
                  setRallyPointRect(null)
                  setRallyPointRectGeo(null)
                  setRallyPointRouteGenerated(false)
                  stopRallyPointFlights()
                } else if (areaSelectSource === 'area-landing') {
                  setAreaLandingRect(null)
                  setAreaLandingCorners(null)
                  setAreaLandingRouteGenerated(false)
                }
                return
              }
              // 绘制阶段（未定格）：右键等效对应面板「取消」按钮——退出框选模式并收起面板（底部功能按钮随之弹回）
              setAreaSelectMode(false)
              setAreaSelectAnchor(null)
              setAreaSelectEnd(null)
              if (areaSelectSource === 'rally-point') {
                stopRallyPointFlights()
                setRallyPointRouteGenerated(false)
                setRallyPointRect(null)
                setRallyPointRectGeo(null)
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
                    <div className="area-select-frame" style={{ left, top, width, height }} />
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
                            // 存储定格选区（视口坐标）到当前来源的已确认区域，供后续航线生成业务使用
                            if (areaSelectSource === 'rally-point') {
                              setRallyPointRect({ left, top, width, height })
                              // 同步换算选区四角经纬度（视口 → 地图容器 → WGS84）：地理锚定数据源——地图拖拽/缩放后重投影回视口
                              let rallyCorners: { lat: number; lng: number }[] | null = null
                              if (adapter) {
                                const b = adapter.getContainer().getBoundingClientRect()
                                const corner = (x: number, y: number) => {
                                  const ll = adapter.unproject({ x: x - b.left, y: y - b.top })
                                  return { lat: ll.lat, lng: ll.lng }
                                }
                                rallyCorners = [
                                  corner(left, top),
                                  corner(left + width, top),
                                  corner(left + width, top + height),
                                  corner(left, top + height),
                                ]
                              }
                              setRallyPointRectGeo(rallyCorners)
                              // 重绘新区域后旧航线/集结坪失效，需重新点「航线生成」
                              setRallyPointRouteGenerated(false)
                              stopRallyPointFlights()
                            } else {
                              // 计算选区四角经纬度（视口坐标 → 地图容器坐标 → WGS84）：区域降落供面板「区域信息」实时显示，区域列表「添加区域」作为新区域顶点
                              let corners: { lat: number; lng: number }[] | null = null
                              if (adapter) {
                                const bounds = adapter.getContainer().getBoundingClientRect()
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
                              // 选区四角经纬度（区域降落专用）：供面板「区域信息」实时显示
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
                            else if (areaSelectSource === 'area-landing') setAreaLandingOpen(true)
                          }}
                        >
                          确认
                        </span>
                        <div className="area-select-confirm-bar__divider" />
                        <span
                          className="area-select-confirm-bar__label area-select-confirm-bar__label--cancel"
                          onClick={() => {
                            // 取消本次绘制：仅清除定格选区回到绘制态（光标恢复停机坪图标）可重新绘制
                            setAreaSelectAnchor(null)
                            setAreaSelectEnd(null)
                            setAreaSelectDragging(false)
                            if (areaSelectSource === 'rally-point') {
                              setRallyPointRect(null)
                              setRallyPointRectGeo(null)
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
