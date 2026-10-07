/**
 * @file useDetailFooterAlign.ts
 * @description 详情 footer 对齐 Hook：测量列宽并对齐"最后更新时间"行与右列数值右边（自 DeviceManagementPanel 拆出）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react'

/**
 * 展开详情渲染后：
 * 1. 跨所有 detail-row 统一列宽（等宽对齐）
 * 2. 计算 footer paddingRight，使时间数值右边对齐第一行右列数值右边
 * 字体异步加载（MiSans）与容器 resize 时自动重测。
 */
export function useDetailFooterAlign() {
  const footerRef = useRef<HTMLDivElement | null>(null)
  const [footerPadRight, setFooterPadRight] = useState<number>(33)

  const measure = useCallback(() => {
    const footer = footerRef.current
    if (!footer) return
    // 从 footer 向上找到详情容器，再查所有列
    const detail = footer.closest('.device-row__detail')
    if (!detail) return

    // 跨所有 detail-row 统一等宽：遍历 detail 内全部列（2行×2列=4列）
    const allCols = detail.querySelectorAll<HTMLElement>('.device-row__detail-col')
    // 先清除行内 width，让列回到内容自然宽度（flex:0 0 auto）
    allCols.forEach((c) => {
      c.style.width = ''
    })
    // 取所有列中最宽者
    let maxColW = 0
    allCols.forEach((c) => {
      const w = c.offsetWidth
      if (w > maxColW) maxColW = w
    })
    // 统一设置所有列宽度，实现跨行等宽对齐
    allCols.forEach((c) => {
      c.style.width = `${maxColW}px`
    })
    const footerRect = footer.getBoundingClientRect()
    // 只取第一个 detail-row（速度Y/偏航角/横滚角所在行）的右列数值，让 footer 与"速度那一列"的数值右边缘对齐
    const firstRow = detail.querySelector<HTMLElement>('.device-row__detail-row')
    const values = firstRow
      ? firstRow.querySelectorAll<HTMLElement>(
          '.device-row__detail-col:last-child .device-row__detail-value',
        )
      : []
    let maxValueRight = -Infinity
    values.forEach((v) => {
      const r = v.getBoundingClientRect()
      if (r.right > maxValueRight) maxValueRight = r.right
    })
    if (!Number.isFinite(maxValueRight)) return
    // footer 内容右边 = footerRect.right - paddingRight
    const desired = footerRect.right - maxValueRight
    if (desired >= 0 && desired <= footerRect.width) {
      setFooterPadRight(Math.round(desired))
    }
  }, [])

  useLayoutEffect(() => {
    // 等布局稳定后测量（含字体/动画首帧）
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(measure)
    })
    // 字体加载完成后重测（MiSans 可能异步加载，影响数值宽度）
    let cancelled = false
    document.fonts?.ready.then(() => {
      if (!cancelled) measure()
    })
    // 监听尺寸变化（面板宽度 clamp 随 vw 变化）
    const ro = new ResizeObserver(() => measure())
    if (footerRef.current) ro.observe(footerRef.current)
    window.addEventListener('resize', measure)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(id)
      window.removeEventListener('resize', measure)
      ro.disconnect()
    }
  }, [measure])

  return { footerRef, footerPadRight }
}