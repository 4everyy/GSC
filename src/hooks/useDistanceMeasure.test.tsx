/**
 * useDistanceMeasure —— 已提交测距的「hover 高亮 + 悬浮删除」单元测试。
 *
 * 验证：
 * - finish() 把已提交折线注册为可悬停交互（透明命中层 + 进入/离开回调）；
 * - 悬停进入：折线高亮 + 悬浮删除按钮出现在命中点（≈光标处）；
 * - 点击删除按钮：移除整条测距（折线 + 图钉 + 分段标签）并解除交互绑定；
 * - 离开命中区：150ms 延时后恢复高亮并隐藏按钮（防按钮↔折线间移动闪烁）；
 * - 卸载：清理已提交测距及悬浮删除按钮。
 *
 * 实现说明：
 * - 用「假适配器」实现测距流程所需的 MapAdapter 子集（其余方法空实现），
 *   避免 jsdom 下加载真实 maplibre-gl；
 * - 使用 React 19 react-dom/client + act 渲染，vi.useFakeTimers 控制 rAF / setTimeout。
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LngLat, MapAdapter, MarkerHandle, PolylineHandle } from '../map-engines'
import { useDistanceMeasure } from './useDistanceMeasure'

type MeasureApi = ReturnType<typeof useDistanceMeasure>

/**
 * 假适配器：记录关键调用（marker/polyline/interactive/highlight/位置）便于断言；
 * 标注元素挂到 document.body 以便查询/点击。仅实现测距流程触及的 MapAdapter 子集。
 */
function createFakeAdapter() {
  const markers = new Map<string, { id: string; el: HTMLElement; lngLat: LngLat }>()
  const polylines = new Map<string, { id: string; pts: LngLat[] }>()
  const interactive: Array<{ id: string; onEnter: (l: LngLat) => void; onLeave: () => void }> = []
  const highlight: Array<{ id: string; on: boolean; color?: string }> = []
  const markerPos: Array<{ id: string; lngLat: LngLat }> = []
  const removed = { markers: [] as string[], polylines: [] as string[] }
  const unbound: string[] = []
  let clickHandler: ((l: LngLat) => void) | null = null

  const container = document.createElement('div')
  document.body.appendChild(container)

  return {
    markers,
    polylines,
    interactive,
    highlight,
    markerPos,
    removed,
    unbound,
    /** 模拟地图点击（触发 hook 内部 addPoint） */
    fireClick(l: LngLat) {
      clickHandler?.(l)
    },
    dispose() {
      container.remove()
    },
    engine: 'maplibre' as const,
    addMarker: vi.fn((id: string, lngLat: LngLat, opts?: { element?: HTMLElement }) => {
      const el = opts?.element ?? document.createElement('div')
      el.setAttribute('data-marker-id', id)
      document.body.appendChild(el)
      markers.set(id, { id, el, lngLat })
      return { raw: el, id, engine: 'maplibre' as const } as MarkerHandle
    }),
    setMarkerPosition: vi.fn((h: MarkerHandle, lngLat: LngLat) => {
      const m = markers.get(h.id)
      if (m) m.lngLat = lngLat
      markerPos.push({ id: h.id, lngLat })
    }),
    setMarkerElement: vi.fn(() => {}),
    removeMarker: vi.fn((id: string) => {
      const m = markers.get(id)
      if (m) {
        m.el.remove()
        markers.delete(id)
      }
      removed.markers.push(id)
    }),
    addPolyline: vi.fn((id: string, pts: LngLat[]) => {
      polylines.set(id, { id, pts })
      return { raw: {}, id, engine: 'maplibre' as const } as PolylineHandle
    }),
    setPolylinePoints: vi.fn(() => {}),
    removePolyline: vi.fn((id: string) => {
      polylines.delete(id)
      removed.polylines.push(id)
    }),
    setPolylineInteractive: vi.fn(
      (id: string, opts: { onEnter?: (l: LngLat) => void; onLeave?: () => void }) => {
        interactive.push({
          id,
          onEnter: opts.onEnter ?? (() => {}),
          onLeave: opts.onLeave ?? (() => {}),
        })
        return () => {
          unbound.push(id)
        }
      },
    ),
    setPolylineHighlight: vi.fn(
      (id: string, on: boolean, o?: { color?: string }) => {
        highlight.push({ id, on, color: o?.color })
      },
    ),
    onClick: vi.fn((h: (l: LngLat) => void) => {
      clickHandler = h
      return () => {
        clickHandler = null
      }
    }),
    onMouseMove: vi.fn(() => () => {}),
    onContextMenu: vi.fn(() => () => {}),
    onMoveEnd: vi.fn(() => () => {}),
    onZoomEnd: vi.fn(() => () => {}),
    getContainer: vi.fn(() => container),
  }
}

/** 渲染使用本 hook 的空组件，返回其 API 与卸载函数 */
function renderMeasure(adapter: MapAdapter): { api: MeasureApi; unmount: () => void } {
  let api!: MeasureApi
  function Host() {
    api = useDistanceMeasure({ adapter })
    return null
  }
  const hostEl = document.createElement('div')
  document.body.appendChild(hostEl)
  const root = createRoot(hostEl)
  act(() => {
    root.render(<Host />)
  })
  return {
    api,
    unmount: () => {
      act(() => {
        root.unmount()
      })
      hostEl.remove()
    },
  }
}

/** 公共「落两点 + 确定」流程，返回已提交折线 id */
function commitTwoPoints(a: ReturnType<typeof createFakeAdapter>, api: MeasureApi) {
  act(() => api.toggle())
  act(() => a.fireClick({ lng: 114, lat: 22 }))
  act(() => a.fireClick({ lng: 114.01, lat: 22 }))
  act(() => {
    vi.runAllTimers()
  })
  act(() => api.finish())
  return [...a.polylines.keys()][0]
}

describe('useDistanceMeasure 悬停高亮 + 悬浮删除', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runAllTimers()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('finish 把已提交折线注册为可悬停交互', () => {
    const a = createFakeAdapter()
    const { api, unmount } = renderMeasure(a as unknown as MapAdapter)
    try {
      const polyId = commitTwoPoints(a, api)
      expect(polyId).toBeTruthy()
      // 已提交折线仍保留在地图上（finish 仅解除进行中跟踪，不移除）
      expect(a.polylines.size).toBe(1)
      // 为该折线附加了悬停交互
      expect(a.interactive).toHaveLength(1)
      expect(a.interactive[0].id).toBe(polyId)
    } finally {
      unmount()
      a.dispose()
    }
  })

  it('悬停已提交折线高亮并显示删除按钮，点击删除整条测距', () => {
    const a = createFakeAdapter()
    const { api, unmount } = renderMeasure(a as unknown as MapAdapter)
    try {
      const polyId = commitTwoPoints(a, api)

      // 悬停进入：折线高亮 + 删除按钮出现在命中点
      act(() => a.interactive[0].onEnter({ lng: 114.005, lat: 22 }))
      expect(a.highlight.at(-1)).toMatchObject({ id: polyId, on: true, color: '#FF8A1E' })
      const btn = document.querySelector('.measure-delete-btn') as HTMLButtonElement | null
      expect(btn, '删除按钮应出现').not.toBeNull()
      expect(btn!.style.display).not.toBe('none')
      expect(a.markerPos.at(-1)).toMatchObject({
        id: 'measure-delete-btn',
        lngLat: { lng: 114.005, lat: 22 },
      })

      // 点击删除：移除整条测距 + 解除交互绑定
      act(() => {
        btn!.click()
      })
      expect(a.polylines.has(polyId)).toBe(false)
      expect(a.removed.polylines).toContain(polyId)
      expect(a.unbound).toContain(polyId)
      // 删除按钮已隐藏
      const btnAfter = document.querySelector('.measure-delete-btn') as HTMLElement | null
      expect(btnAfter?.style.display).toBe('none')
    } finally {
      unmount()
      a.dispose()
    }
  })

  it('离开命中区延时（150ms）恢复高亮并隐藏删除按钮', () => {
    const a = createFakeAdapter()
    const { api, unmount } = renderMeasure(a as unknown as MapAdapter)
    try {
      commitTwoPoints(a, api)

      act(() => a.interactive[0].onEnter({ lng: 114.005, lat: 22 }))
      expect(a.highlight.at(-1)?.on).toBe(true)

      act(() => a.interactive[0].onLeave())
      // 未到 150ms：仍高亮、按钮可见（延时兜底，防按钮↔折线间移动闪烁）
      expect(a.highlight.at(-1)?.on).toBe(true)
      expect(
        (document.querySelector('.measure-delete-btn') as HTMLElement | null)?.style.display,
      ).not.toBe('none')

      act(() => {
        vi.advanceTimersByTime(150)
      })
      // 到时：恢复高亮 + 隐藏按钮
      expect(a.highlight.at(-1)?.on).toBe(false)
      expect(
        (document.querySelector('.measure-delete-btn') as HTMLElement | null)?.style.display,
      ).toBe('none')
    } finally {
      unmount()
      a.dispose()
    }
  })

  it('卸载时清理已提交测距及悬浮删除按钮', () => {
    const a = createFakeAdapter()
    const { api, unmount } = renderMeasure(a as unknown as MapAdapter)
    const polyId = commitTwoPoints(a, api)
    expect(polyId).toBeTruthy()

    unmount()
    a.dispose()

    expect(a.polylines.has(polyId)).toBe(false)
    expect(a.unbound).toContain(polyId)
    expect(document.querySelector('.measure-delete-btn')).toBeNull()
  })
})
