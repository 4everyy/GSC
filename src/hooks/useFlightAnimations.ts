/* 模拟飞行动画 hooks（自 HomePage.tsx 拆出）：8 套 requestAnimationFrame 循环动画，
 * 覆盖返航/指点返航/区域降落/航点飞行/航线飞行/环绕飞行/集结点/编队飞行。
 * 每套动画产出 { x, y, angle, icon }（视口坐标 + 航向角 + 图标切图）驱动
 * tap-return-drone 图片定位与旋转；启停函数由 HomePage 在面板确认/取消/互斥切换时
 * 调用，组件卸载时自动清理全部动画帧。仅前端演示，待接入真实指令链路后由实时遥测驱动。
 *
 * 性能：飞行状态存于 flightAnimStore（Zustand，rAF 每帧写 store），渲染由覆盖层
 * 叶子组件按选择器订阅——动画期间 HomePage 主体与各面板不再每帧重渲染；
 * 本 hook 只保留动画循环与启停控制（全部 useCallback 稳定引用）。 */
import { useCallback, useEffect, useRef } from 'react'
import { useFlightAnimStore, usePlaneStatusStore } from '../stores/index'
import { useRealtimeStore } from '../features/realtime/wsClient'

/** 单个飞行体的瞬时状态：视口屏幕坐标 + 航向角（度，切图机头朝右为 0°，即 CSS rotate
 * 直接采用 atan2 屏幕角：0°=正右 / 90°=正下 / ±180°=正左）+ 图标切图 */
export interface FlightState {
  x: number
  y: number
  angle: number
  icon: string
  /** 飞行中目标设备主键（WS telemetry 键）：AircraftLayer 据此隐藏该机
   *  原地面高度标注（起飞前冻结的 0.000m），改由飞行图标侧实时标注呈现；
   *  航点/航线/环绕飞行写，其余动画不写 */
  planeId?: string
  /** 实时高度（m，视觉插值已向遥测对齐）：航点/航线/环绕飞行高度标注用；
   *  集结点飞行亦写（三阶段动效标注 + 队形变更续飞快照）；其余动画不写 */
  altitude?: number
  /** 地面轨迹点视口 y（未含升空偏移）：高度虚线从图标 (y) 垂直延伸到地面 (groundY) */
  groundY?: number
  /** 集结点飞行完成标记：阶段四「精准落坪定格」置 true（其余阶段恒 false）——
   *  渲染层据此判定任务完成：隐藏绿色航线、原起飞点飞机图标与 0.000m 高度标注，
   *  仅保留定格飞机与集结坪（保留当前位置）；队形变更续飞随新快照 landed=false
   *  复位，取消面板/删除重绘时随 store 清除整体恢复 */
  landed?: boolean
}

/** 航点/航线飞行动效所需的最小地图适配器能力（经纬度 ↔ 容器像素；结构化兼容 MapLibreAdapter） */
interface WaypointFlightMapAdapter {
  getContainer(): HTMLElement
  project(lngLat: { lng: number; lat: number }): { x: number; y: number }
  unproject(point: { x: number; y: number }): { lng: number; lat: number }
  /** 当前比例尺下每像素米数（可选；航线飞行地理锚定的地面速度换算用） */
  getMetersPerPixel?: () => number
}

export function useFlightAnimations() {
  // ---- rAF 句柄（8 套动画各自的循环句柄，null 表示未运行） ----
  const returnHomeFlightRaf = useRef<number | null>(null)
  const tapReturnFlightRaf = useRef<number | null>(null)
  const areaLandingFlightRaf = useRef<number | null>(null)
  const waypointFlightRaf = useRef<number | null>(null)
  const routeFlightFlightRaf = useRef<number | null>(null)
  const orbitFlightRaf = useRef<number | null>(null)
  const rallyPointFlightRaf = useRef<number | null>(null)
  const formationFlightRaf = useRef<number | null>(null)
  // 集结点模拟飞行进行中标记：队形变更时判断是否需要以新布局重启动画
  const rallyPointFlyingRef = useRef(false)

  // 模拟飞行动画：无人机图标沿「航线生成」连线自飞机位置匀速飞向落点图钉（单程约 4s），
  // 图标按航向角旋转（切图机头默认朝右，rotate = atan2 屏幕角）；
  // 到达落点停留 600ms 后回到起点重飞——无限循环播放，
  // 直至手动点击面板「取消」（或切换到其他功能面板）才停止。
  // 仅前端演示，待接入真实指令链路后由实时遥测驱动
  const startTapReturnFlight = useCallback(
    (line: { x1: number; y1: number; x2: number; y2: number }, icon: string) => {
      const { setTapReturnFlight } = useFlightAnimStore.getState()
      if (tapReturnFlightRaf.current !== null) cancelAnimationFrame(tapReturnFlightRaf.current)
      const duration = 4000
      const holdAtEnd = 600
      const cycle = duration + holdAtEnd
      const startTime = performance.now()
      const angle = (Math.atan2(line.y2 - line.y1, line.x2 - line.x1) * 180) / Math.PI
      const step = (now: number) => {
        // 周期取模实现无限循环：0~4s 飞行 → 停留落点 600ms → 回到起点重飞
        const t = Math.min(1, ((now - startTime) % cycle) / duration)
        setTapReturnFlight({
          x: line.x1 + (line.x2 - line.x1) * t,
          y: line.y1 + (line.y2 - line.y1) * t,
          angle,
          icon,
        })
        tapReturnFlightRaf.current = requestAnimationFrame(step)
      }
      tapReturnFlightRaf.current = requestAnimationFrame(step)
    },
    [],
  )
  // 停止循环飞行：取消动画帧并清除飞行无人机（「取消」按钮/面板收起时调用）
  const stopTapReturnFlight = useCallback(() => {
    if (tapReturnFlightRaf.current !== null) {
      cancelAnimationFrame(tapReturnFlightRaf.current)
      tapReturnFlightRaf.current = null
    }
    useFlightAnimStore.getState().setTapReturnFlight(null)
  }, [])

  // 停止航点飞行循环：取消动画帧并清除飞行无人机（面板关闭/重新取点/急停·返航·降落
  // 指令下发时调用，状态机回 idle；声明在 start 之前供其闭包与断流看门狗引用）
  const stopWaypointFlight = useCallback(() => {
    if (waypointFlightRaf.current !== null) {
      cancelAnimationFrame(waypointFlightRaf.current)
      waypointFlightRaf.current = null
    }
    useFlightAnimStore.getState().setWaypointFlight(null)
  }, [])
  // 航点飞行（真实指令链路动效）：HTTP 指令下发成功并收到服务端 WS 回执
  //（cmdAck / 该机遥测帧，由调用方 waitForCommandReceipt 门控）后启动。
  // 两阶段连贯动效（与航线/环绕/集结点飞行「先到高度再平飞」同口径）：
  // 阶段一「高度调整」：垂直于初始态无人机图标向上或向下移动——水平位置钉住
  // 起飞点（启动时由飞机图标当前位置反投影锚定，每帧经适配器重投影保持地图
  // 平移/缩放贴地；无适配器时钉住图标屏幕坐标），高度自
  // 起始高度（遥测实测 → mock 设备 rawPlanes.altitude → 0m 兜底）以恒定 20m/s
  // 线性爬升/下降至面板设定飞行高度（时长 = 高度差 / 20m/s，差值 <0.5m 视为
  // 已到位直接跳过；视觉升空量与 AircraftLayer 同比例 0.3px/m）；机头全程
  // 预对准「起飞点 → 航点」航线方向。遥测高度提前贴近设定值（|Δ|<0.5m，与
  // 航线/环绕飞行到位判定同口径）或停滞 3s 且仍在设定值 1m 内（模拟器爬升
  // 欠冲停在 199.x 等）时提前切入阶段二；恒速爬升时间线走完即确定性切入——
  // 保证「先提升到指定高度、再平飞」动效必现；
  // 阶段二「航点平飞」：机头对准航点，以服务端遥测地速（velocityY，m/s）沿
  // 「当前位置 → 航点」在经纬度空间匀速逼近（每帧按 地速×dt 步进，τ≈800ms
  // 指数平滑消除 1~2Hz 遥测的速度阶梯），到达航点后钉在航点悬停（图标不再
  // 移动，高度继续跟随遥测）——与 mock 版「到达航点悬停」动效一致；
  // 平飞速度兜底：遥测速度字段缺失/非正值时维持上次平滑值（从未有效则
  // 15m/s 观感兜底），仅防呆不推进航线；
  // 遥测断流看门狗：曾收到遥测后 >5s 无新帧（链路失联）终止动效回 idle。
  // 状态机：idle → altitude（高度调整：恒速垂直爬升/下降）→ follow（航点平飞）。
  // 中断路径：stopWaypointFlight（取消/面板收起/互斥切换/急停·返航·降落下发时调用）。
  // 演示兜底：无 planeId（未解析到设备主键）时退回屏幕插值飞向航点（高度
  // 不变），仅用于无后端的纯前端演示；有 planeId 时数据源一律为服务端遥测。
  const startWaypointFlight = useCallback(
    (params: {
      /** 目标设备主键（WS telemetry 键）；缺省时仅做屏幕插值演示兜底 */
      planeId?: string
      /** 飞行图标切图 */
      icon: string
      /** 地图适配器（经纬度 ↔ 容器像素投影）；缺省时仅做屏幕插值演示 */
      adapter?: WaypointFlightMapAdapter | null
      /** 航点：图钉视口坐标 + WGS84 经纬度 */
      waypoint: { x: number; y: number; lng: number; lat: number }
      /** 面板设定飞行高度（米，相对起飞点）：阶段一恒速爬升/下降目标 */
      targetHeight: number
      /** 启动时飞机图标中心视口坐标：反投影为经纬度，作为水平轨迹的锚定起点 */
      aircraftX: number
      aircraftY: number
    }) => {
      const { setWaypointFlight } = useFlightAnimStore.getState()
      if (waypointFlightRaf.current !== null) cancelAnimationFrame(waypointFlightRaf.current)
      const { planeId, icon, adapter, waypoint, targetHeight, aircraftX, aircraftY } = params

      // 启动快照：当前最新遥测帧（回执门控保证已收到 cmdAck 或遥测之一；若仅
      // cmdAck 则此处可能尚无遥测——动效保持不动直至首帧遥测到达）；仅用于起始
      // 高度取数与断流看门狗基线，不再参与水平位置锚定（见下方 groundLL 注释）
      const snapshot =
        planeId !== undefined ? useRealtimeStore.getState().telemetry[planeId] : undefined
      // 起始高度口径（与航线/环绕飞行同源）：优先 WS 遥测实测高度；无遥测时取
      // 设备状态 rawPlanes 中该 mock 无人机的当前高度；均无则兜底 0m
      const rawPlane =
        planeId !== undefined
          ? usePlaneStatusStore.getState().rawPlanes.find((p) => p.id === planeId)
          : undefined
      const mockAlt = Number(rawPlane?.altitude)
      const startAlt =
        snapshot && Number.isFinite(snapshot.altitude)
          ? snapshot.altitude
          : Number.isFinite(mockAlt)
            ? mockAlt
            : 0
      // 初始显示高度：起始高度（阶段一自该值恒速爬升/下降至设定高度）
      let visualAlt = startAlt
      // 高度显示平滑（参考起飞动效 AircraftLayer 的 CSS transition 0.8s ease）：
      // 新遥测高度到达时自当前显示高度经 800ms easeOut 分段过渡到新值——遥测
      // 间隔小于过渡时长时自当前显示值重定向（与 CSS transition 重定向行为
      // 一致），1~2Hz 遥测下爬升连续平滑不阶梯；无新帧则显示保持不动
      let altFrom = visualAlt
      let altTo = visualAlt
      let altT0 = performance.now()
      const ALT_EASE_MS = 800
      const updateVisualAlt = (frameNow: number, target: number) => {
        if (Math.abs(target - altTo) > 1e-6) {
          altFrom = visualAlt
          altTo = target
          altT0 = frameNow
        }
        const k = Math.min(1, (frameNow - altT0) / ALT_EASE_MS)
        const eased = 1 - Math.pow(1 - k, 3)
        visualAlt = altFrom + (altTo - altFrom) * eased
      }
      // 遥测高度停滞检测：liveAlt 较上次记录变化 >0.1m 时刷新时间戳——用于
      // 阶段一切换兜底（爬升欠冲停在设定值附近且不再变化时防止永不切入 follow）
      let lastSeenAlt = snapshot && Number.isFinite(snapshot.altitude) ? snapshot.altitude : null
      let lastAltChangeAt = performance.now()
      // 阶段一「高度调整」时间线：高度差 / 20m/s 恒速爬升/下降（与航线/环绕/
      // 集结点飞行同口径）；高度差 <0.5m 视为已到位直接跳过（时长 0）
      const deltaH = targetHeight - startAlt
      const CLIMB_SPEED_MS = 20
      const climbDuration =
        Math.abs(deltaH) < 0.5 ? 0 : (Math.abs(deltaH) / CLIMB_SPEED_MS) * 1000
      const climbStartAt = performance.now()
      // 遥测到位确认标记：阶段一内遥测高度贴近/停滞兜底切入时置 true——阶段二
      // 高度显示随遥测联动；恒速时间线兜底切入时保持 false（高度钉在设定值平飞，
      // 阶段二内遥测后续贴近设定值再解锁联动，避免陈旧遥测把图标拖回地面）
      let telemetryConfirmed = false
      // 水平轨迹（经纬度）：启动时以飞机图标当前位置（aircraftX/Y 视口坐标，未含
      // 升空偏移）反投影锚定——地图图标是用户布设/可拖拽的展示位置，与设备真实
      // 遥测 GPS 无关；此前误用遥测快照 GPS 锚定，动效起点会瞬移到真实机位的
      // 投影点（表现为自原图标斜下方很远处跳变后再飞向航点）。无适配器时保持
      // null：阶段一钉住图标屏幕坐标、阶段二走屏幕插值兜底。
      let groundLL: { lng: number; lat: number } | null = null
      if (adapter) {
        const rect = adapter.getContainer().getBoundingClientRect()
        const ll = adapter.unproject({ x: aircraftX - rect.left, y: aircraftY - rect.top })
        groundLL = { lng: ll.lng, lat: ll.lat }
      }
      // 平飞速度（m/s 地速）：遥测 velocityY 的平滑值；SPEED_FALLBACK_MS 为
      // 遥测从未给出有效速度时的观感兜底（防呆，不代表服务端数据）
      const SPEED_FALLBACK_MS = 15
      let speedSmooth = SPEED_FALLBACK_MS
      // 遥测断流看门狗：最后收到新帧时刻（曾收到过遥测后才生效）
      let lastTelemetryAt = performance.now()
      let everHadTelemetry = snapshot !== undefined

      // 经纬度 → 视口坐标（容器像素 + 容器视口偏移；每帧重算以跟随地图平移/缩放）
      const projectToViewport = (lng: number, lat: number) => {
        if (!adapter) return null
        const rect = adapter.getContainer().getBoundingClientRect()
        const pt = adapter.project({ lng, lat })
        return { x: rect.left + pt.x, y: rect.top + pt.y }
      }

      // 渲染状态：地面轨迹点（视口坐标，无适配器锚定时取图标屏幕坐标）+ 航向角
      let ground = { x: aircraftX, y: aircraftY }
      if (groundLL) {
        const g0 = projectToViewport(groundLL.lng, groundLL.lat)
        if (g0) ground = g0
      }
      // 初始航向：起飞点 → 航点图钉方向（切图机头朝右，rotate = atan2 屏幕角）；
      // 阶段一垂直爬升/下降全程预对准航线方向，follow 阶段刷新为「当前位置 → 航点」
      let angle = (Math.atan2(waypoint.y - aircraftY, waypoint.x - aircraftX) * 180) / Math.PI
      let targetHeading: number | null = angle
      // 阶段标记与一次性日志
      let phase: 'altitude' | 'follow' = 'altitude'
      let arrivalLogged = false
      // 新帧检测：store 每设备仅存最新一帧（覆盖写），以对象引用判等
      let lastTelemetrySeq: unknown = snapshot
      let lastNow = performance.now()

      const step = (now: number) => {
        const dt = Math.min(100, now - lastNow)
        lastNow = now
        const live =
          planeId !== undefined ? useRealtimeStore.getState().telemetry[planeId] : undefined
        // 新帧检测（对象引用判等）+ 遥测断流看门狗：曾收到遥测后 >5s 无新帧判定
        // 链路失联，终止动效回 idle（渲染面随状态清空自动消覆，与返航/降落等
        // 真实指令链路动效同语义；mock 演示兜底从未有遥测，看门狗不生效）
        if (live !== undefined && live !== lastTelemetrySeq) {
          lastTelemetrySeq = live
          lastTelemetryAt = now
          everHadTelemetry = true
        }
        if (everHadTelemetry && planeId !== undefined && now - lastTelemetryAt > 5000) {
          console.warn(`[waypoint-flight] ${planeId} 遥测断流 >5s，航点飞行动效终止回 idle`)
          stopWaypointFlight()
          return
        }
        // 屏幕兜底插值平滑系数（视觉滤波，τ=250ms；地理平飞不使用，按地速步进）
        const alpha = 1 - Math.exp(-dt / 250)

        // 最新遥测数值（字段见 protocol.ts TelemetryPayload：altitude 相对高度 /
        // velocityY 地速 m/s；经纬度不参与水平锚定——图标为用户布设位置，用遥测
        // GPS 锚定会造成起点跳变，见启动处 groundLL 注释）
        const liveAlt = live && Number.isFinite(live.altitude) ? live.altitude : null
        const liveSpeed =
          live && Number.isFinite(live.velocityY) && live.velocityY > 0.1 ? live.velocityY : null

        // 遥测高度停滞时间戳刷新（变化 >0.1m 视为仍在爬升/下降）
        if (liveAlt !== null && (lastSeenAlt === null || Math.abs(liveAlt - lastSeenAlt) > 0.1)) {
          lastSeenAlt = liveAlt
          lastAltChangeAt = now
        }
        // 阶段一 → 阶段二切换（三路择先）：①遥测高度贴近面板设定飞行高度
        // （|Δ|<0.5m，与航线/环绕飞行「高度差 <0.5m 视为到位」同口径）；②遥测
        // 高度停滞 3s 且仍在设定值 1m 内（模拟器爬升欠冲停在 199.x 等）；③恒速
        // 爬升时间线走完（无遥测确认时的确定性兜底，保证「先提升到指定高度、
        // 再平飞」动效必现）。①②切入时同步显示高度至遥测实测（消除过渡滞后，
        // 避免「设 200m 才 199m 就平飞」观感）并置 telemetryConfirmed（阶段二
        // 高度继续随遥测联动）；③切入时显示高度恰为设定值，阶段二高度钉在设定值
        const altReached = liveAlt !== null && Math.abs(liveAlt - targetHeight) < 0.5
        const altStalled =
          liveAlt !== null && Math.abs(liveAlt - targetHeight) < 1 && now - lastAltChangeAt > 3000
        const climbDone = now - climbStartAt >= climbDuration
        if (phase === 'altitude' && (altReached || altStalled || climbDone)) {
          phase = 'follow'
          telemetryConfirmed = altReached || altStalled
          if (telemetryConfirmed && liveAlt !== null) {
            visualAlt = liveAlt
            altFrom = liveAlt
            altTo = liveAlt
          }
          const climbReason = altReached
            ? '遥测高度贴近设定值（|Δ|<0.5m）'
            : altStalled
              ? '遥测高度停滞 3s 兜底（|Δ|<1m）'
              : `恒速 20m/s 垂直${deltaH >= 0 ? '爬升' : '下降'}到位（${startAlt.toFixed(1)}m → ${targetHeight.toFixed(1)}m）`
          console.info(
            `[waypoint-flight] ${planeId} 高度调整完成（${climbReason}），切入航点平飞${telemetryConfirmed ? '（高度与地速均由服务端遥测驱动）' : '（高度钉在设定值，地速由服务端遥测驱动）'}`,
          )
        }

        if (phase === 'altitude') {
          // —— 阶段一「高度调整」：水平钉住起飞点（启动时已由飞机图标位置反投影
          // 锚定，每帧重投影保持地图平移/缩放贴地；无适配器则钉住图标屏幕坐标），
          // 高度以恒定 20m/s 自起始高度线性爬升/下降至设定值——图标垂直于初始态
          // 向上或向下移动
          if (groundLL) {
            const g = projectToViewport(groundLL.lng, groundLL.lat)
            if (g) ground = g
          }
          const ct = climbDuration > 0 ? Math.min(1, (now - climbStartAt) / climbDuration) : 1
          visualAlt = startAlt + deltaH * ct
        } else if (planeId === undefined) {
          // —— 阶段二演示兜底（无设备主键）：屏幕插值飞向航点（高度保持设定值），
          // 仅前端演示用
          ground = {
            x: ground.x + (waypoint.x - ground.x) * alpha,
            y: ground.y + (waypoint.y - ground.y) * alpha,
          }
          const hdx = waypoint.x - ground.x
          const hdy = waypoint.y - ground.y
          if (Math.hypot(hdx, hdy) > 2) {
            targetHeading = (Math.atan2(hdy, hdx) * 180) / Math.PI
          }
        } else {
          // —— 阶段二「航点平飞」：高度保持设定值平飞（遥测确认到位后随遥测联动，
          // 800ms easeOut 分段过渡）；水平以遥测地速 velocityY（平滑值）沿
          // 「当前位置 → 航点」在经纬度空间匀速逼近（等距圆柱近似，每帧按
          // 地速×dt 步进），地图平移/缩放时逐帧重投影贴地不漂移；
          // 到达航点后钉在航点悬停（图标不再移动，高度随遥测联动）
          // 遥测后续确认到位（阶段一恒速时间线先走完的情形）：解锁高度随遥测联动；
          // 未确认则高度钉在设定值（避免未执行指令的陈旧遥测把图标拖回地面）
          if (!telemetryConfirmed && liveAlt !== null && Math.abs(liveAlt - targetHeight) < 0.5) {
            telemetryConfirmed = true
          }
          if (telemetryConfirmed && liveAlt !== null) updateVisualAlt(now, liveAlt)
          // 平飞速度：遥测地速平滑（τ≈800ms）消除 1~2Hz 遥测的速度阶梯；
          // 速度字段缺失/非正值时维持上次平滑值（从未有效则保持兜底值）
          if (liveSpeed !== null) {
            speedSmooth += (liveSpeed - speedSmooth) * (1 - Math.exp(-dt / 800))
          }
          if (groundLL && adapter) {
            // 地理空间匀速步进：剩余距离 → 本帧步长比例（到达后 ratio=1 钉住）
            const stepMeters = (speedSmooth * dt) / 1000
            const midLatRad = ((groundLL.lat + waypoint.lat) / 2) * (Math.PI / 180)
            const dLngM = (waypoint.lng - groundLL.lng) * 111320 * Math.cos(midLatRad)
            const dLatM = (waypoint.lat - groundLL.lat) * 110540
            const distM = Math.hypot(dLngM, dLatM)
            const ratio = distM > 1e-6 ? Math.min(1, stepMeters / distM) : 1
            groundLL = {
              lng: groundLL.lng + (waypoint.lng - groundLL.lng) * ratio,
              lat: groundLL.lat + (waypoint.lat - groundLL.lat) * ratio,
            }
            const g = projectToViewport(groundLL.lng, groundLL.lat)
            const w = projectToViewport(waypoint.lng, waypoint.lat)
            if (g) ground = g
            // 机头对准「当前位置 → 航点」方向（>2px 才刷新，到达后航向锁定不抖动）
            if (g && w) {
              const hdx = w.x - g.x
              const hdy = w.y - g.y
              if (Math.hypot(hdx, hdy) > 2) {
                targetHeading = (Math.atan2(hdy, hdx) * 180) / Math.PI
              }
            }
            // 到达航点（当前投影点距航点投影 <10px）记录一次日志，此后钉住悬停
            if (!arrivalLogged && g && w && Math.hypot(w.x - g.x, w.y - g.y) < 10) {
              arrivalLogged = true
              console.info(
                `[waypoint-flight] ${planeId} 已到达航点 (${waypoint.lng.toFixed(6)}, ${waypoint.lat.toFixed(6)}) 高度 ${visualAlt.toFixed(1)}m，钉住航点悬停（高度继续跟随遥测）`,
              )
            }
          } else {
            // 无适配器（无锚定经纬度）：退回屏幕指数插值飞向航点（兼容兜底）
            ground = {
              x: ground.x + (waypoint.x - ground.x) * alpha,
              y: ground.y + (waypoint.y - ground.y) * alpha,
            }
            const hdx = waypoint.x - ground.x
            const hdy = waypoint.y - ground.y
            if (Math.hypot(hdx, hdy) > 2) {
              targetHeading = (Math.atan2(hdy, hdx) * 180) / Math.PI
            }
          }
        }

        // 航向角短弧平滑转向（切图机头朝右为 0°）：向目标航向以 τ≈180ms 指数
        // 平滑转向（恒取最短弧），机头全程对准运动方向不跳变
        if (targetHeading !== null) {
          const delta = ((targetHeading - angle + 540) % 360) - 180
          angle += delta * (1 - Math.exp(-dt / 180))
        }

        // 视口坐标 = 地面轨迹点 - 升空像素（与 AircraftLayer 的 --aircraft-lift 同
        // 公式，0.3px/m 仅视觉升空折算非数据 mock）；高度标注随动画 tick 实时刷新
        // （渲染平滑值，逐帧向遥测高度收敛），WaypointAltitudeOverlay 按整米取整显示
        setWaypointFlight({
          x: ground.x,
          y: ground.y - visualAlt * 0.3,
          angle,
          icon,
          // 目标设备主键：AircraftLayer 据此隐藏该机原地面冻结标注（去重）
          planeId,
          altitude: visualAlt,
          groundY: ground.y,
        })

        waypointFlightRaf.current = requestAnimationFrame(step)
      }
      waypointFlightRaf.current = requestAnimationFrame(step)
    },
    [stopWaypointFlight],
  )
  // 航线飞行模拟飞行（与航点/环绕飞行「先到高度再平飞」同口径）：三阶段连贯过渡——
  // 阶段一「高度调整」（climbing/descending）：自当前高度（遥测实测 → mock 设备
  // rawPlanes.altitude → 0m 兜底）以恒定 20m/s 垂直速度爬升/下降至面板设定飞行高度
  // （时长 = 高度差 / 20m/s；高度差 <0.5m 视为已到位直接跳过），水平钉在起飞点地面
  // 位置不移动，视觉升空量与 AircraftLayer 同比例 0.3px/m，实时高度逐帧写入 store
  // 供 WaypointAltitudeOverlay 标注层渲染，机头预对准「起飞点 → 首航点」方向；
  // 阶段二「转场平飞」：到达设定高度后自飞机位置匀速飞向首航点（地理模式按恒定
  // 50m/s 地速平飞，不随缩放级别变化；屏幕兜底约 120px/s 观感），全程保持设定高度不变；
  // 阶段三「航线巡航」：到达首航点后沿「航点1 → 航点2 → …」折线航线循环飞行，按
  // 累计长度线性插值依次经过各编号航点，到达末航点停留 600ms 后回到首航点重飞——
  // 无限循环，高度保持设定值，直至面板关闭/重新取点/删除航点终止；
  // 仅前端演示，待接入真实指令链路后由实时遥测驱动。
  // 地理锚定模式：航点携带经纬度且提供适配器时，按地理分段长度（等距圆柱近似，米）
  // 参数化插值，每帧将「所在段两端航点 + 插值权重」重投影为视口坐标定位并取航向——
  // 地图拖动/旋转/缩放后飞行图标与地理锚定的航线图钉/折线保持贴合不漂移；
  // 无经纬度/无适配器时退回原屏幕空间插值（兼容旧调用）
  const startRouteFlightAnimation = useCallback(
    (
      points: { x: number; y: number; lng?: number; lat?: number }[],
      icon: string,
      adapter?: WaypointFlightMapAdapter | null,
      options?: {
        /** 起飞时飞机图标中心视口坐标（未含升空偏移，与 AircraftLayer 布局同源） */
        aircraftX?: number
        aircraftY?: number
        /** 目标设备主键（WS telemetry 键）：起始高度取数与 AircraftLayer 标注去重用 */
        planeId?: string
        /** 面板设定飞行高度（米，相对起飞点） */
        targetHeight?: number
      },
    ) => {
      const { setRouteFlightFlight } = useFlightAnimStore.getState()
      if (routeFlightFlightRaf.current !== null)
        cancelAnimationFrame(routeFlightFlightRaf.current)
      if (points.length === 0) return
      // 缺省兜底：未传起飞参数时自首航点原地起飞（兼容旧调用）
      const {
        aircraftX = points[0].x,
        aircraftY = points[0].y,
        planeId,
        targetHeight = 0,
      } = options ?? {}
      const geo = !!adapter && points.every((p) => p.lng !== undefined && p.lat !== undefined)
      // 起飞点经纬度（地理锚定）：由飞机图标中心视口坐标反投影——地图图标是用户
      // 布设/可拖拽的展示位置，与设备真实遥测 GPS 无关；此前优先用遥测 GPS 锚定
      // 会让动效起点瞬移到真实机位投影点（与航点飞行同源的「斜下方跳变」缺陷）。
      // snapshot 仅用于起始高度取数（遥测实测高度优先）。
      const snapshot =
        planeId !== undefined ? useRealtimeStore.getState().telemetry[planeId] : undefined
      let startLng: number | undefined
      let startLat: number | undefined
      if (geo && adapter) {
        const rect = adapter.getContainer().getBoundingClientRect()
        const ll = adapter.unproject({ x: aircraftX - rect.left, y: aircraftY - rect.top })
        startLng = ll.lng
        startLat = ll.lat
      }
      const geoAnchor = geo && startLng !== undefined && startLat !== undefined
      // 起始高度口径（与航点/环绕飞行同源）：优先 WS 遥测实测高度；无遥测（mock 离线
      // 兜底）时取设备状态 rawPlanes 中该 mock 无人机的当前高度；均无则兜底 0m
      const rawPlane =
        planeId !== undefined
          ? usePlaneStatusStore.getState().rawPlanes.find((p) => p.id === planeId)
          : undefined
      const mockAlt = Number(rawPlane?.altitude)
      const startAlt =
        snapshot && Number.isFinite(snapshot.altitude)
          ? snapshot.altitude
          : Number.isFinite(mockAlt)
            ? mockAlt
            : 0
      const deltaH = targetHeight - startAlt
      // 阶段一时长：高度差 / 20m/s（恒速增减，与航点/环绕飞行同口径）；可忽略时直接跳过
      const CLIMB_SPEED_MS = 20
      const climbDuration =
        Math.abs(deltaH) < 0.5 ? 0 : (Math.abs(deltaH) / CLIMB_SPEED_MS) * 1000
      // 阶段一方向标记（日志与语义用：deltaH>0 爬升 climbing / <0 下降 descending）
      const climbPhase = deltaH >= 0 ? 'climbing' : 'descending'
      // 预计算折线分段长度：segLens[i] 为航点 i → i+1 段长，total 为全程总长
      // （地理模式用米；屏幕模式用像素）
      const segLens: number[] = []
      let total = 0
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i]
        const b = points[i + 1]
        const len = geo
          ? Math.hypot(
              ((b.lng as number) - (a.lng as number)) *
                111320 *
                Math.cos((((a.lat as number) + (b.lat as number)) / 2) * (Math.PI / 180)),
              ((b.lat as number) - (a.lat as number)) * 110540,
            )
          : Math.hypot(b.x - a.x, b.y - a.y)
        segLens.push(len)
        total += len
      }
      // 平飞速度口径（任务要求）：地理模式按恒定 50m/s 地速平飞（转场平飞与航线
      // 巡航同速，不随缩放级别变化，与航点/环绕飞行同口径）；屏幕兜底模式无地理比例尺，
      // 保持约 120px/s 观感速度
      const speed = 0.12 // px/ms
      const speedLen = geo ? 50 / 1000 : speed // 地理模式：米/ms（恒定 50m/s 地速）
      // 转场段（起飞点 → 首航点）长度与时长：地理模式取等距圆柱近似地面距离（米）；
      // 起飞点已在首航点时跳过（时长 0，直接进入航线巡航）
      const transitLen = geoAnchor
        ? Math.hypot(
            ((points[0].lng as number) - (startLng as number)) *
              111320 *
              Math.cos(
                (((startLat as number) + (points[0].lat as number)) / 2) * (Math.PI / 180),
              ),
            ((points[0].lat as number) - (startLat as number)) * 110540,
          )
        : Math.hypot(points[0].x - aircraftX, points[0].y - aircraftY)
      const transitDuration = transitLen < 1 ? 0 : Math.max(400, transitLen / speedLen)
      const routeDuration = Math.max(1200, total / speedLen)
      const holdAtEnd = 600
      const cycle = routeDuration + holdAtEnd
      const transitEnd = climbDuration + transitDuration
      // 初始航向：起飞点 → 首航点（阶段一垂直爬升/下降与阶段二转场全程保持）
      const initialHeading =
        (Math.atan2(points[0].y - aircraftY, points[0].x - aircraftX) * 180) / Math.PI
      // 经纬度 → 视口坐标（容器像素 + 容器视口偏移；每帧重算以跟随地图平移/缩放）
      const projectToViewport = (lng: number, lat: number) => {
        if (!adapter) return null
        const rect = adapter.getContainer().getBoundingClientRect()
        const pt = adapter.project({ lng, lat })
        return { x: rect.left + pt.x, y: rect.top + pt.y }
      }
      const startTime = performance.now()
      let climbLogged = false
      let routeLogged = false
      const step = (now: number) => {
        const elapsed = now - startTime
        if (elapsed < climbDuration) {
          // —— 阶段一：恒速高度调整 —— 水平钉在起飞点地面位置，
          // 高度以恒定 20m/s 线性增长/下降逼近设定值（实时高度逐帧写入 store 标注）
          const t = Math.min(1, elapsed / climbDuration)
          const visualAlt = startAlt + deltaH * t
          let gx = aircraftX
          let gy = aircraftY
          if (geoAnchor) {
            const g = projectToViewport(startLng as number, startLat as number)
            if (g) {
              gx = g.x
              gy = g.y
            }
          }
          setRouteFlightFlight({
            x: gx,
            y: gy - visualAlt * 0.3,
            angle: initialHeading,
            icon,
            planeId,
            altitude: visualAlt,
            groundY: gy,
          })
        } else if (elapsed < transitEnd) {
          // —— 阶段二：转场平飞 —— 已到达设定高度，自飞机位置匀速飞向首航点
          // （地理模式两端每帧重投影，地图平移/缩放时转场轨迹与航点保持贴合），
          // 高度保持设定值不变
          const t = Math.min(1, (elapsed - climbDuration) / transitDuration)
          let gx = aircraftX + (points[0].x - aircraftX) * t
          let gy = aircraftY + (points[0].y - aircraftY) * t
          let angle = initialHeading
          if (geoAnchor && adapter) {
            const a = projectToViewport(startLng as number, startLat as number)
            const b = projectToViewport(points[0].lng as number, points[0].lat as number)
            if (a && b) {
              gx = a.x + (b.x - a.x) * t
              gy = a.y + (b.y - a.y) * t
              angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
            }
          }
          setRouteFlightFlight({
            x: gx,
            y: gy - targetHeight * 0.3,
            angle,
            icon,
            planeId,
            altitude: targetHeight,
            groundY: gy,
          })
        } else {
          // —— 阶段三：航线巡航 —— 周期取模实现无限循环：
          // 0~routeDuration 飞行 → 停留末航点 600ms → 回到首航点重飞；
          // 沿折线按累计距离定位：找到所在线段并线性插值（航向角随所在段实时更新），
          // 地理模式每帧重投影所在段两端航点（跟随地图平移/旋转/缩放），插值权重沿用
          // 地理分段比例——图标逐帧钉在航线地理位置上，机头对准当前段的投影方向
          const routeElapsed = (now - startTime - transitEnd) % cycle
          const dist = Math.min(total, (routeElapsed / routeDuration) * total)
          let acc = 0
          let x = points[0].x
          let y = points[0].y
          let angle = initialHeading
          for (let i = 0; i < segLens.length; i++) {
            if (dist <= acc + segLens[i] || i === segLens.length - 1) {
              const t = segLens[i] > 1e-6 ? (dist - acc) / segLens[i] : 0
              if (geo && adapter) {
                const rect = adapter.getContainer().getBoundingClientRect()
                const pa = adapter.project({
                  lng: points[i].lng as number,
                  lat: points[i].lat as number,
                })
                const pb = adapter.project({
                  lng: points[i + 1].lng as number,
                  lat: points[i + 1].lat as number,
                })
                const ax = rect.left + pa.x
                const ay = rect.top + pa.y
                const bx = rect.left + pb.x
                const by = rect.top + pb.y
                x = ax + (bx - ax) * t
                y = ay + (by - ay) * t
                angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI
              } else {
                x = points[i].x + (points[i + 1].x - points[i].x) * t
                y = points[i].y + (points[i + 1].y - points[i].y) * t
                angle =
                  (Math.atan2(points[i + 1].y - points[i].y, points[i + 1].x - points[i].x) * 180) /
                  Math.PI
              }
              break
            }
            acc += segLens[i]
          }
          setRouteFlightFlight({
            x,
            y: y - targetHeight * 0.3,
            angle,
            icon,
            planeId,
            altitude: targetHeight,
            groundY: y,
          })
        }
        // 阶段切换日志（一次性）：climbing/descending → 转场平飞 → 航线巡航 衔接留痕
        if (!climbLogged && elapsed >= climbDuration) {
          climbLogged = true
          console.info(
            `[route-flight] ${planeId ?? '无人机'} 高度调整完成（${climbPhase} 20m/s：${startAlt.toFixed(1)}m → ${targetHeight.toFixed(1)}m），切入转场平飞`,
          )
        }
        if (!routeLogged && elapsed >= transitEnd) {
          routeLogged = true
          console.info(
            `[route-flight] ${planeId ?? '无人机'} 已到达首航点，沿 ${points.length} 个航点航线循环巡航`,
          )
        }
        routeFlightFlightRaf.current = requestAnimationFrame(step)
      }
      routeFlightFlightRaf.current = requestAnimationFrame(step)
    },
    [],
  )
  // 停止航线飞行循环：取消动画帧并清除飞行无人机（面板关闭/重新取点/删除航点时调用）
  const stopRouteFlightAnimation = useCallback(() => {
    if (routeFlightFlightRaf.current !== null) {
      cancelAnimationFrame(routeFlightFlightRaf.current)
      routeFlightFlightRaf.current = null
    }
    useFlightAnimStore.getState().setRouteFlightFlight(null)
  }, [])
  // 返航模拟飞行：无人机沿「飞机图标中心 → H 返航标记」航线循环飞行（单程约 4s），
  // 到达 H 标记停留 600ms 后回到起点重飞——无限循环，直至面板关闭（取消）终止；
  // 仅前端演示，待接入真实指令链路后由实时遥测驱动
  const startReturnHomeFlights = useCallback(
    (routes: { x1: number; y1: number; x2: number; y2: number }[], icons: string[]) => {
      const { setReturnHomeFlights } = useFlightAnimStore.getState()
      if (returnHomeFlightRaf.current !== null) cancelAnimationFrame(returnHomeFlightRaf.current)
      if (routes.length === 0) return
      const duration = 4000
      const holdAtEnd = 600
      const cycle = duration + holdAtEnd
      const startTime = performance.now()
      // 各航线航向角（切图机头默认朝右，rotate = atan2 屏幕角）
      const angles = routes.map((r) => (Math.atan2(r.y2 - r.y1, r.x2 - r.x1) * 180) / Math.PI)
      const step = (now: number) => {
        // 周期取模实现无限循环：0~4s 飞行 → 停留 H 标记 600ms → 回到起点重飞（多机同步）
        const t = Math.min(1, ((now - startTime) % cycle) / duration)
        setReturnHomeFlights(
          routes.map((r, i) => ({
            x: r.x1 + (r.x2 - r.x1) * t,
            y: r.y1 + (r.y2 - r.y1) * t,
            angle: angles[i],
            icon: icons[i],
          })),
        )
        returnHomeFlightRaf.current = requestAnimationFrame(step)
      }
      returnHomeFlightRaf.current = requestAnimationFrame(step)
    },
    [],
  )
  // 停止返航循环飞行：取消动画帧并清除飞行无人机（面板关闭时调用）
  const stopReturnHomeFlights = useCallback(() => {
    if (returnHomeFlightRaf.current !== null) {
      cancelAnimationFrame(returnHomeFlightRaf.current)
      returnHomeFlightRaf.current = null
    }
    const { returnHomeFlights, setReturnHomeFlights } = useFlightAnimStore.getState()
    if (returnHomeFlights.length > 0) setReturnHomeFlights([])
  }, [])
  // 区域降落模拟飞行：各选中无人机沿「飞机图标中心 → 对应降落坪」航线同步循环飞行
  // （单程约 4s，多机并行），到达降落坪停留 600ms 后回到起点重飞——无限循环，
  // 直至面板关闭/删除重绘终止；仅前端演示，待接入真实指令链路后由实时遥测驱动
  const startAreaLandingFlights = useCallback(
    (routes: { x1: number; y1: number; x2: number; y2: number }[], icons: string[]) => {
      const { setAreaLandingFlights } = useFlightAnimStore.getState()
      if (areaLandingFlightRaf.current !== null) cancelAnimationFrame(areaLandingFlightRaf.current)
      if (routes.length === 0) return
      const duration = 4000
      const holdAtEnd = 600
      const cycle = duration + holdAtEnd
      const startTime = performance.now()
      // 各航线航向角（切图机头默认朝右，rotate = atan2 屏幕角）
      const angles = routes.map((r) => (Math.atan2(r.y2 - r.y1, r.x2 - r.x1) * 180) / Math.PI)
      const step = (now: number) => {
        // 周期取模实现无限循环：0~4s 飞行 → 停留降落坪 600ms → 回到起点重飞
        const t = Math.min(1, ((now - startTime) % cycle) / duration)
        setAreaLandingFlights(
          routes.map((r, i) => ({
            x: r.x1 + (r.x2 - r.x1) * t,
            y: r.y1 + (r.y2 - r.y1) * t,
            angle: angles[i],
            icon: icons[i],
          })),
        )
        areaLandingFlightRaf.current = requestAnimationFrame(step)
      }
      areaLandingFlightRaf.current = requestAnimationFrame(step)
    },
    [],
  )
  // 停止区域降落循环飞行：取消动画帧并清除全部飞行无人机
  const stopAreaLandingFlights = useCallback(() => {
    if (areaLandingFlightRaf.current !== null) {
      cancelAnimationFrame(areaLandingFlightRaf.current)
      areaLandingFlightRaf.current = null
    }
    useFlightAnimStore.getState().setAreaLandingFlights([])
  }, [])
  // 停止集结点循环飞行：取消动画帧并清除全部飞行无人机（无动画时为无操作）
  const stopRallyPointFlights = useCallback(() => {
    rallyPointFlyingRef.current = false
    if (rallyPointFlightRaf.current !== null) {
      cancelAnimationFrame(rallyPointFlightRaf.current)
      rallyPointFlightRaf.current = null
    }
    const { rallyPointFlights, setRallyPointFlights } = useFlightAnimStore.getState()
    if (rallyPointFlights.length > 0) setRallyPointFlights([])
  }, [])
  // 集结点模拟飞行（真实指令链路动效口径，与航点/环绕飞行「先到高度再平飞」一致，
  // 按面板参数驱动三阶段）：
  // 阶段一「高度调整」：各机水平钉在起飞点地面位置，以恒定 20m/s 自当前高度
  // （WS 遥测实测 → mock rawPlanes → 0m 兜底，与航点飞行同口径）爬升至面板设定
  // 「起飞高度」（时长 = 高度差 / 20m/s；差值 <0.5m 视为已到位直接跳过），
  // 机头预对准「起点 → 对应集结坪」航线方向（到达后无缝转入转场），
  // 实时高度逐帧写入 store 供多机高度标注层渲染；
  // 阶段二「按集结速度转场」：到达起飞高度后各机以面板设定「集结速度」（m/s）沿
  // 航线飞向按所选「集结队形」布置的对应集结坪——像素速度按 10m/s ≈ 100px/s
  // 观感折算（speed × 0.01 px/ms，下限 0.01 防零速除零），各机航程不同、先后到达，
  // 全程保持起飞高度；
  // 阶段三「落坪对齐」：到达对应集结坪上空后边下降（视觉升空量 → 0、高度标注
  // 同步归 0）边将机头平滑旋转至集结坪预设无人机图标的朝向（图标切图机头朝上
  // = 屏幕角 -90°，最短路径转向）；
  // 阶段四「精准落坪定格」：飞机中心与集结坪预设图标中心完全重合（x/y 精确等于
  // 集结坪中心）、机头朝向与图标一致，多机按所选队形就位；全部落地后动画自然
  // 结束——末帧定格状态保留在 store，取消面板/删除重绘/重新生成时经 stop 清除；
  // 队形变更续飞（resume=true）：自各机当前快照位置/高度续飞新队形集结坪
  // （已完成的爬升段不重放）；仅前端演示，待接入真实指令链路后由实时遥测驱动
  const startRallyPointFlights = useCallback(
    (
      flights: {
        x1: number
        y1: number
        x2: number
        y2: number
        icon: string
        /** 目标设备主键（WS telemetry 键）：爬升段起始高度取数（遥测 → mock → 0m） */
        planeId?: string
      }[],
      params: {
        /** 面板设定起飞高度（米，相对起飞点）：阶段一恒速 20m/s 爬升目标 */
        targetHeight: number
        /** 面板设定集结速度（m/s）：阶段二转场速度（10m/s ≈ 100px/s 观感折算） */
        speed: number
        /** 队形变更续飞：自各机当前快照位置/高度续飞新集结坪（不重放爬升段） */
        resume?: boolean
        /** 终态机头朝向（屏幕角，0°=正右）：默认 -90°=朝上，与集结坪预设无人机图标机头一致 */
        finalHeading?: number
      },
    ) => {
      // 续飞快照须在 stop 清空 store 前捕获（各机当前地面轨迹点与实时高度）
      const prevFlights = params.resume ? useFlightAnimStore.getState().rallyPointFlights : []
      const { setRallyPointFlights } = useFlightAnimStore.getState()
      stopRallyPointFlights()
      if (flights.length === 0) return
      const { targetHeight, speed } = params
      // 终态机头朝向：与集结坪预设无人机图标机头方向一致——图标切图机头朝上，
      // atan2 屏幕角口径（0°=正右、顺时针为正）下「上」= -90°
      const finalHeading = params.finalHeading ?? -90
      // 落坪对齐段时长：下降（视觉升空量 → 0）与机头旋转至图标朝向同时完成
      const LAND_MS = 900
      // 高度调整垂直速度（与航点/航线/环绕飞行同口径 20m/s）
      const CLIMB_SPEED_MS = 20
      // 转场像素速度：集结速度（m/s）× 0.01 → 10m/s ≈ 100px/s（屏幕观感口径）；
      // 下限 0.01 px/ms 防止面板速度为 0 时除零（转场时长无穷大）
      const pxPerMs = Math.max(0.01, speed * 0.01)
      const rawPlanes = usePlaneStatusStore.getState().rawPlanes
      // 各机分段参数：起点（续飞快照 / 飞机图标中心）、起始高度（快照 → 遥测 →
      // mock rawPlanes → 0m 兜底）、爬升时长（高度差 / 20m/s）、转场时长（航程 / 速度）
      const segs = flights.map((f, i) => {
        const prev = prevFlights[i]
        const ground =
          prev && prev.groundY !== undefined
            ? { x: prev.x, y: prev.groundY }
            : { x: f.x1, y: f.y1 }
        const prevAlt = prev?.altitude
        let startAlt: number
        if (prevAlt !== undefined && Number.isFinite(prevAlt)) {
          startAlt = prevAlt
        } else {
          const snapshot =
            f.planeId !== undefined
              ? useRealtimeStore.getState().telemetry[f.planeId]
              : undefined
          const mockAlt =
            f.planeId !== undefined
              ? Number(rawPlanes.find((p) => p.id === f.planeId)?.altitude)
              : NaN
          startAlt =
            snapshot && Number.isFinite(snapshot.altitude)
              ? snapshot.altitude
              : Number.isFinite(mockAlt)
                ? mockAlt
                : 0
        }
        const deltaH = targetHeight - startAlt
        return {
          ground,
          startAlt,
          climbMs: Math.abs(deltaH) < 0.5 ? 0 : (Math.abs(deltaH) / CLIMB_SPEED_MS) * 1000,
          cruiseMs: Math.hypot(f.x2 - ground.x, f.y2 - ground.y) / pxPerMs,
          // 机头全程对准「起点 → 对应集结坪」航线方向（切图机头朝右，atan2 屏幕角）
          heading: (Math.atan2(f.y2 - ground.y, f.x2 - ground.x) * 180) / Math.PI,
          // 落坪段机头旋转量：heading → finalHeading 最短路径（归一化到 ±180°）
          turnDelta:
            ((finalHeading -
              (Math.atan2(f.y2 - ground.y, f.x2 - ground.x) * 180) / Math.PI +
              540) %
              360) -
            180,
        }
      })
      const startTime = performance.now()
      let arrivalLogged = false
      const step = (now: number) => {
        const elapsed = now - startTime
        let allArrived = true
        setRallyPointFlights(
          flights.map((f, i) => {
            const s = segs[i]
            // —— 阶段一：恒速高度调整 —— 水平钉在起点地面位置，
            // 高度线性逼近起飞高度（视觉升空量与 AircraftLayer 同比例 0.3px/m）
            if (elapsed < s.climbMs) {
              allArrived = false
              const t = elapsed / s.climbMs
              const alt = s.startAlt + (targetHeight - s.startAlt) * t
              return {
                x: s.ground.x,
                y: s.ground.y - alt * 0.3,
                angle: s.heading,
                icon: f.icon,
                altitude: alt,
                groundY: s.ground.y,
              }
            }
            // —— 阶段二：按集结速度转场 —— 保持起飞高度沿「起点 → 对应集结坪」
            // 航线匀速飞行（各机航程不同、先后到达），高度不变
            const cruiseElapsed = elapsed - s.climbMs
            if (cruiseElapsed < s.cruiseMs) {
              allArrived = false
              const t = cruiseElapsed / s.cruiseMs
              const gx = s.ground.x + (f.x2 - s.ground.x) * t
              const gy = s.ground.y + (f.y2 - s.ground.y) * t
              return {
                x: gx,
                y: gy - targetHeight * 0.3,
                angle: s.heading,
                icon: f.icon,
                altitude: targetHeight,
                groundY: gy,
              }
            }
            // —— 阶段三：落坪对齐 —— 到达集结坪上空后边下降边转向：视觉升空量与
            // 高度标注同步降为 0，机头沿最短路径旋转至图标朝向（smoothstep 缓动）
            const landElapsed = elapsed - s.climbMs - s.cruiseMs
            if (landElapsed < LAND_MS) {
              allArrived = false
              const t = landElapsed / LAND_MS
              const ease = t * t * (3 - 2 * t)
              return {
                x: f.x2,
                y: f.y2 - targetHeight * 0.3 * (1 - ease),
                angle: s.heading + s.turnDelta * ease,
                icon: f.icon,
                altitude: targetHeight * (1 - ease),
                groundY: f.y2,
              }
            }
            // —— 阶段四：精准落坪定格 —— 飞机中心与集结坪预设图标中心完全重合，
            // 机头朝向与图标一致（-90°=朝上），多机按所选队形就位；
            // landed=true 标记任务完成：渲染层据此隐藏绿色航线与原起飞点飞机图标
            return {
              x: f.x2,
              y: f.y2,
              angle: finalHeading,
              icon: f.icon,
              // 目标设备主键：AircraftLayer 据此关联原地面图标（任务完成后隐藏）
              planeId: f.planeId,
              altitude: 0,
              groundY: f.y2,
              landed: true,
            }
          }),
        )
        if (allArrived) {
          // 全部到达：动画循环自然结束，末帧悬停状态保留在 store；rAF 句柄归位，
          // rallyPointFlyingRef 保持 true——队形变更仍可触发续飞，取消面板/
          // 删除重绘时经 stopRallyPointFlights 统一清除
          rallyPointFlightRaf.current = null
          if (!arrivalLogged) {
            arrivalLogged = true
            console.info(
              `[rally-point] ${segs.length} 机已按队形精准落坪：飞机中心与集结坪预设图标重合、机头对齐图标朝向（${finalHeading}°），起飞高度 ${targetHeight}m / 集结速度 ${speed}m/s`,
            )
          }
          return
        }
        rallyPointFlightRaf.current = requestAnimationFrame(step)
      }
      rallyPointFlyingRef.current = true
      rallyPointFlightRaf.current = requestAnimationFrame(step)
    },
    [stopRallyPointFlights],
  )
  // 停止编队飞行循环动画：取消动画帧并清除全部飞行无人机（无动画时为无操作）
  const stopFormationFlightFlights = useCallback(() => {
    if (formationFlightRaf.current !== null) {
      cancelAnimationFrame(formationFlightRaf.current)
      formationFlightRaf.current = null
    }
    const { formationFlightFlights, setFormationFlightFlights } = useFlightAnimStore.getState()
    if (formationFlightFlights.length > 0) setFormationFlightFlights([])
  }, [])
  // 编队飞行模拟飞行：各选中无人机沿「飞机图标中心 → 队形中对应降落点」航线同步循环
  // 飞行（单程 4s + 降落点停留 600ms 为一个周期，多机并行、同步推进保持队形），
  // 到达后回到起点重飞——无限循环，直至取消面板/重新生成终止；
  // 仅前端演示，待接入真实指令链路后由实时遥测驱动
  const startFormationFlightFlights = useCallback(
    (flights: { x1: number; y1: number; x2: number; y2: number; icon: string }[]) => {
      const { setFormationFlightFlights } = useFlightAnimStore.getState()
      stopFormationFlightFlights()
      if (flights.length === 0) return
      const duration = 4000
      const holdAtEnd = 600
      const cycle = duration + holdAtEnd
      const startTime = performance.now()
      // 各航线航向角（切图机头默认朝右，rotate = atan2 屏幕角）
      const angles = flights.map((f) => (Math.atan2(f.y2 - f.y1, f.x2 - f.x1) * 180) / Math.PI)
      const step = (now: number) => {
        // 周期取模实现无限循环：0~4s 飞行 → 降落点停留 600ms → 回到起点重飞
        const t = Math.min(1, ((now - startTime) % cycle) / duration)
        setFormationFlightFlights(
          flights.map((f, i) => ({
            x: f.x1 + (f.x2 - f.x1) * t,
            y: f.y1 + (f.y2 - f.y1) * t,
            angle: angles[i],
            icon: f.icon,
          })),
        )
        formationFlightRaf.current = requestAnimationFrame(step)
      }
      formationFlightRaf.current = requestAnimationFrame(step)
    },
    [stopFormationFlightFlights],
  )
  // 环绕飞行（真实指令链路动效）：三阶段连贯过渡，与航点飞行「先到高度再平飞」同口径——
  // 阶段一「高度调整」（climbing/descending）：自当前高度（遥测实测 → mock 设备
  // rawPlanes.altitude → 0m 兜底，与航点飞行同口径）以恒定 20m/s 垂直速度爬升/下降
  // 至面板设定盘旋高度（时长 = 高度差 / 20m/s；高度差 <0.5m 视为已到位直接跳过）；
  // 水平钉在起飞点地面位置不移动，视觉升空量与 AircraftLayer 同比例 0.3px/m，
  // 实时高度逐帧写入 store 供 WaypointAltitudeOverlay 标注层渲染；
  // 阶段二「直线切入」：到达盘旋高度后沿「飞机图标中心 → 圆周最近点」直线匀速切入
  // 盘旋圆（地理模式按恒定 50m/s 地速切入，屏幕兜底约 120px/s；终点每帧按当前圆重算，
  // 地图移动时仍精确落在圆周上），全程保持盘旋高度不变化；
  // 阶段三「圆周盘旋」：按恒定角速度绕圆无限盘旋（不再返回起点），高度保持盘旋高度。
  // 航向角实时对齐运动方向（切图机头默认朝右，rotate = atan2 屏幕角）；
  // 直至面板关闭/重新取点/取消重绘终止；仅前端演示，待接入真实指令链路后由实时遥测驱动。
  // 地理锚定模式：中心携带经纬度且提供适配器时 radius 为米制盘旋半径——每帧将圆心
  // 经适配器重投影为视口坐标、半径按当前比例尺（getMetersPerPixel）换算像素，
  // 地图拖动/旋转/缩放后盘旋轨迹与地理锚定的绿色圆/图钉保持贴合不漂移；
  // 无经纬度/无适配器时 radius 为屏幕像素半径（兼容旧调用）
  const startOrbitFlight = useCallback(
    (params: {
      /** 起飞时飞机图标中心视口坐标（未含升空偏移，与 AircraftLayer 布局同源） */
      plane: { x: number; y: number }
      /** 盘旋圆心：视口坐标 + WGS84 经纬度（地理锚定时携带） */
      center: { x: number; y: number; lng?: number; lat?: number }
      /** 盘旋半径：地理锚定时为米制半径；否则为屏幕像素半径 */
      radius: number
      /** 飞行图标切图 */
      icon: string
      /** 地图适配器（经纬度 ↔ 容器像素投影）；缺省时仅做屏幕演示 */
      adapter?: WaypointFlightMapAdapter | null
      /** 目标设备主键（WS telemetry 键）：起始高度取数与 AircraftLayer 标注去重用 */
      planeId?: string
      /** 面板设定盘旋高度（米，相对起飞点） */
      targetHeight: number
    }) => {
      const { setOrbitFlight } = useFlightAnimStore.getState()
      if (orbitFlightRaf.current !== null) cancelAnimationFrame(orbitFlightRaf.current)
      const { plane, center, radius, icon, adapter, planeId, targetHeight } = params
      const geo = !!adapter && center.lng !== undefined && center.lat !== undefined
      // 当前帧盘旋圆参数（视口圆心 + 像素半径）：地理模式每帧重投影/换算，静态模式取定值
      const resolveCircle = () => {
        if (geo && adapter && center.lng !== undefined && center.lat !== undefined) {
          const rect = adapter.getContainer().getBoundingClientRect()
          const pt = adapter.project({ lng: center.lng, lat: center.lat })
          const mpp = adapter.getMetersPerPixel?.() ?? 1
          return {
            cx: rect.left + pt.x,
            cy: rect.top + pt.y,
            rPx: Math.max(2, radius / mpp),
          }
        }
        return { cx: center.x, cy: center.y, rPx: radius }
      }
      // 切入段终点：圆周最近点（沿飞机→圆心方向自圆心回退半径像素）
      const c0 = resolveCircle()
      const dx = c0.cx - plane.x
      const dy = c0.cy - plane.y
      const dist = Math.hypot(dx, dy)
      const ux = dist > 1e-6 ? dx / dist : 1
      const uy = dist > 1e-6 ? dy / dist : 0
      // 平飞速度口径（任务要求）：地理锚定按恒定 50m/s 地速切入与盘旋（与航点/航线
      // 飞行同口径，不随缩放级别变化）；屏幕兜底保持约 120px/s 观感速度
      const speed = geo ? 50 / 1000 / (adapter?.getMetersPerPixel?.() ?? 1) : 0.12 // px/ms
      const entryDuration = Math.max(800, dist / speed)
      // 盘旋段：同线速度换算角速度（地理模式按 50m/s 切向线速度换算整圈时长；
      // 整圈时长夹在 3~12s，避免小圆过快/大圆过慢）
      const orbitPeriod = Math.min(12000, Math.max(3000, (2 * Math.PI * c0.rPx) / speed))
      const omega = (2 * Math.PI) / orbitPeriod // rad/ms
      // 切入点位置角（θ₀ = 圆心 → 切入点方向 = -u 方向）：盘旋段自该角起持续绕行
      const entryAngle = Math.atan2(-uy, -ux)
      // 切入方向航向角（阶段一垂直爬升/下降与阶段二切入全程保持）
      const entryHeading = (Math.atan2(uy, ux) * 180) / Math.PI

      // 起始高度口径（与航点飞行同源）：优先 WS 遥测实测高度；无遥测（mock 离线兜底）
      // 时取设备状态 rawPlanes 中该 mock 无人机的当前高度；均无则兜底 0m
      const snapshot =
        planeId !== undefined ? useRealtimeStore.getState().telemetry[planeId] : undefined
      const rawPlane =
        planeId !== undefined
          ? usePlaneStatusStore.getState().rawPlanes.find((p) => p.id === planeId)
          : undefined
      const mockAlt = Number(rawPlane?.altitude)
      const startAlt =
        snapshot && Number.isFinite(snapshot.altitude)
          ? snapshot.altitude
          : Number.isFinite(mockAlt)
            ? mockAlt
            : 0
      const deltaH = targetHeight - startAlt
      // 阶段一时长：高度差 / 20m/s（恒速增减，与航点飞行同口径）；高度差可忽略时直接切入
      const CLIMB_SPEED_MS = 20
      const climbDuration =
        Math.abs(deltaH) < 0.5 ? 0 : (Math.abs(deltaH) / CLIMB_SPEED_MS) * 1000
      // 阶段一方向标记（日志与语义用：deltaH>0 爬升 climbing / <0 下降 descending）
      const climbPhase = deltaH >= 0 ? 'climbing' : 'descending'
      let phaseSwitchLogged = false

      const startTime = performance.now()
      const step = (now: number) => {
        const elapsed = now - startTime
        // 每帧重算盘旋圆（地理锚定：跟随地图平移/旋转/缩放）
        const { cx, cy, rPx } = resolveCircle()
        if (elapsed < climbDuration) {
          // —— 阶段一：恒速高度调整 —— 水平钉在起飞点地面位置，
          // 高度以恒定 20m/s 线性增长/下降逼近盘旋高度（实时高度逐帧写入 store 标注），
          // 机头预对准切入方向（到达后无缝转入直线切入）
          const t = Math.min(1, elapsed / climbDuration)
          const visualAlt = startAlt + deltaH * t
          setOrbitFlight({
            x: plane.x,
            y: plane.y - visualAlt * 0.3,
            angle: entryHeading,
            icon,
            planeId,
            altitude: visualAlt,
            groundY: plane.y,
          })
        } else if (elapsed < climbDuration + entryDuration) {
          // —— 阶段二：直线切入 —— 已到达盘旋高度，沿「飞机中心 → 圆周最近点」
          // 匀速飞行（航向固定为切入方向；终点每帧按当前圆重算，地图移动时仍精确
          // 落在圆周上），高度保持盘旋高度不变
          const t = Math.min(1, (elapsed - climbDuration) / entryDuration)
          const entry = { x: cx - ux * rPx, y: cy - uy * rPx }
          const gx = plane.x + (entry.x - plane.x) * t
          const gy = plane.y + (entry.y - plane.y) * t
          setOrbitFlight({
            x: gx,
            y: gy - targetHeight * 0.3,
            angle: entryHeading,
            icon,
            planeId,
            altitude: targetHeight,
            groundY: gy,
          })
        } else {
          // —— 阶段三：圆周盘旋 —— 自切入点位置角起持续绕行（屏幕坐标下 θ 递增为
          // 顺时针），无限循环；地面轨迹钉在圆周上，图标按升空偏移（0.3px/m）抬升
          const theta = entryAngle + omega * (elapsed - climbDuration - entryDuration)
          const gx = cx + rPx * Math.cos(theta)
          const gy = cy + rPx * Math.sin(theta)
          setOrbitFlight({
            x: gx,
            y: gy - targetHeight * 0.3,
            // 运动方向 = 位置角 θ 的切向 (-sinθ, cosθ)
            angle: (Math.atan2(Math.cos(theta), -Math.sin(theta)) * 180) / Math.PI,
            icon,
            planeId,
            altitude: targetHeight,
            groundY: gy,
          })
        }
        // 阶段切换日志（一次性）：climbing/descending → 切入盘旋 衔接留痕
        if (!phaseSwitchLogged && elapsed >= climbDuration) {
          phaseSwitchLogged = true
          console.info(
            `[orbit-flight] ${planeId ?? '无人机'} 高度调整完成（${climbPhase} 20m/s：${startAlt.toFixed(1)}m → ${targetHeight.toFixed(1)}m），切入盘旋圆`,
          )
        }
        orbitFlightRaf.current = requestAnimationFrame(step)
      }
      orbitFlightRaf.current = requestAnimationFrame(step)
    },
    [],
  )
  // 停止环绕飞行：取消动画帧并清除飞行无人机（面板关闭/重新取点/取消重绘时调用）
  const stopOrbitFlight = useCallback(() => {
    if (orbitFlightRaf.current !== null) {
      cancelAnimationFrame(orbitFlightRaf.current)
      orbitFlightRaf.current = null
    }
    useFlightAnimStore.getState().setOrbitFlight(null)
  }, [])

  // 组件卸载时终止进行中的模拟飞行动画并复位 store（自 HomePage 迁入）
  useEffect(() => {
    return () => {
      const s = useFlightAnimStore.getState()
      if (returnHomeFlightRaf.current !== null) cancelAnimationFrame(returnHomeFlightRaf.current)
      if (areaLandingFlightRaf.current !== null) cancelAnimationFrame(areaLandingFlightRaf.current)
      if (tapReturnFlightRaf.current !== null) cancelAnimationFrame(tapReturnFlightRaf.current)
      if (waypointFlightRaf.current !== null) cancelAnimationFrame(waypointFlightRaf.current)
      if (routeFlightFlightRaf.current !== null)
        cancelAnimationFrame(routeFlightFlightRaf.current)
      if (orbitFlightRaf.current !== null) cancelAnimationFrame(orbitFlightRaf.current)
      if (rallyPointFlightRaf.current !== null) cancelAnimationFrame(rallyPointFlightRaf.current)
      if (formationFlightRaf.current !== null) cancelAnimationFrame(formationFlightRaf.current)
      // 复位飞行状态：HomePage 卸载后残留的飞行图标不应继续渲染
      s.setTapReturnFlight(null)
      s.setWaypointFlight(null)
      s.setRouteFlightFlight(null)
      s.setOrbitFlight(null)
      s.setReturnHomeFlights([])
      s.setAreaLandingFlights([])
      s.setRallyPointFlights([])
      s.setFormationFlightFlights([])
    }
  }, [])

  return {
    // 启停函数（面板确认/取消/互斥切换时调用；全部 useCallback 稳定引用）
    startTapReturnFlight,
    stopTapReturnFlight,
    startWaypointFlight,
    stopWaypointFlight,
    startRouteFlightAnimation,
    stopRouteFlightAnimation,
    startReturnHomeFlights,
    stopReturnHomeFlights,
    startAreaLandingFlights,
    stopAreaLandingFlights,
    startRallyPointFlights,
    stopRallyPointFlights,
    startFormationFlightFlights,
    stopFormationFlightFlights,
    startOrbitFlight,
    stopOrbitFlight,
    // 集结点飞行进行中标记（队形变更时判断是否重启动画）
    rallyPointFlyingRef,
  }
}