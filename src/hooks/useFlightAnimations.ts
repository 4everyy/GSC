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
  /** 实时高度（m，视觉插值已向遥测对齐）：航点/航线/环绕飞行高度标注用；其余动画不写 */
  altitude?: number
  /** 地面轨迹点视口 y（未含升空偏移）：高度虚线从图标 (y) 垂直延伸到地面 (groundY) */
  groundY?: number
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
  // 航点飞行（真实指令链路动效）：滑动确认下发航点指令后启动，两阶段连贯过渡——
  // 阶段一「高度调整」（climbing/descending）：自当前高度（遥测实测 → mock 设备
  // rawPlanes.altitude → 0m 兜底）以恒定 20m/s 垂直速度爬升/下降至面板设定飞行高度
  // （时长 = 高度差 / 20m/s，严格按 20m/s 增长不做时长压缩；高度差 <0.5m 视为
  // 已到位，直接跳过进入阶段二）；水平钉在起飞点地面位置不移动，视觉升空量与
  // AircraftLayer 同比例 0.3px/m，两处动效观感一致连贯，实时高度逐帧写入 store
  // 供 WaypointAltitudeOverlay 标注层渲染；
  // 阶段二「航点平飞」（following）：严格等待阶段一到达设定高度后才启动，以恒定
  // 50m/s 地速向目标点匀速飞行（地理空间
  // 等距圆柱近似按 dt 步进，遥测可用时以遥测位置为目标；mock 离线无遥测时直接
  // 飞向航点），每帧经地图适配器 project 重投影为视口坐标，机头自起飞即指向
  // 航线方向、全程对准飞行方向（底座固定 + 机身转向：航向旋转下沉到机身层，
  // 底座正置不随转）；地图平移/缩放时当前位置与目标位置每帧重投影保持地理贴地
  // （步进在经纬度空间进行，图标精确钉在地理位置上不随缩放漂移）；
  // 仅无适配器时才退回纯屏幕插值（演示兜底）。
  // 状态机：idle → climbing/descending → following，无缝衔接（同一 rAF 循环内切换）。
  // 中断路径：stopWaypointFlight（取消/面板收起/互斥切换/急停·返航·降落下发时调用）；
  // 遥测断流看门狗：收到过遥测后进入 following 且超过 5s 无新遥测帧则终止动画
  // 并回 idle（遥测 ts 取自帧到达时间，断流即飞机失联，动效不应继续悬挂）；
  // mock 离线场景全程无遥测，看门狗不生效，动效自驱动直至抵达航点悬停。
  const startWaypointFlight = useCallback(
    (params: {
      /** 目标设备主键（WS telemetry 键）；缺省时仅做屏幕插值演示 */
      planeId?: string
      /** 飞行图标切图 */
      icon: string
      /** 地图适配器（经纬度 ↔ 容器像素投影）；缺省时仅做屏幕插值演示 */
      adapter?: WaypointFlightMapAdapter | null
      /** 航点：图钉视口坐标 + WGS84 经纬度 */
      waypoint: { x: number; y: number; lng: number; lat: number }
      /** 面板设定飞行高度（米，相对起飞点） */
      targetHeight: number
      /** 起飞时飞机图标中心视口坐标（未含升空偏移，与 AircraftLayer 布局同源） */
      aircraftX: number
      aircraftY: number
    }) => {
      const { setWaypointFlight } = useFlightAnimStore.getState()
      if (waypointFlightRaf.current !== null) cancelAnimationFrame(waypointFlightRaf.current)
      const { planeId, icon, adapter, waypoint, targetHeight, aircraftX, aircraftY } = params

      // 起飞点经纬度：优先实时遥测实测值；无遥测时由飞机图标中心经适配器反投影
      const snapshot =
        planeId !== undefined ? useRealtimeStore.getState().telemetry[planeId] : undefined
      let startLng: number | undefined
      let startLat: number | undefined
      if (
        snapshot &&
        Number.isFinite(snapshot.longitude) &&
        Number.isFinite(snapshot.latitude) &&
        (snapshot.longitude !== 0 || snapshot.latitude !== 0)
      ) {
        startLng = snapshot.longitude
        startLat = snapshot.latitude
      } else if (adapter) {
        const rect = adapter.getContainer().getBoundingClientRect()
        const ll = adapter.unproject({ x: aircraftX - rect.left, y: aircraftY - rect.top })
        startLng = ll.lng
        startLat = ll.lat
      }
      // 起始高度口径：优先 WS 遥测实测高度；无遥测（mock 离线兜底）时取设备状态
      // rawPlanes 中该 mock 无人机的当前高度（与设备面板展示同源）；均无则兜底 0m
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

      // 全程速度口径（任务要求）：阶段一按 20m/s 垂直速度爬升/下降至设定高度，
      // 到达指定高度后才切入阶段二，按 50m/s 地速平飞至航点
      const CLIMB_SPEED_MS = 20
      const CRUISE_SPEED_MS = 50
      // 阶段一时长：高度差 / 20m/s（严格恒速增长，不做时长压缩）；高度差可忽略时直接进入平飞
      const climbDuration =
        Math.abs(deltaH) < 0.5 ? 0 : (Math.abs(deltaH) / CLIMB_SPEED_MS) * 1000
      // 阶段一方向标记（日志与语义用：deltaH>0 爬升 climbing / <0 下降 descending）
      const climbPhase = deltaH >= 0 ? 'climbing' : 'descending'
      // 遥测断流看门狗：最后一次收到该设备遥测帧的时刻（阶段一启动时刷新为任务起点）
      let lastTelemetryAt = performance.now()
      // 上一次遥测帧序号：用于检测「新帧到达」（后端 1~2Hz 推送，同帧不刷新看门狗）
      let lastTelemetrySeq: unknown = snapshot
      // 是否收到过真实遥测帧：mock 离线场景全程无遥测（动效自驱动飞向航点），
      // 断流看门狗仅在「收到过遥测后断流」时生效，避免 mock 飞行被误判失联终止
      let everHadTelemetry = false

      // 初始航向：起飞点 → 航点图钉的航线方向（切图机头朝右，rotate = atan2 屏幕角）——
      // 机头自起飞即对准航线飞行方向（底座固定 + 机身转向：仅飞机图标旋转对准航线）
      const routeHeading =
        (Math.atan2(waypoint.y - aircraftY, waypoint.x - aircraftX) * 180) / Math.PI
      // 渲染状态：地面轨迹点（视口坐标）+ 视觉高度（米，0.3px/m 折算升空像素）
      let ground = { x: aircraftX, y: aircraftY }
      // 平滑状态量（经纬度）：平飞段插值在地理空间进行，随后每帧重投影为视口坐标——
      // 地图平移/缩放时图标与地理位置精确贴合不漂移；无起始经纬度时为 null（退回屏幕插值）
      let groundLL =
        startLng !== undefined && startLat !== undefined
          ? { lng: startLng, lat: startLat }
          : null
      let visualAlt = startAlt
      let angle = routeHeading
      // 目标航向（度）：起飞即指向航线方向；平飞段刷新为「当前位置 → 平滑目标」
      // 方向（即后续运动方向），机头全程对准航线轨迹
      let targetHeading: number | null = routeHeading
      let lastNow = performance.now()
      let arrivalLogged = false
      let phaseSwitchLogged = false
      // 是否已切入阶段二：首帧将视觉高度精确钳位到设定值（消除爬升末帧尾差）
      let enteredFollowing = false

      // 经纬度 → 视口坐标（容器像素 + 容器视口偏移；每帧重算以跟随地图平移/缩放）
      const projectToViewport = (lng: number, lat: number) => {
        if (!adapter) return null
        const rect = adapter.getContainer().getBoundingClientRect()
        const pt = adapter.project({ lng, lat })
        return { x: rect.left + pt.x, y: rect.top + pt.y }
      }

      const startTime = performance.now()
      const step = (now: number) => {
        const dt = Math.min(100, now - lastNow)
        lastNow = now
        const elapsed = now - startTime
        const live =
          planeId !== undefined ? useRealtimeStore.getState().telemetry[planeId] : undefined
        // 遥测断流看门狗（仅 following 阶段生效）：>5s 无新遥测帧判定失联，
        // 终止动效回 idle（渲染面由 FlightSimulationOverlays 因状态清空自动消失）
        if (live !== undefined && live !== lastTelemetrySeq) {
          lastTelemetrySeq = live
          lastTelemetryAt = now
          everHadTelemetry = true
        }
        if (
          everHadTelemetry &&
          elapsed >= climbDuration &&
          now - lastTelemetryAt > 5000 &&
          planeId !== undefined
        ) {
          console.warn(
            `[waypoint-flight] ${planeId} 遥测断流 >5s，航点跟飞动效终止回 idle`,
          )
          stopWaypointFlight()
          return
        }
        // 平滑系数：与帧时长解耦的指数平滑（τ=450ms）——平飞段高度向遥测对齐、
        // 无适配器屏幕兜底插值仍在使用
        const alpha = 1 - Math.exp(-dt / 450)

        if (elapsed < climbDuration) {
          // —— 阶段一：恒速高度调整 —— 水平钉在起飞点地面位置，
          // 高度以恒定 20m/s 线性增长/下降逼近设定值（实时高度逐帧写入 store 标注）
          const t = Math.min(1, elapsed / climbDuration)
          visualAlt = startAlt + deltaH * t
          if (startLng !== undefined && startLat !== undefined) {
            const g = projectToViewport(startLng, startLat)
            if (g) ground = g
          }
        } else {
          // —— 阶段二：航点平飞 —— WS 遥测经纬度驱动地面轨迹点；
          // 遥测未就绪时目标退化为航点经纬度（图标平滑滑向航点，链路不中断）
          const liveLL =
            live &&
            Number.isFinite(live.longitude) &&
            Number.isFinite(live.latitude) &&
            (live.longitude !== 0 || live.latitude !== 0)
              ? { lng: live.longitude, lat: live.latitude }
              : null
          const targetLL = liveLL ?? { lng: waypoint.lng, lat: waypoint.lat }
          if (groundLL && adapter) {
            // 恒速平飞（50m/s 地速）：等距圆柱近似求剩余地面距离，每帧按
            // 地速 × dt 步进逼近目标点（到达即钉在目标点悬停）；
            // 步进在经纬度空间进行、每帧重投影为视口坐标——地图平移/缩放时
            // 当前点与目标点同时重投影，图标精确钉在其地理位置上不漂移/滞留屏幕
            const stepMeters = (CRUISE_SPEED_MS * dt) / 1000
            const midLatRad = ((groundLL.lat + targetLL.lat) / 2) * (Math.PI / 180)
            const dLngM = (targetLL.lng - groundLL.lng) * 111320 * Math.cos(midLatRad)
            const dLatM = (targetLL.lat - groundLL.lat) * 110540
            const distM = Math.hypot(dLngM, dLatM)
            const ratio = distM > 1e-6 ? Math.min(1, stepMeters / distM) : 1
            groundLL = {
              lng: groundLL.lng + (targetLL.lng - groundLL.lng) * ratio,
              lat: groundLL.lat + (targetLL.lat - groundLL.lat) * ratio,
            }
            const g = projectToViewport(groundLL.lng, groundLL.lat)
            const t = projectToViewport(targetLL.lng, targetLL.lat)
            if (g) ground = g
            // 机头对准航线轨迹：航向取「当前位置 → 平滑目标」投影方向（后续运动方向），
            // 距目标 >2px 才刷新，收敛后航向锁定不抖动
            if (g && t) {
              const hdx = t.x - g.x
              const hdy = t.y - g.y
              if (Math.hypot(hdx, hdy) > 2) {
                targetHeading = (Math.atan2(hdy, hdx) * 180) / Math.PI
              }
            }
            // 到达航点（平滑目标投影点距航点投影 <10px）记录一次日志
            if (!arrivalLogged && t) {
              const w = projectToViewport(waypoint.lng, waypoint.lat)
              if (w && Math.hypot(t.x - w.x, t.y - w.y) < 10) {
                arrivalLogged = true
                console.info(
                  `[waypoint-flight] ${planeId ?? '无人机'} 已到达航点 (${waypoint.lng.toFixed(6)}, ${waypoint.lat.toFixed(6)}) 高度 ${visualAlt.toFixed(1)}m`,
                )
              }
            }
          } else {
            // 无地理锚定（无适配器且无起始经纬度）：退回屏幕空间插值（兼容旧调用）
            const target = { x: waypoint.x, y: waypoint.y }
            ground = {
              x: ground.x + (target.x - ground.x) * alpha,
              y: ground.y + (target.y - ground.y) * alpha,
            }
            const hdx = target.x - ground.x
            const hdy = target.y - ground.y
            if (Math.hypot(hdx, hdy) > 2) {
              targetHeading = (Math.atan2(hdy, hdx) * 180) / Math.PI
            }
          }
          // 首帧切入平飞：视觉高度精确钳位到设定值——爬升末帧 t<1（离散 rAF 帧定格在
          // climbDuration 前）会残留 <1m 尾差（如设定 200m 实际 199.x m 就切入平飞），
          // 若再经指数平滑缓慢收敛，标注将长时间停留在 199m 才跳 200m，观感即「到
          // 199m 就平飞」；首帧直接对齐设定值，随后再向遥测实测高度平滑收敛
          if (!enteredFollowing) {
            enteredFollowing = true
            visualAlt = targetHeight
          }
          // 视觉高度向遥测实测高度渐近对齐（实测与设定值的偏差平滑收敛）
          const altTarget = live ? live.altitude : targetHeight
          visualAlt += (altTarget - visualAlt) * alpha
        }

        // 航向角短弧平滑转向（切图机头朝右为 0°，rotate = atan2 屏幕角）：
        // 起飞即指向航线方向（高度过渡段沿该航向垂直爬升/下降）；切入平飞后刷新为
        // 「当前位置 → 平滑目标」方向，以 τ≈180ms 指数平滑转向（恒取最短弧），
        // 机头全程对准航线飞行方向不跳变
        if (targetHeading !== null) {
          const delta = ((targetHeading - angle + 540) % 360) - 180
          angle += delta * (1 - Math.exp(-dt / 180))
        }

        // 视口坐标 = 地面轨迹点 - 升空像素（与 AircraftLayer 的 --aircraft-lift 同公式）
        setWaypointFlight({
          x: ground.x,
          y: ground.y - visualAlt * 0.3,
          angle,
          icon,
          // 目标设备主键：AircraftLayer 据此隐藏该机原地面 0.000m 冻结标注（去重）
          planeId,
          // 高度标注随动画 tick 实时刷新：store 保留浮点原值驱动垂直位移平滑，
          // 标注层按整米取整显示（20m/s ≙ 每 50ms 步进 1m，无小数位跳动）
          altitude: visualAlt,
          groundY: ground.y,
        })
        // 阶段切换日志（一次性）：climbing/descending → following 衔接留痕
        if (!phaseSwitchLogged && elapsed >= climbDuration) {
          phaseSwitchLogged = true
          console.info(
            `[waypoint-flight] ${planeId ?? '无人机'} 高度调整完成（${climbPhase} 20m/s：${startAlt.toFixed(1)}m → ${targetHeight.toFixed(1)}m），切入 50m/s 恒速平飞`,
          )
        }

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
      // 起飞点经纬度（地理锚定）：优先 WS 遥测实测值；无遥测时由飞机图标中心反投影
      const snapshot =
        planeId !== undefined ? useRealtimeStore.getState().telemetry[planeId] : undefined
      let startLng: number | undefined
      let startLat: number | undefined
      if (
        snapshot &&
        Number.isFinite(snapshot.longitude) &&
        Number.isFinite(snapshot.latitude) &&
        (snapshot.longitude !== 0 || snapshot.latitude !== 0)
      ) {
        startLng = snapshot.longitude
        startLat = snapshot.latitude
      } else if (geo && adapter) {
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
  // 集结点模拟飞行：各选中无人机沿「飞机图标中心 → 对应集结坪」航线同步循环飞行
  // （单程约 4s + 集结坪停留 600ms 为一个周期，多机并行），到达后回到起点重飞——
  // 无限循环，直至取消面板/删除重绘/重新生成终止；仅前端演示，待接入真实指令链路后由实时遥测驱动
  const startRallyPointFlights = useCallback(
    (flights: { x1: number; y1: number; x2: number; y2: number; icon: string }[]) => {
      const { setRallyPointFlights } = useFlightAnimStore.getState()
      stopRallyPointFlights()
      if (flights.length === 0) return
      const duration = 4000
      const holdAtEnd = 600
      const cycle = duration + holdAtEnd
      const startTime = performance.now()
      // 各航线航向角（切图机头默认朝右，rotate = atan2 屏幕角）
      const angles = flights.map((f) => (Math.atan2(f.y2 - f.y1, f.x2 - f.x1) * 180) / Math.PI)
      const step = (now: number) => {
        // 周期取模实现无限循环：0~4s 飞行 → 集结坪停留 600ms → 回到起点重飞
        const t = Math.min(1, ((now - startTime) % cycle) / duration)
        setRallyPointFlights(
          flights.map((f, i) => ({
            x: f.x1 + (f.x2 - f.x1) * t,
            y: f.y1 + (f.y2 - f.y1) * t,
            angle: angles[i],
            icon: f.icon,
          })),
        )
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