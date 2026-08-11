/**
 * 城市数据准备进度弹窗。
 *
 * 打开后每 2 秒轮询 GET /api/admin/jobs/current，展示：
 * - 百分比进度条（阶段化，tilemaker 阶段最久）
 * - 当前阶段名称 + 已耗时
 * - 失败时的错误提示
 * - 最近 30 行实时日志（可滚动）
 *
 * 生成中可关闭弹窗（仅停止前端轮询，服务端任务继续）；
 * 任务完成后调用 onCompleted(city) 通知外部刷新可用城市并切换。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Modal, Progress, Typography } from 'antd'
import {
  fetchCurrentJob,
  type PrepareJob,
} from '../api/prepareCity'

const { Text, Paragraph } = Typography

interface PrepareCityModalProps {
  open: boolean
  onClose: () => void
  /** 任务完成（done）时回调，参数为城市 key */
  onCompleted: (city: string) => void
}

const POLL_INTERVAL = 2000

export function PrepareCityModal({
  open,
  onClose,
  onCompleted,
}: PrepareCityModalProps) {
  const [job, setJob] = useState<PrepareJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const completedRef = useRef(false)

  const stableOnCompleted = useCallback(onCompleted, [onCompleted])

  useEffect(() => {
    if (!open) {
      setJob(null)
      setError(null)
      completedRef.current = false
      return
    }

    let cancelled = false

    const poll = async () => {
      try {
        const j = await fetchCurrentJob()
        if (cancelled) return
        if (j.status === 'idle') {
          setJob(null)
          setError(null)
          return
        }
        setJob(j)
        if (j.status === 'failed') {
          setError(j.error || '生成失败，请查看日志')
        }
        if (j.status === 'done' && !completedRef.current) {
          completedRef.current = true
          // 给 tileserver-gl 重启留一点缓冲
          window.setTimeout(() => stableOnCompleted(j.city), 1500)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }

    void poll()
    timerRef.current = setInterval(() => void poll(), POLL_INTERVAL)

    return () => {
      cancelled = true
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [open, stableOnCompleted])

  const status = job?.status ?? 'running'
  const percent = job?.percent ?? 0
  const stage = job?.stage ?? '等待启动…'
  const elapsed = job?.elapsedMs ?? 0
  const isRunning = status === 'running'

  return (
    <Modal
      title="正在生成城市矢量数据"
      open={open}
      closable
      maskClosable={false}
      keyboard={false}
      onCancel={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {isRunning ? '关闭后任务仍在后台运行，可重新打开查看进度' : ''}
          </Text>
          <Button type="primary" onClick={onClose}>
            {status === 'done' ? '完成' : status === 'failed' ? '关闭' : '隐藏'}
          </Button>
        </div>
      }
    >
      <Progress
        percent={percent}
        status={status === 'failed' ? 'exception' : status === 'done' ? 'success' : 'active'}
      />
      <Paragraph style={{ marginTop: 12, marginBottom: 4 }}>
        <Text strong>当前阶段：</Text>
        <Text>{stage}</Text>
      </Paragraph>
      <Paragraph type="secondary" style={{ marginBottom: 8 }}>
        已耗时 {formatElapsed(elapsed)}
      </Paragraph>
      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ marginBottom: 12 }}
        />
      )}
      <div
        style={{
          maxHeight: 180,
          overflow: 'auto',
          background: '#0b0b0b',
          color: '#d4d4d4',
          padding: '8px 10px',
          borderRadius: 4,
          fontFamily: 'ui-monospace, Consolas, monospace',
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          lineHeight: 1.5,
        }}
      >
        {(job?.log ?? []).slice(-30).map((l, i) => (
          <div key={`${l.t}-${i}`} style={{ color: logColor(l.level) }}>
            <span style={{ opacity: 0.5 }}>[{new Date(l.t).toLocaleTimeString()}]</span>{' '}
            {l.msg}
          </div>
        ))}
        {(!job?.log || job.log.length === 0) && (
          <span style={{ opacity: 0.5 }}>（等待日志输出…）</span>
        )}
      </div>
    </Modal>
  )
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function logColor(level: string): string {
  switch (level) {
    case 'ok':
      return '#52c41a'
    case 'warn':
      return '#faad14'
    case 'error':
      return '#ff4d4f'
    case 'progress':
      return '#69b1ff'
    default:
      return '#d4d4d4'
  }
}
