/**
 * @file appNavigation.ts
 * @description 轻量 hash 路由（双屏视角入口）。
 * @author 4everyy
 * @date 2026-10-07
 */

/** 应用级路由：home = 态势主屏；video = 视频监测屏 */
export type AppRoute = 'home' | 'video'

/** 解析当前 hash 为应用路由（video 前缀均归入视频屏，其余归主屏） */
export function parseAppRoute(): AppRoute {
  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase()
  return hash.startsWith('video') ? 'video' : 'home'
}

/** 切换路由：仅写入 hash，由 App.tsx 监听 hashchange 完成分发 */
export function navigateToRoute(route: AppRoute): void {
  const target = route === 'video' ? '#/video' : '#/'
  if (window.location.hash !== target) {
    window.location.hash = target
  }
}