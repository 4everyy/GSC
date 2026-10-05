/**
 * 智能无人集群图传系统（VideoMonitorPage）专属静态资源索引。
 *
 * 本目录收敛图传屏全部本地占位素材，与主屏（home 等）资源隔离，
 * 便于统一管理与后续替换真实图传流：
 * - placeholder-video.mp4 / demo2.mp4：四宫格 / 右栏小卡占位视频（15 路中随机一半
 *   使用 demo2，其余 placeholder；循环播放，各路错开起始秒数）；
 * - icon-snapshot.svg：工具列「抓拍」图标；
 * - icon-record.svg：工具列「录像」图标；
 * - Camera.svg：录像进行中图标（倒计时结束进入录像态后替换 icon-record 显示）；
 * - icon-crop.svg：工具列「裁剪」图标；
 * - icon-fullscreen.svg：工具列「全屏」图标；
 * - 平铺视角右侧锁定图标改用 src/assets/task-panel/lock.svg（VideoMonitorPage
 *   直接导入，不经本目录导出）。
 * 后续新增素材（OSD 图标、离线兜底帧等）也统一在此导出。
 */
export { default as placeholderVideo } from './placeholder-video.mp4'
export { default as demo2Video } from './demo2.mp4'
export { default as iconSnapshot } from './icon-snapshot.svg'
export { default as iconRecord } from './icon-record.svg'
export { default as cameraRecording } from './Camera.svg'
export { default as iconCrop } from './icon-crop.svg'
export { default as iconFullscreen } from './icon-fullscreen.svg'