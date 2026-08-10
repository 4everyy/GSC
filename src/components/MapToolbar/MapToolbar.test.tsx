/**
 * MapToolbar 三态背景切换测试
 *
 * 验证左侧 4 个按钮（设备管理、区域规划、历史轨迹、任务列表）的
 * normal / hover / active 三态背景图是否正确应用。
 *
 * 实现说明：
 * - 使用 React 19 的 react-dom/client + act 进行渲染和交互
 * - 使用 vi.useFakeTimers 模拟 requestAnimationFrame / setTimeout
 *   （MapToolbar 内部用双 rAF + setTimeout 驱动设备面板淡入/淡出）
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MapToolbar } from './MapToolbar'
import { toolbarItems, type ToolbarItem } from '../../config/toolbar'

/** 渲染 MapToolbar 到 jsdom 容器，返回容器和清理函数 */
function renderToolbar() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(<MapToolbar />)
  })

  const cleanup = () => {
    act(() => {
      root.unmount()
    })
    container.remove()
  }

  return { container, cleanup }
}

/** 获取所有工具栏按钮（排除设备面板内的按钮） */
function getToolbarButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelector('.map-toolbar')!.querySelectorAll('button'))
}

/** 提取按钮的背景图 URL */
function getBgUrl(btn: HTMLButtonElement): string {
  const style = btn.getAttribute('style') || ''
  const match = style.match(/background-image:\s*url\(([^)]+)\)/)
  return match ? match[1].replace(/['"]/g, '') : ''
}

describe('MapToolbar 三态背景切换', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('初始渲染：4 个按钮均使用 normal 背景', () => {
    const { container, cleanup } = renderToolbar()

    try {
      const buttons = getToolbarButtons(container)
      expect(buttons).toHaveLength(4)

      buttons.forEach((btn: HTMLButtonElement, i: number) => {
        const bg = getBgUrl(btn)
        expect(bg, `按钮 #${i} 初始背景应为 normal`).toBe(toolbarItems[i].background.normal)
        expect(bg).not.toBe(toolbarItems[i].background.hover)
        expect(bg).not.toBe(toolbarItems[i].background.active)
        expect(btn.classList.contains('is-active')).toBe(false)
      })
    } finally {
      cleanup()
    }
  })

  it('hover 第一个按钮：仅该按钮使用 hover 背景', () => {
    const { container, cleanup } = renderToolbar()

    try {
      const buttons = getToolbarButtons(container)
      const [first, second, third, fourth] = buttons

      act(() => {
        first.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }))
      })

      expect(getBgUrl(first)).toBe(toolbarItems[0].background.hover)
      expect(getBgUrl(second)).toBe(toolbarItems[1].background.normal)
      expect(getBgUrl(third)).toBe(toolbarItems[2].background.normal)
      expect(getBgUrl(fourth)).toBe(toolbarItems[3].background.normal)

      act(() => {
        first.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
      })
      expect(getBgUrl(first)).toBe(toolbarItems[0].background.normal)
    } finally {
      cleanup()
    }
  })

  it('点击第一个按钮：切换为 active 背景 + is-active class，再次点击恢复', () => {
    const { container, cleanup } = renderToolbar()

    try {
      const buttons = getToolbarButtons(container)
      const [first] = buttons

      act(() => {
        first.click()
      })
      expect(getBgUrl(first)).toBe(toolbarItems[0].background.active)
      expect(first.classList.contains('is-active')).toBe(true)

      act(() => {
        first.click()
      })
      expect(getBgUrl(first)).toBe(toolbarItems[0].background.normal)
      expect(first.classList.contains('is-active')).toBe(false)
    } finally {
      cleanup()
    }
  })

  it('active 状态下 hover 不改变背景（active 优先级高于 hover）', () => {
    const { container, cleanup } = renderToolbar()

    try {
      const buttons = getToolbarButtons(container)
      const [first] = buttons

      act(() => {
        first.click()
      })
      expect(getBgUrl(first)).toBe(toolbarItems[0].background.active)

      act(() => {
        first.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }))
      })
      expect(getBgUrl(first)).toBe(toolbarItems[0].background.active)

      act(() => {
        first.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
      })
      expect(getBgUrl(first)).toBe(toolbarItems[0].background.active)
    } finally {
      cleanup()
    }
  })

  it('同时验证全部 4 个按钮的 hover/active 切换', () => {
    const { container, cleanup } = renderToolbar()

    try {
      const buttons = getToolbarButtons(container)

      buttons.forEach((btn: HTMLButtonElement, i: number) => {
        act(() => {
          btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }))
        })
        expect(getBgUrl(btn)).toBe(toolbarItems[i].background.hover)
        act(() => {
          btn.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
        })
        expect(getBgUrl(btn)).toBe(toolbarItems[i].background.normal)
      })

      buttons.forEach((btn: HTMLButtonElement, i: number) => {
        act(() => {
          btn.click()
        })
        expect(getBgUrl(btn)).toBe(toolbarItems[i].background.active)
        expect(btn.classList.contains('is-active')).toBe(true)
        act(() => {
          btn.click()
        })
        expect(getBgUrl(btn)).toBe(toolbarItems[i].background.normal)
        expect(btn.classList.contains('is-active')).toBe(false)
      })
    } finally {
      cleanup()
    }
  })

  it('三态背景图均为非空有效 URL（资源导入正常）', () => {
    toolbarItems.forEach((item: ToolbarItem, i: number) => {
      expect(item.background.normal, `按钮 #${i} normal 背景为空`).toBeTruthy()
      expect(item.background.hover, `按钮 #${i} hover 背景为空`).toBeTruthy()
      expect(item.background.active, `按钮 #${i} active 背景为空`).toBeTruthy()
      expect(item.background.normal).toMatch(/\/assets\//)
    })
  })
})