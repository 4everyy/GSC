import { ALARM_BADGES, toolbarItems } from '../../config/index'
import { homeImages } from '../../assets/images/home/index'
import {
  useAlarmPanelStore,
  useDeviceLinkStore,
  useLayerStore,
  usePlaneStatusStore,
} from '../../stores/index'
import './MapChrome.css'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useTargetLinkStore } from '../../stores/targetLinkStore'
import { DeviceManagementPanel } from '../DeviceManagementPanel/DeviceManagementPanel'
import { AreaListPanel } from '../AreaPanels/AreaPanels'
import { TargetListPanel } from '../TargetListPanel/TargetListPanel'
import { TaskListPanel } from '../TaskListPanel/TaskListPanel'
import { type MapAdapter } from '../../map-engines/index'
import { useDistanceMeasure } from '../../hooks/useDistanceMeasure/index'


/** 顶栏（WB-PF-002）：告警徽标状态自 alarmPanelStore 订阅（无 props），
 *  徽标点击直接调 store action，HomePage 不参与告警交互渲染 */
export function StatusHeader() {
  const activeAlarm = useAlarmPanelStore((s) => s.activeAlarm)
  const handleAlarmClick = useAlarmPanelStore((s) => s.handleAlarmClick)
  // 集群统计（queryPlaneStatus data 顶层字段）：
  // 在线 = planeOnline/planeTotal，起飞 = planeInAir/planeTotal
  const stats = usePlaneStatusStore((s) => s.stats)
  return (
    <header className="status-header">
      <div className="status-header__left">
        <strong>智能无人集群控制系统</strong>
        <div className="status-metric status-metric--online">
          <img src={homeImages.statusOnlineIcon} alt="" />
          <span>
            在线<br />
            数量
          </span>
          <b>
            {stats.planeOnline}/<i>{stats.planeTotal}</i>
          </b>
        </div>
        <div className="status-metric status-metric--takeoff">
          <img src={homeImages.statusTakeoffIcon} alt="" />
          <span>
            起飞<br />
            数量
          </span>
          <b>
            {stats.planeInAir}/<i>{stats.planeTotal}</i>
          </b>
        </div>
      </div>
      <div className="status-header__right">
        {ALARM_BADGES.map((badge, index) => (
          <span
            className={`alarm ${activeAlarm === index ? 'is-active' : ''}`}
            key={badge}
            onClick={() => handleAlarmClick(index)}
            style={{ cursor: 'pointer' }}
          >
            <img src={badge} alt="告警" />
            <img className="alarm__symbol" src={homeImages.alarmSymbol} alt="" />
            <em>99</em>
          </span>
        ))}
        <img className="avatar" src={homeImages.userAvatar} alt="用户" />
        <img className="signal" src={homeImages.signalIcon} alt="信号" />
      </div>
    </header>
  )
}


const FADE_MS = 500

/** 面板淡入/淡出：mounted 控制 DOM 是否存在；visible 控制淡入/淡出 class */
function useFadeMount(isOpen: boolean): [boolean, boolean] {
  const [mounted, setMounted] = useState(isOpen)
  const [visible, setVisible] = useState(false)

  // 打开：渲染期直接挂载（visible 仍为 false，先以 opacity:0 入场）
  if (isOpen && !mounted) setMounted(true)
  // 关闭：渲染期立即摘掉 visible 触发淡出（DOM 保留 FADE_MS 播完动画后卸载）
  if (!isOpen && visible) setVisible(false)

  // 淡入：双 rAF 确保浏览器先把 opacity:0 渲染出来，再加 visible 触发过渡
  useEffect(() => {
    if (!isOpen || visible) return
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setVisible(true))
    })
    return () => window.cancelAnimationFrame(raf)
  }, [isOpen, visible])

  // 淡出：isOpen 变 false 后延迟 FADE_MS 卸载 DOM
  useEffect(() => {
    if (isOpen || !mounted) return
    const timer = window.setTimeout(() => setMounted(false), FADE_MS)
    return () => window.clearTimeout(timer)
  }, [isOpen, mounted])

  return [mounted, visible]
}

export function MapToolbar() {
  const [active, setActive] = useState(-1)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // Open device panel when aircraft icon on home page is clicked (counter signal).
  // 计数器变化在渲染期直接派生 active（避免 effect 内同步 setState）。
  const devicePanelOpenRequests = useDeviceLinkStore((s) => s.devicePanelOpenRequests)
  const [lastDevReq, setLastDevReq] = useState(devicePanelOpenRequests)
  if (devicePanelOpenRequests !== lastDevReq) {
    setLastDevReq(devicePanelOpenRequests)
    if (devicePanelOpenRequests > 0) setActive(0)
  }

  // Open target list panel when target icon on home page is clicked (counter signal)
  const targetPanelOpenRequests = useTargetLinkStore((s) => s.targetPanelOpenRequests)
  const [lastTgtReq, setLastTgtReq] = useState(targetPanelOpenRequests)
  if (targetPanelOpenRequests !== lastTgtReq) {
    setLastTgtReq(targetPanelOpenRequests)
    if (targetPanelOpenRequests > 0) setActive(4)
  }

  // 预加载 hover / active 背景图：首次 hover/click 时浏览器才开始下载这些图片，
  // 下载完成前会闪现空白，产生"背景图片替换"的闪烁感。
  // 组件挂载时用 Image() 提前拉取，后续切换即从缓存秒读。
  useEffect(() => {
    const urls = new Set<string>()
    toolbarItems.forEach((item) => {
      urls.add(item.background.hover)
      urls.add(item.background.active)
    })
    const imgEls: HTMLImageElement[] = []
    urls.forEach((url) => {
      const img = new Image()
      img.src = url
      imgEls.push(img)
    })
    return () => {
      imgEls.length = 0
    }
  }, [])

  // 第 1 个按钮：设备管理面板；第 2 个按钮：区域列表面板；
  // 第 4 个按钮：任务面板；第 5 个按钮：目标列表面板
  const [deviceMounted, deviceVisible] = useFadeMount(active === 0)
  const [areaMounted, areaVisible] = useFadeMount(active === 1)
  const [taskMounted, taskVisible] = useFadeMount(active === 3)
  const [targetMounted, targetVisible] = useFadeMount(active === 4)

  return (
    <div className="map-toolbar-wrapper">
      <aside className="map-toolbar" aria-label="地图工具栏">
        {toolbarItems.map((item, index) => {
          let bgImage = item.background.normal
          if (active === index) {
            bgImage = item.background.active
          } else if (hoveredIndex === index) {
            bgImage = item.background.hover
          }

          return (
            <button
              className={active === index ? 'is-active' : ''}
              key={item.label}
              onClick={() => setActive(active === index ? -1 : index)}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              title={item.label}
              type="button"
              style={{ backgroundImage: `url(${bgImage})` }}
            >
              <img className={`toolbar-icon toolbar-icon--${index + 1}`} src={item.icon} alt="" />
            </button>
          )
        })}
      </aside>
      {deviceMounted && (
        <DeviceManagementPanel visible={deviceVisible} onClose={() => setActive(-1)} />
      )}
      {areaMounted && <AreaListPanel visible={areaVisible} onClose={() => setActive(-1)} />}
      {taskMounted && <TaskListPanel visible={taskVisible} onClose={() => setActive(-1)} />}
      {targetMounted && (
        <TargetListPanel visible={targetVisible} onClose={() => setActive(-1)} />
      )}
    </div>
  )
}

/**
 * MapScale —— 动态比例尺组件（基于 MapAdapter 引擎抽象接口）。
 *
 * 通过 `adapter.getMetersPerPixel()` 与 `onZoomEnd/onMoveEnd` 事件计算
 * 每像素对应的实际米数，渲染比例尺线段与文字。
 */

/** MapScale 组件属性 */
interface MapScaleProps {
  /** 地图适配器，用于获取缩放级别与中心点以计算比例尺 */
  adapter: MapAdapter | null
}

/**
 * 将距离值格式化为可读文本：< 1000m 用 m，否则用 km（保留 1 位小数）。
 */
function formatDistance(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000
    return `${km % 1 === 0 ? km : km.toFixed(1)}km`
  }
  return `${Math.round(meters)}m`
}

/**
 * 预设的"美观"刻度序列：1 / 2 / 5 循环 × 10ⁿ，
 * 覆盖从 1m 到数千公里的常见比例尺读数。
 */
const NICE_STEPS = [
  1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000,
  100000, 200000, 500000, 1000000, 2000000, 5000000,
]

/**
 * 在给定像素宽度限制下，挑选最合适的刻度距离。
 *
 * 策略：从预设序列中选择使比例尺宽度落在 [minPx, maxPx] 区间内的刻度；
 * 若多个刻度满足条件，取其中宽度最接近 targetPx 的，保证视觉上稳定且
 * 跨缩放级别的变化方向（缩小→变长、放大→变短）具备规律性，避免反复跳动。
 */
function pickNiceDistance(
  metersPerPixel: number,
  targetPx: number,
  minPx: number,
  maxPx: number,
): { distance: number; width: number } {
  let best: { distance: number; width: number } | null = null
  for (const step of NICE_STEPS) {
    const width = step / metersPerPixel
    if (width < minPx) continue
    if (width > maxPx) break // 序列递增，后续只会更宽，提前结束
    if (!best || Math.abs(width - targetPx) < Math.abs(best.width - targetPx)) {
      best = { distance: step, width }
    }
  }
  // 兜底：理论上不会走到，取最接近 targetPx 的刻度
  if (!best) {
    let nearest = NICE_STEPS[0]
    let nearestWidth = nearest / metersPerPixel
    for (const step of NICE_STEPS) {
      const width = step / metersPerPixel
      if (Math.abs(width - targetPx) < Math.abs(nearestWidth - targetPx)) {
        nearest = step
        nearestWidth = width
      }
    }
    best = { distance: nearest, width: nearestWidth }
  }
  return best
}

/**
 * 动态比例尺组件。
 *
 * 职责：
 * - 根据当前地图缩放级别与中心纬度，通过 adapter.getMetersPerPixel() 获取"每像素米数"；
 * - 选择一个美观的刻度距离（1/2/5 × 10ⁿ），并据此调整比例尺宽度；
 * - 监听 zoomend / moveend 事件，缩放或平移后刷新比例尺。
 */
export function MapScale({ adapter }: MapScaleProps) {
  const [label, setLabel] = useState('200m')
  const [barWidth, setBarWidth] = useState(60)

  /** 重新计算比例尺距离与宽度 */
  const update = useCallback(() => {
    if (!adapter) return
    const metersPerPixel = adapter.getMetersPerPixel()
    if (!metersPerPixel || !Number.isFinite(metersPerPixel)) return

    // 目标宽度约 96px，合法区间 [64px, 160px]：
    // - 以 96px 为基准换算实际距离，再挑选落在区间内的美观刻度；
    // - 区间设计为 [target×2/3, target×5/3]，使每级缩放后宽度变化方向稳定，
    //   避免出现"忽长忽短"的反复跳动。
    const { distance: niceDistance, width } = pickNiceDistance(metersPerPixel, 96, 64, 160)

    setBarWidth(Math.round(width))
    setLabel(formatDistance(niceDistance))
  }, [adapter])

  useEffect(() => {
    if (!adapter) return
    // 首次计算放入 rAF 异步执行：规避 effect 内同步 setState，并等待容器布局
    const raf = window.requestAnimationFrame(() => update())
    // 适配器返回的是取消订阅函数，在 cleanup 中调用
    const offZoom = adapter.onZoomEnd(() => update())
    const offMove = adapter.onMoveEnd(() => update())
    return () => {
      window.cancelAnimationFrame(raf)
      offZoom()
      offMove()
    }
  }, [adapter, update])

  return (
    <div className="scale">
      <span style={{ width: `${barWidth}px` }} />
      {label}
    </div>
  )
}


/**
 * 测距模式自定义光标（内联 SVG data URI）。
 *
 * 设计稿参考蓝湖标注：十字准线 + 测距标尺样式。
 * 使用 32×32 SVG，热点位于中心 (16,16)，回退到 crosshair。
 * PNG 远程资源（lanhu-oss）为内网设计稿，离线不可达，故内联 SVG 替代。
 */
const MEASURE_CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <g fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round">
    <circle cx="16" cy="16" r="7"/>
    <line x1="16" y1="3" x2="16" y2="9"/>
    <line x1="16" y1="23" x2="16" y2="29"/>
    <line x1="3" y1="16" x2="9" y2="16"/>
    <line x1="23" y1="16" x2="29" y2="16"/>
    <circle cx="16" cy="16" r="1.6" fill="#ffffff" stroke="none"/>
  </g>
</svg>`

const MEASURE_CURSOR = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  MEASURE_CURSOR_SVG,
)}") 16 16, crosshair`

/** MapControls 组件属性 */
interface MapControlsProps {
  /** 地图适配器，用于缩放控制（引擎无关） */
  adapter?: MapAdapter | null
}

export function MapControls({ adapter }: MapControlsProps) {
  // 图层控制面板显隐状态（点击图层按钮切换）
  const [layerPanelVisible, setLayerPanelVisible] = useState(false)
  // 测距工具（标记/折线/距离计算均在 hook 内管理）
  const measure = useDistanceMeasure({ adapter: adapter ?? null })

  // 测距模式光标切换：激活时设置自定义光标，退出时恢复默认
  useEffect(() => {
    if (!adapter) return
    if (measure.active) {
      adapter.setDefaultCursor(MEASURE_CURSOR)
    } else {
      adapter.setDefaultCursor('')
    }
    // 组件卸载或 adapter 变化时恢复默认光标
    return () => {
      adapter.setDefaultCursor('')
    }
  }, [measure.active, adapter])

  // 动态提示文案：多段连续测距，每次点击延伸一段
  const hintText =
    measure.points.length === 0
      ? '点击地图选择起点'
      : `总距离 ${formatDistanceLocal(measure.totalDistance)} · 继续点击添加点`

  return (
    <>
      {/* 图层控制面板：紧贴图层按钮左侧展开 */}
      <LayerControlPanel visible={layerPanelVisible} />

      {/* 测距模式顶部提示条 */}
      {measure.active && (
        <div className="measure-hint" role="status">
          {hintText}
          {measure.points.length > 0 && (
            <button
              type="button"
              className="measure-hint__btn"
              onClick={measure.undo}
              title="撤销上一个点"
            >
              撤销
            </button>
          )}
        </div>
      )}

      <aside className="view-controls">
        <button
          type="button"
          aria-label="测距"
          className={measure.active ? 'active' : undefined}
          aria-pressed={measure.active}
          onClick={measure.toggle}
        >
          <img src={homeImages.iconMeasure} alt="测距" />
        </button>
        <button type="button">2D</button>
        <button
          type="button"
          className={layerPanelVisible ? 'active' : undefined}
          onClick={() => setLayerPanelVisible((prev) => !prev)}
          aria-pressed={layerPanelVisible}
          aria-label="图层控制"
        >
          <img src={homeImages.iconLayer} alt="图层" />
        </button>
      </aside>
      <aside className="zoom-controls">
        <button type="button" onClick={() => adapter?.zoomIn()} disabled={!adapter}>
          <img src={homeImages.iconZoomIn} alt="放大" />
        </button>
        <button type="button" onClick={() => adapter?.zoomOut()} disabled={!adapter}>
          <img src={homeImages.iconZoomOut} alt="缩小" />
        </button>
      </aside>
    </>
  )
}

// 本地格式化（避免引入 hook 内部导出污染）
function formatDistanceLocal(meters: number): string {
  if (meters < 1000) return `${meters.toFixed(0)} 米`
  return `${(meters / 1000).toFixed(2)} 公里`
}


interface LayerControlPanelProps {
  /** 面板可见性（由父组件图层按钮控制） */
  visible?: boolean
}

/**
 * 图层开关状态机（4 态）
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │ 状态       │ 视觉                          │ 可点击 │
 * ├────────────┼───────────────────────────────┼────────┤
 * │ on  开启   │ 青绿 PNG（右侧拨钮）          │  ✓     │
 * │ off 关闭   │ 灰 SVG（左实心圆）            │  ✓     │
 * │ error 禁用 │ 灰 SVG（左空心圆 + ⊘）        │  ✓     │
 * │ loading    │ 青绿 SVG（右侧弧形拨钮旋转）  │  ✗     │
 * └─────────────────────────────────────────────────────────┘
 *
 * 注：loading 态按钮自带旋转视觉，无需额外修改 cursor。
 *
 * 切换逻辑（干净一致）：
 *   on      → off      （用户主动关闭，直接切换）
 *   off     → on       （用户主动开启，直接切换）
 *   error   → loading  → on(成功) / error(重试失败)
 *   loading → 不可操作
 *
 * 说明：on ↔ off 是用户控制的简单开关；error 是加载失败异常态，
 * 点击重试走 loading 流程；loading 是中间态，不可操作。
 */
type LayerStatus = 'on' | 'off' | 'error' | 'loading'

interface LayerItem {
  key: string
  label: string
  initialStatus: LayerStatus
}

const STATUS_LABEL: Record<LayerStatus, string> = {
  on: '开启',
  off: '已关闭',
  error: '禁用',
  loading: '加载中',
}

/** 青绿色主题色（取自开启态 PNG 采样 #8bf9eb） */
const ACCENT_COLOR = '#8bf9eb'

/** 模拟异步加载（mock）：默认 70% 成功率、1.5s 延迟 */
function mockLoadLayer(): Promise<boolean> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(Math.random() > 0.3), 1500)
  })
}

const LAYER_ITEMS: LayerItem[] = [
  { key: 'track', label: '航迹', initialStatus: 'off' },
  { key: 'trajectory', label: '轨迹', initialStatus: 'off' },
  { key: 'inspection', label: '巡检区域', initialStatus: 'off' },
  { key: 'nofly', label: '禁飞区', initialStatus: 'off' },
  { key: 'taskArea', label: '任务区域', initialStatus: 'off' },
  { key: 'label', label: '设备标签', initialStatus: 'on' },
]

/** 胶囊外壳：48×24，rx=12 圆角，描边 + 半透明填充 */
function ToggleShell({ color }: { color: string }) {
  return (
    <rect
      x="0.75"
      y="0.75"
      width="46.5"
      height="22.5"
      rx="11.25"
      stroke={color}
      strokeWidth="1.5"
      fill={color}
      fillOpacity="0.25"
    />
  )
}

/** 关闭态：灰色外壳 + 左侧实心灰圆 */
function OffSwitch() {
  return (
    <svg width="48" height="24" viewBox="0 0 48 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ToggleShell color="#999" />
      <circle cx="12" cy="12" r="7.5" fill="#999" />
    </svg>
  )
}

/** 禁用态：灰色外壳 + 左侧空心灰圆 + 斜杠 ⊘ */
function ErrorSwitch() {
  return (
    <svg width="48" height="24" viewBox="0 0 48 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ToggleShell color="#999" />
      <circle cx="12" cy="12" r="7.5" fill="transparent" stroke="#999" strokeWidth="1.5" />
      <line x1="6.7" y1="17.3" x2="17.3" y2="6.7" stroke="#999" strokeWidth="1.8" />
    </svg>
  )
}

/** 加载中态：青绿外壳（静止）+ 右侧纯SVG圆环拨钮（持续匀速旋转）。
   完美复刻参考图 layer-toggle-on.png 的视觉特征：
   - 空心圆环（非实心圆），有明确的内外边界
   - 双层渐变色：内缘深青 #60aca2 → 外缘亮青 #7cded2 → 外壳 #8bf9eb
   - 约 75° 缺口（类似参考图），旋转时形成清晰的加载指示
   - 圆环中心 (34, 12)，外半径 9，内半径 5.5（厚度 3.5px）*/
function LoadingSwitch() {
  /* 圆环参数（从参考图像素分析得出，微调位置更靠右） */
  const cx = 37,       // 圆环中心 x（右移3px，更贴近外壳右边缘）
    cy = 12,           // 圆环中心 y（垂直居中）
    rOuter = 8.5,      // 外半径（到达 x≈45.5，距外壳右边缘仅~1.5px）
    rInner = 5         // 内半径（形成明显空心，厚度3.5px）

  /* 圆环平均半径 = (rOuter + rInner) / 2 = 7.25 */
  const rMid = (rOuter + rInner) / 2
  /* 圆环厚度 */
  const thickness = rOuter - rInner // 3.5
  /* 平均周长 */
  const circumference = 2 * Math.PI * rMid // ≈45.6
  /* 弧长占比 ≈ 78%（留约 22% 即 100° 缺口，与参考图一致） */
  const dashLen = Math.round(circumference * 0.78) // ≈36
  const gapLen = Math.round(circumference * 0.22) // ≈10

  return (
    <svg width="48" height="24" viewBox="0 0 48 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 定义渐变：模拟参考图的双色圆环（内深外亮） */}
      <defs>
        <linearGradient id="knobGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60aca2" />   {/* 内缘深青（参考图 x=27-30 采样） */}
          <stop offset="50%" stopColor="#7cded2" />  {/* 中部亮青（参考图 x=41-44 采样） */}
          <stop offset="100%" stopColor="#8bf9eb" />  {/* 外缘主题色（与外壳一致） */}
        </linearGradient>
        {/* 内圆遮罩：将实心圆变为空心圆环 */}
        <mask id="ringMask">
          {/* 白色区域 = 可见（外圆） */}
          <circle cx={cx} cy={cy} r={rOuter} fill="white" />
          {/* 黑色区域 = 遮挡（内圆，形成空心） */}
          <circle cx={cx} cy={cy} r={rInner} fill="black" />
        </mask>
      </defs>

      {/* 外壳：静止不动 */}
      <ToggleShell color={ACCENT_COLOR} />

      {/* 旋转组：围绕圆环中心 (cx, cy) 匀速旋转 */}
      <g>
        {/* 圆环主体：用遮罩实现空心 + 渐变填充 + dasharray 制造缺口 */}
        <circle
          cx={cx}
          cy={cy}
          r={rMid}
          stroke="url(#knobGradient)"
          strokeWidth={thickness}
          fill="none"
          strokeDasharray={`${dashLen} ${gapLen}`}
          strokeLinecap="round"
          mask="url(#ringMask)"
        />
        {/* 围绕圆心匀速旋转，1s/圈 */}
        <animateTransform
          attributeName="transform"
          type="rotate"
          from={`0 ${cx} ${cy}`}
          to={`360 ${cx} ${cy}`}
          dur="1s"
          repeatCount="indefinite"
        />
      </g>
    </svg>
  )
}

export function LayerControlPanel({ visible = true }: LayerControlPanelProps) {
  const [statuses, setStatuses] = useState<Record<string, LayerStatus>>(() =>
    Object.fromEntries(LAYER_ITEMS.map((item) => [item.key, item.initialStatus])),
  )

  // 图层显隐联动 store：三个功能开关同步控制首页对应元素显隐
  const setNoflyZoneVisible = useLayerStore((s) => s.setNoflyZoneVisible)
  const setInspectionZoneVisible = useLayerStore((s) => s.setInspectionZoneVisible)
  const setDeviceLabelsVisible = useLayerStore((s) => s.setDeviceLabelsVisible)
  const setTaskAreaVisible = useLayerStore((s) => s.setTaskAreaVisible)

  /** 开关状态 → 首页元素显隐同步（track/trajectory 暂无对应元素，仅记录开关状态） */
  const applyVisibility = (key: string, on: boolean) => {
    if (key === 'nofly') setNoflyZoneVisible(on)
    else if (key === 'inspection') setInspectionZoneVisible(on)
    else if (key === 'label') setDeviceLabelsVisible(on)
    else if (key === 'taskArea') setTaskAreaVisible(on)
  }

  // 防止竞态：记录正在加载的图层 key
  const loadingKeys = useRef<Set<string>>(new Set())

  /** 触发异步加载流程：→ loading → on(成功) / error(失败) */
  const loadLayer = async (key: string) => {
    if (loadingKeys.current.has(key)) return
    loadingKeys.current.add(key)

    setStatuses((prev) => ({ ...prev, [key]: 'loading' }))

    const success = await mockLoadLayer()

    loadingKeys.current.delete(key)
    setStatuses((prev) => ({ ...prev, [key]: success ? 'on' : 'error' }))
    applyVisibility(key, success)
  }

  /** 点击处理：状态机转换 */
  const handleToggle = (item: LayerItem) => {
    const status = statuses[item.key]

    switch (status) {
      case 'on':
        // 开启 → 关闭：同步隐藏首页对应元素
        setStatuses((prev) => ({ ...prev, [item.key]: 'off' }))
        applyVisibility(item.key, false)
        return
      case 'off':
        // 关闭 → 开启：同步显示首页对应元素
        setStatuses((prev) => ({ ...prev, [item.key]: 'on' }))
        applyVisibility(item.key, true)
        return
      case 'error':
        // 禁用 → 重试加载（正常 70% 成功率）
        loadLayer(item.key)
        return
      case 'loading':
        // 加载中：不可操作
        return
    }
  }

  return (
    <div className={`layer-panel${visible ? ' layer-panel--visible' : ''}`}>
      <div className="layer-panel__content">
        <h3 className="layer-panel__title">图层控制</h3>
        <div className="layer-panel__divider" />

        <div className="layer-panel__list">
          {LAYER_ITEMS.map((item) => {
            const status = statuses[item.key]
            const dimmed = status !== 'on'
            return (
              <div className="layer-panel__item" key={item.key}>
                <span className={`layer-panel__label${dimmed ? ' layer-panel__label--dimmed' : ''}`}>
                  {item.label}
                </span>
                <button
                  type="button"
                  className="layer-panel__toggle"
                  onClick={() => handleToggle(item)}
                  aria-pressed={status === 'on'}
                  aria-label={`${item.label}图层（当前：${STATUS_LABEL[status]}），点击切换状态`}
                >
                  {status === 'on' && <img src={homeImages.layerToggleOn} alt="" draggable={false} />}
                  {status === 'off' && <OffSwitch />}
                  {status === 'error' && <ErrorSwitch />}
                  {status === 'loading' && <LoadingSwitch />}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
