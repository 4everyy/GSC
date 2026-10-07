/**
 * @file downlinkObserve.ts
 * @description 下行观测工具：窗口内收集下行帧用于联调对帧
 * @author 4everyy
 * @date 2026-10-07
 */
import { wsClient, type WsStatus } from './wsClient'

// 下行观测窗口（联调对帧用）

/** 单次观测结果：窗口内收到的全部下行帧 + 按类型汇总 */
export interface DownlinkObservation {
  /** 观测标签（如 "takeoff"），用于日志对齐 */
  label: string
  /** 窗口时长（毫秒） */
  durationMs: number
  /** 窗口内下行帧总数 */
  total: number
  /** 按原始帧类型计数：op#ch（新版，如 pub#cmd）或 action/topic/typ… */
  byType: Record<string, number>
  /** 窗口内全部原始帧（协议映射前；DevTools 可展开逐帧检查） */
  frames: unknown[]
  /** 观测结束时是否处于可收发状态 */
  status: WsStatus
}

/** 原始帧分类：新版 op#ch（如 pub#cmd），旧版 action/topic/type，未知归 raw。 */
function frameKind(frame: unknown): string {
  if (typeof frame !== 'object' || frame === null) return 'raw'
  const f = frame as {
    op?: unknown
    ch?: unknown
    action?: unknown
    topic?: unknown
    type?: unknown
  }
  if (typeof f.op === 'string' || typeof f.ch === 'string') {
    return `${typeof f.op === 'string' ? f.op : 'pub'}#${typeof f.ch === 'string' ? f.ch : ''}`
  }
  if (typeof f.action === 'string') return f.action
  if (typeof f.topic === 'string') return f.topic
  if (typeof f.type === 'string') return f.type
  return 'raw'
}

/** cmd 频道（指令回执）结论：pub#cmd 计数 >0 打 ✔ */
function reportCmdChannelReceipt(label: string, count: number): void {
  if (count > 0) {
    console.info(
      `[ws-observe] ✔ 「${label}」收到 cmd 频道回执（pub#cmd × ${count}）——后端已通过 WS cmd 频道推送指令回执`,
    )
  } else {
    console.warn(
      `[ws-observe] ⚠ 「${label}」未收到 cmd 频道回执（pub#cmd=0）。注意：ack#cmd 仅是订阅确认，不是指令回执；` +
        `若后端仅在 WS 上行指令时才回执、REST 起飞结果只体现在 HTTP 响应，则属预期行为`,
    )
  }
}

/** device 频道（设备状态回执）专项结论 —— 客户端/服务端责任判定。 */
function reportDeviceChannelVerdict(
  label: string,
  byType: Record<string, number>,
  subState: Record<string, { sentAt?: number; ackAt?: number }>,
  status: WsStatus,
): void {
  const devicePub = byType['pub#device'] ?? 0
  if (devicePub > 0) {
    console.info(
      `[ws-observe] ✔ 「${label}」收到 device 频道回执（pub#device × ${devicePub}）——` +
        `后端已通过 WS device 频道推送设备状态回执（起飞后 inAir/model 状态变更）`,
    )
    return
  }
  const sentAt = subState.device?.sentAt
  const ackAt = subState.device?.ackAt
  if (status !== 'open') {
    console.error(
      `[ws-observe] ✘ 「${label}」未收到 device 频道回执——【链路问题】观测结束时连接状态为 ${status}（断线/重连中），` +
        `下行不可达无法判定服务端行为；重连成功后重新下发指令再观测`,
    )
  } else if (sentAt === undefined) {
    console.error(
      `[ws-observe] ✘ 「${label}」未收到 device 频道回执——【客户端问题】本次连接从未发送 device 订阅帧` +
        `（订阅帧应在连接建立时随 5 频道一并发出，请检查控制台 "[ws] send subscribe" 日志与 wsClient.onopen）`,
    )
  } else if (ackAt === undefined) {
    console.error(
      `[ws-observe] ✘ 「${label}」未收到 device 频道回执——【服务端问题】device 订阅帧已于 ` +
        `${new Date(sentAt).toLocaleTimeString()} 发出，但服务端始终未回 ack#device 订阅确认` +
        `（可能：服务端不支持该频道 / 频道名不一致 / ack 信封格式异常——可执行 __wsLog.list() 检索 ack 帧核对信封）`,
    )
  } else {
    const otherPub = Object.entries(byType).filter(
      ([k]) => k.startsWith('pub#') && k !== 'pub#device',
    )
    const otherPubTotal = otherPub.reduce((sum, [, v]) => sum + v, 0)
    if (otherPubTotal > 0) {
      console.error(
        `[ws-observe] ✘ 「${label}」未收到 device 频道回执——【服务端问题】订阅已确认（ack#device ✓）且链路正常` +
          `（窗口内其他频道推送 ${otherPubTotal} 帧：${otherPub.map(([k, v]) => `${k}×${v}`).join('、')}），` +
          `但 device 频道零推送——后端未把设备状态变更走 device 频道（可能仅经 telemetry 频道推 swarmState），` +
          `请与后端确认 device 频道的推送时机`,
      )
    } else {
      console.error(
        `[ws-observe] ✘ 「${label}」未收到 device 频道回执——【服务端问题】订阅已确认（ack#device ✓）` +
          `但窗口内所有频道均无 pub 推送（连接 open，仅收到 ${Object.keys(byType).join('、') || '无'} 类帧）`,
      )
    }
  }
}

/** 下行观测窗口（联调专用 v2：挂原始帧）：立即开始记录 N 毫秒内的全部 WS 下行原始帧（JSON 解析后、协议映射前） */
export function observeDownlink(durationMs: number, label: string): Promise<DownlinkObservation> {
  return new Promise((resolve) => {
    const frames: unknown[] = []
    console.info(
      `[ws-observe] ▶ 开始观测下行「${label}」，窗口 ${durationMs}ms，连接状态 ${wsClient.getStatus()}`,
    )
    const off = wsClient.onRawFrame((frame) => {
      frames.push(frame)
      const kind = frameKind(frame)
      // 遥测高频帧只计数（汇总时呈现），其余逐帧打印便于实时跟踪回执
      if (kind !== 'pub#telemetry' && kind !== 'plane.swarmState' && kind !== 'telemetry') {
        console.info(`[ws-observe] ↓ [${label}] ${kind}`, frame)
      }
    })
    window.setTimeout(() => {
      off()
      const byType: Record<string, number> = {}
      frames.forEach((f) => {
        const k = frameKind(f)
        byType[k] = (byType[k] ?? 0) + 1
      })
      const status = wsClient.getStatus()
      const result: DownlinkObservation = {
        label,
        durationMs,
        total: frames.length,
        byType,
        frames,
        status,
      }
      console.info(`[ws-observe] ■ 「${label}」观测结束：共 ${frames.length} 帧`, byType)
      if (frames.length === 0) {
        if (status !== 'open') {
          console.error(
            `[ws-observe] ✘ 「${label}」窗口内无任何下行且连接状态为 ${status}——【链路问题】观测期间连接不可用，无法判定服务端行为`,
          )
        } else {
          console.error(
            `[ws-observe] ✘ 「${label}」窗口内未收到任何 WS 下行帧（连接 open）——【服务端问题】连接正常但所有频道均未推送`,
          )
        }
      } else {
        // 分频道结论：cmd=指令回执；device=设备状态回执（含客户端/服务端责任判定）
        reportCmdChannelReceipt(label, byType['pub#cmd'] ?? 0)
        reportDeviceChannelVerdict(label, byType, wsClient.getSubAckSnapshot(), status)
      }
      resolve(result)
    }, durationMs)
  })
}

// 指令 WS 回执等待（动效启动门控）

/** 等待单机操控指令的服务端 WS 回执（动效启动门控：HTTP 下发成功 ≠ 飞机已受理）。 */
export function waitForCommandReceipt(
  planeId: string,
  timeoutMs = 5_000,
): Promise<'cmdAck' | 'telemetry' | null> {
  return new Promise((resolve) => {
    let settled = false
    let offMessage: () => void = () => {}
    let timer = 0
    const finish = (receipt: 'cmdAck' | 'telemetry' | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      offMessage()
      resolve(receipt)
    }
    // 监听映射后的内部消息（wsClient.onMessage 广播口径）：cmdAck 或该设备遥测帧
    offMessage = wsClient.onMessage((msg) => {
      const m = msg as { type?: string; payload?: { deviceId?: unknown } }
      if (m.type === 'cmdAck') finish('cmdAck')
      else if (m.type === 'telemetry' && m.payload?.deviceId === planeId) finish('telemetry')
    })
    timer = window.setTimeout(() => finish(null), timeoutMs)
  })
}
