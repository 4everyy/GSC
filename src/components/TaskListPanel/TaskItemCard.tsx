/**
 * @file TaskItemCard.tsx
 * @description TaskItemCard —— 任务规划 tab 的单条任务卡片（从 TaskListPanel.tsx 抽离）。 单一职责：任务行（类型/名称/状态/时间）+ 展开详情（执行设备时间轴 + 下发进程圆环仪表 + 操作按钮）。 独立变化：卡片视觉与操作区独立演进，不牵动面板编排层；props 接口可控（7 个）。
 * @author 4everyy
 * @date 2026-10-07
 */
import iconFormation from '../../assets/home/icon-formation.png'
import { deviceImages } from '../../assets/device/index'
import { taskPanelImages } from '../../assets/task-panel/index'
import type { TaskItem } from '../../config/index'

/** 设计稿切图资源（任务卡片专用，src/assets/task-panel/） */
const IMAGES = {
  /** 巡检任务行首图标（18x18） */
  inspectIcon: taskPanelImages.inspectIcon,
  /** 打击任务行首图标（11x20） */
  strikeIcon: taskPanelImages.strikeIcon,
  /** 行展开箭头-激活态（24x24） */
  expandArrowActive: taskPanelImages.expandArrowActive,
  /** 行展开箭头-默认态（24x24） */
  expandArrowNormal: taskPanelImages.expandArrowNormal,
  /** 绿色圆底无人机剪影（20x20） */
  droneWhite: taskPanelImages.droneWhite,
  /** 定位图标（17x16，蓝圆底内） */
  locateIcon: taskPanelImages.locateIcon,
  /** 下发进程 3D 圆环矢量图（106x75，双层叠加按进度扇形揭示） */
  radarCircle: taskPanelImages.radarCircle,
  /** 详情底部装饰图（434x11） */
  detailBottomDeco: taskPanelImages.detailBottomDeco,
} as const

/** 下发进程：按全部设备中就绪（online，drone-white 图标）行数统计，以 x/x（就绪行数/设备总数）形式展示 */
export function dispatchProgress(devices: TaskItem['devices']) {
  const ready = devices.filter((d) => d.badge === 'online').length
  return {
    ready,
    total: devices.length,
  }
}

/** 下发进程圆环：生成以图面中心为圆心的椭圆扇形路径（顶部 12 点方向起顺时针） */
export function ringSectorPath(pct: number): string {
  const cx = 53
  const cy = 37.5
  const rx = 53
  const ry = 37.5
  const clamped = Math.min(1, Math.max(0, pct))
  if (clamped <= 0) return ''
  if (clamped >= 1) {
    // 整椭圆：两段弧闭合，避免起点与终点重合的退化弧
    return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx - rx} ${cy} Z`
  }
  const rad = (deg: number) => (deg * Math.PI) / 180
  const pt = (deg: number) =>
    `${(cx + rx * Math.cos(rad(deg))).toFixed(2)} ${(cy + ry * Math.sin(rad(deg))).toFixed(2)}`
  const startDeg = -90
  const endDeg = -90 + clamped * 360
  const largeArc = clamped > 0.5 ? 1 : 0
  return `M ${cx} ${cy} L ${pt(startDeg)} A ${rx} ${ry} 0 ${largeArc} 1 ${pt(endDeg)} Z`
}

export interface TaskItemCardProps {
  /** 任务数据 */
  task: TaskItem
  /** 是否展开（由面板持有，保证列表内互斥展开） */
  expanded: boolean
  /** 是否处于 hover（行背景三态：展开蓝 > hover 橙 > 常规灰） */
  hovered: boolean
  /** 点击任务行：展开/收起 */
  onToggle: (id: string) => void
  /** hover 进入（父级集中管理 hoveredId） */
  onHover: (id: string | null) => void
  /** 下发：状态置为已下发，设备行徽标全部置 online（下发进程走满） */
  onDispatch: (id: string) => void
  /** 点击删除：弹出确认弹窗（由面板统一管理弹窗） */
  onDelete: (id: string) => void
}

/** 单条任务卡片：行内容 + 展开详情（时间轴 + 圆环仪表 + 操作按钮） */
export function TaskItemCard({
  task,
  expanded,
  hovered,
  onToggle,
  onHover,
  onDispatch,
  onDelete,
}: TaskItemCardProps) {
  // 下发进程：全部设备中就绪（online）行数，以 x/x 形式展示
  const progress = dispatchProgress(task.devices)

  return (
    <div className="task-item">
      {/* 任务行：背景三态（展开蓝 > hover 橙 > 常规灰），绝对定位铺满整行 */}
      <div
        className={`task-item__row${expanded ? ' task-item__row--active' : ''}`}
        onClick={() => onToggle(task.id)}
        onMouseEnter={() => onHover(task.id)}
        onMouseLeave={() => onHover(null)}
      >
        <img
          className="task-item__row-bg"
          src={
            expanded
              ? deviceImages.rowBgBlue
              : hovered
                ? deviceImages.rowBgOrange
                : deviceImages.rowBgGray
          }
          alt=""
        />
        <div className="task-item__main">
          <img
            className="task-item__type-icon"
            src={task.type === '巡检任务' ? IMAGES.inspectIcon : IMAGES.strikeIcon}
            alt=""
          />
          <span className="task-item__name">{task.name}</span>
        </div>
        <div className="task-item__status-wrap">
          <span
            className={`task-item__status-dot${
              task.status === '未下发' ? ' task-item__status-dot--blue' : ''
            }`}
          />
          <span className="task-item__status">{task.status}</span>
        </div>
        <span className="task-item__time">{task.createdAt}</span>
        <img
          className="task-item__expand"
          src={expanded ? IMAGES.expandArrowActive : IMAGES.expandArrowNormal}
          alt=""
        />
      </div>

      {/* 展开详情 */}
      {expanded && (
        <div className="task-item__detail">
          {/* 内容区与横向分割线包为一组：竖向分割线的定位锚点 */}
          <div className="task-detail__main">
            <div className="task-detail__top">
              {/* 左侧：时间轴 + 执行设备卡片（全部渲染，视口最多 4 行，超出滚动查看） */}
              <div className="task-detail__timeline">
                {task.devices.map((dev) => (
                  <div className="task-detail__node" key={dev.id}>
                    <div
                      className={`task-detail__card${dev.badge === 'online' ? ' task-detail__card--ready' : ''}`}
                    >
                      <span className={`task-detail__badge task-detail__badge--${dev.badge}`}>
                        {dev.badge === 'locate' ? (
                          <img className="task-detail__locate" src={IMAGES.locateIcon} alt="" />
                        ) : (
                          <img
                            className="task-detail__drone-white"
                            src={IMAGES.droneWhite}
                            alt=""
                          />
                        )}
                      </span>
                      <img className="task-detail__drone-icon" src={iconFormation} alt="" />
                      <span className="task-detail__device-name">{dev.name}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* 右侧：下发进程仪表（标签 + x/x 数值 + 3D 圆环切图，整体带高亮底光） */}
              <div className="task-detail__gauge">
                <span className="task-detail__gauge-label">下发进程</span>
                <span className="task-detail__gauge-value">
                  {progress.ready}/{progress.total}
                </span>
                <div className="task-detail__gauge-ring-wrap">
                  {/* 3D 圆环按进度揭示：底层暗态 + 上层亮态扇形裁剪 */}
                  <svg className="task-detail__gauge-ring" viewBox="0 0 106 75" aria-hidden="true">
                    <defs>
                      <clipPath id={`task-ring-clip-${task.id}`}>
                        <path
                          d={ringSectorPath(
                            progress.total > 0 ? progress.ready / progress.total : 0,
                          )}
                        />
                      </clipPath>
                    </defs>
                    <image
                      className="task-detail__gauge-ring-base"
                      href={IMAGES.radarCircle}
                      x="0"
                      y="0"
                      width="106"
                      height="75"
                    />
                    <image
                      className="task-detail__gauge-ring-fill"
                      href={IMAGES.radarCircle}
                      x="0"
                      y="0"
                      width="106"
                      height="75"
                      clipPath={`url(#task-ring-clip-${task.id})`}
                    />
                  </svg>
                </div>
              </div>
            </div>

            {/* 竖向分割线：设备卡片右侧 24px（设计稿 box_7），
               自内容区顶边起，止于横向分割线处，不向下超出 */}
            <span className="task-detail__v-divider" aria-hidden="true" />

            {/* 分割线：设备数据行与操作按钮之间（434x1） */}
            <div className="task-detail__divider" />
          </div>

          {/* 操作按钮 */}
          <div className="task-detail__actions">
            <button
              type="button"
              className="task-detail__btn task-detail__btn--primary"
              disabled={task.status === '已下发'}
              onClick={() => onDispatch(task.id)}
            >
              下发
            </button>
            <button type="button" className="task-detail__btn task-detail__btn--disabled" disabled>
              开始
            </button>
            <button type="button" className="task-detail__btn task-detail__btn--outline">
              重规划
            </button>
            <button
              type="button"
              className="task-detail__btn task-detail__btn--outline"
              onClick={() => onDelete(task.id)}
            >
              删除
            </button>
          </div>

          <img className="task-detail__deco" src={IMAGES.detailBottomDeco} alt="" />
        </div>
      )}
    </div>
  )
}