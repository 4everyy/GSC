/**
 * @file VideoChannelCard.tsx
 * @description Single video channel card extracted from VideoMonitorPage.tsx.
 * @author 4everyy
 * @date 2026-10-07
 */
import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { type VideoChannel } from './videoMonitorData'
import {
  iconSnapshot,
  iconRecord,
  cameraRecording,
  iconCrop,
  iconFullscreen,
} from '../../assets/video-monitor'
import recordCountdownRingIcon from '../../assets/task-panel/Ellipse 72.svg'
import exitFullscreenIcon from '../../assets/home/fullscreen-exit.svg'
import formationIcon from '../../assets/home/icon-formation.png'
import { deviceImages } from '../../assets/device'
import { IconChevron, IconClose } from './VideoMonitorIcons'
import { Joystick } from './Joystick'
import { FollowSettingsPanel } from './FollowSettingsPanel'
import { OfflineVideoStream, pickDemoVideo } from './PlaceholderVideoStream'
import { LiveVideoStream, LIVE_STREAM_CHANNEL_IDS } from './LiveVideoStream'

/* ---------------- 画面抓拍 / 区域截图工具（工具列第 1 / 第 3 个按钮） ---------------- */

/** 选区矩形（局部坐标，px） */
type SnipRect = { x: number; y: number; w: number; h: number }

const clampNum = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

/** 由起点/当前点归一化选区（支持向左上方向拖拽，w/h 恒为正） */
const normSnipRect = (a: { x: number; y: number }, b: { x: number; y: number }): SnipRect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(a.x - b.x),
  h: Math.abs(a.y - b.y),
})

/** 截图文件名时间戳：YYYYMMDD-HHmmss */
const formatSnapStamp = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** object-fit: cover 显示映射：容器内选区 → 视频原始像素源区域（等比缩放 + 居中偏移） */
function coverSourceRect(
  video: HTMLVideoElement,
  sel: SnipRect,
  containerW: number,
  containerH: number,
): SnipRect {
  const scale = Math.max(containerW / video.videoWidth, containerH / video.videoHeight)
  const offsetX = (containerW - video.videoWidth * scale) / 2
  const offsetY = (containerH - video.videoHeight * scale) / 2
  const sx = clampNum((sel.x - offsetX) / scale, 0, video.videoWidth)
  const sy = clampNum((sel.y - offsetY) / scale, 0, video.videoHeight)
  return {
    x: sx,
    y: sy,
    w: clampNum((sel.x + sel.w - offsetX) / scale, 0, video.videoWidth) - sx,
    h: clampNum((sel.y + sel.h - offsetY) / scale, 0, video.videoHeight) - sy,
  }
}

/** 按选区截取视频当前帧为 PNG Blob（选区经 cover 映射换算到原始分辨率，不丢像素） */
async function captureVideoFrame(
  video: HTMLVideoElement,
  sel: SnipRect,
  containerW: number,
  containerH: number,
): Promise<Blob | null> {
  const src = coverSourceRect(video, sel, containerW, containerH)
  if (src.w < 2 || src.h < 2) return null
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(src.w)
  canvas.height = Math.round(src.h)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, src.x, src.y, src.w, src.h, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

/** 抓拍整帧：按视频原始分辨率截取当前画面为 PNG Blob（不丢像素、不受 cover 裁切影响） */
async function captureVideoFullFrame(video: HTMLVideoElement): Promise<Blob | null> {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

/** 触发浏览器下载（Blob → 临时 a 标签点击后回收） */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/* ---------------- 单路视频画面 ---------------- */

/** 拖拽把手排除区：这些控件上按下鼠标不触发画面拖动（摇杆/工具列/操作条/面板/输入/截图框选） */
const DRAG_BLOCK_SELECTOR =
  'button, input, .vm-joystick, .vm-tools, .vm-action, .vm-tele-panel, .vm-follow, .vm-snip-overlay'

export function VideoChannelCard({
  channel,
  onClose,
  expanded = false,
  onToggleExpand,
  locked = false,
  layoutFixed = false,
  channelId,
  dragging = false,
  dragOver = false,
  onChannelDragStart,
  onChannelDragOver,
  onChannelDragLeave,
  onChannelDrop,
  onChannelDragEnd,
}: {
  channel: VideoChannel
  onClose?: () => void
  /** 页内展开态：当前画面铺满整个视图（工具列末位按钮切换，非浏览器全屏） */
  expanded?: boolean
  /** 切换展开/收起 */
  onToggleExpand?: () => void
  /** 页面锁定态：禁用画面内全部操作（关闭/摇杆/工具列/操作条/参数面板/拖拽），解锁后恢复 */
  locked?: boolean
  /** 布局固定（平铺视图）：不渲染关闭叉号、禁用拖拽源/放置目标——
      叉掉关闭与拖动换位/设备拖入承接仅四宫格视图提供 */
  layoutFixed?: boolean
  /** 本画面所属格子（通道）id：主区画面拖动换位的拖拽标识 */
  channelId: string
  /** 本画面正处于拖拽源状态（半透明展示） */
  dragging?: boolean
  /** 其他画面/设备正拖拽悬停在本格上（青色描边提示可放置） */
  dragOver?: boolean
  /** 拖拽开始（携带本格 id） */
  onChannelDragStart?: (channelId: string) => void
  /** 拖拽悬停进入本格 */
  onChannelDragOver?: (channelId: string) => void
  /** 拖拽悬停离开本格 */
  onChannelDragLeave?: (channelId: string) => void
  /** 放置到本格：payload 为拖拽负载（「channel:」前缀 = 主区画面互换，否则为右栏设备顶替） */
  onChannelDrop?: (channelId: string, payload: string) => void
  /** 拖拽结束（含取消）：复位拖拽态 */
  onChannelDragEnd?: (channelId: string) => void
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
  /** 区域截图模式：工具列第 3 个按钮进入，画面上框选后截取当前帧 */
  const [snipMode, setSnipMode] = useState(false)
  /** 框选起点（画面局部坐标，px）；null = 未开始拖拽 */
  const [snipStart, setSnipStart] = useState<{ x: number; y: number } | null>(null)
  /** 当前选区（画面局部坐标，px）；null = 尚未拖出 */
  const [snipRect, setSnipRect] = useState<SnipRect | null>(null)
  /** 截图结果提示（toast 文案，自动消失） */
  const [snipToast, setSnipToast] = useState<string | null>(null)
  /** 截图成功白闪反馈（短暂播放后自动消失） */
  const [snipFlash, setSnipFlash] = useState(false)
  /** 画面内 <video> 引用：抓拍/截图时取当前帧 */
  const videoRef = useRef<HTMLVideoElement>(null)

  /** 录像时长 mm:ss 格式化（不足 1 小时按 分:秒 展示） */
  const formatRecordDuration = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    const p = (n: string | number) => String(n).padStart(2, '0')
    return `${p(m)}:${p(s)}`
  }

  /* ---------- 抓拍 / 区域截图交互 ---------- */

  /** 退出截图模式并清空选区 */
  const exitSnip = () => {
    setSnipMode(false)
    setSnipStart(null)
    setSnipRect(null)
  }

  /* 锁定时收起画面内的展开浮层（遥测面板/操作条/参数设置/截图模式），画面转为纯监视 */
  useEffect(() => {
    if (!locked) return
    setPanelOpen(false)
    setActionOpen(false)
    setPanelAction(null)
    exitSnip()
  }, [locked])

  /* 截图模式：ESC 退出（与页内展开画面的退出习惯一致） */
  useEffect(() => {
    if (!snipMode) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitSnip()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [snipMode])

  /* 截图提示 toast：2.6s 后自动消失 */
  useEffect(() => {
    if (!snipToast) return
    const timer = window.setTimeout(() => setSnipToast(null), 2600)
    return () => window.clearTimeout(timer)
  }, [snipToast])

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

  /** 工具列第 1 个按钮：抓拍当前画面整帧并下载（复用截图的白闪/Toast 反馈） */
  const takeSnapshot = async () => {
    const video = videoRef.current
    if (!video || video.readyState < 2 || !video.videoWidth) {
      setSnipToast('视频尚未就绪，请稍后重试')
      return
    }
    try {
      const blob = await captureVideoFullFrame(video)
      if (!blob) {
        setSnipToast('抓拍失败，请稍后重试')
        return
      }
      const filename = `抓拍_${channel.name}_${formatSnapStamp()}.png`
      downloadBlob(blob, filename)
      setSnipFlash(true)
      window.setTimeout(() => setSnipFlash(false), 380)
      setSnipToast(`已保存抓拍：${filename}`)
    } catch (err) {
      setSnipToast(`抓拍失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /** 工具列第 3 个按钮：进入/退出截图模式 */
  const toggleSnipMode = () => {
    if (snipMode) {
      exitSnip()
      return
    }
    setSnipStart(null)
    setSnipRect(null)
    setSnipMode(true)
  }

  const onSnipPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const box = e.currentTarget.getBoundingClientRect()
    e.currentTarget.setPointerCapture(e.pointerId)
    setSnipStart({ x: e.clientX - box.left, y: e.clientY - box.top })
    setSnipRect(null)
  }

  const onSnipPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!snipStart) return
    const box = e.currentTarget.getBoundingClientRect()
    const cur = {
      x: clampNum(e.clientX - box.left, 0, box.width),
      y: clampNum(e.clientY - box.top, 0, box.height),
    }
    setSnipRect(normSnipRect(snipStart, cur))
  }

  const onSnipPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!snipStart) return
    const box = e.currentTarget.getBoundingClientRect()
    const cur = {
      x: clampNum(e.clientX - box.left, 0, box.width),
      y: clampNum(e.clientY - box.top, 0, box.height),
    }
    const sel = normSnipRect(snipStart, cur)
    setSnipStart(null)
    /* 过小选区视为单击空白：退出截图模式 */
    if (sel.w < 6 || sel.h < 6) {
      exitSnip()
      return
    }
    void finishSnip(sel, box.width, box.height)
  }

  /** 截取选区当前帧并下载（cover 映射到原始分辨率，避免截到容器黑边） */
  const finishSnip = async (sel: SnipRect, containerW: number, containerH: number) => {
    setSnipMode(false)
    setSnipRect(null)
    const video = videoRef.current
    if (!video || video.readyState < 2 || !video.videoWidth) {
      setSnipToast('视频尚未就绪，请稍后重试')
      return
    }
    try {
      const blob = await captureVideoFrame(video, sel, containerW, containerH)
      if (!blob) {
        setSnipToast('所选区域不在视频画面内')
        return
      }
      const filename = `截图_${channel.name}_${formatSnapStamp()}.png`
      downloadBlob(blob, filename)
      setSnipFlash(true)
      window.setTimeout(() => setSnipFlash(false), 380)
      setSnipToast(`已保存截图：${filename}`)
    } catch (err) {
      setSnipToast(`截图失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /* 画面形态：在线设备恒有流（四宫格/平铺两视图数据一致——同一设备在两个视图
     按设备名确定性播放同一路样例视频，右栏小卡同源，不再按名字哈希随机出现
     「空视频位」）；设备离线（online = false）显示「设备已离线」占位。
     接真实流后由后端流状态驱动（无流设备可在 PlaceholderVideoStream.tsx 恢复
     「空视频位」形态：PlaceholderVideoStream / hasDemoStream 已保留）。 */
  /* 真实流接入：名单内通道经 WHEP/WebRTC 播放现场直播流（LiveVideoStream，见该文件头说明），
     其余通道播放按名字确定性分配的样例视频（各路流就绪后在 LIVE_STREAM_CHANNEL_IDS 扩展） */
  const isLiveChannel = channel.online && LIVE_STREAM_CHANNEL_IDS.includes(channel.id)
  const hasStream = channel.online

  /* ---------- 主区画面拖动换位（HTML5 拖拽）：画面卡既是拖拽源也是放置目标 ---------- */

  /** 无流/有流两处 section 根共用的拖拽源 + 放置目标属性 */
  const channelDragProps = {
    draggable: !locked && !expanded && !layoutFixed,
    onDragStart: (e: ReactDragEvent<HTMLElement>) => {
      /* 摇杆/工具列/操作条/面板等交互控件上按下不发起拖动 */
      if ((e.target as HTMLElement).closest(DRAG_BLOCK_SELECTOR)) {
        e.preventDefault()
        return
      }
      /* 携带「channel:」前缀通道 id，与右栏设备拖拽（裸设备 id）区分 */
      e.dataTransfer.setData('text/plain', `channel:${channelId}`)
      e.dataTransfer.effectAllowed = 'move'
      onChannelDragStart?.(channelId)
    },
    onDragOver: (e: ReactDragEvent<HTMLElement>) => {
      if (locked || layoutFixed) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      onChannelDragOver?.(channelId)
    },
    onDragLeave: () => onChannelDragLeave?.(channelId),
    onDrop: (e: ReactDragEvent<HTMLElement>) => {
      e.preventDefault()
      onChannelDrop?.(channelId, e.dataTransfer.getData('text/plain'))
    },
    onDragEnd: () => onChannelDragEnd?.(channelId),
  }

  if (!hasStream) {
    return (
      <section
        className={`vm-channel ${expanded ? 'vm-channel--expanded' : ''} ${
          dragging ? 'vm-channel--dragging' : ''
        } ${dragOver ? 'vm-channel--drop-over' : ''}`}
        aria-label={`${channel.name} 视频画面`}
        {...channelDragProps}
      >
        {/* 顶部一行：设备名称（原信息条位置）+ 右侧关闭叉号；
            此分支仅为离线画面（在线设备恒有流）：叉号关闭后设备顶回右栏列表，
            平铺视图（layoutFixed）布局固定，不提供叉掉 */}
        <header className="vm-channel-bar">
          <span className="vm-channel-name">{channel.name}</span>
          <span className="vm-channel-right">
            {!layoutFixed && (
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
            )}
          </span>
        </header>
        <div className="vm-video">
          {/* 设备离线 → load-fail.png「设备已离线」占位（可叉掉顶回右栏） */}
          <OfflineVideoStream />
        </div>
      </section>
    )
  }

  return (
    <section
      className={`vm-channel ${expanded ? 'vm-channel--expanded' : ''} ${
        dragging ? 'vm-channel--dragging' : ''
      } ${dragOver ? 'vm-channel--drop-over' : ''}`}
      aria-label={`${channel.name} 视频画面`}
      {...channelDragProps}
    >
      {/* 画面区：真实流通道走 WHEP/WebRTC 播放器；demo 通道播放按 id 随机分配的样例视频 */}
      <div className="vm-video">
        {isLiveChannel ? (
          <LiveVideoStream videoRef={videoRef} />
        ) : (
          <video
            ref={videoRef}
            className="vm-video-stream"
            src={pickDemoVideo(channel.name)}
            autoPlay
            muted
            loop
            playsInline
          />
        )}
      </div>
      <div className="vm-video-shade" />

      {/* 信息条 */}
      <header className="vm-channel-bar">
        <img className="vm-channel-icon" src={formationIcon} alt="" />
        <span className="vm-channel-name">{channel.name}</span>
        <span className="vm-channel-right">
          <span className="vm-online">{channel.online ? '在线' : '离线'}</span>
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
          {/* 电量右侧：关闭画面叉号按钮（锁定时禁用；平铺视图布局固定，不提供叉掉） */}
          {!layoutFixed && (
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
          )}
        </span>
      </header>

      {/* AI 目标检测框按需求暂不显示（数据见 videoMonitorData.ts，恢复渲染即可） */}

      {/* 左上折叠按钮：展开/收起遥测信息面板（锁定时禁用）；
          平铺视图与右栏小卡一致，仅展示画面不提供交互按钮 */}
      {!layoutFixed && (
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
      )}

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
          title={
            panelAction === 'track'
              ? '目标跟踪参数设置'
              : panelAction === 'strike'
                ? '目标打击参数设置'
                : '目标跟随参数设置'
          }
          confirmLabel={
            panelAction === 'track'
              ? '确认跟踪'
              : panelAction === 'strike'
                ? '确认打击'
                : '确认跟随'
          }
          onClose={() => setPanelAction(null)}
        />
      )}

      {/* 摇杆 / 右侧工具列（图标取自 src/assets/video-monitor/*.svg）；锁定时禁用；
          平铺视图不提供画面内交互（与右栏小卡一致） */}
      {!layoutFixed && (
        <>
          <Joystick disabled={locked} />
          <div className="vm-tools">
            {/* 第 1 个按钮：抓拍——截取当前画面整帧（原始分辨率）下载保存 */}
            <button
              type="button"
              className="vm-tool"
              disabled={locked}
              title="抓拍"
              aria-label="抓拍"
              onClick={takeSnapshot}
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
            {/* 第 3 个按钮：区域截图——点击进入截图模式，画面上框选后自动截取当前帧下载 */}
            <button
              type="button"
              className={`vm-tool ${snipMode ? 'vm-tool--active' : ''}`}
              disabled={locked}
              title={snipMode ? '取消截图' : '截图'}
              aria-label={snipMode ? '取消截图' : '截图'}
              aria-pressed={snipMode}
              onClick={toggleSnipMode}
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
              <img
                className="vm-tool-icon"
                src={expanded ? exitFullscreenIcon : iconFullscreen}
                alt=""
              />
            </button>
          </div>
        </>
      )}

      {/* 区域截图浮层：全画面接收框选（青色选框 + 四角标记 + 尺寸标注，四周压暗），
          松开左键即截取当前帧下载；ESC 或空白处单击取消 */}
      {snipMode && (
        <div
          className="vm-snip-overlay"
          role="application"
          aria-label="框选截图区域"
          onPointerDown={onSnipPointerDown}
          onPointerMove={onSnipPointerMove}
          onPointerUp={onSnipPointerUp}
          onPointerCancel={exitSnip}
        >
          <span className="vm-snip-hint">按住左键框选截图区域，松开自动保存（ESC 取消）</span>
          {snipRect && snipRect.w > 0 && snipRect.h > 0 && (
            <div
              className="vm-snip-box"
              style={{
                left: snipRect.x,
                top: snipRect.y,
                width: snipRect.w,
                height: snipRect.h,
              }}
            >
              <i className="vm-snip-corner vm-snip-corner--tl" />
              <i className="vm-snip-corner vm-snip-corner--tr" />
              <i className="vm-snip-corner vm-snip-corner--bl" />
              <i className="vm-snip-corner vm-snip-corner--br" />
              <span className="vm-snip-size">
                {Math.round(snipRect.w)}×{Math.round(snipRect.h)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 截图成功白闪 + 结果提示 toast */}
      {snipFlash && <div className="vm-snip-flash" aria-hidden="true" />}
      {snipToast && (
        <div className="vm-snip-toast" role="status">
          {snipToast}
        </div>
      )}

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
          展开态左侧为箭头向右的收起 chip（点击收起）；锁定时全部禁用；
          平铺视图不提供画面内交互（与右栏小卡一致） */}
      {!layoutFixed &&
        (actionOpen ? (
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
        ))}
    </section>
  )
}