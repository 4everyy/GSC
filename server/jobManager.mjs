// 城市数据准备服务：单任务 Job 管理器
//
// 设计要点：
// 1. 同一时刻只允许一个生成任务（避免重复下载 1.5GB PBF + tilemaker 抢占 CPU）。
//    第二个请求返回 {status:'busy'}，前端据此轮询已有任务。
// 2. spawn powershell 运行 prepare-data.ps1，逐行读 stdout 更新进度。
// 3. 进程退出码 0 后，自动 `docker compose restart` 重载 tileserver-gl
//    （脚本本身只提示重启，不执行）。
// 4. 用 -Command 包装以强制 UTF-8 输出，避免中文乱码。

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { parseLine } from './progressParser.mjs'

const MAX_LOG = 500
const CITY_RE = /^[a-z0-9_-]+$/i

/** @type {Job | null} */
let current = null

/**
 * @param {{ tileserverDir: string, scriptPath: string }} opts
 */
export function createJobManager({ tileserverDir, scriptPath }) {
  function restartTileserver() {
    return new Promise((resolve) => {
      const proc = spawn('docker', ['compose', 'restart'], {
        cwd: tileserverDir,
        windowsHide: true,
      })
      let out = ''
      proc.stdout.on('data', (c) => {
        out += c.toString()
      })
      proc.stderr.on('data', (c) => {
        out += c.toString()
      })
      proc.on('error', () =>
        resolve({ code: -1, out: 'docker compose restart 启动失败（docker 未安装或未运行）' }),
      )
      proc.on('close', (code) => resolve({ code, out }))
    })
  }

  /**
   * 启动城市数据准备。
   * @param {{ city: string, primary?: string, maxZoom?: number }} params
   * @returns {{ status: 'running', jobId: string } | { status: 'busy', jobId: string, message: string } | { status: 'rejected', message: string }}
   */
  function start({ city, primary, maxZoom }) {
    if (!city || !CITY_RE.test(city)) {
      return { status: 'rejected', message: '非法的城市 key（仅允许字母/数字/下划线/连字符）' }
    }
    if (current && current.status === 'running') {
      return {
        status: 'busy',
        jobId: current.jobId,
        message: `已有任务在运行：${current.stage}（${current.percent}%）`,
      }
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const startedAt = Date.now()
    current = {
      jobId,
      status: 'running',
      city,
      percent: 1,
      stage: '初始化…',
      startedAt,
      elapsedMs: 0,
      log: [],
      error: null,
    }

    // 用 -Command 包装：先强制 UTF-8 输出，再 & 调用脚本
    let paramString = `-Cities '${city}'`
    if (primary && CITY_RE.test(primary)) paramString += ` -Primary '${primary}'`
    if (Number.isInteger(maxZoom) && maxZoom > 0 && maxZoom <= 20) {
      paramString += ` -MaxZoom ${maxZoom}`
    }
    const psCommand =
      `$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; & '${scriptPath}' ${paramString}`

    const proc = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand],
      { cwd: tileserverDir, windowsHide: true },
    )
    current.pid = proc.pid

    const pushLog = (level, msg) => {
      current.log.push({ t: Date.now(), level, msg })
      if (current.log.length > MAX_LOG) {
        current.log.splice(0, current.log.length - MAX_LOG)
      }
    }

    const rl = createInterface({ input: proc.stdout })
    rl.on('line', (line) => {
      const parsed = parseLine(line)
      if (!parsed) return
      pushLog(parsed.level, parsed.message)
      if (typeof parsed.percent === 'number' && parsed.percent > current.percent) {
        current.percent = parsed.percent
      }
      if (parsed.stage) current.stage = parsed.stage
      if (parsed.level === 'error' && !current.error) current.error = parsed.message
    })

    const rlErr = createInterface({ input: proc.stderr })
    rlErr.on('line', (line) => {
      const clean = String(line).replace(/\x1b\[[0-9;]*m/g, '').trim()
      if (clean) pushLog('error', clean)
    })

    proc.on('error', (err) => {
      current.elapsedMs = Date.now() - startedAt
      current.status = 'failed'
      current.error = `无法启动 prepare-data.ps1：${err.message}`
    })

    proc.on('close', async (code) => {
      current.elapsedMs = Date.now() - startedAt
      if (code !== 0) {
        current.status = 'failed'
        if (!current.error) current.error = `prepare-data.ps1 退出码 ${code}`
        return
      }
      current.stage = '数据生成完成，正在重启瓦片服务…'
      current.percent = 97
      const r = await restartTileserver()
      current.elapsedMs = Date.now() - startedAt
      pushLog(r.code === 0 ? 'ok' : 'error', `docker compose restart 退出码 ${r.code}`)
      if (r.out) pushLog('info', r.out.slice(-400))
      if (r.code === 0) {
        current.status = 'done'
        current.percent = 100
        current.stage = '完成：数据已注册并重启瓦片服务'
      } else {
        current.status = 'failed'
        current.error = `docker compose restart 失败（退出码 ${r.code}）`
      }
    })

    return { status: 'running', jobId }
  }

  /** 返回当前 job 的快照（running 时实时计算耗时） */
  function snapshot() {
    if (!current) return null
    const j = current
    return {
      jobId: j.jobId,
      status: j.status,
      city: j.city,
      percent: j.percent,
      stage: j.stage,
      startedAt: j.startedAt,
      elapsedMs: j.status === 'running' ? Date.now() - j.startedAt : j.elapsedMs,
      error: j.error,
      log: j.log,
    }
  }

  /** 测试用：重置内部状态 */
  function _reset() {
    current = null
  }

  return { start, current: snapshot, _reset }
}
