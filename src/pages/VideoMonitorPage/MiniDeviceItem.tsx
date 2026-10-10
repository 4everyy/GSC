/**
 * @file MiniDeviceItem.tsx
 * @description Aside mini device card extracted from VideoMonitorPage.tsx.
 * @author 4everyy
 * @date 2026-10-07
 */
import { type DragEvent as ReactDragEvent } from 'react'
import { pickDemoVideo, OfflineVideoStream } from './PlaceholderVideoStream'

/* ---------------- 右栏「其他在线设备」小卡 ---------------- */

/**
 * 画面阶段：暂无真实图传流——顶部一行设备名称，
 * 在线设备画面区统一以样例视频呈现（右栏小卡不保留「空视频位」占位；跟踪状态/电量暂不展示）；
 * 离线设备（online = false）画面区显示「设备已离线」占位（load-fail.png 图标）。
 * 在线/离线小卡均可按住左键拖入主区空占位（锁定期间禁止拖拽）。
 * 接真实流后可在此恢复 vm-mini-bar（名称/跟踪中/电量）等完整小卡 UI 并替换流地址。
 */
export function MiniDeviceItem({
  name,
  online = true,
  draggable = false,
  onDragStart,
}: {
  name: string
  /** 设备在线状态：false 时画面区显示「设备已离线」占位（替代样例视频） */
  online?: boolean
  /** 可按住鼠标左键拖动至主区空占位（HTML5 拖放源）；页面锁定时置 false 禁止拖拽（离线设备同样支持） */
  draggable?: boolean
  onDragStart?: (e: ReactDragEvent<HTMLDivElement>) => void
}) {
  return (
    <div
      className={`vm-mini ${online ? '' : 'vm-mini--offline'}`}
      draggable={draggable}
      onDragStart={onDragStart}
      title={draggable ? '可按住左键拖动到主区空占位' : undefined}
    >
      {/* 顶部一行：设备名称（原小卡信息条位置） */}
      <div className="vm-mini-bar">
        <span className="vm-mini-name">{name}</span>
      </div>
      <div className="vm-mini-video">
        {/* 离线设备 → load-fail.png「设备已离线」占位；在线设备 → 统一样例视频（接真实流后替换 src） */}
        {online ? (
          <video
            className="vm-video-stream"
            src={pickDemoVideo(name)}
            autoPlay
            muted
            loop
            playsInline
          />
        ) : (
          <OfflineVideoStream />
        )}
      </div>
    </div>
  )
}