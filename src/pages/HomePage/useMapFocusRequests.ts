/**
 * @file useMapFocusRequests.ts
 * @description useMapFocusRequests（自 HomePage 拆出）—— 面板行勾选 → 地图平滑飞转编排。 三类请求信号（deviceLinkStore.mapFocusDeviceRequest / targetLinkStore.mapFocusTargetRequest / taskAreaStore.areaFocusRequest）出现即消费（读锚点/边界 → flyTo/fitBounds → 清除信号）， 与页面其余状态无关（独立变化），统一收口避免 HomePage 副作用堆积。
 * @author 4everyy
 * @date 2026-10-07
 */
import { useEffect } from 'react'
import { type MapAdapter } from '../../map-engines/types'
import { useDeviceLinkStore, useTaskAreaStore, useLayerStore } from '../../stores/index'
import { useTargetLinkStore } from '../../stores/targetLinkStore'
import { getAreaBounds } from '../../components/home/zones/TaskAreaLayer'
import {
  MAP_FOCUS_ZOOM,
  MAP_FOCUS_FLY_DURATION_MS,
  AREA_FOCUS_PADDING,
  AREA_FOCUS_MAX_ZOOM,
} from '../../lib/formationLayout'

/** 面板单选聚焦：设备/目标面板单行勾上时地图平滑飞转到对应图标锚点全选/全不选走整体替换；区域列表行复选框勾选联动 fitBounds */
export function useMapFocusRequests(
  adapter: MapAdapter | null,
  getAircraftAnchor: (index: number) => { lng: number; lat: number } | null,
) {
  // 设备面板行 → 飞转飞机锚点
  const mapFocusDeviceRequest = useDeviceLinkStore((s) => s.mapFocusDeviceRequest)
  const clearMapFocusDeviceRequest = useDeviceLinkStore((s) => s.clearMapFocusDeviceRequest)
  useEffect(() => {
    if (!adapter || !mapFocusDeviceRequest) return
    const anchor = getAircraftAnchor(mapFocusDeviceRequest.index)
    clearMapFocusDeviceRequest()
    if (!anchor) return
    adapter.flyTo(anchor, {
      zoom: Math.max(adapter.getZoom(), MAP_FOCUS_ZOOM),
      duration: MAP_FOCUS_FLY_DURATION_MS,
    })
  }, [adapter, mapFocusDeviceRequest, getAircraftAnchor, clearMapFocusDeviceRequest])

  // 目标面板行 → 飞转目标锚点（存于 store，TargetMarkerLayer 初始化/拖拽后更新），按 id 读取
  const mapFocusTargetRequest = useTargetLinkStore((s) => s.mapFocusTargetRequest)
  const clearMapFocusTargetRequest = useTargetLinkStore((s) => s.clearMapFocusTargetRequest)
  useEffect(() => {
    if (!adapter || !mapFocusTargetRequest) return
    const anchor = useTargetLinkStore.getState().targetAnchors[mapFocusTargetRequest.id]
    clearMapFocusTargetRequest()
    if (!anchor) return
    adapter.flyTo(anchor, {
      zoom: Math.max(adapter.getZoom(), MAP_FOCUS_ZOOM),
      duration: MAP_FOCUS_FLY_DURATION_MS,
    })
  }, [adapter, mapFocusTargetRequest, clearMapFocusTargetRequest])

  // 区域列表行复选框勾选联动聚焦：区域处于显示状态（「任务区域」图层开启 且未被行内眼睛/批量显示隐藏）时
  const areaFocusRequest = useTaskAreaStore((s) => s.areaFocusRequest)
  const clearAreaFocusRequest = useTaskAreaStore((s) => s.clearAreaFocusRequest)
  useEffect(() => {
    if (!adapter || !areaFocusRequest) return
    const { id } = areaFocusRequest
    clearAreaFocusRequest()
    // 双重校验：请求发出后图层关闭/区域隐藏/被删则放弃聚焦（态势图无对应渲染）
    if (!useLayerStore.getState().taskAreaVisible) return
    const s = useTaskAreaStore.getState()
    const area = s.areas.find((a) => a.id === id)
    if (!area || s.hiddenIds.has(id)) return
    adapter.fitBounds(getAreaBounds(area), {
      padding: AREA_FOCUS_PADDING,
      maxZoom: AREA_FOCUS_MAX_ZOOM,
      duration: MAP_FOCUS_FLY_DURATION_MS,
    })
  }, [adapter, areaFocusRequest, clearAreaFocusRequest])
}