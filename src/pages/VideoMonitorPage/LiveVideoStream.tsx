/**
 * @file LiveVideoStream.tsx
 * @description LiveVideoStream —— 真实直播流播放组件（WHEP/WebRTC，零第三方依赖）。
 *              浏览器原生不支持 rtsp:// 协议（<video> 无法直接播放 RTSP），因此不能把
 *              rtsp://192.168.120.210:8554/live 直接塞进 <video src>；但现场该地址是
 *              MediaMTX 流媒体服务器，同一路 /live 流已开放浏览器可用的 WebRTC(WHEP)
 *              出口 http://192.168.120.210:8889/live/whep，且其 CORS 已放行 http://localhost:5173。
 *              组件内完成 WHEP 握手（POST SDP offer → SDP answer）并经 RTCPeerConnection
 *              把媒体轨挂到 <video>.srcObject；未推流/断流时显示提示并每 5 秒自动重试。
 *              流地址可用 .env.local 的 VITE_WHEP_STREAM_URL 覆盖（默认现场 MediaMTX）。
 * @author 4everyy
 * @date 2026-10-09
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/** 默认 WHEP 端点：与 rtsp://192.168.120.210:8554/live 同一路流的 WebRTC 出口（MediaMTX） */
export const DEFAULT_WHEP_URL = 'http://192.168.120.210:8889/live/whep'

/** 实际使用的 WHEP 端点：可用 .env.local 的 VITE_WHEP_STREAM_URL 覆盖 */
export const LIVE_WHEP_URL: string = import.meta.env.VITE_WHEP_STREAM_URL || DEFAULT_WHEP_URL

/** 接入真实直播流的通道 id：当前现场仅一路 /live 源，先接入 01 号主通道；
 *  后续多机各路流就绪后，把对应通道 id 追加进来（并为通道映射各自的流地址）。 */
export const LIVE_STREAM_CHANNEL_IDS: readonly string[] = ['cam-01']

/** 组件状态：连接中 / 播放中 / 不可用（未推流或握手失败，自动重试中） */
type LiveStatus = 'loading' | 'playing' | 'error'

/** 等待 ICE 候选收集完成（按非 trickle 方式一次性提交完整 SDP，对 MediaMTX 最稳）。
 *  局域网 host 候选通常立即收齐；设 1.2s 超时兜底，超时用已收集的 SDP 继续。 */
function waitIceGathering(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve()
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', onChange)
      resolve()
    }
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') done()
    }
    pc.addEventListener('icegatheringstatechange', onChange)
    window.setTimeout(done, 1200)
  })
}

/**
 * 直播流画面：铺满容器的 <video>（复用 .vm-video-stream 样式）+ 连接状态提示浮层。
 * 仅输出视频元素与状态层，信息条/摇杆/工具列等 UI 仍由外层 VideoChannelCard 渲染。
 */
export function LiveVideoStream({
  whepUrl = LIVE_WHEP_URL,
  videoRef,
}: {
  /** WHEP 端点地址（默认 LIVE_WHEP_URL，env 可覆盖） */
  whepUrl?: string
  /** 外部 <video> 引用（供画面卡抓拍/区域截图读取当前帧） */
  videoRef?: RefObject<HTMLVideoElement | null>
}) {
  const [status, setStatus] = useState<LiveStatus>('loading')
  const videoElRef = useRef<HTMLVideoElement | null>(null)

  /* callback ref：元素挂载/卸载时同步内部引用与外部 videoRef（卸载置 null 释放抓拍引用） */
  const attachVideoEl = useCallback(
    (el: HTMLVideoElement | null) => {
      videoElRef.current = el
      if (videoRef) videoRef.current = el
    },
    [videoRef],
  )

  useEffect(() => {
    const video = videoElRef.current
    if (!video) return
    let pc: RTCPeerConnection | null = null
    let disposed = false
    let retryTimer: number | null = null

    /** 释放当前 RTCPeerConnection 并清空画面 */
    const teardown = () => {
      video.srcObject = null
      pc?.close()
      pc = null
    }

    /** 失败重试：5 秒后重建连接（未推流/网络抖动场景持续自愈，直到组件卸载） */
    const scheduleRetry = () => {
      if (disposed || retryTimer !== null) return
      setStatus('error')
      retryTimer = window.setTimeout(() => {
        retryTimer = null
        teardown()
        void connect()
      }, 5000)
    }

    /** WHEP 握手 + 建连：POST SDP offer → answer → ICE/DTLS → 媒体轨进 <video> */
    const connect = async () => {
      try {
        setStatus('loading')
        const next = new RTCPeerConnection()
        pc = next
        /* 只收不发：声明 video/audio 接收方向（服务端据此返回带媒体的 answer） */
        next.addTransceiver('video', { direction: 'recvonly' })
        next.addTransceiver('audio', { direction: 'recvonly' })
        next.ontrack = (e) => {
          video.srcObject = e.streams[0] ?? new MediaStream([e.track])
          void video.play().catch(() => {})
        }
        next.onconnectionstatechange = () => {
          if (disposed) return
          if (next.connectionState === 'connected') setStatus('playing')
          else if (next.connectionState === 'failed') scheduleRetry()
        }
        const offer = await next.createOffer()
        await next.setLocalDescription(offer)
        await waitIceGathering(next)
        if (disposed) return
        const res = await fetch(whepUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: next.localDescription?.sdp ?? '',
        })
        /* 未推流时 MediaMTX 对 /whep 返回 404：走 catch 进入不可用态并自动重试 */
        if (!res.ok) throw new Error(`WHEP HTTP ${res.status}`)
        await next.setRemoteDescription({ type: 'answer', sdp: await res.text() })
      } catch {
        scheduleRetry()
      }
    }

    void connect()

    return () => {
      disposed = true
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      teardown()
    }
  }, [whepUrl])

  return (
    <>
      <video ref={attachVideoEl} className="vm-video-stream" autoPlay muted playsInline />
      {status !== 'playing' && (
        <div className="vm-live-status" role="status">
          <span className="vm-live-status-text">
            {status === 'loading' ? '正在连接视频流…' : '视频流不可用，等待推流…'}
          </span>
        </div>
      )}
    </>
  )
}