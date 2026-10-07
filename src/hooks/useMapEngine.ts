/**
 * @file useMapEngine.ts
 * @description useMapEngine.ts（自 hooks/index.ts 拆出）—— 地图引擎实例状态管理 Hook + 首帧数据加载 Hooks （usePlaneStatusInit / useTaskAreaInit）。单一职责：引擎就绪与一次性初始化。
 * @author 4everyy
 * @date 2026-10-07
 */
import { useCallback, useState, useEffect } from 'react'
import { type MapEngineInstance } from '../map-engines/index'
import { usePlaneStatusStore, useTaskAreaStore } from '../stores/index'

/** useMapEngine —— 地图引擎状态管理 Hook。 */

export function useMapEngine() {
  const [engineInstance, setEngineInstance] = useState<MapEngineInstance | null>(
    null,
  )

  /** Container onReady 回调：注入新引擎实例 */
  const handleEngineReady = useCallback((instance: MapEngineInstance) => {
    setEngineInstance(instance)
  }, [])

  return {
    /** 当前引擎实例（可能为 null：初始化中） */
    engineInstance,
    /** 适配器（engineInstance?.adapter 的简写） */
    adapter: engineInstance?.adapter ?? null,
    /** Container onReady 绑定此回调 */
    onEngineReady: handleEngineReady,
  }
}

/** 无人机状态一次性加载 Hook —— MainApp 挂载一次 */

/** 模块级标记：本次会话内已发起过加载则不再请求 */
let initialized = false

export function usePlaneStatusInit(): void {
  useEffect(() => {
    if (!initialized) {
      initialized = true
      void usePlaneStatusStore.getState().refresh()
    }
  }, [])
}

/** 任务区域一次性加载 Hook —— MainApp 挂载一次，拉取/api/v1/control/queryTaskAreaList 首帧写… */

/** 模块级标记：本次会话内已发起过任务区域加载则不再请求 */
let taskAreaInitialized = false

export function useTaskAreaInit(): void {
  useEffect(() => {
    if (!taskAreaInitialized) {
      taskAreaInitialized = true
      void useTaskAreaStore.getState().refresh()
    }
  }, [])
}
