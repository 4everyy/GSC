/**
 * @file elements.ts
 * @description elements.ts（自 renderers.ts 拆出）—— 测距 DOM 元素工厂：图钉 / 结束确认面板 / 悬浮删除按钮 / 距离标签 / 面板防裁切重定位。纯 DOM 构建，与地图引擎解耦（单一职责/低耦合）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { measureIcons } from '../../assets/measure/index'

/** 锚点统一使用 (0,0)：零尺寸容器的原点即地图坐标。 */
export const PIN_ANCHOR = { x: 0, y: 0 }

/** 创建定位图钉标记元素（使用蓝湖设计稿 PNG 图标）。 */
function createPinMarkerElement(src: string): HTMLElement {
  const el = document.createElement('div')
  el.style.cursor = 'pointer'
  el.style.position = 'relative'
  el.style.width = '0'
  el.style.height = '0'
  el.style.overflow = 'visible'

  // 图钉图片：24×34，灰色阴影中心在 (11.5,29.5)，故左上角放在 (-11.5,-…
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

/** 创建「测距结束确认」面板元素（依附于最新终点图钉）。 */
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

/** 创建「悬浮删除」按钮元素（依附于悬停的已提交折线）。 */
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

/** 创建距离标签元素（零尺寸容器 + 绝对定位标签）。 */
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

/** 重定位「完成测距」面板，避免被地图边缘裁切。 */
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
      // 左侧贴边：面板左边贴 bx0+pad → 相对原点的 right = ox - (bx0+p…
      panel.classList.add('measure-finish-panel--left')
      panel.style.right = `${ox - (bx0 + pad) - W}px`
    }
  }

  // —— 竖直：默认 top:-13px + translateY(-50%) → 面板中心在…
  const defaultTop = -13
  const defaultCenter = oy + defaultTop
  const minCenter = by0 + pad + H / 2
  const maxCenter = by1 - pad - H / 2
  let center = defaultCenter
  if (center < minCenter) center = minCenter
  else if (center > maxCenter) center = maxCenter
  if (center !== defaultCenter) {
    // 内联 top 覆盖默认 -13px
    panel.style.top = `${center - oy}px`
  }
}
