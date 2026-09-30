import { type DragPosition } from '../hooks/index'
import { type RallyPointFormation, type FormationFlightFormation } from '../components/FlightActionPanels/FlightActionPanels'
import { type AreaLandingFormation } from '../components/AreaPanels/AreaPanels'
import { homeImages } from '../assets/images/home/index'
import { type AlarmColor, type Device } from '../config'
import { type LngLat } from '../map-engines/types'
import { resolvePlaneSrc } from './planeIcons'

/* 编队布局纯函数（自 HomePage.tsx 拆出）：集结点集结坪 / 编队飞行降落点 / 区域降落降落坪
 * 的视口坐标布置算法——航线渲染（绿色实线 + 图标）与模拟飞行共用同一套布局。 */

// 集结点集结坪布局纯函数：按集结队形在已确认集结区域内布置 count 个集结坪（视口坐标），
// 组件内 rallyPointSpots memo 与队形下拉变更即时重排共用同一算法；
// 三种队形样式（人字形 V 形两翼 / 一字型水平一行 / 三角型 1+2+3…行容量）与编队飞行
// layoutFormationFlightSpots 共用同一套固定间距相对形状，队形整体平移缩放后
// 水平垂直居中于绘制区域——队形包围盒中心与区域中心对齐（不再铺满整个区域）；
// 队形超出区域可用范围（四周留 30px 边距）时等比缩小，形状不变不溢出
export function getRallyPointSpots(
  rect: { left: number; top: number; width: number; height: number } | null,
  formation: RallyPointFormation,
  count: number,
): { x: number; y: number }[] {
  if (!rect) return []
  const { left, top, width, height } = rect
  const n = count
  if (n <= 0) return []
  // 单机：水平垂直居中于绘制区域中心
  if (n === 1) return [{ x: left + width / 2, y: top + height / 2 }]
  // 以原点为锚点生成队形相对坐标：与编队飞行同一形状——人字形顶点居首、两翼交替
  // 斜向展开；一字型水平一行等距；三角型行容量 1、2、3…逐行水平居中，
  // 保证集结队形与编队飞行队形观感一致
  const rel = layoutFormationFlightSpots({ x: 0, y: 0 }, formation, n)
  // 队形包围盒：超出区域可用范围（四周留 30px 边距）时整体等比缩小，队形形状不变
  const minX = Math.min(...rel.map((s) => s.x))
  const maxX = Math.max(...rel.map((s) => s.x))
  const minY = Math.min(...rel.map((s) => s.y))
  const maxY = Math.max(...rel.map((s) => s.y))
  const pad = 30
  const bboxW = maxX - minX
  const bboxH = maxY - minY
  const scale = Math.min(
    bboxW > 0 ? Math.max(width - pad * 2, 0) / bboxW : 1,
    bboxH > 0 ? Math.max(height - pad * 2, 0) / bboxH : 1,
    1,
  )
  // 整体平移：队形包围盒中心对齐绘制区域中心（水平垂直居中）
  const bcx = (minX + maxX) / 2
  const bcy = (minY + maxY) / 2
  const cx = left + width / 2
  const cy = top + height / 2
  return rel.map((s) => ({ x: cx + (s.x - bcx) * scale, y: cy + (s.y - bcy) * scale }))
}

// 编队飞行降落点布局纯函数：以锚点（最左选中飞机图标正上方一定距离处）为队形顶点，
// 按编队队形布置 count 个降落点（视口坐标）——人字形：V 形两翼自顶点交替向左下/右下
// 展开；一字型：水平一行等距；三角型：行容量 1、2、3…（末行可不满）。
// 航线渲染（绿色实线 + 降落点图标）与模拟飞行共用同一算法
function layoutFormationFlightSpots(
  anchor: { x: number; y: number },
  formation: FormationFlightFormation,
  count: number,
): { x: number; y: number }[] {
  const n = count
  if (n <= 0) return []
  if (n === 1) return [{ x: anchor.x, y: anchor.y }]
  const gapX = 100
  const gapY = 70
  if (formation === '三角型') {
    // 行容量 1、2、3…：第 k 行放 k 个（末行可不满），行内水平等距、纵向等距
    const rows: number[] = []
    let remain = n
    while (remain > 0) {
      const size = rows.length + 1
      rows.push(Math.min(size, remain))
      remain -= size
    }
    const spots: { x: number; y: number }[] = []
    rows.forEach((countInRow, k) => {
      const y = anchor.y + k * gapY
      for (let j = 0; j < countInRow; j++) {
        spots.push({ x: anchor.x + (j - (countInRow - 1) / 2) * gapX, y })
      }
    })
    return spots
  }
  if (formation === '一字型') {
    // 水平一行等距分布
    return Array.from(
      { length: n },
      (_, i): { x: number; y: number } => ({
        x: anchor.x + (i - (n - 1) / 2) * gapX,
        y: anchor.y,
      }),
    )
  }
  // 人字形（默认）：首机居顶点，奇数号位左翼、偶数号位右翼沿斜线逐个外推
  return Array.from({ length: n }, (_, i) => {
    if (i === 0) return { x: anchor.x, y: anchor.y }
    const wing = Math.ceil(i / 2)
    const side = i % 2 === 1 ? -1 : 1
    return { x: anchor.x + side * wing * gapX, y: anchor.y + wing * gapY * 0.85 }
  })
}

// 区域降落降落坪排列（视口坐标，自 HomePage areaLandingSpots memo 迁出）：按所选降落编队
// 在已确认区域内布置 count 个降落坪——一字型：水平一行等距；三角型：1+2+3…行容量三角排列
// （首行 1 个朝上）；环形：沿内切圆等角分布（单机居中）。
// 编队/选区/选中飞机数变化时由调用方 memo 联动重排
export function getAreaLandingSpots(
  rect: { left: number; top: number; width: number; height: number } | null,
  formation: AreaLandingFormation,
  count: number,
): { x: number; y: number }[] {
  if (!rect) return []
  const { left, top, width, height } = rect
  const n = count
  if (n <= 0) return []
  if (formation === '环形') {
    if (n === 1) return [{ x: left + width / 2, y: top + height / 2 }]
    const cx = left + width / 2
    const cy = top + height / 2
    const r = (Math.min(width, height) / 2) * 0.62
    return Array.from({ length: n }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
    })
  }
  if (formation === '三角型') {
    if (n === 1) return [{ x: left + width / 2, y: top + height / 2 }]
    // 行容量 1、2、3…：第 k 行放 k 个（末行可不满），纵向等距、行内水平等距
    const rows: number[] = []
    let remain = n
    while (remain > 0) {
      const size = rows.length + 1
      rows.push(Math.min(size, remain))
      remain -= size
    }
    const spots: { x: number; y: number }[] = []
    const gapY = height / (rows.length + 1)
    rows.forEach((countInRow, k) => {
      const y = top + gapY * (k + 1)
      const gapX = width / (countInRow + 1)
      for (let j = 0; j < countInRow; j++) spots.push({ x: left + gapX * (j + 1), y })
    })
    return spots
  }
  // 一字型（默认）：水平一行等距分布
  const gap = width / (n + 1)
  return Array.from({ length: n }, (_, i) => ({ x: left + gap * (i + 1), y: top + height / 2 }))
}

// 编队飞行航线几何（视口坐标，自 HomePage getFormationFlightGeometry 迁出）：
// 以最左选中飞机图标正上方（水平对齐其中心、上移 360px 且不越过视口上缘）为锚点，
// 按队形布置降落点——目的地尽量贴近左侧原始无人机图标；左缘防溢出整体右移补偿
// （队形形状不变，确保最左降落点完整可见）；就近配对：飞机与降落点各自按水平位置
// 升序后同序号配对（左边的飞机连靠左的降落点），避免航线左右交叉。
// 航线渲染（绿色实线 + 降落点图标）与模拟飞行（滑窗确认后启动）共用同一算法。
// 集结落坪续飞：传入 landedOrigins（与 picked 同序的落坪定格坐标）时各机起点改用
// 集结落坪位置（编队自「集结后的位置」继续），条目缺失的机回退原始图标中心投影
export function computeFormationFlightGeometry(
  aircraft: ReadonlyArray<{ src: string; deviceIndex: number }>,
  selectedDevices: Set<number>,
  aircraftPositions: DragPosition[],
  formation: FormationFlightFormation,
  /** 设备状态快照（usePlaneStatusStore.devices）：按接口状态取机身切图；缺省回退静态配置色 */
  devices: readonly (Device | undefined)[] = [],
  /** 集结落坪起点覆盖（可选）：与 picked（设备序号升序）同序的视口坐标——集结任务
   *  全部落坪定格后续飞编队时，编队航线自各机落坪位置起算（landed 帧最终 x/y），
   *  替代原始图标百分比位置的投影；缺省/条目不足时逐机回退原始投影 */
  landedOrigins?: ReadonlyArray<{ x: number; y: number }>,
): {
  planes: { x: number; y: number }[]
  spots: { x: number; y: number }[]
  icons: string[]
} | null {
  const stage = document.querySelector('.map-stage')?.getBoundingClientRect()
  // 选中飞机按设备序号升序与降落点一一对应（与集结点航线渲染的 picked 完全一致）
  const picked = aircraft
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => selectedDevices.has(item.deviceIndex))
    .sort((a, b) => a.item.deviceIndex - b.item.deviceIndex)
  if (!stage || picked.length === 0) return null
  // 各选中飞机图标中心（视口坐标，48px 图标半宽 +24 与其他航线一致），携带各自切图；
  // 集结落坪续飞：优先取 landedOrigins[i]（与 picked 设备序号升序同序对齐）的落坪
  // 定格坐标，条目缺失（如选中集合已变化）时逐机回退原始图标中心投影
  const planes = picked.map(({ item, index }, i) => ({
    x:
      landedOrigins?.[i]?.x ??
      stage.left + (aircraftPositions[index].x / 100) * stage.width + 24,
    y:
      landedOrigins?.[i]?.y ??
      stage.top + (aircraftPositions[index].y / 100) * stage.height + 24,
    icon: resolvePlaneSrc(devices, item.deviceIndex, item.src),
  }))
  const minX = Math.min(...planes.map((p) => p.x))
  const minY = Math.min(...planes.map((p) => p.y))
  // 锚点贴近左侧原始无人机图标：水平对齐最左选中飞机中心、上移 360px（不越过
  // 视口上缘），目的地整体落在屏幕左侧而非中部
  const anchor = { x: minX, y: Math.max(minY - 360, stage.top + 48) }
  const spots = layoutFormationFlightSpots(
    anchor,
    formation,
    planes.length,
  )
  // 左缘防溢出：锚点贴左后宽队形（一字整行/三角末行/人字左翼）可能超出视口左侧，
  // 整体右移补偿（队形形状不变），确保最左降落点完整可见
  const spotsMinX = Math.min(...spots.map((s) => s.x))
  const leftBound = stage.left + 30
  if (spotsMinX < leftBound) {
    const shiftX = leftBound - spotsMinX
    spots.forEach((s) => {
      s.x += shiftX
    })
  }
  // 就近配对：飞机与降落点各自按水平位置升序后同序号配对——左边的飞机连靠左的
  // 降落点、右边的连靠右的，避免航线左右交叉
  planes.sort((a, b) => a.x - b.x)
  spots.sort((a, b) => a.x - b.x)
  return {
    planes: planes.map(({ x, y }) => ({ x, y })),
    spots,
    icons: planes.map((p) => p.icon),
  }
}

/** 三点方向判定（带容差）：返回 1 / -1 / 0（逆时针 / 顺时针 / 共线或近共线） */
function orient(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  const eps = 1e-9
  if (cross > eps) return 1
  if (cross < -eps) return -1
  return 0
}

/** 线段 AB 与 CD 是否真交叉（proper crossing）：仅当两线段内部相交才计，
 *  端点接触 / 共线重叠不算——配对是一一映射（端点互不重合），只需消除内部交叉 */
function segmentsCross(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
): boolean {
  const o1 = orient(a.x, a.y, b.x, b.y, c.x, c.y)
  const o2 = orient(a.x, a.y, b.x, b.y, d.x, d.y)
  const o3 = orient(c.x, c.y, d.x, d.y, a.x, a.y)
  const o4 = orient(c.x, c.y, d.x, d.y, b.x, b.y)
  return o1 * o2 < 0 && o3 * o4 < 0
}

// 最小总代价指派求解（经典 O(n³) 匈牙利算法，对偶势 + 最短增广路实现）：
// 输入 n×n 代价方阵 cost，返回 ans——第 i 行匹配的列号（0-based），全部匹配对
// 代价之和取全局最小。集结点飞机数 ≤ 9，O(n³) 每次调用可忽略不计（<0.1ms）
function solveAssignment(cost: number[][]): number[] {
  const n = cost.length
  const INF = Number.POSITIVE_INFINITY
  // u/v：行/列对偶势；p：列 → 已匹配行（0 = 未匹配）；way：增广路径前驱列
  const u = new Array<number>(n + 1).fill(0)
  const v = new Array<number>(n + 1).fill(0)
  const p = new Array<number>(n + 1).fill(0)
  const way = new Array<number>(n + 1).fill(0)
  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array<number>(n + 1).fill(INF)
    const used = new Array<boolean>(n + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = INF
      let j1 = 0
      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
          if (cur < minv[j]) {
            minv[j] = cur
            way[j] = j0
          }
          if (minv[j] < delta) {
            delta = minv[j]
            j1 = j
          }
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta
          v[j] -= delta
        } else {
          minv[j] -= delta
        }
      }
      j0 = j1
    } while (p[j0] !== 0)
    // 沿增广路径回溯翻转匹配，直到回到虚拟列 0
    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0 !== 0)
  }
  // 行 → 列：第 p[j] 行匹配第 j 列（方阵完美匹配，每列必有行）
  const ans = new Array<number>(n).fill(-1)
  for (let j = 1; j <= n; j++) {
    if (p[j] > 0) ans[p[j] - 1] = j - 1
  }
  return ans
}

// 集结点航线最优配对纯函数：飞机与集结坪按欧氏距离求「总航程最小」的一一配对，
// 返回 perm——第 i 架飞机连接第 perm[i] 个集结坪；perm[i] 为 -1 表示无对应集结坪
// （跳过连线）。
// 无交叉数学保证：总长最小的匹配中任意两条航线段必然不相交——若线段 AB 与 CD
// 交叉于 P，由三角形不等式 |AC|+|BD| ≤ |AP|+|PC|+|BP|+|PD| = |AB|+|CD|（真交叉时
// 严格小于），交换配对端点后总长不增，与最优性矛盾。距离平局（等长替代方案）时
// 求解器可能仍返回交叉解，故求最优后再做一轮「去交叉」后处理：扫描全部配对，
// 一旦发现真交叉即交换两机的集结坪——每次交换严格缩短总长（保证终止），最终
// 配对既总航程最短、又无任何航线几何交叉（优于原「双方按 x 排序同序号配对」——
// 飞机与集结坪纵向分布差异大时后者仍会出现交叉航线）。
// 飞机与集结坪数量不等时以零代价虚拟行列补齐方阵：多余飞机（无集结坪可配）自然
// 落在虚拟列上映射回 -1，且被放弃的是配对代价最高的那些。
// 航线渲染（绿色实线）与模拟飞行（滑窗确认启动 / 队形变更续飞）共用同一配对，
// 保证动画终点与画出的航线一一对应。
export function pairRallyPointSpots(
  planes: ReadonlyArray<{ x: number; y: number }>,
  spots: ReadonlyArray<{ x: number; y: number }>,
): number[] {
  const n = planes.length
  const m = spots.length
  if (n === 0) return []
  if (m === 0) return planes.map(() => -1)
  // 补齐方阵：size = max(n, m)，虚拟行/列代价 0（不影响真实配对的总长最优性）
  const size = Math.max(n, m)
  const cost: number[][] = Array.from({ length: size }, (_, i) =>
    Array.from(
      { length: size },
      (_, j) =>
        i < n && j < m
          ? Math.hypot(planes[i].x - spots[j].x, planes[i].y - spots[j].y)
          : 0,
    ),
  )
  const assign = solveAssignment(cost)
  const perm = planes.map((_, i) => {
    const j = assign[i]
    return j >= 0 && j < m ? j : -1
  })
  // 去交叉后处理：真交叉的两条配对交换集结坪后总长严格变短（三角形不等式），
  // 循环扫描直至无交叉；n ≤ 9 交换次数上界极小，guard 兜底防御性退出
  let swapped = true
  let guard = 0
  const maxSwaps = size * (size - 1)
  while (swapped && guard < maxSwaps) {
    swapped = false
    for (let i = 0; i < n && !swapped; i++) {
      if (perm[i] < 0) continue
      for (let k = i + 1; k < n; k++) {
        if (perm[k] < 0) continue
        if (segmentsCross(planes[i], spots[perm[i]], planes[k], spots[perm[k]])) {
          const t = perm[i]
          perm[i] = perm[k]
          perm[k] = t
          swapped = true
          guard++
          break
        }
      }
    }
  }
  return perm
}


// 飞机初始位置（百分比），与 HomePage.css 中 .aircraft--xxx 的 left/top 保持一致。
// 拖拽后通过内联 style 覆盖 CSS 定位，实现自由拖动。
// 仅作为引擎未就绪（无地理锚定）时的退化布局；启用锚定后由
// AIRCRAFT_ANCHOR_OFFSETS 按离线包中心播种真实地理锚点。
export const AIRCRAFT_INITIAL_POSITIONS: DragPosition[] = [
  { x: 33, y: 22 }, // red (01设备)：左上
  { x: 56, y: 18 }, // orange (03设备)：中上偏右
  { x: 26, y: 48 }, // blue (04设备)：左中
  { x: 48, y: 58 }, // gray (02设备·离线)：中下
  { x: 38, y: 36 }, // blue2 (05设备)：中部
  // 06-09 号机（queryPlaneStatus 实测 9 架扩容）：右下侧空白带网格铺开，
  // 与上方 5 架簇保持间距不重叠（间距 ≥ 8%，1080p 下 ≥ 150px）
  { x: 64, y: 42 }, // 06设备：中部偏右
  { x: 72, y: 30 }, // 07设备：右上
  { x: 80, y: 46 }, // 08设备：右中
  { x: 68, y: 58 }, // 09设备：中下偏右
]

/**
 * 飞机初始地理锚点相对「当前离线地图包中心」的偏移（度）。
 *
 * 偏移量由 AIRCRAFT_INITIAL_POSITIONS 的百分比布局按 zoom 14 视口尺度换算
 * （1080p 下约 1% 宽 ≈ 0.00045° 经度、1% 高 ≈ 0.00035° 纬度；屏幕 y 向下为正，
 * 纬度向北为正，故 y 偏移取反），保证锚定播种后的初始布局与原百分比布局观感
 * 一致（无人机簇分散于视口中部带，彼此间距 ≥ 180px 不聚集）；包中心必在瓦片
 * bounds 内，微小偏移不会越出离线数据覆盖范围。顺序与 AIRCRAFT_INITIAL_POSITIONS /
 * config/aircraft.ts 一一对应。
 */
export const AIRCRAFT_ANCHOR_OFFSETS: LngLat[] = [
  { lng: -0.0077, lat: 0.0098 }, // red (01设备)：左上
  { lng: 0.0027, lat: 0.0112 }, // orange (03设备)：中上偏右
  { lng: -0.0108, lat: 0.0007 }, // blue (04设备)：左中
  { lng: -0.0009, lat: -0.0028 }, // gray (02设备·离线)：中下
  { lng: -0.0054, lat: 0.0049 }, // blue2 (05设备)：中部
  // 06-09 号机：与百分比布局同源换算（1% 宽 ≈ 0.00045° lng、1% 高 ≈ 0.00035° lat，
  // y 取反；相对簇中心 (-0.004, 0.005) 的右下侧空白带），全部落在 zoom 14 视口内
  { lng: 0.0014, lat: -0.0032 }, // 06设备：中部偏右
  { lng: 0.005, lat: 0.001 }, // 07设备：右上
  { lng: 0.0086, lat: -0.0046 }, // 08设备：右中
  { lng: 0.0023, lat: -0.0102 }, // 09设备：中下偏右
]

/**
 * 接口目标回退布局：无人机图标簇附近空白带的偏移池（相对当前离线地图包中心）。
 *
 * 接口目标携带的真实经纬度可能远离离线地图包（如后端测试数据落在其它城市），
 * 直接锚定会把图标投影视口之外；此类目标按序取本池偏移播种到无人机簇
 * （AIRCRAFT_ANCHOR_OFFSETS，簇中心约 (-0.004, 0.005)，居中偏左上）右下侧
 * 空白带——3 列网格（列距 0.003° ≈ 128px、行距 0.004° ≈ 123px@1080p），
 * 与全部无人机锚点及目标彼此间均保持 ≥ 84px 图标直径 + 间隙不重叠，
 * 且全部落在 zoom 14 初始视口内；超出池量的目标回退包中心。
 */
export const TARGET_NEAR_AIRCRAFT_OFFSETS: LngLat[] = [
  { lng: 0.0021, lat: 0.004 },
  { lng: 0.0051, lat: 0.004 },
  { lng: 0.0081, lat: 0.004 },
  { lng: 0.0021, lat: 0 },
  { lng: 0.0051, lat: 0 },
  { lng: 0.0081, lat: 0 },
  { lng: 0.0021, lat: -0.004 },
  { lng: 0.0051, lat: -0.004 },
  { lng: 0.0081, lat: -0.004 },
  { lng: 0.0021, lat: -0.008 },
  { lng: 0.0051, lat: -0.008 },
  { lng: 0.0081, lat: -0.008 },
  { lng: 0.0021, lat: -0.012 },
  { lng: 0.0051, lat: -0.012 },
  { lng: 0.0081, lat: -0.012 },
]

/**
 * 接口目标真实经纬度视为「当前视口可见」的最大偏移（相对包中心，度）。
 *
 * zoom 14 初始视口约覆盖包中心 ±0.0225° 经度 / ±0.0175° 纬度（1080p）；
 * 超出该范围的 lngLat 即使在离线包 bounds 内也在视口之外，回退
 * TARGET_NEAR_AIRCRAFT_OFFSETS 无人机附近布局，保证图标始终可见。
 */
export const TARGET_REAL_LNGLAT_MAX_OFFSET = { lng: 0.02, lat: 0.015 }

// 待接入功能的临时显示开关（false = 隐藏）：
// MissionPanel / 橙色禁飞区——功能就绪后置 true 或删除相关代码
export const SHOW_PENDING_PANELS = false

// 告警信息面板色调映射：与顶栏告警徽标（红/橙/蓝，config/alarms.ts ALARM_BADGES 顺序）按下标一一对应
export const ALARM_COLORS: AlarmColor[] = ['red', 'orange', 'blue']

// 告警详情面板收起动画时长（ms）：须与 AlarmPanels.css 中收起过渡时长（0.35s）一致。
// 收起动画播放期间常驻面板缺口保持补齐（HomePage 挂 --collapsing 类），
// 定时到点（动画播完）后移除该类，缺口才恢复展示。
export const ALARM_COLLAPSE_MS = 350

// 底部功能面板类型：起飞（TakeoffPanel）/ 降落（LandingPanel）/ 返航（ReturnHomePanel）/ 指点返航（TapReturnPanel）/ 区域降落（AreaLandingPanel）/ 悬停（HoverPanel）/ 航点飞行（WaypointFlightPanel）/ 航线飞行（RouteFlightPanel）/ 环绕飞行（OrbitFlightPanel）/ 集结点（RallyPointPanel）/ 编队飞行（FormationFlightPanel）
export type BottomBarPanel =
  | 'takeoff'
  | 'landing'
  | 'return-home'
  | 'tap-return'
  | 'area-landing'
  | 'hover'
  | 'waypoint-flight'
  | 'route-flight'
  | 'orbit-flight'
  | 'rally-point'
  | 'formation-flight'

export interface BottomBarItem {
  background: string
  /** 激活态背景切图：功能面板展开期间由独立发光层显示（第 2~12 段功能按钮均提供） */
  activeBackground?: string
  /** 禁用态背景切图：按钮不可用期间直接替换默认背景（第 2~12 段功能按钮均提供） */
  disabledBackground?: string
  /** 选中设备数量要求：single = 恰好 1 台（单机功能）；multi = 至少 1 台（多机功能）。
   *  不满足时按钮进入禁用态（禁用态切图 + 拦截点击 + 抑制反馈） */
  mode?: 'single' | 'multi'
  width: number
  icon?: string
  tooltip?: string
  panel?: BottomBarPanel
}

// 底部水平居中按钮条：13 段背景切图按显示顺序（从左到右）编号拼接（高度统一 60px）。
// width 为各切图原始宽度，经 aspect-ratio 与高度联动保持每段比例，整体随视口等比缩放。
// 各段切缝的水平间距补偿见 HomePage.css 中 .bottom-bar__item:nth-child 逐缝 margin 规则。
// 第 2~12 段为功能按钮：icon 为叠加在背景框体中心的功能图标（64×64 切图），
// tooltip 为悬停时显示于按钮上方的中文名称。
export const BOTTOM_BAR_ITEMS: BottomBarItem[] = [
  {
    background: homeImages.bottomBarSeg1,
    // 禁用态切图（bottom-bar-seg-01-disabled.png）：未选中设备、全部功能按钮置灰时替换
    disabledBackground: homeImages.bottomBarSeg1Disabled,
    width: 119,
  },
  {
    background: homeImages.bottomBarSeg2,
    activeBackground: homeImages.bottomBarSeg2Active,
    disabledBackground: homeImages.bottomBarSeg2Disabled,
    width: 129,
    icon: homeImages.iconTakeoff,
    tooltip: '起飞',
    mode: 'multi',
    panel: 'takeoff',
  },
  {
    background: homeImages.bottomBarSeg3,
    activeBackground: homeImages.bottomBarSeg3Active,
    disabledBackground: homeImages.bottomBarSeg3Disabled,
    width: 110,
    icon: homeImages.iconLand,
    tooltip: '降落',
    mode: 'multi',
    panel: 'landing',
  },
  {
    background: homeImages.bottomBarSeg4,
    activeBackground: homeImages.bottomBarSeg4Active,
    disabledBackground: homeImages.bottomBarSeg4Disabled,
    width: 100,
    icon: homeImages.iconReturnToHome,
    tooltip: '返航',
    mode: 'multi',
    panel: 'return-home',
  },
  {
    background: homeImages.bottomBarSeg5,
    activeBackground: homeImages.bottomBarSeg5Active,
    disabledBackground: homeImages.bottomBarSeg5Disabled,
    width: 101,
    icon: homeImages.iconTapToReturn,
    tooltip: '指点返航',
    mode: 'single',
    panel: 'tap-return',
  },
  {
    background: homeImages.bottomBarSeg6,
    activeBackground: homeImages.bottomBarSeg6Active,
    disabledBackground: homeImages.bottomBarSeg6Disabled,
    width: 92,
    icon: homeImages.iconAreaLanding,
    tooltip: '区域降落',
    mode: 'multi',
    panel: 'area-landing',
  },
  {
    background: homeImages.bottomBarSeg7,
    activeBackground: homeImages.bottomBarSeg7Active,
    disabledBackground: homeImages.bottomBarSeg7Disabled,
    width: 92,
    icon: homeImages.iconHover,
    tooltip: '悬停',
    mode: 'multi',
    panel: 'hover',
  },
  {
    background: homeImages.bottomBarSeg8,
    activeBackground: homeImages.bottomBarSeg8Active,
    disabledBackground: homeImages.bottomBarSeg8Disabled,
    width: 92,
    icon: homeImages.iconWaypointFlight,
    tooltip: '航点飞行',
    mode: 'single',
    panel: 'waypoint-flight',
  },
  {
    background: homeImages.bottomBarSeg9,
    activeBackground: homeImages.bottomBarSeg9Active,
    disabledBackground: homeImages.bottomBarSeg9Disabled,
    width: 101,
    icon: homeImages.iconRouteFlight,
    tooltip: '航线飞行',
    mode: 'single',
    panel: 'route-flight',
  },
  {
    background: homeImages.bottomBarSeg10,
    activeBackground: homeImages.bottomBarSeg10Active,
    disabledBackground: homeImages.bottomBarSeg10Disabled,
    width: 100,
    icon: homeImages.iconOrbit,
    tooltip: '环绕飞行',
    mode: 'single',
    panel: 'orbit-flight',
  },
  {
    background: homeImages.bottomBarSeg11,
    activeBackground: homeImages.bottomBarSeg11Active,
    disabledBackground: homeImages.bottomBarSeg11Disabled,
    width: 110,
    icon: homeImages.iconRallyPoint,
    tooltip: '集结点',
    mode: 'multi',
    panel: 'rally-point',
  },
  {
    background: homeImages.bottomBarSeg12,
    activeBackground: homeImages.bottomBarSeg12Active,
    disabledBackground: homeImages.bottomBarSeg12Disabled,
    width: 129,
    icon: homeImages.iconFormationFlight,
    tooltip: '编队飞行',
    mode: 'multi',
    panel: 'formation-flight',
  },
  {
    background: homeImages.bottomBarSeg13,
    // 禁用态切图（bottom-bar-seg-13-disabled.png）：未选中设备、全部功能按钮置灰时替换
    disabledBackground: homeImages.bottomBarSeg13Disabled,
    width: 119,
  },
]
/** 面板单选聚焦：设备/目标面板单行勾上时地图 flyTo 的最低层级（当前更低时放大） */
export const MAP_FOCUS_ZOOM = 16
/** 面板单选聚焦飞转动画时长（ms） */
export const MAP_FOCUS_FLY_DURATION_MS = 1200
/**
 * 区域列表行 hover 聚焦（fitBounds）视口边距：左 = 地图工具栏(64) +
 * 区域列表面板(466) + 间隙；右 = 任务/目标列表面板(466) + 间隙；
 * 上下避开状态栏与底部按钮条。让区域完整落在左右悬浮面板之间的中央可视带。
 */
export const AREA_FOCUS_PADDING = {
  left: 560,
  right: 510,
  top: 80,
  bottom: 80,
} as const
/** 区域聚焦 zoom 上限（小区域避免过度放大，fitBounds 自动钳制） */
export const AREA_FOCUS_MAX_ZOOM = 16