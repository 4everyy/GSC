// 城市数据准备服务：鉴权中间件
//
// 采用单一管理令牌（Bearer Token）校验，令牌来自环境变量
// GCS_ADMIN_TOKEN。未配置时 fail-closed（直接拒绝），避免服务裸奔。
// 服务仅监听 127.0.0.1（同机 vite/nginx 代理访问），令牌作第二道防线。

import crypto from 'node:crypto'

/**
 * @param {string} expectedToken 允许的令牌（来自环境变量）
 */
export function requireAdminToken(expectedToken) {
  if (!expectedToken) {
    // fail-closed：未配置令牌时拒绝一切管理操作
    return function closedGuard(_req, res) {
      res.status(503).json({
        error: 'ADMIN_TOKEN_NOT_CONFIGURED',
        message: '后端未配置 GCS_ADMIN_TOKEN，管理操作被拒绝。',
      })
    }
  }
  const expectedBuf = Buffer.from(expectedToken)
  return function adminAuth(req, res, next) {
    const auth = req.headers.authorization || ''
    const m = /^Bearer\s+(.+)$/i.exec(auth)
    const got = m ? m[1] : ''
    const gotBuf = Buffer.from(got)
    // 长度不同直接拒绝（timingSafeEqual 要求等长）
    const ok =
      gotBuf.length === expectedBuf.length &&
      gotBuf.length > 0 &&
      crypto.timingSafeEqual(gotBuf, expectedBuf)
    if (!ok) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: '无效的管理令牌' })
      return
    }
    next()
  }
}
