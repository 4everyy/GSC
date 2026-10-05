/**
 * 轻量 hash 路由（双屏视角入口）。
 *
 * 项目未引入 react-router，双屏用 hash 区分：
 * - 主屏（态势大屏，现状 HomePage）：默认路由，`#/` 或任意非 video hash；
 * - 视频监测屏（第二屏）：`#/video`。
 *
 * 两屏均挂在 App.tsx 登录门控之后：未登录时无论 hash 为何，
 * 一律先渲染 LoginPage，登录成功后再按 hash 分发到对应屏。
 *
 * 双物理屏部署：两块屏幕各开一个浏览器窗口，分别访问
 * `http://<host>/#/` 与 `http://<host>/#/video` 即可。
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