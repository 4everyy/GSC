/**
 * usePanelClamp —— hover 面板边缘自适应平移修正（兜底方案）。
 *
 * 背景：
 * `utils/panelPlacement.ts` 通过百分比阈值选择面板展开方向（左/右、上/下），
 * 但阈值是经验值，在不同视口尺寸 / 拖拽位置下，面板仍可能溢出可视区域被裁剪，
 * 导致「内容显示不全」。
 *
 * 本 hook 作为兜底：在每次渲染、拖拽、resize、DOM 变更、字体加载后，测量所有 hover 面板
 * 的实际矩形，计算使其完全进入可视区域所需的平移量，通过 CSS 变量 `--clamp-x` / `--clamp-y`
 * 注入到面板元素；CSS 端用独立的 `translate` 属性叠加该平移，与各面板既有的
 * `transform` 解耦互不干扰。
 *
 * 关键设计：以面板的「裁剪祖先」边界（而非视口边界）为基准进行修正。
 * hover 面板位于 `.map-stage`（overflow:hidden）内部，实际可见区域 = `.map-stage`
 * 矩形（比视口小，上方被 StatusHeader 遮挡），若按视口边界修正仍会被 overflow:hidden 裁剪。
 *
 * 设计要点：
 * - 使用 useLayoutEffect，在浏览器绘制前同步完成测量与修正，避免溢出闪烁；
 * - 不通过 removeProperty 测量「自然位置」（会触发 MutationObserver 反馈循环），
 *   而是读取当前 --clamp 值并从 rect 中减去，推导出自然位置；
 * - 仅当新计算的 clamp 值与当前不同时才写入，避免触发 MutationObserver 反馈循环；
 * - panel 使用 visibility:hidden 隐藏（非 display:none），始终保留布局可被测量；
 * - 仅做「平移修正」，不改方向；方向由 panelPlacement.ts 的修饰类负责，两者互不干扰。
 * - 每次应用前实时查询面板节点，保证动态增删的面板（如聚焦面板切换）都能被覆盖；
 * - 通过 MutationObserver 监听 DOM 变更（面板增删、宿主 class/style 变化），
 *   确保面板在 hover 显示后立即重新修正，不依赖外部 deps 的精确性。
 */
import { useLayoutEffect, type DependencyList, type RefObject } from 'react'

/**
 * 获取元素最近的可裁剪祖先（overflow ≠ visible）的矩形。
 *
 * hover 面板被 `.map-stage`（overflow:hidden）等容器裁剪，需以该容器边界
 * 而非视口边界为基准进行平移修正，否则面板仍会被容器裁剪不可见。
 *
 * 从面板父元素逐级向上查找，返回第一个设置了 overflow/overflowX/overflowY
 * 为 hidden/scroll/auto/clip 的祖先的 getBoundingClientRect()。
 * 若未找到（已到 body），回退到视口矩形。
 */
function getClippingRect(el: HTMLElement): DOMRect {
  let node: HTMLElement | null = el.parentElement
  while (node && node !== document.body) {
    const style = getComputedStyle(node)
    if (
      style.overflow !== 'visible' ||
      style.overflowX !== 'visible' ||
      style.overflowY !== 'visible'
    ) {
      return node.getBoundingClientRect()
    }
    node = node.parentElement
  }
  return new DOMRect(
    0,
    0,
    document.documentElement.clientWidth,
    document.documentElement.clientHeight,
  )
}

export interface UsePanelClampOptions {
  /** 容器 ref；在其内查找 hover 面板。缺省使用 document.body */
  containerRef?: RefObject<HTMLElement | null>
  /** hover 面板选择器，默认 [data-hover-panel] */
  selector?: string
  /** 距视口边缘的安全间距（px），默认 8 */
  padding?: number
  /** 触发重新计算的额外依赖（宿主百分比坐标、聚焦索引等）。
   *  宿主拖拽时其百分比坐标变化，传入作为依赖可实时重新修正。 */
  deps?: DependencyList
}

export function usePanelClamp({
  containerRef,
  selector = '[data-hover-panel]',
  padding = 8,
  deps = [],
}: UsePanelClampOptions = {}) {
  useLayoutEffect(() => {
    const root = containerRef?.current ?? document.body
    if (!root) return

    // 实时查询面板：每次 apply 都重新查 DOM，保证动态增删的面板都能被覆盖。
    const queryPanels = () => Array.from(root.querySelectorAll<HTMLElement>(selector))

    const apply = () => {
      const panels = queryPanels()
      for (const panel of panels) {
        // 读取当前注入的 clamp 值（inline style），用于从测量矩形中反推「自然位置」。
        // 不使用 removeProperty + remeasure 的方式，因为那会修改 style 属性，
        // 触发 MutationObserver → apply → 修改 style → MO → ... 的无限反馈循环。
        const currentClampX = parseFloat(panel.style.getPropertyValue('--clamp-x')) || 0
        const currentClampY = parseFloat(panel.style.getPropertyValue('--clamp-y')) || 0

        const rect = panel.getBoundingClientRect()
        // 反推自然位置：当前 rect 包含了上一次注入的 clamp 平移，减去即得无修正时的位置
        const naturalRight = rect.right - currentClampX
        const naturalLeft = rect.left - currentClampX
        const naturalBottom = rect.bottom - currentClampY
        const naturalTop = rect.top - currentClampY

        // 以最近可裁剪祖先（如 .map-stage overflow:hidden）为可见边界
        const clip = getClippingRect(panel)
        const boundLeft = clip.left + padding
        const boundRight = clip.right - padding
        const boundTop = clip.top + padding
        const boundBottom = clip.bottom - padding

        let shiftX = 0
        let shiftY = 0
        // 右溢出：向左平移
        if (naturalRight > boundRight) shiftX = boundRight - naturalRight
        // 左溢出（含右溢出修正后的二次校验）：向右平移
        if (naturalLeft + shiftX < boundLeft) shiftX += boundLeft - (naturalLeft + shiftX)
        // 下溢出：向上平移
        if (naturalBottom > boundBottom) shiftY = boundBottom - naturalBottom
        // 上溢出：向下平移
        if (naturalTop + shiftY < boundTop) shiftY += boundTop - (naturalTop + shiftY)

        const newClampX = `${Math.round(shiftX)}px`
        const newClampY = `${Math.round(shiftY)}px`

        // 仅当值变化时才写入，避免触发 MutationObserver 反馈循环
        if (panel.style.getPropertyValue('--clamp-x') !== newClampX) {
          panel.style.setProperty('--clamp-x', newClampX)
        }
        if (panel.style.getPropertyValue('--clamp-y') !== newClampY) {
          panel.style.setProperty('--clamp-y', newClampY)
        }
      }
    }

    apply()

    // 视口尺寸变化：重新修正
    const onResize = () => apply()
    window.addEventListener('resize', onResize)

    // 容器尺寸变化：重新修正
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => apply()) : undefined
    ro?.observe(root)

    // DOM 变更监听：面板的增删（聚焦面板切换）、宿主位置/方向 class 变化
    // 都会触发重新修正。使用微任务节流避免高频回调导致性能问题。
    let scheduled = false
    const scheduleApply = () => {
      if (scheduled) return
      scheduled = true
      Promise.resolve().then(() => {
        scheduled = false
        apply()
      })
    }
    const mo =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(scheduleApply)
        : undefined
    mo?.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    })

    // 字体加载完成后重新修正：字体异步加载会改变文本行高/宽度，导致面板尺寸变化
    let fontReadyHandled = false
    const onFontReady = () => {
      if (fontReadyHandled) return
      fontReadyHandled = true
      apply()
    }
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready.then(onFontReady).catch(() => {})
    }

    return () => {
      window.removeEventListener('resize', onResize)
      ro?.disconnect()
      mo?.disconnect()
      const panels = queryPanels()
      for (const panel of panels) {
        panel.style.removeProperty('--clamp-x')
        panel.style.removeProperty('--clamp-y')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, selector, padding, ...deps])
}