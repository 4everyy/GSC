/**
 * @file desktop/preload-kiosk.cjs
 * @description kiosk 窗 preload：注入「跳过登录页」开关（token 已由登录窗写入 localStorage）、
 *              顶栏窗口控制桥 gscWin（最小化/关闭当前窗口，走 IPC 由主进程执行）、
 *              双屏开关桥（查询/切换另一屏，状态经 gsc:screens-changed 广播同步）。
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('__GSC_DESKTOP__', { skipLogin: true })

contextBridge.exposeInMainWorld('gscWin', {
  minimize: () => ipcRenderer.send('gsc:win-minimize'),
  close: () => ipcRenderer.send('gsc:win-close'),
  /** 查询两屏开关状态：Promise<{ '#/': boolean, '#/video': boolean }> */
  screens: () => ipcRenderer.invoke('gsc:screens-state'),
  /** 切换指定屏：存在则关闭，不存在则唤醒重建（主进程裁决） */
  toggleScreen: (hash) => ipcRenderer.send('gsc:toggle-screen', hash),
  /** 订阅两屏状态广播；返回取消订阅函数 */
  onScreensChanged: (cb) => {
    const listener = (_event, state) => cb(state)
    ipcRenderer.on('gsc:screens-changed', listener)
    return () => ipcRenderer.removeListener('gsc:screens-changed', listener)
  },
})
