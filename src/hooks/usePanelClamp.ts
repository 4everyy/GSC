/**
 * @file usePanelClamp.ts
 * @description usePanelClamp.ts（自 hooks/index.ts 拆出）—— hover 面板边缘自适应平移修正（兜底方案）： 查找可裁剪祖先 → 计算溢出 → 平移修正。独立变化的视口适配职责。
 * @author 4everyy
 * @date 2026-10-07
 */
import { useLayoutEffect, type DependencyList, type RefObject } from 'react'

/** usePanelClamp —— hover 面板边缘自适应平移修正（兜底方案）。 */

/** 获取元素最近的可裁剪祖先（overflow ≠ visible）的矩形。 */
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
  /** 触发重新计算的额外依赖（宿主百分比坐标、聚焦索引等）。 */
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

    // DOM 变更监听：面板的增删（聚焦面板切换）、宿主位置/方向 class 变化都会触发重新修正。
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

