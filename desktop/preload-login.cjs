/**
 * @file desktop/preload-login.cjs
 * @description 登录窗 preload：注入「强制显示登录页」开关 + 登录成功 IPC 桥。
 */
const { contextBridge, ipcRenderer } = require('electron')

/** 运行时登录开关：覆盖 VITE_SKIP_LOGIN，桌面启动始终先登录验证 */
contextBridge.exposeInMainWorld('__GSC_DESKTOP__', { requireLogin: true })

/** 登录成功通知：主进程收到后关闭登录窗并打开 kiosk 双屏 */
contextBridge.exposeInMainWorld('gscDesktop', {
  notifyLoginSuccess: () => ipcRenderer.send('gsc:login-success'),
})
