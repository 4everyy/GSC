import { measureIcons } from '../../assets/images/measure'

/**
 * 锚点统一使用 (0,0)：零尺寸容器的原点即地图坐标。
 * 图钉/标签内部子元素已通过 absolute 定位相对原点偏移，
 * 无需引擎再做任何锚点/偏移补偿。
 */
export const PIN_ANCHOR = { x: 0, y: 0 }

/**
 * 创建定位图钉标记元素（使用蓝湖设计稿 PNG 图标）。
 *
 * 关键设计：采用「零尺寸容器 + 绝对定位子元素」方案。
 * 容器宽高均为 0，其原点 (0,0) 即地图坐标点。
 * 图钉 img 相对该原点绝对定位：
 *   - img 左上角放在 (-11.5, -29.5)，使「灰色落点阴影中心」(11.5,29.5) 落在原点
 * 图标 PNG 自身已内置灰色落点（#999999，位于图 y[26..33] x[7..16]），
 * 折线落点对齐该阴影中心，而非图钉最底尖端（避免折线终点落在阴影正下方）。
 * 不依赖引擎的像素锚点 / offset 机制（避免 MapLibre setOffset 拉伸变形、
 * 以及未挂载元素 offsetWidth=0 导致的锚点推断失败）。
 */
function createPinMarkerElement(src: string): HTMLElement {
  const el = document.createElement('div')
  el.style.cursor = 'pointer'
  el.style.position = 'relative'
  el.style.width = '0'
  el.style.height = '0'
  el.style.overflow = 'visible'

  // 图钉图片：24×34，灰色阴影中心在 (11.5,29.5)，故左上角放在 (-11.5,-29.5)
  const img = document.createElement('img')
  img.src = src
  img.style.position = 'absolute'
  img.style.left = '-11.5px'
  img.style.top = '-29.5px'
  img.style.width = '24px'
  img.style.height = '34px'
  img.draggable = false
  el.appendChild(img)

  return el
}

/** 起点标记：绿色定位图钉（蓝湖设计稿 start.png） */
export function createStartMarkerElement(): HTMLElement {
  return createPinMarkerElement(measureIcons.start)
}

/** 终点/路径点标记：红色定位图钉（蓝湖设计稿 end.png） */
export function createEndMarkerElement(): HTMLElement {
  return createPinMarkerElement(measureIcons.end)
}

/**
 * 创建「测距结束确认」面板元素（依附于最新终点图钉）。
 *
 * 面板为绝对定位，出现在红色终点图钉右侧，便于就近结束测距。
 * 包含标签 + 两按钮（取消 / 确定）：
 * - 取消：调用 onCancel（取消本次测距并清空进行中的绘制），并移除面板
 * - 确定：调用 onConfirm（确认结束并保留结果），并移除面板
 *
 * 定位基准：零尺寸 Marker 容器原点即图钉落点（灰色阴影中心），
 * 具体偏移由 .measure-finish-panel 样式控制（图钉右侧 + 竖直居中）。
 * 面板内 click/contextmenu 均 stopPropagation，避免冒泡到地图触发落点/清空。
 */
export function createFinishPanelElement(handlers: {
  onCancel: () => void
  onConfirm: () => void
}): HTMLElement {
  const panel = document.createElement('div')
  panel.className = 'measure-finish-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', '测距结束确认')

  const label = document.createElement('span')
  label.className = 'measure-finish-panel__label'
  label.textContent = '完成测距？'
  panel.appendChild(label)

  const actions = document.createElement('div')
  actions.className = 'measure-finish-panel__actions'

  const makeBtn = (text: string, variant: string, onClick: () => void): HTMLButtonElement => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `measure-finish-panel__btn measure-finish-panel__btn--${variant}`
    btn.textContent = text
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      onClick()
      panel.remove()
    })
    return btn
  }

  actions.appendChild(makeBtn('取消', 'cancel', handlers.onCancel))
  actions.appendChild(makeBtn('确定', 'confirm', handlers.onConfirm))
  panel.appendChild(actions)

  // 面板内任意交互都不冒泡到地图：click 防落点，contextmenu 防右键清空
  panel.addEventListener('click', (e) => e.stopPropagation())
  panel.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })

  return panel
}

/**
 * 创建「悬浮删除」按钮元素（依附于悬停的已提交折线）。
 *
 * 触发场景：hover 已「确定」的测距折线 → 折线高亮 + 本按钮出现在命中点（≈光标处），
 * 点击删除悬停的那一段（剩余点自动重连并显示新段距离）。
 *
 * 与图钉/距离标签一致采用「零尺寸容器 + 绝对定位子元素」：容器原点对齐命中坐标，
 * 按钮经 translate(-50%,-50%) 居中于原点（零尺寸容器锚点解析为 'center'）。
 * 防闪烁：鼠标在折线命中层与按钮之间移动时，由 hook 的 150ms 延时隐藏兜底
 * （按钮 mouseenter 取消延时，mouseleave 重新计时）。
 * 容器本身不拦截地图交互，仅按钮 pointer-events:auto 可点。
 */
export function createDeleteButtonElement(handlers: {
  onEnter: () => void
  onLeave: () => void
  onDelete: () => void
}): { host: HTMLDivElement; button: HTMLButtonElement } {
  const wrap = document.createElement('div')
  wrap.style.position = 'relative'
  wrap.style.width = '0'
  wrap.style.height = '0'
  wrap.style.overflow = 'visible'

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'measure-delete-btn'
  btn.setAttribute('aria-label', '删除该测距')
  btn.textContent = '×'
  // 点击删除：阻止冒泡到地图（避免触发落点 / 右键清空）
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    handlers.onDelete()
  })
  btn.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  // 鼠标进入按钮：取消延时隐藏，保持高亮与按钮可见
  btn.addEventListener('mouseenter', () => handlers.onEnter())
  // 鼠标离开按钮：重新进入延时隐藏流程
  btn.addEventListener('mouseleave', () => handlers.onLeave())

  wrap.appendChild(btn)
  return { host: wrap, button: btn }
}

/**
 * 创建距离标签元素（零尺寸容器 + 绝对定位标签）。
 *
 * 容器原点 (0,0) 对齐地图坐标（即线段中点），
 * 标签通过 absolute + transform 向上偏移显示在线段上方。
 * 返回内层 label 元素（用于后续更新文本/位置）。
 */
export function createDistanceLabelElement(text: string): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.style.position = 'relative'
  wrapper.style.width = '0'
  wrapper.style.height = '0'
  wrapper.style.overflow = 'visible'

  const label = document.createElement('div')
  // 实线段标签：用线条颜色（橙）标注，无深色背景
  label.className = 'measure-distance-label measure-distance-label--segment'
  label.textContent = text
  label.style.position = 'absolute'
  // 水平居中（相对原点）+ 向上偏移 10px（线段上方，避免遮挡折线）
  label.style.left = '0'
  label.style.top = '-10px'
  label.style.transform = 'translateX(-50%)'
  label.style.whiteSpace = 'nowrap'
  wrapper.appendChild(label)

  return label
}

/**
 * 重定位「完成测距」面板，避免被地图边缘裁切。
 *
 * 面板默认在图钉右侧、竖直居中；本函数实测其与地图容器边界的相对位置并按需翻转/贴边：
 * - 水平：右侧放不下则翻到左侧（.--left）；两侧都放不下则向空间较大的一侧贴边。
 * - 竖直：默认中心在图钉上方 13px，若超出容器顶/底则向内收紧。
 *
 * 测量基准：面板父级即零尺寸 Marker 容器，其 getBoundingClientRect() 即图钉落点屏幕坐标；
 * 边界取适配器地图容器（其 overflow:hidden 会裁切面板）。offsetWidth/Height 不受 transform
 * 影响，故即便面板带入场动画（scale）也能测得真实尺寸。每次先还原默认再判定，避免叠加误差。
 */
export function repositionFinishPanel(
  panel: HTMLElement,
  container: HTMLElement | null,
): void {
  const host = panel.parentElement
  if (!host) return
  const cb = container ? container.getBoundingClientRect() : null
  const bx0 = cb ? cb.left : 0
  const by0 = cb ? cb.top : 0
  const bx1 = cb ? cb.right : window.innerWidth
  const by1 = cb ? cb.bottom : window.innerHeight
  const pad = 8

  // 还原默认（移除上次的修饰类与内联偏移），按默认布局重新判定
  panel.classList.remove('measure-finish-panel--left')
  panel.style.removeProperty('left')
  panel.style.removeProperty('right')
  panel.style.removeProperty('top')

  const W = panel.offsetWidth
  const H = panel.offsetHeight
  const o = host.getBoundingClientRect() // 零尺寸容器原点 = 图钉落点屏幕坐标
  const ox = o.left
  const oy = o.top

  // —— 水平：默认 left:gap → 面板左边在 ox+gap、右边在 ox+gap+W ——
  const gap = 15
  const fitsRight = ox + gap + W <= bx1 - pad
  const fitsLeft = ox - gap - W >= bx0 + pad
  if (!fitsRight && fitsLeft) {
    // 右侧放不下、左侧够：翻到左侧（.--left 设置 right:gap;left:auto）
    panel.classList.add('measure-finish-panel--left')
  } else if (!fitsRight && !fitsLeft) {
    // 两侧都不够：向空间较大的一侧贴边
    const spaceRight = bx1 - pad - ox
    const spaceLeft = ox - pad - bx0
    if (spaceRight >= spaceLeft) {
      // 右侧贴边：面板右边贴 bx1-pad → left = (bx1-pad-W) - ox
      panel.style.left = `${bx1 - pad - W - ox}px`
    } else {
      // 左侧贴边：面板左边贴 bx0+pad → 相对原点的 right = ox - (bx0+pad) - W
      panel.classList.add('measure-finish-panel--left')
      panel.style.right = `${ox - (bx0 + pad) - W}px`
    }
  }

  // —— 竖直：默认 top:-13px + translateY(-50%) → 面板中心在 oy-13 ——
  const defaultTop = -13
  const defaultCenter = oy + defaultTop
  const minCenter = by0 + pad + H / 2
  const maxCenter = by1 - pad - H / 2
  let center = defaultCenter
  if (center < minCenter) center = minCenter
  else if (center > maxCenter) center = maxCenter
  if (center !== defaultCenter) {
    // 内联 top 覆盖默认 -13px；translateY(-50%) 仍生效，面板中心落在 center 处
    panel.style.top = `${center - oy}px`
  }
}