/**
 * @file desktop/main.cjs
 * @description GSC 桌面壳（Electron 主进程）。
 * 流程：拉起 Vite（dev 或 preview）→ 全屏登录窗 → 登录成功后按显示器数量打开 kiosk 窗口：
 * - 双屏：主屏 = 首页（#/），副屏 = 视频监测（#/video），两窗均为 kiosk 锁定全屏；
 * - 单屏：仅打开首页 kiosk。
 * 启动器联动：首个窗口 ready-to-show 时写 desktop\.launcher-ready（内容 OK），
 * 致命错误时写 ERROR 行；启动地面站.cmd 据此把控制台留到「页面真正显示」再收起。
 * 退出：Ctrl+Alt+Shift+Q 全局快捷键；顶栏右上角 ✕ 逐窗关闭（关完即退）；
 * 任务栏右键「关闭窗口」/缩略图 ✕ 对任意状态生效（单发单关、组发组关，关完自动退出）；
 * 仅 Alt+F4 被阻止（kiosk 防误触）；启动器控制台已改为自动隐藏，不再是退出入口。
 * 可选环境变量：
 * - GSC_PORT=5173            前端服务端口（默认 5173）
 * - GSC_SERVE=preview        用 vite preview 服务 dist（需先 npm run build），默认 dev
 * - GSC_ALLOW_CLOSE=1        允许 Alt+F4 直接关闭 kiosk 窗口（默认阻止）
 * - GSC_NODE=<path>          指定运行 vite 的 node（默认复用 Electron 内置运行时，无需系统 node）
 */
const { app, BrowserWindow, Menu, dialog, ipcMain, screen, globalShortcut } = require('electron')
const { spawn } = require('node:child_process')
const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')

const APP_ROOT = path.join(__dirname, '..')
const PORT = Number(process.env.GSC_PORT || 5173)
const BASE_URL = `http://127.0.0.1:${PORT}`
const USE_PREVIEW = process.env.GSC_SERVE === 'preview'
const QUIT_SHORTCUT = 'Control+Alt+Shift+Q'
const LOG_FILE = path.join(APP_ROOT, 'desktop', 'launcher.log')
/** 启动器等待标记：cmd 轮询该文件判断页面是否已显示（OK）或启动失败（ERROR: 原因） */
const READY_MARKER = path.join(APP_ROOT, 'desktop', '.launcher-ready')

/* ---------------- 文件日志：双击启动无控制台时也可排查 ---------------- */

/** 追加一行到 desktop/launcher.log（失败静默，不影响启动） */
function appendLog(line) {
  try {
    const ts = new Date().toISOString()
    fs.appendFileSync(LOG_FILE, `[${ts}] ${line}\n`, 'utf8')
  } catch {
    /* 日志写失败不影响主流程 */
  }
}

/** 控制台 + 文件双写 */
function log(msg) {
  console.log(msg)
  appendLog(msg)
}

/** 已写入 OK 标记：首个窗口显示后置位，避免重复写/被后续写覆盖 */
let readyMarked = false

/**
 * 写启动器等待标记（写失败静默，不影响主流程）：
 * - markReady()          首个窗口 ready-to-show 时调用，内容 OK，启动器控制台随即收起；
 * - markReady('原因')    致命错误时调用，内容 ERROR: 原因，启动器控制台打印并暂停展示。
 */
function markReady(error) {
  if (readyMarked) return
  readyMarked = true
  try {
    fs.writeFileSync(READY_MARKER, (error ? 'ERROR: ' + error : 'OK') + '\n', 'utf8')
  } catch {
    /* 标记写失败只影响 cmd 控制台的收起时机，走超时兜底 */
  }
}

/** 启动时截断旧日志（保留最近一次运行的完整现场）；带 BOM 方便记事本/PowerShell 识别 UTF-8，
 * 同时清掉上次运行遗留的等待标记，防止 cmd 把旧 OK 误读为本次就绪 */
try {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true })
  fs.writeFileSync(LOG_FILE, '\ufeff[' + new Date().toISOString() + `] ===== launcher start (pid ${process.pid}) =====\n`, 'utf8')
  fs.rmSync(READY_MARKER, { force: true })
} catch {
  /* 忽略 */
}

process.on('uncaughtException', (err) => {
  appendLog('uncaughtException: ' + (err && err.stack ? err.stack : String(err)))
  // 页面尚未就绪时发生未捕获异常：同步写 ERROR 标记，启动器控制台即刻提示而非空等超时
  markReady('uncaughtException: ' + (err && err.message ? err.message : String(err)))
  if (!quitting) {
    dialog.showErrorBox('智能无人集群控制系统', '发生未捕获错误：' + (err && err.message ? err.message : String(err)))
  }
})

/** 正在退出应用：置位后 kiosk 窗口不再阻止 close，vite 退出不再弹错 */
let quitting = false
/** 桌面壳拉起的 vite 子进程（复用已有服务时为 null） */
let viteProc = null
/** 登录窗（登录成功后销毁） */
let loginWin = null
/** kiosk 窗口集合（首页 + 视频监测） */
const kioskWins = []
/** kiosk 窗口标签（#/ 或 #/video）：getTitle() 返回的是 document.title（两屏相同），不能用于区分 */
const kioskTags = new WeakMap()
/** 最近一次 Alt+F4 按键时刻：close 事件不携带来源（任务栏关闭/Alt+F4 都是 WM_CLOSE），
 * 无法直接区分；在 before-input-event 里标记 Alt+F4 按键，短窗内的 close 即视为 Alt+F4 拦下，
 * 其余来源（任务栏单关/整组关闭/顶栏 ✕）一律放行——单发单关、组发组关，天然正确 */
let altF4At = 0
/** 正在主动最小化的 kiosk 窗：最小化会先脱离全屏，避免 leave-full-screen 守卫立即拉回全屏 */
const minimizingWins = new WeakSet()

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/* ---------------- 前端服务（vite）管理 ---------------- */

/** 探测本地前端服务是否已可访问 */
function pingServer() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/', timeout: 900 }, (res) => {
      res.resume()
      resolve(typeof res.statusCode === 'number' && res.statusCode < 500)
    })
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
    req.on('error', () => resolve(false))
  })
}

/** 等待前端服务就绪（超时返回 false） */
async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let announced = false
  while (Date.now() < deadline) {
    if (await pingServer()) return true
    if (!announced && viteProc) {
      console.log(`[gsc-desktop] 等待前端服务启动 (port ${PORT}) ...`)
      announced = true
    }
    await sleep(300)
  }
  return false
}

/** 带前缀逐行转发子进程输出到桌面壳控制台与日志文件 */
function pipeWithPrefix(stream, prefix) {
  let buf = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buf += chunk
    const lines = buf.split(/\r?\n/)
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (line) log(prefix + ' ' + line)
    }
  })
  stream.on('end', () => {
    if (buf) log(prefix + ' ' + buf)
  })
}

/**
 * 采集渲染进程的 console 报错到 launcher.log：
 * kiosk 模式没有开发者工具，页面渲染崩溃（如 React ErrorBoundary、未捕获异常）
 * 只能靠文件日志排查；仅记录 error 级别，避免日志被常规输出刷爆。
 */
function captureRendererErrors(win, tag) {
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 3) {
      appendLog(`[${tag}] console.error: ${message} (${sourceId}:${line})`)
    }
  })
}

/** 拉起 vite dev / preview 子进程：
 * 运行时优先级 GSC_NODE > npm 注入的 node > 系统 PATH 上的 node > Electron 内置 node。
 * Electron 内置 node（ELECTRON_RUN_AS_NODE=1）保底保证无系统 node 也能启动，
 * 但版本可能低于 vite 要求，故优先用系统 node。 */
function startVite() {
  const viteBin = path.join(APP_ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  if (!fs.existsSync(viteBin)) {
    fatal('未找到 node_modules/vite，请先在项目目录执行 npm install')
    return
  }
  if (USE_PREVIEW && !fs.existsSync(path.join(APP_ROOT, 'dist', 'index.html'))) {
    fatal('GSC_SERVE=preview 需要先构建产物：npm run build')
    return
  }
  const args = [viteBin, ...(USE_PREVIEW ? ['preview'] : []), '--port', String(PORT), '--strictPort']
  const runners = [
    ...(process.env.GSC_NODE ? [process.env.GSC_NODE] : []),
    ...(process.env.npm_node_execpath ? [process.env.npm_node_execpath] : []),
    'node',
    process.execPath, // Electron 二进制以 node 模式运行（最后保底）
  ]
  spawnVite(runners, args)
}

/** 依次尝试运行时拉起 vite：ENOENT（找不到可执行文件）时换下一个候选 */
function spawnVite(runners, args) {
  if (runners.length === 0) {
    fatal('未找到可用的 Node.js 运行时，无法启动前端服务')
    return
  }
  const [runner, ...rest] = runners
  const isElectronRuntime = runner === process.execPath
  log(`[gsc-desktop] vite 运行时: ${runner} (剩余候选 ${rest.length})`)
  viteProc = spawn(runner, args, {
    cwd: APP_ROOT,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    // 仅在用 Electron 二进制跑 vite 时开启 node 模式
    env: { ...process.env, ...(isElectronRuntime ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
  })
  pipeWithPrefix(viteProc.stdout, '[vite]')
  pipeWithPrefix(viteProc.stderr, '[vite!]')
  viteProc.once('error', (err) => {
    const code = err && /** @type {NodeJS.ErrnoException} */ (err).code
    log(`[gsc-desktop] vite spawn error: ${code ?? ''} ${err && err.message}`)
    if (code === 'ENOENT' && rest.length > 0) {
      viteProc = null
      spawnVite(rest, args)
      return
    }
    fatal('前端服务启动失败：' + (err && err.message ? err.message : String(err)))
  })
  viteProc.on('exit', (code, signal) => {
    log(`[gsc-desktop] vite exit: code=${code} signal=${signal}`)
    viteProc = null
    if (quitting) return
    dialog.showErrorBox('智能无人集群控制系统', `前端服务（vite）意外退出（code ${code}），应用即将关闭。详见 desktop/launcher.log`)
    quitting = true
    for (const w of [...kioskWins]) w.destroy()
    loginWin?.destroy()
    app.exit(1)
  })
}

/** 终止 vite 子进程（Windows 下按进程树终止，防止孤儿进程占用端口） */
function killVite() {
  const p = viteProc
  viteProc = null
  if (!p || p.exitCode !== null || p.signalCode !== null) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  } else {
    p.kill('SIGTERM')
  }
}

/** 致命错误：弹窗提示并退出（先清理 vite 子进程；先写 ERROR 标记让启动器控制台立即提示，不必等弹窗被点掉） */
function fatal(message) {
  log('[gsc-desktop] FATAL: ' + message)
  markReady(message)
  dialog.showErrorBox('地面站启动失败', message + '\n\n详细信息见 desktop/launcher.log')
  quitting = true
  killVite()
  app.exit(1)
}

/* ---------------- 窗口 ---------------- */

/** kiosk 是否已打开（防止登录窗销毁事件与 kiosk 创建的竞态导致误退出） */
let kiosksOpened = false

/** 全屏登录窗（主屏，无边框非 kiosk：登录前保留 Alt+F4 退出入口） */
function createLoginWindow() {
  const { bounds } = screen.getPrimaryDisplay()
  loginWin = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    fullscreen: true,
    frame: false,
    backgroundColor: '#0e1013',
    show: false,
    title: '智能无人集群控制系统',
    webPreferences: {
      preload: path.join(__dirname, 'preload-login.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  loginWin.once('ready-to-show', () => {
    if (!loginWin) return
    log('[gsc-desktop] 登录窗 ready-to-show，显示')
    markReady()
    loginWin.show()
    loginWin.setFullScreen(true)
  })
  captureRendererErrors(loginWin, '登录窗')
  loginWin.on('closed', () => {
    log('[gsc-desktop] 登录窗 closed')
    loginWin = null
    // 登录前被用户关闭且 kiosk 尚未打开：整个应用退出
    if (!quitting && !kiosksOpened && kioskWins.length === 0) app.quit()
  })
  loginWin.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log(`[gsc-desktop] 登录窗 did-fail-load: ${code} ${desc} ${url}`)
  })
  loginWin.loadURL(`${BASE_URL}/#/`).catch((err) => {
    fatal('登录页加载失败：' + (err && err.message ? err.message : String(err)))
  })
}

/** 查询两屏开关状态：kiosk 窗存在即 true（与最小化无关，仅看是否存活） */
function getScreensState() {
  const state = { '#/': false, '#/video': false }
  for (const w of kioskWins) {
    if (w.isDestroyed()) continue
    const tag = kioskTags.get(w)
    if (tag === '#/' || tag === '#/video') state[tag] = true
  }
  return state
}

/** 向所有存活的 kiosk 窗广播屏幕开关状态（创建/关闭后调用，供顶栏开关同步点亮） */
function broadcastScreensChanged() {
  const state = getScreensState()
  for (const w of kioskWins) {
    if (!w.isDestroyed()) w.webContents.send('gsc:screens-changed', state)
  }
}

/** 唤醒指定屏：已存在则从任务栏还原并聚焦；不存在则重建。
 * 显示器选择：态势主屏恒用主屏；视频监测屏优先第一副屏，无副屏（单屏机）落主屏。 */
function ensureKiosk(hash) {
  const existing = kioskWins.find((w) => kioskTags.get(w) === hash && !w.isDestroyed())
  if (existing) {
    log(`[gsc-desktop] 唤醒已有 kiosk(${hash})：聚焦`)
    if (existing.isMinimized()) existing.restore()
    existing.focus()
    return
  }
  const primary = screen.getPrimaryDisplay()
  let display = primary
  if (hash === '#/video') {
    const others = screen
      .getAllDisplays()
      .filter((d) => d.id !== primary.id)
      .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
    if (others.length > 0) display = others[0]
  }
  log(`[gsc-desktop] 唤醒 kiosk(${hash})：重建窗口`)
  createKioskWindow(display, hash)
}

/** kiosk 窗口：指定显示器锁定全屏，屏蔽刷新/开发者工具/缩放/关闭等退出途径 */
function createKioskWindow(display, hash) {
  const b = display.bounds
  const win = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    kiosk: true,
    fullscreen: true,
    frame: false,
    backgroundColor: '#0e1013',
    show: false,
    title: hash === '#/video' ? '视频监测屏' : '态势主屏',
    webPreferences: {
      preload: path.join(__dirname, 'preload-kiosk.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false,
      spellcheck: false,
    },
  })
  win.once('ready-to-show', () => {
    if (!win) return
    log(`[gsc-desktop] kiosk(${hash}) ready-to-show，进入 kiosk 全屏`)
    markReady()
    win.show()
    win.setKiosk(true)
    win.setFullScreen(true)
  })
  captureRendererErrors(win, `kiosk(${hash})`)
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log(`[gsc-desktop] kiosk(${hash}) did-fail-load: ${code} ${desc} ${url}`)
  })
  // 意外脱离全屏（系统热键等）时重新进入 kiosk；主动最小化（顶栏 ─）时跳过，
  // 任务栏还原窗口后（restore）再恢复 kiosk 全屏
  win.on('leave-full-screen', () => {
    if (minimizingWins.has(win)) return
    if (!win.isDestroyed()) {
      win.setKiosk(true)
      win.setFullScreen(true)
    }
  })
  win.on('restore', () => {
    log(`[gsc-desktop] kiosk(${kioskTags.get(win)}) 从任务栏还原，恢复 kiosk 全屏`)
    minimizingWins.delete(win)
    if (!win.isDestroyed()) {
      win.setKiosk(true)
      win.setFullScreen(true)
    }
  })
  // 屏蔽刷新 / F11 / 开发者工具 / 缩放 / Ctrl+W 等按键；同时标记 Alt+F4 供 close 守卫识别
  win.webContents.on('before-input-event', (event, input) => {
    const key = input.key.toLowerCase()
    if (input.alt && key === 'f4') {
      altF4At = Date.now()
      return
    }
    const blockReload = key === 'f5' || (input.control && key === 'r')
    const blockFullscreenToggle = key === 'f11'
    const blockDevTools = key === 'f12' || (input.control && input.shift && (key === 'i' || key === 'j' || key === 'c'))
    const blockZoom = input.control && (key === '=' || key === '+' || key === '-' || key === '0')
    const blockClose = input.control && key === 'w'
    if (blockReload || blockFullscreenToggle || blockDevTools || blockZoom || blockClose) {
      event.preventDefault()
    }
  })
  // 禁止页面打开新窗口（window.open / target=_blank）
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  // 关闭守卫只拦 Alt+F4（防误触 kiosk 逃逸），其余来源全部放行：
  // - 任务栏缩略图 ✕ / 右键「关闭窗口」：单发单关、组发组关（Win11 整组关闭会向所有窗发 close）；
  // - 顶栏 ✕ 走 IPC destroy()，不经本守卫；Ctrl+Alt+Shift+Q 走 app.quit()（quitting 已置位）。
  // 说明：close 事件不携带来源，之前按「是否收起/最小化」猜测任务栏来源，
  // 导致必须先收起才能关、整组关闭时序敏感等一堆问题，现改为识别 Alt+F4 本身。
  win.on('close', (e) => {
    const tag = kioskTags.get(win) ?? '?'
    const sinceAltF4 = Date.now() - altF4At
    if (quitting || process.env.GSC_ALLOW_CLOSE === '1' || sinceAltF4 >= 1000) {
      log(`[gsc-desktop] kiosk(${tag}) 关闭放行 (sinceAltF4=${sinceAltF4}ms, quitting=${quitting})`)
      return
    }
    log(`[gsc-desktop] kiosk(${tag}) 拦截 Alt+F4（kiosk 防误触；退出用顶栏 ✕ / 任务栏右键关闭 / Ctrl+Alt+Shift+Q）`)
    e.preventDefault()
  })
  win.on('closed', () => {
    const i = kioskWins.indexOf(win)
    if (i >= 0) kioskWins.splice(i, 1)
    log(`[gsc-desktop] kiosk(${kioskTags.get(win)}) closed，剩余 ${kioskWins.length} 屏`)
    broadcastScreensChanged()
    if (!quitting && kioskWins.length === 0 && !loginWin) app.quit()
  })
  win.loadURL(`${BASE_URL}/${hash}`).catch((err) => {
    fatal(`${hash} 页面加载失败：` + (err && err.message ? err.message : String(err)))
  })
  kioskTags.set(win, hash)
  kioskWins.push(win)
  broadcastScreensChanged()
}

/** 登录成功：按显示器数量打开 kiosk（主屏=首页，第一副屏=视频监测；单屏仅首页）。
 * 注意：必须先创建 kiosk 窗口再销毁登录窗——登录窗 'closed' 事件会检查 kioskWins，
 * 若先销毁会误判为「未登录即退出」。 */
function openKioskScreens() {
  if (kiosksOpened) return
  kiosksOpened = true
  const primary = screen.getPrimaryDisplay()
  const others = screen
    .getAllDisplays()
    .filter((d) => d.id !== primary.id)
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
  const plan = [{ display: primary, hash: '#/' }]
  if (others.length > 0) plan.push({ display: others[0], hash: '#/video' })
  log(
    `[gsc-desktop] 检测到 ${screen.getAllDisplays().length} 个显示器，打开 ${plan.length} 个 kiosk 窗口: ` +
      plan.map((p) => `${p.hash}@(${p.display.bounds.x},${p.display.bounds.y} ${p.display.bounds.width}x${p.display.bounds.height})`).join(' | '),
  )
  for (const { display, hash } of plan) createKioskWindow(display, hash)
  if (loginWin) {
    loginWin.destroy()
    loginWin = null
  }
}

/* ---------------- 应用生命周期 ---------------- */

// 视频监测屏存在无手势自动播放的样例视频，放开 Chromium 自动播放限制
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// 单实例：重复双击启动器时聚焦已有窗口而非再起一套。
// 注意：不弹「已在运行」阻塞对话框——页面本来就在显示，写 OK 标记让本次启动器
// 控制台立即关闭即可（second-instance 事件负责把已有窗口聚焦到前台）。
if (!app.requestSingleInstanceLock()) {
  log('[gsc-desktop] 已有实例在运行：本次启动退出，聚焦已有窗口')
  markReady()
  app.quit()
} else {
  app.on('second-instance', () => {
    log('[gsc-desktop] second-instance: 聚焦已有窗口')
    const w = kioskWins[0] ?? loginWin
    if (w && !w.isDestroyed()) {
      if (w.isMinimized()) w.restore()
      w.focus()
    }
  })

  app.whenReady().then(async () => {
    try {
      log(`[gsc-desktop] app ready. cwd=${process.cwd()} execPath=${process.execPath} port=${PORT} preview=${USE_PREVIEW}`)
      Menu.setApplicationMenu(null)
      const shortcutOk = globalShortcut.register(QUIT_SHORTCUT, () => app.quit())
      log(`[gsc-desktop] 退出快捷键 ${QUIT_SHORTCUT} 注册${shortcutOk ? '成功' : '失败（可能被其他程序占用）'}`)

      // 端口已有服务则复用（例如开发者手动 npm run dev 中），否则由桌面壳拉起
      if (await pingServer()) {
        log(`[gsc-desktop] 复用已运行的前端服务 (port ${PORT})`)
      } else {
        log(`[gsc-desktop] 启动前端服务 (${USE_PREVIEW ? 'vite preview' : 'vite dev'}, port ${PORT})`)
        startVite()
        const ok = await waitForServer(90_000)
        if (!ok) fatal(`前端服务启动超时（port ${PORT}），请检查端口占用后重试`)
      }
      if (!quitting) {
        log(`[gsc-desktop] 打开登录窗；登录成功后自动分屏。退出快捷键：${QUIT_SHORTCUT}`)
        createLoginWindow()
      }
    } catch (err) {
      fatal('初始化失败：' + (err && err.message ? err.message : String(err)))
    }
  })

  ipcMain.on('gsc:login-success', openKioskScreens)

  // 顶栏右上角缩小（─）：最小化发起调用的 kiosk 窗到任务栏（任务栏图标点击还原）。
  // Windows 下 kiosk 态窗口不可直接最小化，先退 kiosk/全屏再最小化，还原时恢复 kiosk
  ipcMain.on('gsc:win-minimize', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w || w.isDestroyed()) return
    minimizingWins.add(w)
    log(`[gsc-desktop] 顶栏最小化：kiosk(${kioskTags.get(w)}) 收起到任务栏（右键任务栏标签可关闭该页签）`)
    if (w.isKiosk()) w.setKiosk(false)
    if (w.isFullScreen()) w.setFullScreen(false)
    w.minimize()
  })

  // 顶栏右上角叉号关闭（✕）：作用于发起调用的 kiosk 窗。
  // 关闭为用户显式点击，destroy() 绕过 kiosk 兜底关闭拦截（Alt+F4 仍被阻止）
  ipcMain.on('gsc:win-close', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (w && !w.isDestroyed()) {
      log('[gsc-desktop] 顶栏关闭按钮：关闭 kiosk 窗口')
      w.destroy()
    }
  })

  // 顶栏「另一屏」开关：查询两屏状态 / 切换指定屏（存在则关闭，不存在则唤醒重建）
  ipcMain.handle('gsc:screens-state', () => getScreensState())
  ipcMain.on('gsc:toggle-screen', (_e, hash) => {
    if (hash !== '#/' && hash !== '#/video') return
    const exists = kioskWins.some((w) => kioskTags.get(w) === hash && !w.isDestroyed())
    log(`[gsc-desktop] 顶栏开关切换 kiosk(${hash})：当前${exists ? '已开，执行关闭' : '已关，执行唤醒'}`)
    if (exists) {
      const w = kioskWins.find((w) => kioskTags.get(w) === hash && !w.isDestroyed())
      // 用户显式开关操作：destroy 绕过 kiosk 关闭拦截（同顶栏 ✕）
      w.destroy()
    } else {
      ensureKiosk(hash)
    }
    broadcastScreensChanged()
  })

  app.on('window-all-closed', () => {
    log('[gsc-desktop] window-all-closed -> quit')
    app.quit()
  })

  app.on('before-quit', () => {
    log('[gsc-desktop] before-quit')
    quitting = true
  })

  app.on('will-quit', () => {
    log('[gsc-desktop] will-quit: 清理 vite 子进程与快捷键')
    killVite()
    globalShortcut.unregisterAll()
  })

  app.on('render-process-gone', (_e, wc, details) => {
    log(`[gsc-desktop] render-process-gone: ${details.reason} exitCode=${details.exitCode} url=${(wc && wc.getURL()) || ''}`)
  })
}
