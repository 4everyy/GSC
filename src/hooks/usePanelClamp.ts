/**
 * usePanelClamp —— hover 面板边缘自适应平移修正（兜底方案）。
 *
 * 背景：
 * `utils/panelPlacement.ts` 通过百分比阈值选择面板展开方向（左/右、上/下），
 * 但阈值是经验值，在不同视口尺寸 / 拖拽位置下，面板仍可能溢出可视区域被裁剪，
 * 导致「内容显示不全」。
 *
 * 本 hook 作为兜底：在每次渲染、拖拽、resize 后，测量所有 hover 面板的实际矩形，
 * 计算使其完全进入可视区域所需的平移量，通过 CSS 变量 `--clamp-x` / `--clamp-y`
 * 注入到面板元素；CSS 端用独立的 `translate` 属性叠加该平移，与各面板既有的
 * `transform` 解耦互不干扰。
 *
 * 关键设计：以面板的「裁剪祖先」边界（而非视口边界）为基准进行修正。
 * hover 面板位于 `.map-stage`（overflow:hidden）内部，实际可见区域 = `.map-stage`
 * 矩形（比视口小，上方被 StatusHeader 遮挡），若按视口边界修正仍会被 overflow:hidden 裁剪。
 *
 * 设计要点：
 * - 使用 useLayoutEffect，在浏览器绘制前同步完成测量与修正，避免溢出闪烁；
 * - 测量前先清除上次注入的变量，得到「自然位置」再计算位移，避免反馈循环；
 * - panel 使用 visibility:hidden 隐藏（非 display:none），始终保留布局可被测量；
 * - 仅做「平移修正」，不改方向；方向由 panelPlacement.ts 的修饰类负责，两者互不干扰。
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
    const panels = Array.from(root.querySelectorAll<HTMLElement>(selector))
    if (panels.length === 0) return

    const apply = () => {
      for (const panel of panels) {
        // 先清除上次注入的修正，测量面板「自然位置」，避免反馈循环
        panel.style.removeProperty('--clamp-x')
        panel.style.removeProperty('--clamp-y')
        const rect = panel.getBoundingClientRect()
        // 以最近可裁剪祖先（如 .map-stage overflow:hidden）为可见边界，
        // 而非视口边界——面板被祖先裁剪，只有留在祖先矩形内才真正可见。
        const clip = getClippingRect(panel)
        const boundLeft = clip.left + padding
        const boundRight = clip.right - padding
        const boundTop = clip.top + padding
        const boundBottom = clip.bottom - padding
        let shiftX = 0
        let shiftY = 0
        // 右溢出：向左平移
        if (rect.right > boundRight) shiftX = boundRight - rect.right
        // 左溢出（含右溢出修正后的二次校验）：向右平移
        if (rect.left + shiftX < boundLeft) shiftX += boundLeft - (rect.left + shiftX)
        // 下溢出：向上平移
        if (rect.bottom > boundBottom) shiftY = boundBottom - rect.bottom
        // 上溢出：向下平移
        if (rect.top + shiftY < boundTop) shiftY += boundTop - (rect.top + shiftY)
        panel.style.setProperty('--clamp-x', `${Math.round(shiftX)}px`)
        panel.style.setProperty('--clamp-y', `${Math.round(shiftY)}px`)
      }
    }

    apply()

    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : undefined
    ro?.observe(root)
    window.addEventListener('resize', apply)

    return () => {
      window.removeEventListener('resize', apply)
      ro?.disconnect()
      for (const panel of panels) {
        panel.style.removeProperty('--clamp-x')
        panel.style.removeProperty('--clamp-y')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, selector, padding, ...deps])
}