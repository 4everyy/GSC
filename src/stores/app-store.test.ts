import { act, renderHook } from '@testing-library/react'
import { useAppStore } from './app-store'

describe('useAppStore', () => {
  it('toggles the sidebar state', () => {
    const { result } = renderHook(() => useAppStore())

    expect(result.current.isSidebarCollapsed).toBe(false)
    act(() => result.current.toggleSidebar())
    expect(result.current.isSidebarCollapsed).toBe(true)
  })
})
