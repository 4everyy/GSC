/**
 * 离线地图全局状态 —— React Context + useReducer。
 *
 * 设计依据：docs/离线地图下载方案.md §4（进度通信：React Context + useReducer）。
 *
 * 持有：
 * - dialogOpen：弹窗开关；
 * - tasks：下载任务列表（含运行进度，持久化到 IndexedDB）；
 * - isOffline：navigator.onLine 离线态（驱动地图灰显/提示）；
 * - stats：本地缓存分组统计 + 配额（LocalTab 展示）。
 *
 * 通过 Provider 暴露命令式方法（startDownload/cancelDownload/...），
 * 内部驱动 tileDownload 引擎，并以 AbortController 支持中断（断点续传）。
 */

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'
import {
  clearAllTiles,
  clearAllTasks,
  deleteTask,
  deleteTilesBySource,
  getAllTasks,
  getCacheEstimate,
  getCacheStats,
  putTask,
  requestPersistentStorage,
} from './tileCache'
import {
  contentTypeForBasemap,
  deriveSourceId,
  downloadTiles,
  enumerateTiles,
} from './tileDownload'
import type {
  Basemap,
  BBox,
  CacheGroupStat,
  DownloadTask,
} from './types'

/** 全局状态 */
export interface OfflineMapState {
  /** 弹窗是否打开 */
  dialogOpen: boolean
  /** 下载任务列表 */
  tasks: DownloadTask[]
  /** 是否检测到网络离线 */
  isOffline: boolean
  /** 当前运行中的任务 id（用于进度条与禁用并发） */
  activeTaskId: string | null
  /** 本地缓存分组统计 */
  stats: CacheGroupStat[]
  /** 存储配额（usage/quota，字节） */
  estimate: { usage: number; quota: number }
}

/** 初始状态 */
const initialState: OfflineMapState = {
  dialogOpen: false,
  tasks: [],
  isOffline: false,
  activeTaskId: null,
  stats: [],
  estimate: { usage: 0, quota: 0 },
}

/** reducer 动作 */
type Action =
  | { type: 'OPEN_DIALOG' }
  | { type: 'CLOSE_DIALOG' }
  | { type: 'SET_OFFLINE'; value: boolean }
  | { type: 'SET_TASKS'; tasks: DownloadTask[] }
  | { type: 'UPSERT_TASK'; task: DownloadTask }
  | { type: 'REMOVE_TASK'; id: string }
  | { type: 'SET_ACTIVE'; id: string | null }
  | {
      type: 'SET_STATS'
      stats: CacheGroupStat[]
      estimate: { usage: number; quota: number }
    }

function reducer(state: OfflineMapState, action: Action): OfflineMapState {
  switch (action.type) {
    case 'OPEN_DIALOG':
      return { ...state, dialogOpen: true }
    case 'CLOSE_DIALOG':
      return { ...state, dialogOpen: false }
    case 'SET_OFFLINE':
      return { ...state, isOffline: action.value }
    case 'SET_TASKS':
      return { ...state, tasks: action.tasks }
    case 'UPSERT_TASK': {
      const idx = state.tasks.findIndex((t) => t.id === action.task.id)
      const tasks =
        idx >= 0
          ? state.tasks.map((t) => (t.id === action.task.id ? action.task : t))
          : [...state.tasks, action.task]
      return { ...state, tasks }
    }
    case 'REMOVE_TASK':
      return { ...state, tasks: state.tasks.filter((t) => t.id !== action.id) }
    case 'SET_ACTIVE':
      return { ...state, activeTaskId: action.id }
    case 'SET_STATS':
      return { ...state, stats: action.stats, estimate: action.estimate }
    default:
      return state
  }
}

/** 启动下载所需参数 */
export interface StartDownloadParams {
  basemap: Basemap
  regionName: string
  bbox: BBox
  minZoom: number
  maxZoom: number
  /** 已解析的瓦片 URL 模板（由 tileTemplateResolver 解析） */
  tileUrlTemplate: string
}

/** Context 暴露的命令式 API */
export interface OfflineMapContextValue extends OfflineMapState {
  openDialog: () => void
  closeDialog: () => void
  startDownload: (params: StartDownloadParams) => Promise<string>
  cancelDownload: (taskId: string) => void
  resumeDownload: (taskId: string) => Promise<void>
  removeTask: (taskId: string) => Promise<void>
  deleteCache: (sourceId: string) => Promise<void>
  clearAllCache: () => Promise<void>
  refreshStats: () => Promise<void>
  /** 派生：所有数据源汇总（块数 / 字节 / 数据源个数），供 LocalTab 概览 */
  cacheSummary: {
    totalTiles: number
    totalBytes: number
    sourceCount: number
  }
  /** 派生：浏览器存储配额（无 Storage API 时为 null） */
  storageQuota: { usage: number; quota: number } | null
}

export const OfflineMapContext = createContext<OfflineMapContextValue | null>(
  null,
)

/** 生成任务 id */
function genId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 离线地图全局状态 Provider。
 *
 * 挂载在应用根部（或 HomePage），向下提供离线地图状态与命令。
 */
export function OfflineMapProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // 运行中的 AbortController（按 taskId 索引），支持中断
  const abortControllers = useRef<Map<string, AbortController>>(new Map())
  // 运行中的任务对象引用（避免闭包读到旧 task）
  const runningTasks = useRef<Map<string, DownloadTask>>(new Map())
  // 持久化防抖
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** 持久化任务（防抖批量写入 IndexedDB） */
  const persistTask = useCallback((task: DownloadTask) => {
    runningTasks.current.set(task.id, task)
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      void Promise.all(
        Array.from(runningTasks.current.values()).map((t) => putTask(t)),
      )
    }, 400)
  }, [])

  /** 刷新缓存统计 */
  const refreshStats = useCallback(async () => {
    const [stats, estimate] = await Promise.all([
      getCacheStats(),
      getCacheEstimate(),
    ])
    dispatch({ type: 'SET_STATS', stats, estimate })
  }, [])

  /** 初始化：加载持久化任务 + 首次统计 + 监听在线状态 */
  useEffect(() => {
    void (async () => {
      const tasks = await getAllTasks()
      // 将中断态（downloading）的任务回退为 paused，支持续传
      const restored = tasks.map((t) =>
        t.status === 'downloading' ? { ...t, status: 'paused' as const } : t,
      )
      dispatch({ type: 'SET_TASKS', tasks: restored })
      await refreshStats()
    })()

    const updateOnline = () =>
      dispatch({ type: 'SET_OFFLINE', value: !navigator.onLine })
    updateOnline()
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [refreshStats])

  /** 核心下载循环（供 start/resume 复用） */
  const runDownload = useCallback(
    async (task: DownloadTask) => {
      const controller = new AbortController()
      abortControllers.current.set(task.id, controller)
      dispatch({ type: 'SET_ACTIVE', id: task.id })

      const running: DownloadTask = {
        ...task,
        status: 'downloading',
        updatedAt: Date.now(),
      }
      dispatch({ type: 'UPSERT_TASK', task: running })
      persistTask(running)

      const sourceId = deriveSourceId(task.tileUrlTemplate)
      const coords = enumerateTiles(task.bbox, task.minZoom, task.maxZoom)

      try {
        const snapshot = await downloadTiles(
          coords,
          sourceId,
          task.tileUrlTemplate,
          task.tileContentType,
          {
            signal: controller.signal,
            onProgress: ({ completed, failed, bytes, total }) => {
              const next: DownloadTask = {
                ...running,
                totalTiles: total,
                completedTiles: completed,
                failedTiles: failed,
                bytesDownloaded: bytes,
                updatedAt: Date.now(),
              }
              runningTasks.current.set(next.id, next)
              dispatch({ type: 'UPSERT_TASK', task: next })
            },
          },
        )

        const aborted = !!controller.signal.aborted
        const finalTask: DownloadTask = {
          ...running,
          totalTiles: snapshot.total || running.totalTiles,
          completedTiles: snapshot.completed,
          failedTiles: snapshot.failed,
          bytesDownloaded: snapshot.bytes,
          status: aborted
            ? 'paused'
            : snapshot.failed > 0
              ? 'failed'
              : 'completed',
          error: aborted
            ? undefined
            : snapshot.failed > 0
              ? `${snapshot.failed} 块下载失败`
              : undefined,
          updatedAt: Date.now(),
        }
        dispatch({ type: 'UPSERT_TASK', task: finalTask })
        await putTask(finalTask)
        runningTasks.current.delete(finalTask.id)
        await refreshStats()
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        const failedTask: DownloadTask = {
          ...running,
          status: 'failed',
          error: detail,
          updatedAt: Date.now(),
        }
        dispatch({ type: 'UPSERT_TASK', task: failedTask })
        await putTask(failedTask)
        runningTasks.current.delete(failedTask.id)
      } finally {
        abortControllers.current.delete(task.id)
        dispatch({ type: 'SET_ACTIVE', id: null })
      }
    },
    [persistTask, refreshStats],
  )

  const startDownload = useCallback(
    async (params: StartDownloadParams): Promise<string> => {
      // 请求持久化存储（依据 §6.4，首次下载时请求）
      void requestPersistentStorage()

      const total = enumerateTiles(
        params.bbox,
        params.minZoom,
        params.maxZoom,
      ).length
      const now = Date.now()
      const task: DownloadTask = {
        id: genId(),
        basemap: params.basemap,
        regionName: params.regionName,
        bbox: params.bbox,
        minZoom: params.minZoom,
        maxZoom: params.maxZoom,
        tileUrlTemplate: params.tileUrlTemplate,
        tileContentType: contentTypeForBasemap(params.basemap),
        status: 'pending',
        totalTiles: total,
        completedTiles: 0,
        failedTiles: 0,
        bytesDownloaded: 0,
        createdAt: now,
        updatedAt: now,
      }
      dispatch({ type: 'UPSERT_TASK', task })
      await putTask(task)
      void runDownload(task)
      return task.id
    },
    [runDownload],
  )

  const cancelDownload = useCallback((taskId: string) => {
    const controller = abortControllers.current.get(taskId)
    if (controller) controller.abort()
  }, [])

  const resumeDownload = useCallback(
    async (taskId: string) => {
      const task = state.tasks.find((t) => t.id === taskId)
      if (!task) return
      await runDownload({
        ...task,
        status: 'pending',
        failedTiles: 0,
        error: undefined,
      })
    },
    [runDownload, state.tasks],
  )

  const removeTask = useCallback(async (taskId: string) => {
    const controller = abortControllers.current.get(taskId)
    if (controller) controller.abort()
    await deleteTask(taskId)
    dispatch({ type: 'REMOVE_TASK', id: taskId })
  }, [])

  const deleteCache = useCallback(
    async (sourceId: string) => {
      await deleteTilesBySource(sourceId)
      await refreshStats()
    },
    [refreshStats],
  )

  const clearAllCache = useCallback(async () => {
    // 同时清空 tiles（瓦片数据）与 tasks（下载任务记录）两个 store；
    // 清空后同步 React state（SET_TASKS 置空），使任务列表立即消失，
    // 与 LocalTab「清除所有离线地图缓存及下载任务」确认文案保持一致。
    await clearAllTiles()
    await clearAllTasks()
    dispatch({ type: 'SET_TASKS', tasks: [] })
    await refreshStats()
  }, [refreshStats])

  const openDialog = useCallback(() => dispatch({ type: 'OPEN_DIALOG' }), [])
  const closeDialog = useCallback(() => dispatch({ type: 'CLOSE_DIALOG' }), [])

  const cacheSummary = useMemo(
    () => ({
      totalTiles: state.stats.reduce((sum, s) => sum + s.count, 0),
      totalBytes: state.stats.reduce((sum, s) => sum + s.bytes, 0),
      sourceCount: state.stats.length,
    }),
    [state.stats],
  )

  // storageQuota：仅当浏览器支持 Storage API 且 quota>0 时有意义
  const storageQuota =
    state.estimate.quota > 0
      ? { usage: state.estimate.usage, quota: state.estimate.quota }
      : null

  const value = useMemo<OfflineMapContextValue>(
    () => ({
      ...state,
      openDialog,
      closeDialog,
      startDownload,
      cancelDownload,
      resumeDownload,
      removeTask,
      deleteCache,
      clearAllCache,
      refreshStats,
      cacheSummary,
      storageQuota,
    }),
    [
      state,
      openDialog,
      closeDialog,
      startDownload,
      cancelDownload,
      resumeDownload,
      removeTask,
      deleteCache,
      clearAllCache,
      refreshStats,
      cacheSummary,
      storageQuota,
    ],
  )

  return (
    <OfflineMapContext.Provider value={value}>
      {children}
    </OfflineMapContext.Provider>
  )
}
