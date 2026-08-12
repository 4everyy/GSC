// 城市数据准备服务：Job 管理器（城市矢量）
//
// 设计要点：
// 1. 同一时刻只允许一个准备任务（单任务槽）：任务在写 tileserver/data/
//    并需 docker compose restart，并发会相互冲突。第二个请求返回
//    {status:'busy'}，前端据此轮询已有任务。
// 2. 城市任务 spawn powershell 运行 prepare-data.ps1（WSL tilemaker）。
//    （卫星影像严格离线，不在本服务在线准备——运维须用
//    tileserver/bin/prepare-satellite.py 从自有影像/GDAL 离线生成 mbtiles。）
// 3. 逐行读 stdout，progressParser 解析 [PROGRESS]/里程碑 → 阶段化进度。
// 4. 进程退出码 0 后，自动 `docker compose restart` 重载 tileserver-gl
//    （脚本本身只提示重启，不执行）。

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
   * 构造并登记新 job（占单任务槽）。调用方随后用 launch 启动进程。
   * @param {string} city 城市 key，供 snapshot.city 展示
   */
  function createJobRecord(city) {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    current = {
      jobId,
      status: 'running',
      city,
      percent: 1,
      stage: '初始化…',
      startedAt: Date.now(),
      elapsedMs: 0,
      log: [],
      error: null,
    }
    return current
  }

  /** 单任务槽已占用 → busy 快照；否则 null。 */
  function busyIfRunning() {
    if (current && current.status === 'running') {
      return {
        status: 'busy',
        jobId: current.jobId,
        message: `已有任务在运行：${current.stage}（${current.percent}%）`,
      }
    }
    return null
  }

  /**
   * 通用：spawn 子进程，逐行读 stdout → progressParser，完成后
   * `docker compose restart` 重载 tileserver-gl。
   *
   * @param {object} job createJobRecord 返回的 job 记录
   * @param {string} command 可执行程序（powershell.exe）
   * @param {string[]} args 命令行参数
   * @param {string} cwd 工作目录
   * @param {string} kind 错误文案用的进程标识（prepare-data.ps1）
   * @returns {{ status: 'running', jobId: string }}
   */
  function launch(job, command, args, cwd, kind) {
    const startedAt = job.startedAt
    let proc
    try {
      proc = spawn(command, args, { cwd, windowsHide: true })
    } catch (err) {
      job.elapsedMs = Date.now() - startedAt
      job.status = 'failed'
      job.error = `无法启动 ${kind}：${err.message}`
      return { status: 'failed', jobId: job.jobId }
    }
    job.pid = proc.pid

    const pushLog = (level, msg) => {
      job.log.push({ t: Date.now(), level, msg })
      if (job.log.length > MAX_LOG) {
        job.log.splice(0, job.log.length - MAX_LOG)
      }
    }

    const rl = createInterface({ input: proc.stdout })
    rl.on('line', (line) => {
      const parsed = parseLine(line)
      if (!parsed) return
      pushLog(parsed.level, parsed.message)
      if (typeof parsed.percent === 'number' && parsed.percent > job.percent) {
        job.percent = parsed.percent
      }
      if (parsed.stage) job.stage = parsed.stage
      if (parsed.level === 'error' && !job.error) job.error = parsed.message
    })

    const rlErr = createInterface({ input: proc.stderr })
    rlErr.on('line', (line) => {
      const clean = String(line).replace(/\x1b\[[0-9;]*m/g, '').trim()
      if (clean) pushLog('error', clean)
    })

    proc.on('error', (err) => {
      job.elapsedMs = Date.now() - startedAt
      job.status = 'failed'
      job.error = `无法启动 ${kind}：${err.message}`
    })

    proc.on('close', async (code) => {
      job.elapsedMs = Date.now() - startedAt
      if (code !== 0) {
        job.status = 'failed'
        if (!job.error) job.error = `${kind} 退出码 ${code}`
        return
      }
      job.stage = '数据准备完成，正在重启瓦片服务…'
      job.percent = 97
      const r = await restartTileserver()
      job.elapsedMs = Date.now() - startedAt
      pushLog(r.code === 0 ? 'ok' : 'error', `docker compose restart 退出码 ${r.code}`)
      if (r.out) pushLog('info', r.out.slice(-400))
      if (r.code === 0) {
        job.status = 'done'
        job.percent = 100
        job.stage = '完成：数据已注册并重启瓦片服务'
      } else {
        job.status = 'failed'
        job.error = `docker compose restart 失败（退出码 ${r.code}）`
      }
    })

    return { status: 'running', jobId: job.jobId }
  }

  /**
   * 启动城市矢量数据准备（prepare-data.ps1）。
   * @param {{ city: string, primary?: string, maxZoom?: number }} params
   * @returns {{ status: 'running', jobId: string } | { status: 'busy', jobId: string, message: string } | { status: 'rejected', message: string }}
   */
  function start({ city, primary, maxZoom }) {
    if (!city || !CITY_RE.test(city)) {
      return { status: 'rejected', message: '非法的城市 key（仅允许字母/数字/下划线/连字符）' }
    }
    const busy = busyIfRunning()
    if (busy) return busy

    const job = createJobRecord(city)

    // 用 -Command 包装：先强制 UTF-8 输出，再 & 调用脚本
    let paramString = `-Cities '${city}'`
    if (primary && CITY_RE.test(primary)) paramString += ` -Primary '${primary}'`
    if (Number.isInteger(maxZoom) && maxZoom > 0 && maxZoom <= 20) {
      paramString += ` -MaxZoom ${maxZoom}`
    }
    const psCommand =
      `$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; & '${scriptPath}' ${paramString}`

    return launch(
      job,
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand],
      tileserverDir,
      'prepare-data.ps1',
    )
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
