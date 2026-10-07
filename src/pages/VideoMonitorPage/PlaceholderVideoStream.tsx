/**
 * @file PlaceholderVideoStream.tsx
 * @description Placeholder video stream extracted from VideoMonitorPage.tsx.
 * @author 4everyy
 * @date 2026-10-07
 */
import cameraIcon from '../../assets/task-panel/Camera.svg'
import { deviceImages } from '../../assets/device'
import demoVideo1 from '../../assets/video-monitor/placeholder-video.mp4'
import demoVideo2 from '../../assets/video-monitor/demo2.mp4'

/* ---------------- 样例视频源（接真实流前过渡使用） ---------------- */

/** 两个 demo 样例视频：随机分配给各通道，模拟多机不同画面 */
export const DEMO_VIDEO_SOURCES: string[] = [demoVideo1, demoVideo2]

/** 按通道 id 确定性地取一个样例视频源（同一 id 稳定返回同一路，避免重渲染跳变） */
export function pickDemoVideo(channelId: string): string {
  let h = 0
  for (let i = 0; i < channelId.length; i++) h = (h * 31 + channelId.charCodeAt(i)) >>> 0
  return DEMO_VIDEO_SOURCES[h % DEMO_VIDEO_SOURCES.length]
}

/** 按通道 id 判定该通道是否有流（demo 演示阶段随机：约 1/3 画面为空视频位）。
 *  以 id 哈希取模保证同一次会话内同一通道形态稳定，刷新页面后分布重新随机。 */
export function hasDemoStream(channelId: string): boolean {
  let h = 0
  for (let i = 0; i < channelId.length; i++) h = (h * 31 + channelId.charCodeAt(i)) >>> 0
  return h % 3 !== 0
}

/* ---------------- 空视频位占位（暂无图传流时的画面占位） ---------------- */

/**
 * 空视频位：src/assets/task-panel/Camera.svg 图标 + 固定文案「空视频位」。
 * 设备名称不在此处展示——由外层画面卡顶部一行（原信息条位置）显示。
 * 接真实图传流时在此恢复 <video> 并将 src 换成流地址即可。
 */
export function PlaceholderVideoStream() {
  return (
    <div className="vm-video-empty" role="img" aria-label="空视频位">
      <img className="vm-video-empty-icon" src={cameraIcon} alt="" />
      <span className="vm-video-empty-text">空视频位</span>
    </div>
  )
}

/* ---------------- 设备离线占位 ---------------- */

/**
 * 设备离线占位：src/assets/device/load-fail.png 图标 + 固定文案「设备已离线」。
 * 通道 online = false 时由 VideoChannelCard 渲染（替代样例视频/空视频位）。
 */
export function OfflineVideoStream() {
  return (
    <div className="vm-video-empty vm-video-offline" role="img" aria-label="设备已离线">
      <img className="vm-video-offline-icon" src={deviceImages.loadFail} alt="" />
      <span className="vm-video-offline-text">设备已离线</span>
    </div>
  )
}