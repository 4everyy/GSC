/**
 * useOfflineMap 回归测试 —— 锁定「启用离线包即整页白屏」根因修复。
 *
 * 根因回顾：旧实现把 selectActiveStyle 直接作为 store 选择器传入 useOfflineMapStore()，
 * 而 buildRasterStyle 每次返回全新对象，破坏 useSyncExternalStore 的快照稳定性契约
 * （默认 Object.is 比较恒为不等）→ React 判定 store 在渲染期间持续变化 → 无限重渲染
 * → Maximum update depth exceeded → 整页白屏。
 *
 * 本测试：激活一个离线包后渲染使用该 Hook 的组件，断言不抛错、样式被派生，
 *          且 activeStyle 在「无关 store 字段变化」时引用保持稳定。
 *
 * 环境隔离：jsdom 无 IndexedDB / 真实 maplibre，故：
 *   - vi.mock('./tileProtocol') 屏蔽协议注册；
 *   - 通过 setState 把 loadPackages 替换为空操作，避免触发 IndexedDB 读取。
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

vi.mock('./tileProtocol', async (importOriginal) => {
  // 保留真实导出（GCS_PKG_PROTOCOL 等被 styleBuilder 引用），仅屏蔽协议注册副作用。
  const actual = await importOriginal<typeof import('./tileProtocol')>()
  return {
    ...actual,
    registerTileProtocol: () => {},
  }
})

import { useOfflineMap } from './useOfflineMap'
import { useOfflineMapStore } from './offlineMapStore'
import type { OfflinePackageMeta } from './types'

const PKG: OfflinePackageMeta = {
  id: 'suzhou',
  name: '苏州卫星影像',
  format: 'png',
  tileSize: 256,
  minZoom: 0,
  maxZoom: 14,
  bounds: { west: 120.1, south: 31.1, east: 120.8, north: 31.6 },
  center: { lng: 120.45, lat: 31.35 },
  tileCount: 1,
  importedAt: 1,
}

/** 探针组件：调用 useOfflineMap 并把结果外抛，便于断言；文本反映是否派生出样式 */
function Probe({ onResult }: { onResult: (activeStyle: unknown) => void }): ReactNode {
  const { activeStyle } = useOfflineMap()
  onResult(activeStyle)
  return <div data-testid="probe">{activeStyle ? 'has-style' : 'no-style'}</div>
}

describe('useOfflineMap', () => {
  beforeEach(() => {
    // 预置：已导入并激活苏州包；中和 IndexedDB 加载动作
    useOfflineMapStore.setState({
      packages: [PKG],
      activePackageId: PKG.id,
      status: 'ready',
      error: null,
      loadPackages: async () => {},
    })
  })

  afterEach(() => {
    useOfflineMapStore.setState({ packages: [], activePackageId: null, error: null })
  })

  it('激活离线包后不触发无限重渲染（白屏根因回归）', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    expect(() => {
      act(() => {
        root.render(<Probe onResult={() => {}} />)
      })
    }).not.toThrow()

    expect(container.textContent).toContain('has-style')

    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('activeStyle 在「无关 store 字段变化」时引用保持稳定（不每次新建）', () => {
    let last: unknown = null
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(<Probe onResult={(s) => { last = s }} />)
    })
    const refBefore = last

    // 触发一次与 activeStyle 派生无关的状态更新（error 字段）
    act(() => {
      useOfflineMapStore.setState({ error: 'some-unrelated-error' })
    })

    expect(last).toBe(refBefore)

    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('未激活包时 activeStyle 为 null（占位底图）', () => {
    useOfflineMapStore.setState({ packages: [PKG], activePackageId: null })

    let last: unknown = 'unset'
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(<Probe onResult={(s) => { last = s }} />)
    })

    expect(last).toBeNull()
    expect(container.textContent).toContain('no-style')

    act(() => {
      root.unmount()
    })
    container.remove()
  })
})
