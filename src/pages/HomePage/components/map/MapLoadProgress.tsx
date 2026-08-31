/**
 * MapLoadProgress —— 地图加载进度指示器（首页右下角）。
 *
 * 样式参考 antd「自定义进度条渐变色」示例：
 * <Progress type="dashboard" percent={93} strokeColor={conicColors} />
 *
 * 覆盖「应用启动 → 离线包就绪 → 瓦片渲染完毕」全流程（修复两类问题）：
 * 1. 进度条出现太晚 / 一出来就 95%：engineInstance 在地图 load（首批瓦片
 *    已渲染完）之后才暴露，真实瓦片事件早已错过。因此本组件挂载即显示，
 *    分阶段驱动：
 *    - 阶段 A（占位等待）：样式未注入（reloadKey 为空）或引擎未就绪，
 *      用时间曲线缓升假进度（上限 30%；引擎初始化带样式时上限 80%），
 *      保证黑底等待期始终有提示；
 *    - 阶段 B（真实统计）：样式已注入且引擎就绪（setStyle 进行中），
 *      监听 sourcedataloading / sourcedata(content) 的「已完成/总数」实时
 *      比值（35%~95% 单调递增）；若 onReady 时已 loaded（首次初始化路径，
 *      首批瓦片在监听前完成）直接收尾；
 *    - 阶段 C（收尾）：跳 100% → 停留 700ms → 淡出隐藏。
 * 2. 结束条件（任一先满足）：最后一批瓦片完成后 450ms 无新请求 / idle /
 *    兜底超时（占位等待 10s、瓦片统计 30s）。
 * - reloadKey（activeStyle 引用）变化 = 离线地图包热切换 setStyle，
 *   重置为可见并重新统计新一轮加载（进度从 0 重新走起）。
 */
import { useEffect, useRef, useState } from 'react'
import { Progress } from 'antd'
import type { Map as MLMap, MapSourceDataEvent } from 'maplibre-gl'
import './MapLoadProgress.css'

/** conic 渐变色：项目主色系提亮提饱和（亮青 #00e5ff → 天蓝 #35c8fb → 冰青 #8df3ff），
 *  配合 CSS drop-shadow 发光，避免与深色背景撞色 */
const CONIC_COLORS = {
  '0%': '#00e5ff',
  '50%': '#35c8fb',
  '100%': '#8df3ff',
}

/** 组件属性 */
interface MapLoadProgressProps {
  /** MapLibre 原始地图实例（MapEngineInstance.raw，未就绪时为 undefined） */
  map?: unknown
  /** 热切换标识：引用变化时视为新一轮加载（离线地图包切换 setStyle） */
  reloadKey?: unknown
}

/** 展示阶段：active 展示中 / leaving 淡出中 / hidden 已隐藏 */
type Phase = 'active' | 'leaving' | 'hidden'

// ============ 阶段 A：占位等待（假进度） ============
/** 假进度上限：普通等待（占位底图 / 引擎初始化） */
const IDLE_CAP = 30
/** 假进度上限：引擎正以离线样式初始化（load 后 onReady 即收尾） */
const INIT_CAP = 80
/** 时间常数：假进度按 1 - e^(-t/τ) 缓升，约 4.5s 接近上限 */
const IDLE_TAU_MS = 1500
/** 假进度刷新间隔 */
const TICK_MS = 100

// ============ 阶段 B：真实瓦片统计 ============
/** 真实进度区间（与阶段 A 的 30% 平滑衔接） */
const REAL_MIN = 35
const REAL_MAX = 95
/** 最后一批瓦片完成后静默多久即视为加载结束 */
const SETTLE_MS = 450

// ============ 兜底与收尾 ============
/** 占位等待兜底：迟迟没有离线包激活时完成收尾（纯色底图本身已可用） */
const IDLE_TIMEOUT_MS = 10000
/** 真实统计兜底：事件流异常（如样式彻底失败）时强制结束 */
const SAFETY_MS = 30000
/** 结束动作：100% 停留 700ms 后开始淡出，1200ms 彻底隐藏 */
const FADE_DELAY_MS = 700
const HIDE_DELAY_MS = 1200

/** 跨渲染存续的流程状态（组件级 ref，effect 重跑保持连续） */
interface ProgressState {
  /** 本轮开始时间戳（performance.now） */
  startedAt: number
  /** 已展示进度（0~100，全程单调递增，抵消阶段切换回跳） */
  shown: number
  /** 已完成瓦片数（失败也算走完，避免卡住） */
  done: number
  /** 进行中瓦片数 */
  inflight: number
  /** 是否已进入真实瓦片统计（阶段 B） */
  tracking: boolean
  /** 全部瓦片归零后已启动静默收尾定时器 */
  settled: boolean
  /** 是否已收尾（阶段 C 已触发） */
  finished: boolean
  /** 最近一轮见过的非空 reloadKey（识别热切换新一轮） */
  lastKey: unknown
  /** lastKey 是否已赋值（区分首轮 null → style，不重置进度） */
  lastKeySet: boolean
}

function makeState(): ProgressState {
  return {
    startedAt: performance.now(),
    shown: 0,
    done: 0,
    inflight: 0,
    tracking: false,
    settled: false,
    finished: false,
    lastKey: undefined,
    lastKeySet: false,
  }
}

export function MapLoadProgress({ map, reloadKey }: MapLoadProgressProps) {
  const [percent, setPercent] = useState(0)
  // 挂载即显示：覆盖启动初期的黑底等待阶段
  const [phase, setPhase] = useState<Phase>('active')

  const stRef = useRef<ProgressState>(null as unknown as ProgressState)
  if (!stRef.current) stRef.current = makeState()
  const settleTimer = useRef(0)
  const fadeTimer = useRef(0)
  const hideTimer = useRef(0)
  const globalTimer = useRef(0)
  const safetyTimer = useRef(0)

  // 主流程：map / reloadKey 任一就绪或变化时推进
  useEffect(() => {
    const s = stRef.current
    const mlMap = (map ?? null) as MLMap | null

    // —— 热切换新一轮检测：reloadKey 引用变化（且非首轮注入）→ 全量重置 ——
    if (reloadKey != null) {
      if (s.lastKeySet && reloadKey !== s.lastKey) {
        window.clearTimeout(settleTimer.current)
        window.clearTimeout(fadeTimer.current)
        window.clearTimeout(hideTimer.current)
        window.clearTimeout(globalTimer.current)
        window.clearTimeout(safetyTimer.current)
        Object.assign(s, makeState())
        setPercent(0)
        setPhase('active')
      }
      s.lastKey = reloadKey
      s.lastKeySet = true
    }
    if (s.finished) return

    // 保证展示中（新一轮重置后 / 常规路径）
    setPhase('active')

    /** 单调发布进度 */
    const publish = (p: number) => {
      if (p > s.shown) {
        s.shown = p
        setPercent(p)
      }
    }

    /** 阶段 C：收尾——跳 100%、停留后淡出隐藏 */
    const finish = () => {
      if (s.finished) return
      s.finished = true
      window.clearTimeout(settleTimer.current)
      window.clearTimeout(globalTimer.current)
      window.clearTimeout(safetyTimer.current)
      setPercent(100)
      fadeTimer.current = window.setTimeout(() => setPhase('leaving'), FADE_DELAY_MS)
      hideTimer.current = window.setTimeout(() => setPhase('hidden'), HIDE_DELAY_MS)
    }

    // —— 阶段 B：真实瓦片统计（引擎就绪 + 样式已注入） ——
    let detach: (() => void) | null = null
    if (mlMap && reloadKey) {
      if (mlMap.loaded()) {
        // 首次初始化路径：onReady 暴露实例时首批瓦片已渲染完（事件已错过），
        // 无加载过程可统计，直接收尾
        finish()
      } else {
        s.tracking = true
        window.clearTimeout(globalTimer.current)
        const minReal = Math.max(s.shown, REAL_MIN)

        const publishReal = () => {
          const total = s.done + s.inflight
          if (total <= 0) return
          publish(minReal + (s.done / total) * (REAL_MAX - minReal))
        }

        // 瓦片开始加载（content）：进行中 +1，取消静默收尾（新瓦片陆续被发现）。
        // metadata 事件（source 元数据就绪）不算瓦片，必须过滤
        const onTileLoading = (e: MapSourceDataEvent) => {
          if (e.dataType !== 'source' || e.sourceDataType !== 'content') return
          if (s.finished) return
          s.settled = false
          window.clearTimeout(settleTimer.current)
          s.inflight += 1
          publishReal()
        }

        // 计入一枚已完成瓦片：全部归零后静默 SETTLE_MS 即收尾。
        // maplibre 约定：每个 sourcedataloading(content) 之后必跟 sourcedata /
        // sourcedataabort / error 之一，三处都计数才能保证 inflight 归零
        const completeTile = () => {
          if (s.finished) return
          if (s.inflight > 0) s.inflight -= 1
          s.done += 1
          publishReal()
          if (s.inflight === 0 && !s.settled) {
            s.settled = true
            settleTimer.current = window.setTimeout(finish, SETTLE_MS)
          }
        }

        // 瓦片结束（成功 sourcedata / 中止 sourcedataabort），同样只认 content
        const onTileDone = (e: MapSourceDataEvent) => {
          if (e.dataType !== 'source' || e.sourceDataType !== 'content') return
          completeTile()
        }

        // 瓦片失败（error 无 sourceDataType 字段）：仅在有进行中瓦片时计数，
        // 避免与瓦片无关的 error 虚增 done 抬高进度
        const onTileError = () => {
          if (s.inflight > 0) completeTile()
        }

        mlMap.on('sourcedataloading', onTileLoading)
        mlMap.on('sourcedata', onTileDone)
        mlMap.on('sourcedataabort', onTileDone)
        mlMap.on('error', onTileError)
        // idle = 全部瓦片渲染完毕且无进行中的相机动画，作为收尾的权威兜底
        mlMap.on('idle', finish)
        // 兜底：极端情况下事件流异常（如样式彻底失败），超时强制结束避免常驻
        safetyTimer.current = window.setTimeout(finish, SAFETY_MS)

        detach = () => {
          mlMap.off('sourcedataloading', onTileLoading)
          mlMap.off('sourcedata', onTileDone)
          mlMap.off('sourcedataabort', onTileDone)
          mlMap.off('error', onTileError)
          mlMap.off('idle', finish)
          window.clearTimeout(safetyTimer.current)
        }
      }
    }

    // —— 阶段 A：占位等待假进度（未进入真实统计时缓升，保证黑底期有提示） ——
    let tickId = 0
    tickId = window.setInterval(() => {
      if (s.finished || s.tracking) {
        window.clearInterval(tickId)
        return
      }
      const t = performance.now() - s.startedAt
      // 引擎正以离线样式初始化（load 后 onReady 即收尾）→ 上限 80%；
      // 其余等待（占位底图 / 引擎初始化）→ 上限 30%
      const cap = reloadKey && !mlMap ? INIT_CAP : IDLE_CAP
      publish(cap * (1 - Math.exp(-t / IDLE_TAU_MS)))
    }, TICK_MS)

    // —— 阶段 A 兜底：迟迟没有离线包激活（无包极端场景）时完成收尾 ——
    window.clearTimeout(globalTimer.current)
    if (!s.tracking && !s.finished) {
      globalTimer.current = window.setTimeout(finish, IDLE_TIMEOUT_MS)
    }

    return () => {
      detach?.()
      window.clearInterval(tickId)
      // 注意：settle/global/safety/fade/hide 属于流程状态，effect 重跑不清理
      // （保持进度连续），仅在新一轮重置或组件卸载时清理
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, reloadKey])

  // 组件卸载：清理所有挂起定时器
  useEffect(
    () => () => {
      window.clearTimeout(settleTimer.current)
      window.clearTimeout(fadeTimer.current)
      window.clearTimeout(hideTimer.current)
      window.clearTimeout(globalTimer.current)
      window.clearTimeout(safetyTimer.current)
    },
    [],
  )

  if (phase === 'hidden') return null

  return (
    <div
      className={`map-load-progress${phase === 'leaving' ? ' map-load-progress--leaving' : ''}`}
      role="status"
      aria-label="地图加载进度"
    >
      <Progress
        type="dashboard"
        percent={Math.round(percent)}
        strokeColor={CONIC_COLORS}
        railColor="rgba(148, 163, 184, 0.18)"
        strokeWidth={10}
        size={96}
        /* 百分比文字用 antd6 语义化 styles.indicator 内联注入：内联样式优先级
           高于 antd CSS-in-JS 的 class 规则（默认 colorText 黑色），任何注入
           顺序下都必定生效；配合 CSS 文件中的同名规则作双保险 */
        styles={{
          indicator: {
            background:
              'linear-gradient(180deg, #ffffff 0%, #c8f8ff 50%, #5ee7ff 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
            fontWeight: 700,
            fontSize: '20px',
            lineHeight: 1,
          },
        }}
      />
      <span className="map-load-progress__label">
        {percent >= 100 ? '加载完成' : '地图加载中'}
      </span>
    </div>
  )
}