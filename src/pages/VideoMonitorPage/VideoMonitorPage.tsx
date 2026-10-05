/**
 * VideoMonitorPage —— 视频监测屏（双屏视角第二屏）。
 *
 * 依据 demo.txt 设计稿还原（1920×1080）：
 * - 顶栏：系统标题「智能无人集群图传系统」/ 实时时钟 / 四宫格-平铺视图切换 / 在线数量；
 * - 顶栏「平铺视图」切换按钮右侧 24px 处放置 48×48 框（背景与顶栏菜单栏一致），
 *   中心展示 lock.svg 图标（素材：src/assets/task-panel/lock.svg）；
 * - 顶栏锁定框：点击在 lock.svg（未锁）↔ lock-active.svg（锁定）间切换；锁定期间页面下方
 *   全部操作（视图切换/画面内摇杆/工具列/操作条/参数面板/拖拽/右栏折叠）均禁用，
 *   仅锁定框本身可点击，解锁后方可继续对应操作；
 * - 顶栏「在线数量」前的图标使用 src/assets/task-panel/link.svg；
 * - 主区：四宫格视频画面（768×432 一路），含信息条（设备名/在线/电量）、
 *   左下虚拟摇杆、右侧工具列（抓拍/录像/裁剪/全屏，图标取自 video-monitor 素材）、
 *   底部操作条（默认「操作」按钮；点击展开 跟随|跟随|打击 三按钮，左侧箭头向右的 chip 收起）；
 * - 点击操作条中的「跟踪/跟随/打击」在画面右侧（距容器右缘 16px、距标题条底部 16px）展开对应参数设置面板（目标跟踪/目标跟随/目标打击参数设置）：
 *   目标ID（下拉）/ 跟随距离 / 跟随高度（-1/数值/+1 步进，单位 m）/
 *   跟随方位（自动|左后|右后|右后 四段）/ 确认打击 / 取消；
 * - 右栏：「其他在线设备」小卡列表（跟踪中状态 + 电量），可折叠；
 * - 信息条右上角叉号关闭画面后格子占位保留（渲染空占位），
 *   支持将右栏小卡设备按住鼠标左键拖入空占位升格为完整画面（拖入后从右栏移除）；
 *
 * 画面阶段：本地占位视频循环播放——15 路中随机一半使用 demo2.mp4，其余 placeholder-video.mp4
 * （素材统一收敛在 src/assets/video-monitor/，
 * 数据 mock 见 videoMonitorData.ts）；后续接真实图传流仅替换 <video> 的 src 数据源。
 * 注：画面内目标标记框（vm-target）按需求暂不显示，mock 数据保留在
 * videoMonitorData.ts，后续需要时在此恢复渲染即可。
 * 登录门控：由 App.tsx 统一控制，未登录不会进入本屏。
 */
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  MINI_DEVICES,
  ONLINE_COUNT,
  TILED_CHANNELS,
  VIDEO_CHANNELS,
  type VideoChannel,
} from './videoMonitorData'
import {
  placeholderVideo,
  demo2Video,
  iconSnapshot,
  iconRecord,
  cameraRecording,
  iconCrop,
  iconFullscreen,
} from '../../assets/video-monitor'
import lockIcon from '../../assets/task-panel/lock.svg'
import lockActiveIcon from '../../assets/task-panel/lock-active.svg'
import linkIcon from '../../assets/task-panel/link.svg'
import timeIcon from '../../assets/task-panel/time.svg'
import recordCountdownRingIcon from '../../assets/task-panel/Ellipse 72.svg'
import exitFullscreenIcon from '../../assets/home/fullscreen-exit.svg'
import formationIcon from '../../assets/home/icon-formation.png'
import joystickCrosshairIcon from '../../assets/home/joystick-crosshair.svg'
import joystickRingInnerIcon from '../../assets/home/joystick-ring-inner.svg'
import joystickRingOuterIcon from '../../assets/home/joystick-ring-outer.svg'
import joystickArrowIcon from '../../assets/home/joystick-arrow.svg'
import { deviceImages } from '../../assets/device'
import './VideoMonitorPage.css'

/* ---------------- 视频源随机分配 ---------------- */

/**
 * 15 路视频源槽位：随机一半使用 demo2.mp4，其余 placeholder-video.mp4。
 * 模块级计算一次——同一会话内各路画面稳定不闪烁，刷新页面重新洗牌；
 * Fisher–Yates 保证「恰好一半」而非每路独立 50%（避免偶发全同源）。
 */
const VIDEO_SOURCE_SLOTS: string[] = (() => {
  const total = VIDEO_CHANNELS.length + MINI_DEVICES.length
  const demo2Count = Math.round(total / 2)
  const slots = Array.from({ length: total }, (_, i) => (i < demo2Count ? demo2Video : placeholderVideo))
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = slots[i]
    slots[i] = slots[j]
    slots[j] = tmp
  }
  return slots
})()

/* ---------------- 小图标（内联 SVG，白色 currentColor） ---------------- */

function IconDrone({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="2.4" y="2.4" width="6.75" height="6.75" rx="1" />
      <rect x="14.85" y="2.4" width="6.75" height="6.75" rx="1" />
      <rect x="2.4" y="14.85" width="6.75" height="6.75" rx="1" />
      <rect x="14.85" y="14.85" width="6.75" height="6.75" rx="1" />
      <circle cx="12" cy="12" r="1.2" />
    </svg>
  )
}

function IconBattery({ size = 24, pct = 100 }: { size?: number; pct?: number }) {
  const w = (14 * Math.min(100, Math.max(0, pct))) / 100
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {/* 旋转 90° 的电池本体：外壳 + 电量填充 + 正极触点 */}
      <g transform="rotate(90 12 12)">
        <rect x="2.5" y="7" width="19" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <rect x="4.5" y="9" width={w} height="6" rx="0.5" />
        <rect x="22.4" y="10" width="1.6" height="4" rx="0.8" />
      </g>
    </svg>
  )
}

function IconChevron({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M5 3.5 L10.5 8 L5 12.5 Z" />
    </svg>
  )
}

function IconClose({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M2.5 2.5 L11.5 11.5 M11.5 2.5 L2.5 11.5" strokeLinecap="round" />
    </svg>
  )
}

function IconGrid4() {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden>
      <rect x="4" y="4" width="10" height="10" rx="1" />
      <rect x="18" y="4" width="10" height="10" rx="1" />
      <rect x="4" y="18" width="10" height="10" rx="1" />
      <rect x="18" y="18" width="10" height="10" rx="1" />
    </svg>
  )
}

function IconTile() {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={4 + (i % 3) * 9} y={4 + Math.floor(i / 3) * 9} width="6" height="6" rx="0.5" />
      ))}
    </svg>
  )
}


/* ---------------- 顶栏实时时钟（写 textContent，避免整树重渲染） ---------------- */

function TopBarClock() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const fmt = (d: Date) => {
      const p = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}  ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    }
    const el = ref.current
    if (el) el.textContent = fmt(new Date())
    const timer = window.setInterval(() => {
      if (ref.current) ref.current.textContent = fmt(new Date())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])
  return <span ref={ref} className="vm-clock" />
}

/* ---------------- 虚拟摇杆（画面左下） ---------------- */

/**
 * 素材组合（均为 src/assets/home/ 下设计稿导出件）：
 * - 最外围：joystick-ring-outer.svg（108×108，黑 0.4 透明圆底）；
 * - 内层：joystick-ring-inner.svg（56×56，黑 0.2 透明圆）套住中心图标；
 * - 中心：joystick-crosshair.svg（26×26 取景图标）；
 * - 四向键：joystick-arrow.svg（10×13，默认朝左的三角箭头——尖在左、平底在右），
 *   按方向旋转使尖端指向外侧（上 90° / 右 180° / 下 -90° / 左 0°）。
 *
 * 交互（Pointer Events，鼠标/触屏通用）：
 * - 点击：按下后 350ms 内松开 → 触发一次 tap 命令；按压期间 :active 通过兄弟选择器
 *   点亮对应方向的「管道」扇形高亮层（.vm-js-glow：conic 90° 扇形 + 径向 mask
 *   裁出内圈~外圈环带，沿管道填充、绝不超出外圈容器）；
 * - 长按：按住 ≥350ms 进入持续态（容器 data-holding 驱动该扇形层呼吸动画），
 *   期间每 100ms 重复触发 hold 命令（模拟持续转动云台），松开/取消即结束；
 * - setPointerCapture 保证指针移出按钮仍能收到 up/cancel，状态必定清理。
 * onCommand 为预留回调，接真实云台控制时由父组件传入即可。
 * disabled（页面锁定态）：四向键按钮原生禁用 + pointerdown 直接忽略，双保险。
 */

/** 四向键方向 */
type JoystickDir = 'up' | 'right' | 'down' | 'left'

const JOYSTICK_DIR_LABELS: Record<JoystickDir, string> = {
  up: '向上',
  right: '向右',
  down: '向下',
  left: '向左',
}

/** 长按判定阈值：按住超过该时长进入「长按」持续态 */
const JOYSTICK_LONG_PRESS_MS = 350
/** 长按期间命令重复触发间隔（模拟持续控制） */
const JOYSTICK_REPEAT_MS = 100

function Joystick({
  disabled = false,
  onCommand,
}: {
  /** 禁用态（页面锁定时四向键不响应按压/长按） */
  disabled?: boolean
  /** tap=单击一次；hold=长按持续（按 JOYSTICK_REPEAT_MS 间隔重复触发） */
  onCommand?: (dir: JoystickDir, mode: 'tap' | 'hold') => void
}) {
  /** 当前处于长按态的方向（用于持续高亮背景） */
  const [holding, setHolding] = useState<JoystickDir | null>(null)
  /** 长按判定定时器；触发后置 null（用于区分点击/长按） */
  const longPressTimer = useRef<number | null>(null)
  /** 长按期间重复触发命令的定时器 */
  const repeatTimer = useRef<number | null>(null)

  const clearTimers = () => {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current)
    if (repeatTimer.current !== null) window.clearInterval(repeatTimer.current)
    longPressTimer.current = null
    repeatTimer.current = null
    setHolding(null)
  }

  /* 卸载时清理定时器 */
  useEffect(() => clearTimers, [])

  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>, dir: JoystickDir) => {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setHolding(null)
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null // 已进入长按态，标记非待定
      setHolding(dir)
      onCommand?.(dir, 'hold')
      repeatTimer.current = window.setInterval(() => onCommand?.(dir, 'hold'), JOYSTICK_REPEAT_MS)
    }, JOYSTICK_LONG_PRESS_MS)
  }

  const handlePointerUp = (dir: JoystickDir) => {
    // 长按定时器仍在等待（未进入长按）→ 视为一次点击命令
    if (longPressTimer.current !== null) onCommand?.(dir, 'tap')
    clearTimers()
  }

  return (
    <div
      className="vm-joystick"
      role="group"
      aria-label="云台方向控制"
      /* 长按态方向：驱动对应管道扇形层的呼吸动画（CSS [data-holding='xx']） */
      data-holding={holding ?? undefined}
    >
      <img className="vm-js-outer" src={joystickRingOuterIcon} alt="" />
      <img className="vm-js-inner" src={joystickRingInnerIcon} alt="" />
      <img className="vm-js-center" src={joystickCrosshairIcon} alt="" />
      {(['up', 'right', 'down', 'left'] as const).map((dir) => (
        <Fragment key={dir}>
          <button
            type="button"
            className={`vm-js-btn vm-js-btn--${dir}`}
            disabled={disabled}
            aria-label={JOYSTICK_DIR_LABELS[dir]}
            onPointerDown={(e) => handlePointerDown(e, dir)}
            onPointerUp={() => handlePointerUp(dir)}
            onPointerCancel={clearTimers}
            /* 移动端长按不弹出系统上下文菜单 */
            onContextMenu={(e) => e.preventDefault()}
          >
            <img className="vm-js-arrow-icon" src={joystickArrowIcon} alt="" />
          </button>
          {/* 管道扇形高亮层：点击随按钮 :active 点亮（兄弟选择器），长按由容器
              data-holding 驱动呼吸；径向 mask 保证只填充环带、不超出外圈容器 */}
          <div className={`vm-js-glow vm-js-glow--${dir}`} aria-hidden />
        </Fragment>
      ))}
    </div>
  )
}

/* ---------------- 目标跟随参数设置面板（底部操作条「跟随」展开） ---------------- */

/** 跟随方位选项（按设计稿四段：自动 | 左后 | 右后 | 右后） */
const FOLLOW_DIRS = ['自动', '左后', '右后', '右后'] as const

/** 目标类型显示名（对应 videoMonitorData.ts 的 kind 字段） */
const TARGET_KIND_LABELS: Record<'person' | 'vehicle', string> = {
  person: '人员',
  vehicle: '车辆',
}

/** 目标下拉选项：画面检测目标优先，无目标时回退设计稿样例「人员 | P-102」 */
function buildTargetOptions(channel: VideoChannel): { id: string; label: string }[] {
  if (channel.targets.length) {
    return channel.targets.map((t) => ({ id: t.id, label: `${TARGET_KIND_LABELS[t.kind]} | ${t.targetId}` }))
  }
  return [{ id: 'sample', label: '人员 | P-102' }]
}

/** 跟随数值步进器：-1(43×28) / 数值输入(93×28)+m / +1（按设计稿还原） */
function FollowStepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const clamp = (n: number) => Math.min(9999, Math.max(0, n))
  return (
    <div className="vm-follow-field">
      <div className="vm-follow-label">{label}</div>
      <div className="vm-follow-stepper">
        <button type="button" className="vm-follow-step-btn" onClick={() => onChange(clamp(value - 1))}>
          -1
        </button>
        <div className="vm-follow-step-input">
          <input
            className="vm-follow-input"
            type="text"
            inputMode="numeric"
            aria-label={`${label}（米）`}
            value={value}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value.trim(), 10)
              onChange(Number.isNaN(n) ? 0 : clamp(n))
            }}
          />
          <span className="vm-follow-unit">m</span>
        </div>
        <button type="button" className="vm-follow-step-btn" onClick={() => onChange(clamp(value + 1))}>
          +1
        </button>
      </div>
    </div>
  )
}

/**
 * 目标参数设置面板（按设计稿还原，标题随操作变化）：跟踪→「目标跟踪参数设置」/ 跟随→「目标跟随参数设置」/ 打击→「目标打击参数设置」+
 * 目标ID（下拉）/ 跟随距离 / 跟随高度（-1/数值/+1 步进，单位 m）/
 * 跟随方位（自动|左后|右后|右后 四段）/ 确认（文案随打开面板的操作按钮变化）/ 取消；
 * 确认与取消均收起面板（接真实指令链路后在此下发跟随/打击命令）。
 * 注：页面锁定时面板会被直接收起（锁定即禁一切操作），故面板内部无需感知锁定。
 */
function FollowSettingsPanel({
  channel,
  title,
  confirmLabel,
  onClose,
}: {
  channel: VideoChannel
  /** 面板标题：目标跟踪参数设置 / 目标跟随参数设置 / 目标打击参数设置（随操作按钮变化） */
  title: string
  /** 确认按钮文案：确认跟踪 / 确认跟随 / 确认打击（随打开面板的操作按钮变化） */
  confirmLabel: string
  onClose: () => void
}) {
  /** 目标ID 下拉展开态 */
  const [idOpen, setIdOpen] = useState(false)
  const targetOptions = buildTargetOptions(channel)
  const [selectedTarget, setSelectedTarget] = useState(targetOptions[0])
  /** 跟随距离 / 跟随高度（米），默认 10 */
  const [distance, setDistance] = useState(10)
  const [height, setHeight] = useState(10)
  /** 跟随方位选中段（0=自动 默认选中，白底黑字） */
  const [dirIndex, setDirIndex] = useState(0)

  return (
    <div className="vm-follow">
      <div className="vm-follow-title">{title}</div>
      <div className="vm-follow-body">
        {/* 目标ID */}
        <div className="vm-follow-field vm-follow-field--id">
          <div className="vm-follow-label">目标ID</div>
          <button
            type="button"
            className="vm-follow-id-toggle"
            aria-expanded={idOpen}
            aria-label={`选择目标ID，当前 ${selectedTarget.label}`}
            onClick={() => setIdOpen((v) => !v)}
          >
            <span className="vm-follow-id-value">{selectedTarget.label}</span>
            <span className={`vm-follow-id-arrow ${idOpen ? 'vm-follow-id-arrow--up' : ''}`}>
              <IconChevron size={14} />
            </span>
          </button>
          {idOpen && (
            <div className="vm-follow-id-list" role="listbox" aria-label="目标ID 列表">
              {targetOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={opt.id === selectedTarget.id}
                  className={`vm-follow-id-item ${opt.id === selectedTarget.id ? 'vm-follow-id-item--active' : ''}`}
                  onClick={() => {
                    setSelectedTarget(opt)
                    setIdOpen(false)
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 跟随距离 / 跟随高度 */}
        <FollowStepper label="跟随距离" value={distance} onChange={setDistance} />
        <FollowStepper label="跟随高度" value={height} onChange={setHeight} />

        {/* 跟随方位 */}
        <div className="vm-follow-field vm-follow-field--dir">
          <div className="vm-follow-label">跟随方位</div>
          <div className="vm-follow-dir" role="radiogroup" aria-label="跟随方位">
            {FOLLOW_DIRS.map((d, i) => (
              <button
                key={`dir-${i}`}
                type="button"
                role="radio"
                aria-checked={dirIndex === i}
                className={`vm-follow-dir-item ${dirIndex === i ? 'vm-follow-dir-item--active' : ''}`}
                onClick={() => setDirIndex(i)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* 确认（文案随操作变化）/ 取消：均收起面板（接真实指令链路后在此下发命令） */}
        <div className="vm-follow-actions">
          <button type="button" className="vm-follow-btn vm-follow-btn--primary" onClick={onClose}>
            {confirmLabel}
          </button>
          <button type="button" className="vm-follow-btn vm-follow-btn--ghost" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- 占位视频画面（placeholder-video.mp4，接真实流时替换数据源） ---------------- */

/**
 * 占位图传画面：循环播放本地占位视频（placeholder-video.mp4 / demo2.mp4 随机各半）。
 * 各路经 offsetSec 错开播放起点，避免多路画面完全同步显得呆板；
 * 接真实图传流时仅需将 <video> 的 src 换成流地址。
 * 注：画面播放本身不受页面锁定影响——锁定禁的是「操作」，监控画面继续可见。
 */
function PlaceholderVideoStream({
  src = placeholderVideo,
  offsetSec = 0,
}: {
  src?: string
  offsetSec?: number
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const handleLoadedData = () => {
    const el = ref.current
    if (el && offsetSec > 0) el.currentTime = offsetSec
  }
  return (
    <video
      ref={ref}
      className="vm-video-stream"
      src={src}
      autoPlay
      loop
      muted
      playsInline
      onLoadedData={handleLoadedData}
    />
  )
}

/* ---------------- 单路视频画面 ---------------- */

function VideoChannelCard({
  channel,
  offsetSec = 0,
  videoSrc,
  onClose,
  expanded = false,
  onToggleExpand,
  locked = false,
}: {
  channel: VideoChannel
  offsetSec?: number
  videoSrc?: string
  onClose?: () => void
  /** 页内展开态：当前画面铺满整个视图（工具列末位按钮切换，非浏览器全屏） */
  expanded?: boolean
  /** 切换展开/收起 */
  onToggleExpand?: () => void
  /** 页面锁定态：禁用画面内全部操作（关闭/摇杆/工具列/操作条），解锁后恢复 */
  locked?: boolean
}) {
  const [panelOpen, setPanelOpen] = useState(false)
  /** 底部操作条展开态：默认收起为「操作」，点击展开 跟随/跟随/打击 三按钮 */
  const [actionOpen, setActionOpen] = useState(false)
  /** 参数设置面板展开态：记录由哪个操作按钮（跟踪/跟随/打击）打开，null 为收起 */
  const [panelAction, setPanelAction] = useState<'track' | 'follow' | 'strike' | null>(null)
  /** 录像倒计时剩余秒数：工具列「录像」按钮点击后 3→2→1 逐秒递减，null 为未在倒计时 */
  const [recordCountdown, setRecordCountdown] = useState<number | null>(null)
  /** 录像进行中：倒计时走完后进入录像态（图标切换为 Camera.svg 并计时） */
  const [recording, setRecording] = useState(false)
  /** 录像已进行秒数：从 0 起每秒 +1，按 mm:ss 显示（如 15:24） */
  const [recordSeconds, setRecordSeconds] = useState(0)

  /** 录像时长 mm:ss 格式化（不足 1 小时按 分:秒 展示） */
  const formatRecordDuration = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(m)}:${p(s)}`
  }

  /* 锁定时收起画面内的展开浮层（遥测面板/操作条/参数设置），画面转为纯监视 */
  useEffect(() => {
    if (!locked) return
    setPanelOpen(false)
    setActionOpen(false)
    setPanelAction(null)
  }, [locked])

  /* 录像倒计时：每秒递减一次（3→2→1），最后一位数走满 1 秒后自动收起浮层并进入录像态 */
  useEffect(() => {
    if (recordCountdown === null) return
    const timer = window.setTimeout(() => {
      setRecordCountdown((v) => {
        if (v !== null && v > 1) return v - 1
        /* 倒计时走完 → 进入录像态，从 0 秒开始计时 */
        setRecording(true)
        setRecordSeconds(0)
        return null
      })
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [recordCountdown])

  /* 录像计时：录像中每秒 +1 累加（mm:ss 显示） */
  useEffect(() => {
    if (!recording) return
    const timer = window.setInterval(() => setRecordSeconds((v) => v + 1), 1000)
    return () => window.clearInterval(timer)
  }, [recording])

  return (
    <section
      className={`vm-channel ${expanded ? 'vm-channel--expanded' : ''}`}
      aria-label={`${channel.name} 视频画面`}
    >
      {/* 占位图传画面：placeholder-video.mp4 循环播放（接真实流时仅替换视频源） */}
      <div className="vm-video">
        <PlaceholderVideoStream src={videoSrc} offsetSec={offsetSec} />
      </div>
      <div className="vm-video-shade" />

      {/* 信息条 */}
      <header className="vm-channel-bar">
        <img className="vm-channel-icon" src={formationIcon} alt="" />
        <span className="vm-channel-name">{channel.name}</span>
        <span className="vm-channel-right">
          <span className="vm-online">在线</span>
          <span className="vm-battery">
            <img
              className="vm-battery-icon"
              src={
                channel.battery >= 75
                  ? deviceImages.batteryFull
                  : channel.battery >= 40
                    ? deviceImages.batteryMid
                    : deviceImages.batteryLow
              }
              alt=""
            />
            {channel.battery}%
          </span>
          {/* 电量右侧：关闭画面叉号按钮（锁定时禁用） */}
          <button
            type="button"
            className="vm-close"
            disabled={locked}
            title="关闭画面"
            aria-label={`关闭 ${channel.name} 画面`}
            onClick={onClose}
          >
            <IconClose />
          </button>
        </span>
      </header>

      {/* AI 目标检测框按需求暂不显示（数据见 videoMonitorData.ts，恢复渲染即可） */}

      {/* 左上折叠按钮：展开/收起遥测信息面板（锁定时禁用） */}
      <button
        type="button"
        className={`vm-chip vm-chip--fold ${panelOpen ? 'vm-chip--fold-open' : ''}`}
        disabled={locked}
        aria-label={panelOpen ? '收起遥测信息' : '展开遥测信息'}
        aria-expanded={panelOpen}
        onClick={() => setPanelOpen((v) => !v)}
      >
        <IconChevron />
      </button>

      {/* 遥测信息面板：图传延迟 / 经纬度 / 姿态 / RTK / GPS（数据见 videoMonitorData.ts） */}
      {panelOpen && (
        <div className="vm-tele-panel">
          {channel.telemetry.map((item) => (
            <div key={item.label} className="vm-tele-row">
              {item.label}:{item.value}
            </div>
          ))}
        </div>
      )}

      {/* 参数设置面板：底部操作条 跟踪/跟随/打击 均可打开，标题与确认文案随操作变化 */}
      {panelAction && (
        <FollowSettingsPanel
          channel={channel}
          title={panelAction === 'track' ? '目标跟踪参数设置' : panelAction === 'strike' ? '目标打击参数设置' : '目标跟随参数设置'}
          confirmLabel={panelAction === 'track' ? '确认跟踪' : panelAction === 'strike' ? '确认打击' : '确认跟随'}
          onClose={() => setPanelAction(null)}
        />
      )}

      {/* 摇杆 / 右侧工具列（图标取自 src/assets/video-monitor/*.svg）；锁定时禁用 */}
      <Joystick disabled={locked} />
      <div className="vm-tools">
        <button
          type="button"
          className="vm-tool"
          disabled={locked}
          title="抓拍"
          aria-label="抓拍"
        >
          <img className="vm-tool-icon" src={iconSnapshot} alt="" />
        </button>
        <button
          type="button"
          className="vm-tool"
          disabled={locked}
          title={recording ? '停止录像' : '录像'}
          aria-label={recording ? '停止录像' : '录像'}
          aria-pressed={recording}
          onClick={() => {
            /* 倒计时进行中忽略重复点击，避免重新计时 */
            if (recordCountdown !== null) return
            /* 录像中再点一次：停止录像并复位计时 */
            if (recording) {
              setRecording(false)
              setRecordSeconds(0)
              return
            }
            setRecordCountdown(3)
          }}
        >
          {/* 录像进行中：图标切换为 Camera.svg（圆环+红色 REC 方块） */}
          <img className="vm-tool-icon" src={recording ? cameraRecording : iconRecord} alt="" />
        </button>
        {/* 录像时长：录像中显示于录像按钮正下方（mm:ss，如 15:24） */}
        {recording && (
          <span className="vm-record-duration">{formatRecordDuration(recordSeconds)}</span>
        )}
        <button
          type="button"
          className="vm-tool"
          disabled={locked}
          title="裁剪"
          aria-label="裁剪"
        >
          <img className="vm-tool-icon" src={iconCrop} alt="" />
        </button>
        <button
          type="button"
          className="vm-tool"
          disabled={locked}
          title={expanded ? '取消全屏' : '全屏'}
          aria-label={expanded ? '取消全屏' : '全屏'}
          aria-pressed={expanded}
          onClick={onToggleExpand}
        >
          {/* 全屏态切换为 src/assets/home/fullscreen-exit.svg（取消全屏图标） */}
          <img className="vm-tool-icon" src={expanded ? exitFullscreenIcon : iconFullscreen} alt="" />
        </button>
      </div>

      {/* 录像倒计时浮层：Ellipse 72.svg 圆环（140×140）中心放置剩余秒数 3→2→1，
          数字白 0.6 / 100px / MiSans / 520；纯视觉提示，不拦截交互 */}
      {recordCountdown !== null && (
        <div
          className="vm-record-countdown"
          role="status"
          aria-label={`录像倒计时 ${recordCountdown} 秒`}
        >
          <img className="vm-record-countdown-ring" src={recordCountdownRingIcon} alt="" />
          <span className="vm-record-countdown-num">{recordCountdown}</span>
        </div>
      )}

      {/* 底部操作条：默认收起为「操作」按钮；点击展开 跟随/跟随/打击 三按钮，
          展开态左侧为箭头向右的收起 chip（点击收起）；锁定时全部禁用 */}
      {actionOpen ? (
        <div className="vm-action">
          <button
            type="button"
            className="vm-chip vm-chip--action"
            disabled={locked}
            aria-label="收起操作按钮"
            aria-expanded="true"
            onClick={() => setActionOpen(false)}
          >
            <IconChevron />
          </button>
          <div className="vm-action-pill">
            <button
              type="button"
              className={`vm-action-item ${panelAction === 'track' ? 'vm-action-item--active' : ''}`}
              disabled={locked}
              aria-expanded={panelAction === 'track'}
              onClick={() => setPanelAction(panelAction === 'track' ? null : 'track')}
            >
              跟踪
            </button>
            <i className="vm-action-sep" />
            <button
              type="button"
              className={`vm-action-item ${panelAction === 'follow' ? 'vm-action-item--active' : ''}`}
              disabled={locked}
              aria-expanded={panelAction === 'follow'}
              onClick={() => setPanelAction(panelAction === 'follow' ? null : 'follow')}
            >
              跟随
            </button>
            <i className="vm-action-sep" />
            <button
              type="button"
              className={`vm-action-item ${panelAction === 'strike' ? 'vm-action-item--active' : ''}`}
              disabled={locked}
              aria-expanded={panelAction === 'strike'}
              onClick={() => setPanelAction(panelAction === 'strike' ? null : 'strike')}
            >
              打击
            </button>
          </div>
        </div>
      ) : (
        <div className="vm-action vm-action--single">
          <div className="vm-action-pill">
            <button
              type="button"
              className="vm-action-item"
              disabled={locked}
              aria-expanded="false"
              onClick={() => setActionOpen(true)}
            >
              操作
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

/* ---------------- 右栏「其他在线设备」小卡 ---------------- */

function MiniDeviceItem({
  name,
  battery,
  offsetSec = 0,
  videoSrc,
  draggable = false,
  onDragStart,
}: {
  name: string
  battery: number
  offsetSec?: number
  videoSrc?: string
  /** 可按住鼠标左键拖动至主区空占位（HTML5 拖放源）；页面锁定时置 false 禁止拖拽 */
  draggable?: boolean
  onDragStart?: (e: ReactDragEvent<HTMLDivElement>) => void
}) {
  return (
    <div
      className="vm-mini"
      draggable={draggable}
      onDragStart={onDragStart}
      title={draggable ? '可按住左键拖动到主区空占位' : undefined}
    >
      <div className="vm-mini-video">
        <PlaceholderVideoStream src={videoSrc} offsetSec={offsetSec} />
      </div>
      <div className="vm-mini-bar">
        <span className="vm-mini-name">{name}</span>
        <span className="vm-mini-status">
          <IconDrone size={16} />
          <span className="vm-mini-track">跟踪中</span>
          <span className="vm-mini-battery">
            <IconBattery size={16} pct={battery} />
            {battery}%
          </span>
        </span>
      </div>
    </div>
  )
}

/* ---------------- 页面 ---------------- */

export function VideoMonitorPage() {
  const [view, setView] = useState<'grid' | 'tiled'>('grid')
  const [asideOpen, setAsideOpen] = useState(true)
  /** 已关闭画面集合（叉号关闭后格子保留为空占位，刷新页面恢复） */
  const [closedIds, setClosedIds] = useState<ReadonlySet<string>>(new Set())
  /** 空占位承接的设备映射：通道 id → 拖入的右栏设备 id（拖入后从右栏移除） */
  const [assignedDevices, setAssignedDevices] = useState<Record<string, string>>({})
  /** 拖拽悬停高亮的空占位通道 id */
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const closeChannel = (id: string) => {
    setClosedIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    /* 关闭承接设备的占位时映射一并清除，该设备回到右栏小卡列表 */
    setAssignedDevices((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
    /* 关闭的恰为展开画面时同步收起，避免 expandedId 残留指向已卸载画面 */
    setExpandedId((prev) => (prev === id ? null : prev))
  }
  /** 锁定框状态：未锁定显示 lock.svg（白色），锁定后切换为 lock-active.svg（橙色闭锁）；
      锁定期间下方全部操作禁用，仅锁定框可点击解锁 */
  const [locked, setLocked] = useState(false)
  /** 页内展开画面 id：非 null 时该画面铺满整个视图（非浏览器全屏） */
  const [expandedId, setExpandedId] = useState<string | null>(null)

  /* ESC 收起展开画面（与全屏一致的交互预期）；锁定期间不响应 */
  useEffect(() => {
    if (!expandedId || locked) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [expandedId, locked])

  return (
    <div className={`vm-page ${locked ? 'vm-page--locked' : ''}`}>
      {/* 顶栏 */}
      <header className="vm-topbar">
        <div className="vm-topbar-left">
          <h1 className="vm-title">智能无人集群图传系统</h1>
        </div>

        {/* 视图切换 + 其右侧 24px 的锁定框（锁定时视图切换一并禁用） */}
        <div className="vm-topbar-center">
          <div className="vm-view-switch" role="tablist" aria-label="视图切换">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'grid'}
              className={`vm-view-btn vm-view-btn--active-${view === 'grid'}`}
              disabled={locked}
              onClick={() => setView('grid')}
            >
              <IconGrid4 />
              四宫格视图
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'tiled'}
              className={`vm-view-btn vm-view-btn--active-${view === 'tiled'}`}
              disabled={locked}
              onClick={() => setView('tiled')}
            >
              <IconTile />
              平铺视图
            </button>
          </div>

          {/* 「平铺视图」按钮右侧 24px 处的 48×48 框（背景透明，与顶栏菜单栏
              背景色一致），中心展示 src/assets/task-panel/lock.svg
              （白色本体在深色顶栏背景上直接可见）。
              锁定后图标切换为 lock-active.svg 并禁用下方全部操作，再点一次解锁恢复 */}
          <button
            type="button"
            className={`vm-tiled-lock ${locked ? 'vm-tiled-lock--locked' : ''}`}
            title={locked ? '解锁' : '锁定'}
            aria-label={locked ? '解锁' : '锁定'}
            aria-pressed={locked}
            onClick={() => setLocked((v) => !v)}
          >
            <img className="vm-tiled-lock-icon" src={locked ? lockActiveIcon : lockIcon} alt="" />
          </button>
        </div>

        <div className="vm-topbar-right">
          {/* 在线数量前的图标：src/assets/task-panel/link.svg（白色 0.6 透明度） */}
          <span className="vm-online-count">
            <img className="vm-online-icon" src={linkIcon} alt="" />
            在线数量：{ONLINE_COUNT}
          </span>
          {/* 时间前图标：src/assets/task-panel/time.svg */}
          <span className="vm-clock-group">
            <img className="vm-clock-icon" src={timeIcon} alt="" />
            <TopBarClock />
          </span>
        </div>
      </header>

      {/* 主体：视频区 + 右栏；锁定态由 .vm-page--locked 整体屏蔽交互 */}
      <div className="vm-body">
        <main className={`vm-main ${view === 'tiled' ? 'vm-main--tiled' : 'vm-main--grid'}`}>
          {/* 保留原数组索引映射视频源槽位，避免关闭某路后其余画面视频源错位 */}
          {(view === 'tiled' ? TILED_CHANNELS : VIDEO_CHANNELS).map((ch, i) => {
            /* 叉号关闭的通道：格子占位保留，接受右栏设备按住左键拖入 */
            if (closedIds.has(ch.id)) {
              return (
                <div
                  key={ch.id}
                  className={`vm-slot-empty ${dragOverId === ch.id ? 'vm-slot-empty--over' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDragOverId(ch.id)
                  }}
                  onDragLeave={() => setDragOverId((prev) => (prev === ch.id ? null : prev))}
                  onDrop={(e) => {
                    e.preventDefault()
                    const deviceId = e.dataTransfer.getData('text/plain')
                    setDragOverId(null)
                    if (!deviceId) return
                    /* 设备落入占位：恢复该格并记录承接关系（设备从右栏移除） */
                    setClosedIds((prev) => {
                      const next = new Set(prev)
                      next.delete(ch.id)
                      return next
                    })
                    setAssignedDevices((prev) => ({ ...prev, [ch.id]: deviceId }))
                  }}
                >
                  拖动右侧设备至此占位
                </div>
              )
            }
            /* 拖入设备：复用平铺通道（tiled-<设备id>）的名称/遥测升格为完整画面卡，
               视频源沿用该设备在右栏时的槽位（原索引 + 主通道数）避免画面跳变 */
            const assignedDeviceId = assignedDevices[ch.id]
            const miniIndex = assignedDeviceId
              ? MINI_DEVICES.findIndex((d) => d.id === assignedDeviceId)
              : -1
            const channel =
              assignedDeviceId && miniIndex >= 0
                ? (TILED_CHANNELS.find((t) => t.id === `tiled-${assignedDeviceId}`) ?? ch)
                : ch
            return (
              <VideoChannelCard
                key={ch.id}
                channel={channel}
                offsetSec={i * 3}
                videoSrc={VIDEO_SOURCE_SLOTS[miniIndex >= 0 ? VIDEO_CHANNELS.length + miniIndex : i]}
                onClose={() => closeChannel(ch.id)}
                expanded={expandedId === ch.id}
                onToggleExpand={() => setExpandedId((prev) => (prev === ch.id ? null : ch.id))}
                locked={locked}
              />
            )
          })}
        </main>

        {/* 折叠把手（锁定时禁用） */}
        {view === 'grid' && (
        <button
          type="button"
          className={`vm-aside-toggle ${asideOpen ? '' : 'vm-aside-toggle--closed'}`}
          disabled={locked}
          aria-label={asideOpen ? '收起其他在线设备' : '展开其他在线设备'}
          title={asideOpen ? '收起' : '展开'}
          onClick={() => setAsideOpen((v) => !v)}
        >
          <span className={asideOpen ? 'vm-aside-toggle-icon' : 'vm-aside-toggle-icon vm-aside-toggle-icon--flip'}>
            <IconChevron />
          </span>
        </button>

        )}

        {view === 'grid' && asideOpen && (
          <aside className="vm-aside">
            <h2 className="vm-aside-title">其他在线设备</h2>
            <div className="vm-aside-list">
              {/* 已拖入空占位的设备从右栏移除；保留原数组索引映射视频源槽位；
                  锁定期间设备卡不可拖出（draggable=false） */}
              {MINI_DEVICES.map((d, i) => ({ d, i }))
                .filter(({ d }) => !Object.values(assignedDevices).includes(d.id))
                .map(({ d, i }) => (
                  <MiniDeviceItem
                    key={d.id}
                    name={d.name}
                    battery={d.battery}
                    offsetSec={i * 5}
                    videoSrc={VIDEO_SOURCE_SLOTS[VIDEO_CHANNELS.length + i]}
                    draggable={!locked}
                    onDragStart={(e) => {
                      /* 按住左键拖动：携带设备 id，落入主区空占位后升格为完整画面 */
                      e.dataTransfer.setData('text/plain', d.id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                  />
                ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

export default VideoMonitorPage