/**
 * @file useFadeMount.ts
 * @description useFadeMount（自 MapChrome.tsx 拆出）—— 面板淡入/淡出动画编排 hook。 MapToolbar 四联面板与 LayerControlPanel 复用（复用性），只关心挂载/可见两个布尔值（单一职责）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { useEffect, useState } from 'react'

const FADE_MS = 500

/** 面板淡入/淡出：mounted 控制 DOM 是否存在；visible 控制淡入/淡出 class */
export function useFadeMount(isOpen: boolean): [boolean, boolean] {
  const [mounted, setMounted] = useState(isOpen)
  const [visible, setVisible] = useState(false)

  // 打开：渲染期直接挂载（visible 仍为 false，先以 opacity:0 入场）
  if (isOpen && !mounted) setMounted(true)
  // 关闭：渲染期立即摘掉 visible 触发淡出（DOM 保留 FADE_MS 播完动画后卸载）
  if (!isOpen && visible) setVisible(false)

  // 淡入：双 rAF 确保浏览器先把 opacity:0 渲染出来，再加 visible 触发过渡
  useEffect(() => {
    if (!isOpen || visible) return
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setVisible(true))
    })
    return () => window.cancelAnimationFrame(raf)
  }, [isOpen, visible])

  // 淡出：isOpen 变 false 后延迟 FADE_MS 卸载 DOM
  useEffect(() => {
    if (isOpen || !mounted) return
    const timer = window.setTimeout(() => setMounted(false), FADE_MS)
    return () => window.clearTimeout(timer)
  }, [isOpen, mounted])

  return [mounted, visible]
}
