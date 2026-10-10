/**
 * @file VideoMonitorPage.tsx
 * @description VideoMonitorPage —— 视频监测屏（双屏视角第二屏）。 依据 demo.txt 设计稿还原（1920×1080）： - 顶栏：系统标题「智能无人集群图传系统」/ 实时时钟 / 四宫格-平铺视图切换 / 在线数量； - 顶栏「平铺视图」切换按钮右侧 24px 处放置 48×48 框（背景与顶栏菜单栏一致）， 中心展示 lock.svg 图标（素材：src/assets/task-panel/lock.svg）； - 顶栏锁定框：点击在 lock.svg（未锁）↔ lock-active.svg（锁定）间切换；锁定期间页面下方 全部操作（视图切换/画面内摇杆/工具列/操作条/参数面板/拖拽/右栏折叠）均禁用， 仅锁定框本身可点击，解锁后方可继续对应操作； - 顶栏「在线数量」前的图标使用 src/assets/task-panel/link.svg； - 主区：四宫格视频画面（768×432 一路），含信息条（设备名/在线/电量）、 左下虚拟摇杆、右侧工具列（抓拍/录像/裁剪/全屏，图标取自 video-monitor 素材）、 底部操作条（默认「操作」按钮；点击展开 跟随|跟随|打击 三按钮，左侧箭头向右的 chip 收起）； - 点击操作条中的「跟踪/跟随/打击」在画面右侧（距容器右缘 16px、距标题条底部 16px）展开对应参数设置面板（目标跟踪/目标跟随/目标打击参数设置）： 目标ID（下拉）/ 跟随距离 / 跟随高度（-1/数值/+1 步进，单位 m）/ 跟随方位（自动|左后|右后|右后 四段）/ 确认打击 / 取消； - 右栏：「其他在线设备」小卡列表（跟踪中状态 + 电量），可折叠； - 信息条右上角叉号关闭画面后格子占位保留（渲染空占位）， 支持将右栏小卡设备按住鼠标左键拖入空占位升格为完整画面（拖入后从右栏移除）； 画面阶段：暂无真实图传流，在线画面恒有流、按设备名确定性播放样例视频（四宫格/平铺两视图数据一致，同一设备两视图画面相同）， 离线画面显示「设备已离线」占位（见 PlaceholderVideoStream.tsx）；叉号关闭后的空格子保留「空视频位」占位 （src/assets/task-panel/Camera.svg 图标 + 文案），等待右栏设备拖入承接； 后续接真实图传流时在 LiveVideoStream / PlaceholderVideoStream 中接入流地址即可。 注：画面内目标标记框（vm-target）按需求暂不显示，mock 数据保留在 videoMonitorData.ts，后续需要时在此恢复渲染即可。 登录门控：由 App.tsx 统一控制，未登录不会进入本屏。
 * @author 4everyy
 * @date 2026-10-07
 */

import { useEffect, useState } from 'react'
import {
  MINI_DEVICES,
  MINI_OFFLINE_DEVICES,
  ONLINE_COUNT,
  TILED_CHANNELS,
  VIDEO_CHANNELS,
  type VideoChannel,
} from './videoMonitorData'
import lockIcon from '../../assets/task-panel/lock.svg'
import lockActiveIcon from '../../assets/task-panel/lock-active.svg'
import linkIcon from '../../assets/task-panel/link.svg'
import timeIcon from '../../assets/task-panel/time.svg'
import cameraIcon from '../../assets/task-panel/Camera.svg'
import './VideoMonitorPage.css'
import { IconChevron, IconGrid4, IconTile } from './VideoMonitorIcons'
import { TopBarClock } from './TopBarClock'
import { VideoChannelCard } from './VideoChannelCard'
import { MiniDeviceItem } from './MiniDeviceItem'

/* ---------------- 页面 ---------------- */

export function VideoMonitorPage() {
  const [view, setView] = useState<'grid' | 'tiled'>('grid')
  const [asideOpen, setAsideOpen] = useState(true)
  /** 已关闭画面集合（叉号关闭后格子保留为空占位，刷新页面恢复） */
  const [closedIds, setClosedIds] = useState<ReadonlySet<string>>(new Set())
  /**
   * 被叉掉画面的设备标识队列：按叉掉先后倒序（最新叉掉的排最前），
   * 固定展示在右栏「其他在线设备」列表最上方。
   * 标识取设备维度：主通道为通道 id（cam-XX），平铺小卡通道为其设备 id（mini-N）。
   */
  const [closedOrder, setClosedOrder] = useState<string[]>([])
  /** 空占位承接的设备映射：通道 id → 拖入的右栏设备 id（拖入后从右栏移除） */
  const [assignedDevices, setAssignedDevices] = useState<Record<string, string>>({})
  /** 拖拽悬停高亮的空占位通道 id */
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  /** 主区通道渲染顺序：四宫格/平铺各维护一份通道 id 列表，
      主区画面拖动换位即交换两格在列表中的位置（空占位/承接关系按通道 id 维度不变） */
  const [orders, setOrders] = useState<Record<'grid' | 'tiled', string[]>>({
    grid: VIDEO_CHANNELS.map((c) => c.id),
    tiled: TILED_CHANNELS.map((c) => c.id),
  })
  /** 主区画面拖拽源通道 id：正在被拖动的画面（null 为无拖拽） */
  const [dragChannelId, setDragChannelId] = useState<string | null>(null)
  /** 主区画面拖拽悬停目标通道 id（高亮提示可放置） */
  const [dragOverChannelId, setDragOverChannelId] = useState<string | null>(null)
  /** 通道 id → 设备标识：平铺小卡通道（tiled-<设备id>）取其设备 id，主通道即通道 id 自身 */
  const deviceKeyOf = (channelId: string) =>
    channelId.startsWith('tiled-') ? channelId.slice('tiled-'.length) : channelId
  const closeChannel = (id: string) => {
    setClosedIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    /* 被叉掉画面的设备自动顶到右栏「其他在线设备」列表最上方（后叉掉的排最前，重复叉掉去重）；
       占位曾承接其他设备时优先顶到该设备（画面里消失的是它） */
    const deviceKey = assignedDevices[id] ?? deviceKeyOf(id)
    setClosedOrder((prev) => [deviceKey, ...prev.filter((k) => k !== deviceKey)])
    /* 关闭承接设备的占位时映射一并清除，该设备同样顶到右栏列表最上方 */
    setAssignedDevices((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
    /* 关闭的恰为展开画面时同步收起，避免 expandedId 残留指向已卸载画面 */
    setExpandedId((prev) => (prev === id ? null : prev))
  }
  /** 当前视图的通道清单：四宫格 = 主通道，平铺 = 平铺通道（渲染顺序由 orders 决定） */
  const viewChannels = view === 'tiled' ? TILED_CHANNELS : VIDEO_CHANNELS
  /** 按用户拖动换位后的顺序取当前视图的通道列表 */
  const orderedChannels = orders[view]
    .map((id) => viewChannels.find((c) => c.id === id))
    .filter((c): c is VideoChannel => Boolean(c))
  /** 主区画面拖动换位：交换两个通道格的渲染位置（画面内容随通道 id 一起移动） */
  const swapChannels = (aId: string, bId: string) => {
    if (aId === bId) return
    setOrders((prev) => {
      const list = [...prev[view]]
      const i = list.indexOf(aId)
      const j = list.indexOf(bId)
      if (i < 0 || j < 0) return prev
      const tmp = list[i]
      list[i] = list[j]
      list[j] = tmp
      return { ...prev, [view]: list }
    })
  }
  /** 右栏设备拖入画面格：设备从右栏移除并升格为该格完整画面。
      原画面设备按「叉掉置顶」规则顶到右栏列表最上方（交换语义，右栏总数不变） */
  const replaceChannelWithDevice = (channelId: string, deviceId: string) => {
    const displacedKey = assignedDevices[channelId] ?? deviceKeyOf(channelId)
    setClosedOrder((prev) => {
      const rest = prev.filter((k) => k !== deviceId && k !== displacedKey)
      return [displacedKey, ...rest]
    })
    setAssignedDevices((prev) => ({ ...prev, [channelId]: deviceId }))
    /* 该格若此前被叉掉为空占位，顶替后恢复开启 */
    setClosedIds((prev) => {
      if (!prev.has(channelId)) return prev
      const next = new Set(prev)
      next.delete(channelId)
      return next
    })
    setExpandedId((prev) => (prev === channelId ? null : prev))
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
          {orderedChannels.map((ch) => {
            /* 拖拽悬停目标：主区画面/设备拖入本格时高亮（拖拽源自身不高亮） */
            const isDropOver = dragOverChannelId === ch.id && dragChannelId !== ch.id
            /* 叉号关闭的通道：格子占位保留，接受右栏设备/主区画面拖入 */
            if (closedIds.has(ch.id)) {
              return (
                <div
                  key={ch.id}
                  className={`vm-slot-empty ${dragOverId === ch.id || isDropOver ? 'vm-slot-empty--over' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDragOverId(ch.id)
                  }}
                  onDragLeave={() => setDragOverId((prev) => (prev === ch.id ? null : prev))}
                  onDrop={(e) => {
                    e.preventDefault()
                    const payload = e.dataTransfer.getData('text/plain')
                    setDragOverId(null)
                    if (!payload) return
                    /* 主区画面拖入空占位：两格互换位置（画面与被叉掉占位换位） */
                    if (payload.startsWith('channel:')) {
                      swapChannels(ch.id, payload.slice('channel:'.length))
                      return
                    }
                    /* 设备落入空占位：恢复该格并记录承接关系（设备从右栏移除，右栏净减一）；
                        原被叉掉置顶的设备卡保留在右栏（该设备仅失去画面归属，不随拖入丢失） */
                    setClosedIds((prev) => {
                      const next = new Set(prev)
                      next.delete(ch.id)
                      return next
                    })
                    setAssignedDevices((prev) => ({ ...prev, [ch.id]: payload }))
                  }}
                >
                  {/* 空占位样式融合：保留「空视频位」占位（Camera 图标 + 文案），
                      叠加拖入提示「拖动右侧设备至此占位」，整体居中展示 */}
                  <img className="vm-slot-empty-icon" src={cameraIcon} alt="" />
                  <span className="vm-slot-empty-title">空视频位</span>
                  <span className="vm-slot-empty-hint">拖动右侧设备至此占位</span>
                </div>
              )
            }
            /* 拖入设备：复用平铺通道（tiled-<设备id>，含在线/离线设备，离线通道已并入
               TILED_CHANNELS）的名称/遥测升格为完整画面卡（离线设备拖入后画面
               显示「设备已离线」占位）；拖入的是被叉掉的主通道设备（cam-XX）时
               回退到 VIDEO_CHANNELS 查找 */
            const assignedDeviceId = assignedDevices[ch.id]
            const channel = assignedDeviceId
              ? (TILED_CHANNELS.find((t) => t.id === `tiled-${assignedDeviceId}`) ??
                VIDEO_CHANNELS.find((c) => c.id === assignedDeviceId) ??
                ch)
              : ch
            return (
              <VideoChannelCard
                key={ch.id}
                channelId={ch.id}
                channel={channel}
                /* 平铺视图布局固定：不渲染关闭叉号、禁用画面拖动/拖入承接
                    （叉掉与拖动换位仅四宫格视图提供） */
                layoutFixed={view === 'tiled'}
                onClose={() => closeChannel(ch.id)}
                expanded={expandedId === ch.id}
                onToggleExpand={() => setExpandedId((prev) => (prev === ch.id ? null : ch.id))}
                locked={locked}
                dragging={dragChannelId === ch.id}
                dragOver={isDropOver}
                onChannelDragStart={(id) => setDragChannelId(id)}
                onChannelDragOver={(id) => setDragOverChannelId(id)}
                onChannelDragLeave={() =>
                  setDragOverChannelId((prev) => (prev === ch.id ? null : prev))
                }
                onChannelDrop={(targetId, payload) => {
                  /* 主区画面拖入其他画面格：两格互换位置 */
                  if (payload.startsWith('channel:')) {
                    swapChannels(targetId, payload.slice('channel:'.length))
                    return
                  }
                  /* 右栏设备拖入已占用画面：设备顶替该画面，原画面设备顶到右栏最上方 */
                  if (payload) replaceChannelWithDevice(targetId, payload)
                }}
                onChannelDragEnd={() => {
                  setDragChannelId(null)
                  setDragOverChannelId(null)
                }}
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
            <span
              className={
                asideOpen
                  ? 'vm-aside-toggle-icon'
                  : 'vm-aside-toggle-icon vm-aside-toggle-icon--flip'
              }
            >
              <IconChevron />
            </span>
          </button>
        )}

        {view === 'grid' && asideOpen && (
          <aside className="vm-aside">
            <h2 className="vm-aside-title">其他在线设备</h2>
            <div className="vm-aside-list">
              {/* 被叉掉画面的设备卡：按叉掉先后倒序（最新叉掉的排最前）固定排列在列表最上方；
                  已被其他空占位承接的设备不再重复展示；锁定期间不可拖出（draggable=false） */}
              {closedOrder
                .filter((key) => !Object.values(assignedDevices).includes(key))
                .map((key) => {
                  /* 置顶卡可能是主通道设备（cam-XX）/在线小卡（mini-N）/离线小卡（offline-mini-N），
                     离线设备置顶时同样以「设备已离线」占位小卡展示且可再拖入主区；
                     在线状态按数据源标记判定（cam-04 主通道本身离线） */
                  const device =
                    MINI_DEVICES.find((d) => d.id === key) ??
                    MINI_OFFLINE_DEVICES.find((d) => d.id === key) ??
                    VIDEO_CHANNELS.find((c) => c.id === key)
                  if (!device) return null
                  const isOnline =
                    'online' in device ? device.online : MINI_DEVICES.some((d) => d.id === key)
                  return (
                    <MiniDeviceItem
                      key={key}
                      name={device.name}
                      online={isOnline}
                      draggable={!locked}
                      onDragStart={(e) => {
                        /* 按住左键拖动：携带设备标识，落入主区空占位后升格为完整画面 */
                        e.dataTransfer.setData('text/plain', key)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                    />
                  )
                })}
              {/* 常规小卡列表：已拖入空占位、或已因叉掉置顶展示的设备不再重复出现 */}
              {MINI_DEVICES.map((d) => ({ d }))
                .filter(({ d }) => !Object.values(assignedDevices).includes(d.id))
                .filter(({ d }) => !closedOrder.includes(d.id))
                .map(({ d }) => (
                  <MiniDeviceItem
                    key={d.id}
                    name={d.name}
                    draggable={!locked}
                    onDragStart={(e) => {
                      /* 按住左键拖动：携带设备 id，落入主区空占位后升格为完整画面 */
                      e.dataTransfer.setData('text/plain', d.id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                  />
                ))}
              {/* 离线设备栏位：排列在全部在线设备之后，画面显示「设备已离线」占位；
                  同样支持按住左键拖入主区空占位（升格为「设备已离线」完整画面卡），
                  已拖入占位、或已因叉掉置顶展示的设备不再重复出现（与在线小卡段过滤规则一致） */}
              {MINI_OFFLINE_DEVICES.map((d) => ({ d }))
                .filter(({ d }) => !Object.values(assignedDevices).includes(d.id))
                .filter(({ d }) => !closedOrder.includes(d.id))
                .map(({ d }) => (
                  <MiniDeviceItem
                    key={d.id}
                    name={d.name}
                    online={false}
                    draggable={!locked}
                    onDragStart={(e) => {
                      /* 按住左键拖动：携带设备 id，落入主区空占位后升格为离线画面卡 */
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
