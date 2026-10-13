/**
 * @file windowControls.ts
 * @description 顶栏窗口控制行为（缩小/关闭），供各屏顶栏 WindowControls 组件共用。
 *              桌面壳（Electron）下经 preload-kiosk 注入的 gscWin 桥走 IPC：
 *              缩小 = 最小化当前窗口到任务栏（任务栏图标点击还原），关闭 = 关闭当前窗口；
 *              纯浏览器环境安全沙箱不允许脚本最小化系统窗口，缩小为无操作，
 *              关闭退化为返回态势主屏（#/）。
 * @author 4everyy
 * @date 2026-10-12
 */

/** 桌面壳窗口控制桥（preload-kiosk 注入） */
interface GscWindowBridge {
  minimize?: () => void
  close?: () => void
  /** 查询两屏开关状态（桌面壳双屏唤醒入口） */
  screens?: () => Promise<ScreensState>
  /** 切换指定屏：存在则关闭，不存在则唤醒重建 */
  toggleScreen?: (hash: ScreenHash) => void
  /** 订阅两屏状态广播；返回取消订阅函数 */
  onScreensChanged?: (cb: (state: ScreensState) => void) => () => void
}

/** 屏幕标识：态势主屏（#/）与视频监测屏（#/video），与桌面壳 kiosk 窗一一对应 */
export type ScreenHash = '#/' | '#/video'

/** 两屏开关状态（键即屏幕标识，值 = 该屏 kiosk 窗是否存活） */
export interface ScreensState {
  '#/': boolean
  '#/video': boolean
}

/** 屏幕中文名（顶栏开关文案） */
export const SCREEN_LABELS: Record<ScreenHash, string> = {
  '#/': '态势主屏',
  '#/video': '视频监测屏',
}

const winBridge = () => (window as Window & { gscWin?: GscWindowBridge }).gscWin

/** 是否具备双屏开关能力（桌面壳新 preload 注入；纯浏览器 / 旧壳为 false，顶栏开关不渲染） */
export function hasScreenBridge(): boolean {
  return typeof winBridge()?.toggleScreen === 'function'
}

/** 订阅两屏状态：先拉一次初始值再挂广播监听；纯浏览器返回空取消函数（组件据此不渲染） */
export function subscribeScreensChanged(cb: (state: ScreensState) => void): () => void {
  const bridge = winBridge()
  if (!bridge?.screens || !bridge.onScreensChanged) return () => {}
  bridge.screens().then(cb).catch(() => {})
  return bridge.onScreensChanged(cb)
}

/** 切换指定屏（存在则关闭，不存在则唤醒）；纯浏览器为无操作 */
export function toggleScreen(hash: ScreenHash): void {
  winBridge()?.toggleScreen?.(hash)
}

/** 最小化结果：os = 桌面壳内已最小化到系统任务栏；collapsed = 浏览器内收纳为页内底部任务栏 */
export type MinimizeResult = 'minimized' | 'collapsed'

/**
 * 最小化当前窗口。
 * 桌面壳（Electron）：走 IPC 最小化到系统任务栏（任务栏标签右键可关闭，主进程已放行）；
 * 纯浏览器：安全沙箱不允许脚本最小化系统窗口，返回 'collapsed'，
 * 由页面收纳为底部任务栏页签（左键还原、右键关闭）。
 */
export function minimizeWindow(): MinimizeResult {
  const bridge = winBridge()
  if (bridge?.minimize) {
    bridge.minimize()
    return 'minimized'
  }
  return 'collapsed'
}

/** 关闭当前窗口（浏览器环境返回态势主屏 #/） */
export function closeWindow() {
  const bridge = winBridge()
  if (bridge?.close) {
    bridge.close()
    return
  }
  window.location.hash = '#/'
}
