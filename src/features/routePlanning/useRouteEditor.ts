/**
 * useRouteEditor —— 航线编辑状态管理 hook。
 *
 * 只负责"数据层"：维护一条正在编辑的草稿航线及其统计信息，
 * 提供增删改查、移动、清空等纯数据操作，不依赖地图 SDK。
 *
 * "交互层"（地图点击/拖拽/右键 → 调用这里的操作）由 RouteEditor 组件负责，
 * 这样状态逻辑可独立测试，也便于将来换其它交互载体（如导入文件）。
 */
import { useCallback, useMemo, useState } from 'react'
import { computeRouteStats, createWaypoint } from './routeModel'
import { DEFAULT_ROUTE_COLOR, DEFAULT_ROUTE_SPEED } from './config'
import type { Route, Waypoint } from './types'

/** 草稿航线初始值：空航点，使用默认颜色与速度 */
function createEmptyRoute(): Route {
  return {
    id: `draft-${Date.now().toString(36)}`,
    name: '新建航线',
    color: DEFAULT_ROUTE_COLOR,
    defaultSpeed: DEFAULT_ROUTE_SPEED,
    waypoints: [],
  }
}

export interface UseRouteEditor {
  /** 当前草稿航线（可能航点为空） */
  route: Route
  /** 基于草稿实时计算的统计信息 */
  stats: ReturnType<typeof computeRouteStats>
  /** 在指定坐标追加一个航点（默认 action=pass） */
  addWaypoint: (lng: number, lat: number, partial?: Partial<Waypoint>) => void
  /** 更新指定航点（部分字段） */
  updateWaypoint: (id: string, patch: Partial<Waypoint>) => void
  /** 删除指定航点 */
  removeWaypoint: (id: string) => void
  /** 上移/下移航点（改变飞行顺序），dir: -1 上移 / +1 下移 */
  moveWaypoint: (id: string, dir: -1 | 1) => void
  /** 清空所有航点 */
  clear: () => void
  /** 用一条已有航线替换当前草稿（用于编辑已存在航线） */
  loadRoute: (route: Route) => void
  /** 设置航线元信息（名称/颜色/速度） */
  setMeta: (patch: Partial<Pick<Route, 'name' | 'color' | 'defaultSpeed'>>) => void
}

export function useRouteEditor(initial?: Route): UseRouteEditor {
  const [route, setRoute] = useState<Route>(initial ?? createEmptyRoute)

  const addWaypoint = useCallback((lng: number, lat: number, partial?: Partial<Waypoint>) => {
    setRoute((prev) => ({
      ...prev,
      waypoints: [...prev.waypoints, createWaypoint(lng, lat, partial)],
    }))
  }, [])

  const updateWaypoint = useCallback((id: string, patch: Partial<Waypoint>) => {
    setRoute((prev) => ({
      ...prev,
      waypoints: prev.waypoints.map((wp) => (wp.id === id ? { ...wp, ...patch } : wp)),
    }))
  }, [])

  const removeWaypoint = useCallback((id: string) => {
    setRoute((prev) => ({
      ...prev,
      waypoints: prev.waypoints.filter((wp) => wp.id !== id),
    }))
  }, [])

  const moveWaypoint = useCallback((id: string, dir: -1 | 1) => {
    setRoute((prev) => {
      const idx = prev.waypoints.findIndex((wp) => wp.id === id)
      const target = idx + dir
      if (idx < 0 || target < 0 || target >= prev.waypoints.length) return prev
      const next = [...prev.waypoints]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...prev, waypoints: next }
    })
  }, [])

  const clear = useCallback(() => {
    setRoute((prev) => ({ ...prev, waypoints: [] }))
  }, [])

  const loadRoute = useCallback((next: Route) => {
    setRoute(next)
  }, [])

  const setMeta = useCallback(
    (patch: Partial<Pick<Route, 'name' | 'color' | 'defaultSpeed'>>) => {
      setRoute((prev) => ({ ...prev, ...patch }))
    },
    [],
  )

  const stats = useMemo(() => computeRouteStats(route), [route])

  return { route, stats, addWaypoint, updateWaypoint, removeWaypoint, moveWaypoint, clear, loadRoute, setMeta }
}