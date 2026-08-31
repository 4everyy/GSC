import { homeImages } from '../../../../assets/images/home'

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
