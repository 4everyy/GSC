/* 编队布局纯函数（自 HomePage.tsx 拆出）：集结点集结坪 / 编队飞行降落点 / 区域降落降落坪
 * 的视口坐标布置算法——航线渲染（绿色实线 + 图标）与模拟飞行共用同一套布局。 */
import type { DragPosition } from '../../hooks/useDraggable'
import type { RallyPointFormation } from '../../components/RallyPointPanel/RallyPointPanel'
import type { FormationFlightFormation } from '../../components/FormationFlightPanel/FormationFlightPanel'
import type { AreaLandingFormation } from '../../components/AreaLandingPanel/AreaLandingPanel'

// 集结点集结坪布局纯函数：按集结队形在已确认集结区域内布置 count 个集结坪（视口坐标），
// 组件内 rallyPointSpots memo 与队形下拉变更即时重排共用同一算法；
// 布置后整体左对齐——集结坪簇贴近区域左缘（朝向左侧原始无人机图标一侧），不横向铺满全区
export function getRallyPointSpots(
  rect: { left: number; top: number; width: number; height: number } | null,
  formation: RallyPointFormation,
  count: number,
): { x: number; y: number }[] {
  if (!rect) return []
  const { left, top, width, height } = rect
  const n = count
  if (n <= 0) return []
  let spots: { x: number; y: number }[]
  if (formation === '三角型') {
    // 行容量 1、2、3…：第 k 行放 k 个（末行可不满），纵向等距、行内水平等距
    const rows: number[] = []
    let remain = n
    while (remain > 0) {
      const size = rows.length + 1
      rows.push(Math.min(size, remain))
      remain -= size
    }
    const gapY = height / (rows.length + 1)
    spots = []
    rows.forEach((countInRow, k) => {
      const y = top + gapY * (k + 1)
      // 行内间距优先固定 100px（区域过窄时区内自适应），配合整体左对齐使集结坪聚拢左侧
      const gapX = Math.min(width / (countInRow + 1), 100)
      for (let j = 0; j < countInRow; j++) spots.push({ x: left + gapX * (j + 1), y })
    })
  } else if (formation === '一字型') {
    // 水平一行等距分布：间距优先固定 100px（区域过窄时区内自适应），不横向铺满全区
    const gap = Math.min(width / (n + 1), 100)
    spots = Array.from({ length: n }, (_, i) => ({ x: left + gap * (i + 1), y: top + height / 2 }))
  } else {
    // 人字形（默认）：V 形两翼交替排布——首机居区域上中（人字顶点），之后奇数号位
    // 左翼、偶数号位右翼，两翼沿斜线逐个向左下/右下外推
    const cx = left + width / 2
    const apexY = top + height * 0.25
    const spanX = (width / 2) * 0.9
    const spanY = height * 0.7
    const wingCount = Math.floor((n - 1) / 2) + 1
    const gapX = Math.min(spanX / wingCount, 100)
    const gapY = spanY / wingCount
    spots = Array.from({ length: n }, (_, i) => {
      if (i === 0) return { x: cx, y: apexY }
      const wing = Math.ceil(i / 2)
      const side = i % 2 === 1 ? -1 : 1
      return { x: cx + side * wing * gapX, y: apexY + wing * gapY }
    })
  }
  // 整体左对齐：让最左集结坪落在区域左缘（距边 40px，朝向左侧原始无人机图标一侧），
  // 队形形状不变、仅整体平移；单点亦直接落于左缘
  const minSpotX = Math.min(...spots.map((s) => s.x))
  const shiftX = left + 40 - minSpotX
  spots.forEach((s) => {
    s.x += shiftX
  })
  return spots
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
// 航线渲染（绿色实线 + 降落点图标）与模拟飞行（滑窗确认后启动）共用同一算法
export function computeFormationFlightGeometry(
  aircraft: ReadonlyArray<{ src: string; deviceIndex: number }>,
  selectedDevices: Set<number>,
  aircraftPositions: DragPosition[],
  formation: FormationFlightFormation,
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
  const planes = picked.map(({ item, index }) => ({
    x: stage.left + (aircraftPositions[index].x / 100) * stage.width + 24,
    y: stage.top + (aircraftPositions[index].y / 100) * stage.height + 24,
    icon: item.src,
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
