// 城市数据准备服务：Express 入口
//
// 职责：暴露管理 API，让前端在切换到「未准备数据」的城市时，
// 在线触发 prepare-data.ps1 生成 mbtiles 并重启 tileserver-gl。
//
// 启动：  node server/index.mjs
//   （开发）node --watch server/index.mjs
//   （生产）PM2 / nssm 守护，见 docs/离线部署指南.md
//
// 仅监听 127.0.0.1，由 vite dev proxy 或生产 nginx 同机反代访问。

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { requireAdminToken } from './auth.mjs'
import { createJobManager } from './jobManager.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
// server/ 位于项目根，tileserver/ 为兄弟目录
const repoRoot = join(__dirname, '..')
const tileserverDir = join(repoRoot, 'tileserver')
const scriptPath = join(tileserverDir, 'prepare-data.ps1')

const PORT = Number(process.env.GCS_ADMIN_PORT || 8082)
const TOKEN = process.env.GCS_ADMIN_TOKEN || ''

const app = express()
app.set('trust proxy', 1) // vite/nginx 同机反代，信任一层
app.use(cors())
app.use(express.json({ limit: '64kb' }))

// 管理 API 限流：15 分钟最多 60 次（防误触/滥用）
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
})
app.use('/api/admin', limiter)

const auth = requireAdminToken(TOKEN)
const jobs = createJobManager({ tileserverDir, scriptPath })

// 健康检查（无需鉴权，供前端探测后端是否在线）
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() })
})

// 启动城市数据准备任务
app.post('/api/admin/prepare', auth, (req, res) => {
  const { city, primary, maxZoom } = req.body || {}
  if (!city || typeof city !== 'string') {
    res.status(400).json({ error: 'INVALID_PARAMS', message: '缺少 city 参数' })
    return
  }
  const result = jobs.start({
    city,
    primary: typeof primary === 'string' ? primary : undefined,
    maxZoom: typeof maxZoom === 'number' ? maxZoom : undefined,
  })
  if (result.status === 'rejected') {
    res.status(400).json(result)
    return
  }
  // running → 202 Accepted；busy → 409 Conflict（前端应转去轮询现有任务）
  res.status(result.status === 'busy' ? 409 : 202).json(result)
})

// 查询当前任务状态（前端轮询用）
app.get('/api/admin/jobs/current', auth, (_req, res) => {
  const snap = jobs.current()
  if (!snap) {
    res.status(404).json({ status: 'idle', message: '当前无运行中的任务' })
    return
  }
  res.json(snap)
})

// 兜底错误处理
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error('[server] unhandled error:', err)
  res.status(500).json({ error: 'INTERNAL', message: err.message || '内部错误' })
})

app.listen(PORT, '127.0.0.1', () => {
  // eslint-disable-next-line no-console
  console.log(`[GCS admin server] listening on http://127.0.0.1:${PORT}`)
  // eslint-disable-next-line no-console
  console.log(`  tileserverDir = ${tileserverDir}`)
  // eslint-disable-next-line no-console
  console.log(`  scriptPath    = ${scriptPath}`)
  if (!TOKEN) {
    // eslint-disable-next-line no-console
    console.warn(
      '[WARN] GCS_ADMIN_TOKEN 未设置，所有管理操作将被拒绝（fail-closed）。',
    )
  }
})

export { app }
