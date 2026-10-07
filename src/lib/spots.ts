/**
 * @file spots.ts
 * @description spots.ts（自 formationLayout.ts 拆出）—— 集结坪 / 编队降落点 / 区域降落坪的视口坐标布置算法： 布局纯函数 + 方向判定 + 线段相交 + 匈牙利式指派求解（单一职责：空间布局计算）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { type DragPosition } from '../hooks/index'
import { type RallyPointFormation, type FormationFlightFormation } from '../components/FlightActionPanels/FlightActionPanels'
import { type AreaLandingFormation } from '../components/AreaPanels/AreaPanels'
import { type Device } from '../config'
import { resolvePlaneSrc } from './planeIcons'

/* 集结点集结坪 / 编队飞行降落点 / 区域降落降落坪的视口坐标布置算法——航线渲染… */

// 集结点集结坪布局纯函数：按集结队形在已确认集结区域内布置 count 个集结坪（视口坐标）
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
  // 以原点为锚点生成队形相对坐标：与编队飞行同一形状——人字形顶点居首、两翼交替斜向展开
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

// 编队飞行降落点布局纯函数：以锚点（最左选中飞机图标正上方一定距离处）为队形顶点
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

// 按所选降落编队在已确认区域内布置 c…
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

// 以最左选中飞机图标正上方…
export function computeFormationFlightGeometry(
  aircraft: ReadonlyArray<{ src: string; deviceIndex: number }>,
  selectedDevices: Set<number>,
  aircraftPositions: DragPosition[],
  formation: FormationFlightFormation,
  /** 设备状态快照（usePlaneStatusStore.devices）：按接口状态取机身切图 */
  devices: readonly (Device | undefined)[] = [],
  /** 集结落坪起点覆盖（可选）：与 picked（设备序号升序）同序的视口坐标——集结任务全部落坪定格后续飞编队时 */
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
  // 各选中飞机图标中心（视口坐标，48px 图标半宽 +24 与其他航线一致），携带各自切图
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
  // 锚点贴近左侧原始无人机图标：水平对齐最左选中飞机中心、上移 360px（不越过视口上缘），目的地整体落在屏幕左侧而非中部
  const anchor = { x: minX, y: Math.max(minY - 360, stage.top + 48) }
  const spots = layoutFormationFlightSpots(
    anchor,
    formation,
    planes.length,
  )
  // 左缘防溢出：锚点贴左后宽队形（一字整行/三角末行/人字左翼）可能超出视口左侧，整体右移补偿（队形形状不变），确保最左降落点完整可见
  const spotsMinX = Math.min(...spots.map((s) => s.x))
  const leftBound = stage.left + 30
  if (spotsMinX < leftBound) {
    const shiftX = leftBound - spotsMinX
    spots.forEach((s) => {
      s.x += shiftX
    })
  }
  // 就近配对：飞机与降落点各自按水平位置升序后同序号配对——左边的飞机连靠左的降落点、右边的连靠右的，避免航线左右交叉
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

/** 线段 AB 与 CD 是否真交叉（proper crossing）：仅当两线段内部相交才计 */
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

// 最小总代价指派求解（经典 O(n³) 匈牙利算法，对偶势 + 最短增广路实现）：输入 n×n 代价方阵 cost
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

// 集结点航线最优配对纯函数：飞机与集结坪按欧氏距离求「总航程最小」的一一配对
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
  // 去交叉后处理：真交叉的两条配对交换集结坪后总长严格变短（三角形不等式），循环扫描直至无交叉
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
