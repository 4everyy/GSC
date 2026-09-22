/**
 * DemoScenario —— 态势图演示层：单机「区域降落」+ 四机「环绕飞行」。
 *
 * 场景一（区域降落，地理锚定）：单机操控·区域降落同款真实交互视觉——
 * 紫色矩形确认区（rgba(113,96,242,0.3) 直角）+ 区域中心圆形徽章（100×100、
 * 紫 0.1 填充、8px 白 0.2 描边、内嵌 44×52 降落坪图标）+ 左上角外挂
 * 「删除重绘」按钮 mock + 单个降落坪（.area-landing-spot 同款 44×44；
 * getAreaLandingSpots 单机 n=1 布局 = 区域中心）+ 飞机→降落坪绿色实线
 * （#00FF95，与真实航线渲染同色）。
 *
 * 地理锚定：演示区直接取自 mock 数据「任务区-02」（stores MOCK_TASK_AREAS
 * id=mock-area-02）的包围盒——**同宽高（等面积）**、紧贴其**南侧**（名称标签
 * 附近）；全部元素经 adapter.project 投影为容器像素，拖动/缩放/惯性平移时
 * 由 onMove/逐帧投影联动重排——**钉死在地图上随地图移动**。进场起点取降落坪
 * 东北方 1.5×区宽 / 1.25×区高偏移（上一版 3×/2.5× 的一半），**航程缩减一半**。
 *
 * 动效：mock 匀速范式——恒速约 60px/s 自场外沿绿线飞入降落坪（高度 60→0，
 * 地理空间线性插值 + 逐帧投影，地图拖动时无人机仍钉在航线上），终点停留
 * 600ms 后回场外重飞，无限循环，无淡入淡出。
 *
 * 图标规范：与真实 AircraftLayer 一致——「机身 xxx_plane.png + 底部光晕
 * xxx_bottom.svg」组合图标（48px 定位盒 / 光晕 64px / 机身 40px）。
 *
 * 场景二（四机环绕，视口固定）：4 架无人机（蓝/黄/红/灰「底座光晕 + 机身」
 * 组合图标）沿绿色实线盘旋圆（1px #00FF95）顺时针匀速盘旋，整个组合图标
 * 随机头切向旋转——机头始终朝向飞行方向；线速度 0.12px/ms、整圈时长按半径
 * 换算并钳制 3~12s（startOrbitFlight 同款）。**高度 1km~2km**（1100/1500/
 * 1800/2000m 各不相同）：每机常驻绿色虚线高度垂线 + 高度值（置于外层平移
 * 节点、不随航向旋转，始终竖直可读）。按舞台百分比定位、不参与地理
 * 锚定——拖动/缩放地图时圆心与半径均保持屏幕位置/尺寸不变。
 *
 * 纯展示型自动演示，与交互式模拟飞行系统完全解耦：不订阅任何面板状态机，
 * pointer-events:none 全穿透。
 */
import { useEffect, useRef } from 'react'
import { deviceImages } from '../../../assets/images/device/index'
import { homeImages } from '../../../assets/images/home/index'
import { MOCK_TASK_AREAS } from '../../../stores'
import { type MapAdapter } from '../../../map-engines/types'
import './DemoScenario.css'

/* ============================== 基础工具 ============================== */

/** 视口百分比坐标（相对 map-stage，x/y 均为 0~100；四机环绕圆心用） */
interface Pt {
  x: number
  y: number
}

/** WGS84 经纬度 */
interface Geo {
  lng: number
  lat: number
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/* ============================== mock 动效常量 ============================== */

/** 终点停留时长（ms） */
const HOLD_MS = 600
/** 演示巡航恒速（px/ms，约 60px/s）——按当前投影航程换算单程时长 */
const SPEED_PX_MS = 0.06
/** 单程时长钳制范围（ms） */
const MIN_MS = 5000
const MAX_MS = 14000
/** 首次布局前的默认单程时长（ms；布局后按投影航程重算） */
const DEFAULT_FLIGHT_MS = 8000

/* ============================== 任务区-02 参照（演示区几何基准） ============================== */

/** 任务区-02 mock（hexagon(CX+0.025, CY+0.03, r=0.005)，WGS84 正六边形） */
const T02 = MOCK_TASK_AREAS.find((a) => a.id === 'mock-area-02')
const T02_LONS = (T02?.vertices ?? []).map((v) => v.longitude)
const T02_LATS = (T02?.vertices ?? []).map((v) => v.latitude)
/** 包围盒宽高（°）：经度 2r·cos30° ≈ 0.00866 / 纬度 2r = 0.01 */
const T02_W = Math.max(...T02_LONS) - Math.min(...T02_LONS)
const T02_H = Math.max(...T02_LATS) - Math.min(...T02_LATS)
/** 包围盒中心：(120.625, 31.33) —— 区域名称标签所在 */
const T02_CX = (Math.max(...T02_LONS) + Math.min(...T02_LONS)) / 2
const T02_CY = (Math.max(...T02_LATS) + Math.min(...T02_LATS)) / 2

/** 与任务区-02 的南侧间隙（10% 区高——紧邻其名称附近、不重叠压盖） */
const GAP = T02_H * 0.1

/**
 * 演示降落区（紫色矩形）：与任务区-02 包围盒**同宽高（等面积）**，
 * 紧贴其正南侧（west/east/north/south 为 WGS84 边界）。
 */
const RECT = {
  west: T02_CX - T02_W / 2,
  east: T02_CX + T02_W / 2,
  north: T02_CY - T02_H / 2 - GAP,
  south: T02_CY - T02_H / 2 - GAP - T02_H,
}

/** 单机降落坪 = 演示区中心（getAreaLandingSpots 单机 n=1 分支同款：居中） */
const PAD_GEO: Geo = {
  lng: (RECT.west + RECT.east) / 2,
  lat: (RECT.north + RECT.south) / 2,
}

/**
 * 进场起点：降落坪东北方 1.5×区宽 / 1.25×区高偏移——为上一版（3×/2.5×）
 * 的一半，**降落线路缩减一半**；航线走任务区-02 东南角外侧、不穿其本体的视觉干扰。
 */
const FROM_GEO: Geo = {
  lng: PAD_GEO.lng + T02_W * 1.5,
  lat: PAD_GEO.lat + T02_H * 1.25,
}

/** 高度：场外 60m → 落地 0m（地理插值同步线性递减） */
const ALT_FROM = 60
const ALT_TO = 0

/** 高度垂线像素高：alt(m) × 0.55，封顶 52px（与真实图标层垂线观感一致） */
const stickPx = (alt: number) => Math.min(52, Math.max(0, alt * 0.55))

/* ============================== 四机环绕（视口固定） ============================== */

/** 环绕圆心（舞台百分比；视口固定 mock，不参与地理锚定，拖图/缩放时不动） */
const ORBIT_CENTER: Pt = { x: 42, y: 68 }
/** 盘旋半径（px，视口固定像素，不随地图缩放变化） */
const ORBIT_RADIUS_PX = 150
/** 盘旋角速度：线速度 0.12px/ms（startOrbitFlight 同款），整圈时长钳制 3~12s */
const ORBIT_OMEGA =
  (2 * Math.PI) /
  Math.min(12000, Math.max(3000, (2 * Math.PI * ORBIT_RADIUS_PX) / 0.12))
/**
 * 4 架环绕无人机：初始相位均匀分布（相位差 90°，圆周四象限——位置分散），
 * 蓝/黄/红/灰组合图标区分；高度 **1km~2km**（1100/1500/1800/2000m 各不相同）。
 */
const ORBIT_DRONES = [
  { plane: deviceImages.bluePlane, bottom: deviceImages.blueBottom, phase: 0, alt: 1100 },
  {
    plane: deviceImages.yellowPlane,
    bottom: deviceImages.yellowBottom,
    phase: Math.PI / 2,
    alt: 1500,
  },
  { plane: deviceImages.redPlane, bottom: deviceImages.redBottom, phase: Math.PI, alt: 1800 },
  {
    plane: deviceImages.grayPlane,
    bottom: deviceImages.grayBottom,
    phase: (3 * Math.PI) / 2,
    alt: 2000,
  },
]

/** 环绕机高度垂线像素高：alt(m) × 0.02（1km→20px、2km→40px，静态固定） */
const orbitStickPx = (alt: number) => alt * 0.02

export interface DemoScenarioProps {
  /** 地图适配器：地理锚定投影（project）+ move 联动重排（onMove） */
  adapter: MapAdapter | null
}

export function DemoScenario({ adapter }: DemoScenarioProps) {
  // ---- 区域降落（地理锚定）：rAF/布局直写 DOM 的节点引用 ----
  /** 场景容器：内联 opacity:0 默认隐藏（避免首次布局前 0,0 闪现），
      首次投影布局成功后置 1 显形 */
  const sceneRef = useRef<HTMLDivElement | null>(null)
  const rectRef = useRef<HTMLDivElement | null>(null)
  const padRef = useRef<HTMLImageElement | null>(null)
  const lineRef = useRef<SVGLineElement | null>(null)
  // 无人机定位盒 / 高度垂线 / 高度值（rAF 直写）
  const boxRef = useRef<HTMLDivElement | null>(null)
  const stickRef = useRef<HTMLSpanElement | null>(null)
  const altRef = useRef<HTMLSpanElement | null>(null)
  /** 单程时长（ms）：布局时按当前投影航程换算（钳制 5~14s），随缩放微调 */
  const flightMsRef = useRef(DEFAULT_FLIGHT_MS)
  // ---- 四机环绕（视口固定）：外层定位节点（圆周平移）+ 内层图标（航向旋转） ----
  const orbitDroneRefs = useRef<Array<HTMLDivElement | null>>([])
  const orbitIconRefs = useRef<Array<HTMLSpanElement | null>>([])

  // ---- 地理锚定布局：adapter.project 将区域四角/降落坪/航线起点投影为容器像素，
  //      直写静态元素样式；onMove（拖动/缩放/惯性每帧触发）联动重排——
  //      区域钉死在地图坐标上、随地图移动 ----
  useEffect(() => {
    if (!adapter) return
    const layout = () => {
      const scene = sceneRef.current
      const rect = rectRef.current
      const padEl = padRef.current
      const line = lineRef.current
      if (!scene || !rect || !padEl || !line) return
      // 演示区矩形：西北角投影 → left/top，东南角投影 → 宽高（随缩放同步缩放）
      const nw = adapter.project({ lng: RECT.west, lat: RECT.north })
      const se = adapter.project({ lng: RECT.east, lat: RECT.south })
      rect.style.left = `${nw.x}px`
      rect.style.top = `${nw.y}px`
      rect.style.width = `${Math.max(1, se.x - nw.x)}px`
      rect.style.height = `${Math.max(1, se.y - nw.y)}px`
      // 降落坪：区中心投影（CSS transform: translate(-50%,-50%) 居中）
      const p = adapter.project(PAD_GEO)
      padEl.style.left = `${p.x}px`
      padEl.style.top = `${p.y}px`
      // 进场航线：起点→降落坪像素连线（SVG 逐次 setAttribute）
      const f = adapter.project(FROM_GEO)
      line.setAttribute('x1', `${f.x}`)
      line.setAttribute('y1', `${f.y}`)
      line.setAttribute('x2', `${p.x}`)
      line.setAttribute('y2', `${p.y}`)
      // 单程时长：按当前投影航程 / 恒速换算（钳制），缩放后节奏自适应
      flightMsRef.current = Math.min(
        MAX_MS,
        Math.max(MIN_MS, Math.hypot(p.x - f.x, p.y - f.y) / SPEED_PX_MS),
      )
      // 首次布局成功：场景显形（此后 onMove 每帧保持重排）
      scene.style.opacity = '1'
    }
    layout()
    const offMove = adapter.onMove(layout)
    return () => {
      offMove()
    }
  }, [adapter])

  // ---- 无人机飞行动画（地理插值 + 逐帧投影）：位置在地理空间 from→pad 线性推进，
  //      每帧 adapter.project 落屏——地图任意拖动/缩放/惯性中无人机均钉在航线上 ----
  useEffect(() => {
    if (!adapter) return
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const t = now - t0
      const box = boxRef.current
      const stick = stickRef.current
      const alt = altRef.current
      if (box && stick && alt) {
        const flightMs = flightMsRef.current
        const cycle = flightMs + HOLD_MS
        const k = Math.min(1, (((t % cycle) + cycle) % cycle) / flightMs)
        const p = adapter.project({
          lng: lerp(FROM_GEO.lng, PAD_GEO.lng, k),
          lat: lerp(FROM_GEO.lat, PAD_GEO.lat, k),
        })
        box.style.left = `${p.x}px`
        box.style.top = `${p.y}px`
        const a = lerp(ALT_FROM, ALT_TO, k)
        const h = stickPx(a)
        stick.style.height = `${h}px`
        alt.style.top = `${h / 2}px`
        alt.textContent = `${Math.round(a)}m`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [adapter])

  // ---- 四机环绕动画（视口固定）：θ = 初始相位 + ωt，屏幕坐标 θ 递增即顺时针
  //      （startOrbitFlight 同向）；外层写圆周偏移、内层写航向旋转——
  //      航向 = 位置角切向 (-sinθ, cosθ)，+90 对齐机身「上」为机头（机头朝向飞行方向） ----
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const t = now - t0
      for (let i = 0; i < ORBIT_DRONES.length; i++) {
        const droneEl = orbitDroneRefs.current[i]
        const iconEl = orbitIconRefs.current[i]
        if (!droneEl || !iconEl) continue
        const theta = ORBIT_DRONES[i].phase + ORBIT_OMEGA * t
        droneEl.style.transform = `translate(${(
          ORBIT_RADIUS_PX * Math.cos(theta)
        ).toFixed(2)}px, ${(ORBIT_RADIUS_PX * Math.sin(theta)).toFixed(2)}px)`
        const heading =
          (Math.atan2(Math.cos(theta), -Math.sin(theta)) * 180) / Math.PI + 90
        iconEl.style.transform = `rotate(${heading.toFixed(2)}deg)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="demo-layer" aria-hidden="true">
      {/* ===== 区域降落子场景（地理锚定，adapter 就绪并首次布局后显形）：
          内联样式兜底默认隐藏（opacity:0），首次投影布局成功后置 1 ===== */}
      <div
        className="demo-area-scene"
        ref={sceneRef}
        style={{ position: 'absolute', inset: 0, opacity: 0 }}
      >
        {/* 紫色已确认降落区（.area-landing-confirmed 同款视觉）：与任务区-02 同尺寸、
            紧贴其南侧；left/top/width/height 由布局投影直写（随地图拖动/缩放联动） */}
        <div className="demo-area-rect" ref={rectRef}>
          {/* 区域正中心圆形徽章：紫 0.1 填充 + 8px 白 0.2 描边，内嵌 44×52 降落坪图标 */}
          <span className="demo-area-rect__badge">
            <img src={homeImages.iconAreaLandingCenter} alt="" draggable={false} />
          </span>
          {/* 「删除重绘」按钮 mock：区域左上角外挂（纯展示，pointer-events:none） */}
          <span className="demo-area-rect__delete">删除重绘</span>
        </div>

        {/* 单机降落坪（区域中心，.area-landing-spot 同款 44×44 真实素材）；
            置于紫色填充之后渲染避免被半透明层压暗（与真实 z 序一致） */}
        <img
          className="demo-area-spot"
          src={homeImages.areaLandingSpot}
          ref={padRef}
          alt=""
          draggable={false}
        />

        {/* 进场航线：飞机 → 降落坪绿色实线（真实渲染同色 #00FF95；
            航程 = 上一版一半；坐标由布局投影直写） */}
        <svg className="demo-routes">
          <line
            ref={lineRef}
            x1="0"
            y1="0"
            x2="0"
            y2="0"
            className="demo-route-line demo-route-line--green"
          />
        </svg>

        {/* 单架动画无人机（地理插值 + 逐帧投影直写 style，React 不重渲染） */}
        <div className="demo-drone" ref={boxRef}>
          {/* 组合图标（与真实图层同规范）：底部光晕 64px + 机身 40px，均居中于 48px 定位盒 */}
          <span className="demo-drone__icon">
            <img
              className="demo-drone__bottom"
              src={deviceImages.blueBottom}
              alt=""
              draggable={false}
            />
            <img
              className="demo-drone__plane"
              src={deviceImages.bluePlane}
              alt=""
              draggable={false}
            />
          </span>
          <span className="demo-drone__stick" ref={stickRef} />
          <span className="demo-drone__label">01·区域降落</span>
          <span className="demo-drone__alt" ref={altRef}>
            {ALT_FROM}m
          </span>
        </div>
      </div>

      {/* ===== 四机环绕飞行（视口固定 mock）：绿色实线盘旋圆 + 4 机「底座光晕 +
            机身」组合图标沿圆周顺时针匀速盘旋（rAF 直写 transform：
            外层圆周平移 + 内层航向旋转，机头朝向飞行方向；React 不重渲染）。
            每机常驻高度 1km~2km 绿色虚线垂线 + 数值（外层节点不旋转，始终竖直）。
            圆心按舞台百分比定位、不参与地理锚定——拖动/缩放地图时位置不变 ===== */}
      <div
        className="demo-orbit"
        style={{ left: `${ORBIT_CENTER.x}%`, top: `${ORBIT_CENTER.y}%` }}
      >
        {/* 盘旋圆：确认后实线（取点期为 16 10 虚线，mock 呈确认后状态） */}
        <span
          className="demo-orbit__circle"
          style={{ width: ORBIT_RADIUS_PX * 2, height: ORBIT_RADIUS_PX * 2 }}
        />
        {ORBIT_DRONES.map((d, i) => (
          <div
            key={i}
            className="demo-orbit__drone"
            ref={(el) => {
              orbitDroneRefs.current[i] = el
            }}
          >
            {/* 组合图标（与真实图层同规范）：底部光晕 64px + 机身 40px，
                居中于 48px 盒；整个图标绕自身中心旋转 → 机头朝向飞行方向 */}
            <span
              className="demo-orbit__drone-icon"
              ref={(el) => {
                orbitIconRefs.current[i] = el
              }}
            >
              <img
                className="demo-orbit__drone-bottom"
                src={d.bottom}
                alt=""
                draggable={false}
              />
              <img
                className="demo-orbit__drone-plane"
                src={d.plane}
                alt=""
                draggable={false}
              />
            </span>
            {/* 高度垂线（静态 1km~2km）：自图标中心垂直向下，绿色虚线 + 底端投影点；
                内联样式（高度随 alt 变化：1km→20px、2km→40px） */}
            <span
              className="demo-orbit__drone-stick"
              style={{ height: orbitStickPx(d.alt) }}
            />
            {/* 高度值：垂线右侧、沿垂线垂直居中（top = 垂线高/2，内联注入） */}
            <span
              className="demo-orbit__drone-alt"
              style={{ top: orbitStickPx(d.alt) / 2 }}
            >
              {d.alt}m
            </span>
          </div>
        ))}
      </div>

      {/* ===== 图例 ===== */}
      <div className="demo-legend">
        <div className="demo-legend__title">单机 · 区域降落演示</div>
        <div className="demo-legend__sub">四机 · 环绕飞行演示</div>
      </div>
    </div>
  )
}

export default DemoScenario