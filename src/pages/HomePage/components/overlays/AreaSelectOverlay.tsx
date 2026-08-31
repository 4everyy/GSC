/**
 * AreaSelectOverlay —— HomePage 区域降落/集结点框选遮罩（全屏遮罩 + 拖拽紫色虚线框 + 跟随光标停机坪图标 + 定格后确认/取消按钮条，createPortal 挂载 body）（自 HomePage.tsx 拆出）。
 *
 * 纯展示组件：所有状态经 props 传入（Panels/Anims 字段类型直接取自对应 hook 的 ReturnType，
 * 与 HomePage 内联实现完全同源）；不含任何 hooks，便于独立维护。
 */
import type { useExclusivePanels } from '../../hooks/useExclusivePanels'
import type { useFlightAnimations } from '../../hooks/useFlightAnimations'
import type { useMapEngine } from '../../../../hooks/useMapEngine'
import { homeImages } from '../../../../assets/images/home'
import { createPortal } from 'react-dom'

type Panels = ReturnType<typeof useExclusivePanels>
type Anims = ReturnType<typeof useFlightAnimations>

interface AreaSelectOverlayProps extends
  Pick<Panels, 'setAreaLandingOpen' | 'setRallyPointOpen' | 'setAreaLandingRect' | 'setAreaLandingCorners' | 'setAreaLandingRouteGenerated' | 'areaSelectMode' | 'setAreaSelectMode' | 'areaSelectAnchor' | 'setAreaSelectAnchor' | 'areaSelectEnd' | 'setAreaSelectEnd' | 'areaSelectDragging' | 'setAreaSelectDragging' | 'areaSelectHover' | 'setAreaSelectHover' | 'areaSelectSource' | 'setRallyPointRect' | 'setRallyPointRouteGenerated'>,
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
  return (
    <>
          {/* 区域降落框选模式（航线生成）：截图式拖拽选区——按下左键确定起点，
              按住拖动实时拉伸出自定义大小的矩形（框内清晰、框外遮罩变暗），
              松开定格，Esc/右键退出 */}
          {areaSelectMode &&
            createPortal(
              <div
                className="area-select-overlay"
                style={{
                  // 绘制阶段（未定格）隐藏原生光标：area-landing-cursor 切图 54×54 超出
                  // 浏览器 32×32 光标上限，cursor:url() 会回退成十字准线，改由下方 DOM
                  // 图片跟随鼠标；选区定格（松开左键）后恢复默认光标便于点击
                  // 「确定/取消」，点击「取消」回到绘制态后再次隐藏
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
                  setAreaSelectMode(false)
                  setAreaSelectAnchor(null)
                  setAreaSelectEnd(null)
                  // 取消绘制并重新展示对应面板（信息已提升保留）
                  if (areaSelectSource === 'rally-point') setRallyPointOpen(true)
                  else setAreaLandingOpen(true)
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
                                  setAreaLandingRect({ left, top, width, height })
                                  setAreaLandingRouteGenerated(false)
                                  // 计算选区四角经纬度（视口坐标 → 地图容器坐标 → WGS84），
                                  // 供区域降落面板「区域信息」实时显示
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
                                    setAreaLandingCorners([
                                      corner(left, top),
                                      corner(left + width, top),
                                      corner(left + width, top + height),
                                      corner(left, top + height),
                                    ])
                                  } else {
                                    setAreaLandingCorners(null)
                                  }
                                }
                                // TODO: 接入航线生成业务
                                setAreaSelectMode(false)
                                setAreaSelectAnchor(null)
                                setAreaSelectEnd(null)
                                // 重新展示对应面板（信息已提升保留）
                                if (areaSelectSource === 'rally-point') setRallyPointOpen(true)
                                else setAreaLandingOpen(true)
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
                                } else {
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
