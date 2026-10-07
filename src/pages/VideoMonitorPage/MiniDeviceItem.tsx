/**
 * @file MiniDeviceItem.tsx
 * @description Aside mini device card extracted from VideoMonitorPage.tsx.
 * @author 4everyy
 * @date 2026-10-07
 */
import { type DragEvent as ReactDragEvent } from 'react'
import {
  PlaceholderVideoStream,
  hasDemoStream,
  pickDemoVideo,
} from './PlaceholderVideoStream'

/* ---------------- 右栏「其他在线设备」小卡 ---------------- */

/**
 * 画面阶段：暂无真实图传流——demo 阶段小卡随机分配形态：
 * 顶部一行设备名称，画面区为随机样例视频或「空视频位」（跟踪状态/电量暂不展示）。
 * 接真实流后可在此恢复 vm-mini-bar（名称/跟踪中/电量）等完整小卡 UI。
 */
export function MiniDeviceItem({
  name,
  draggable = false,
  onDragStart,
}: {
  name: string
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
      {/* 顶部一行：设备名称（原小卡信息条位置） */}
      <div className="vm-mini-bar">
        <span className="vm-mini-name">{name}</span>
      </div>
      <div className="vm-mini-video">
        {/* demo 阶段：按设备名随机分配样例视频或空视频位（与主区通道同规则） */}
        {hasDemoStream(name) ? (
          <video
            className="vm-video-stream"
            src={pickDemoVideo(name)}
            autoPlay
            muted
            loop
            playsInline
          />
        ) : (
          <PlaceholderVideoStream />
        )}
      </div>
    </div>
  )
}