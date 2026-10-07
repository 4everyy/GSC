/**
 * @file protocol-builders.ts
 * @description 上行消息工厂与运行时校验 —— 自 protocol.ts 拆出。
 * @author 4everyy
 * @date 2026-10-07
 */
import type { ClientHeartbeatPayload, ClientMessage, CommandPayload, CommandType, DeviceId, HelloPayload, ServerMessage, SubscribePayload, UnsubscribePayload } from './protocol-types'

// 消息构造器（上行消息工厂）

/** 生成递增 reqId：时间戳 + 自增序号，用于指令与回执关联 */
let reqSeq = 0
function nextReqId(): string {
  reqSeq += 1
  return `req-${Date.now()}-${reqSeq}`
}

/** 当前页面会话 ID：每次刷新（模块重新加载）生成一次，握手与日志关联用 */
const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/** 构造应用层握手消息（连接建立后前端发送的第一条消息） */
export function buildHello(): ClientMessage<HelloPayload> {
  return {
    type: 'hello',
    payload: { client: 'gsc-web', sessionId },
    ts: Date.now(),
  }
}

/** 构造订阅消息 */
export function buildSubscribe(deviceIds: DeviceId[]): ClientMessage<SubscribePayload> {
  return { type: 'subscribe', payload: { deviceIds }, ts: Date.now() }
}

/** 构造退订消息 */
export function buildUnsubscribe(deviceIds: DeviceId[]): ClientMessage<UnsubscribePayload> {
  return { type: 'unsubscribe', payload: { deviceIds }, ts: Date.now() }
}

/** 构造控制指令消息（自动生成 reqId 用于回执关联） */
export function buildCommand(
  command: CommandType,
  deviceIds: DeviceId[],
  params?: Record<string, unknown>,
): ClientMessage<CommandPayload> {
  return {
    type: 'command',
    payload: { command, deviceIds, params },
    ts: Date.now(),
    reqId: nextReqId(),
  }
}

/** 构造客户端心跳消息 */
export function buildHeartbeat(): ClientMessage<ClientHeartbeatPayload> {
  return { type: 'heartbeat', payload: {}, ts: Date.now() }
}

// 运行时校验（防御式解析）

/** 判断未知数据是否为合法的下行消息信封。 */
export function isServerMessage(value: unknown): value is ServerMessage {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.type === 'string' &&
    typeof v.payload === 'object' &&
    v.payload !== null &&
    typeof v.ts === 'number'
  )
}
