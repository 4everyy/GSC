/**
 * @file useAreaSelectInteraction.ts
 * @description 区域框选交互 Hook：区域降落/集结点/区域列表共用
 * @author 4everyy
 * @date 2026-10-07
 */
import { useEffect, useState } from 'react'

/** 框选模式归属：'area-landing' 区域降落 / 'rally-point' 集结点 / 'area-list' 区域列表 */
export type AreaSelectSource = 'area-landing' | 'rally-point' | 'area-list'

interface UseAreaSelectInteractionOptions {
  /** Esc 取消框选后重新展示区域降落面板（面板状态由父级持有） */
  setAreaLandingOpen: (open: boolean) => void
  /** Esc 取消框选后重新展示集结点面板（面板状态由父级持有） */
  setRallyPointOpen: (open: boolean) => void
}

/**
 * useAreaSelectInteraction —— 区域降落/集结点/区域列表共用的「框选绘制」交互状态（自 useExclusivePanels 拆出）。
 * 职责单一：进入框选时清零上一轮选区，Esc 退出并恢复对应面板；调用方负责业务落盘（rect/corners 等）。
 */
export function useAreaSelectInteraction({
  setAreaLandingOpen,
  setRallyPointOpen,
}: UseAreaSelectInteractionOptions) {
  // 区域降落/集结点框选模式：进入后首页全屏遮罩 + 拖拽自定义大小紫色虚线框
  const [areaSelectMode, setAreaSelectMode] = useState(false)
  // 框选起点（视口坐标 clientX/clientY），null = 尚未开始框选
  const [areaSelectAnchor, setAreaSelectAnchor] = useState<{ x: number; y: number } | null>(null)
  // 框选当前终点（拖动中的视口坐标），与起点共同确定选区矩形
  const [areaSelectEnd, setAreaSelectEnd] = useState<{ x: number; y: number } | null>(null)
  // 是否处于按住左键拖动状态（拖动期间矩形实时拉伸）
  const [areaSelectDragging, setAreaSelectDragging] = useState(false)
  // 框选跟随光标点：绘制阶段鼠标在遮罩上的实时位置（视口坐标）
  const [areaSelectHover, setAreaSelectHover] = useState<{ x: number; y: number } | null>(null)
  // 框选模式归属：决定确认后写入哪个面板的选区状态
  const [areaSelectSource, setAreaSelectSource] = useState<AreaSelectSource>('area-landing')

  // 进入框选模式时清零上一轮遗留的选区状态（rAF 异步执行规避 effect 内同步 setState；兜底任何退出路径未清干净）
  useEffect(() => {
    if (!areaSelectMode) return
    const raf = window.requestAnimationFrame(() => {
      setAreaSelectAnchor(null)
      setAreaSelectEnd(null)
      setAreaSelectDragging(false)
      setAreaSelectHover(null)
    })
    return () => window.cancelAnimationFrame(raf)
  }, [areaSelectMode])

  // Esc 退出框选模式：取消绘制并重新展示对应面板（面板信息已提升保留）
  useEffect(() => {
    if (!areaSelectMode) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAreaSelectMode(false)
        setAreaSelectAnchor(null)
        setAreaSelectEnd(null)
        // 取消绘制并重新展示对应面板（信息已提升保留）
        if (areaSelectSource === 'rally-point') setRallyPointOpen(true)
        else if (areaSelectSource === 'area-landing') setAreaLandingOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    areaSelectMode,
    areaSelectSource,
    setAreaSelectMode,
    setAreaSelectAnchor,
    setAreaSelectEnd,
    setRallyPointOpen,
    setAreaLandingOpen,
  ])

  return {
    areaSelectMode,
    setAreaSelectMode,
    areaSelectAnchor,
    setAreaSelectAnchor,
    areaSelectEnd,
    setAreaSelectEnd,
    areaSelectDragging,
    setAreaSelectDragging,
    areaSelectHover,
    setAreaSelectHover,
    areaSelectSource,
    setAreaSelectSource,
  }
}