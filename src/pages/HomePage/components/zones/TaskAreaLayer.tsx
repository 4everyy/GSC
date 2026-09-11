/**
 * TaskAreaLayer —— 任务区域图层（真实后端数据）。
 *
 * 数据源：POST /api/v1/control/queryTaskAreaList（taskAreaStore 一次加载）。
 * 渲染：每个区域一个多边形（类型主题色填充+描边）+ 质心名称标签（胶囊样式）。
 * 挂载即触发 load()（status='idle' 时）；卸载清理全部覆盖物。
 * 显隐由 layerStore.taskAreaVisible 控制（HomePage 条件渲染，本组件不感知）。
 */
import { useEffect } from 'react'
import type { MapAdapter } from '../../../../map-engines/types'
import { useTaskAreaStore } from '../../../../stores/taskAreaStore'
import { taskAreaTypeMeta, type TaskArea } from '../../../../api/taskArea'

/** 覆盖物 id 前缀（隔离命名空间，避免与业务图层冲突） */
const POLYGON_ID_PREFIX = 'task-area-polygon-'
const LABEL_ID_PREFIX = 'task-area-label-'

/** 多边形质心（顶点均值；任务区域范围小，均值近似即可） */
function polygonCentroid(area: TaskArea): { lng: number; lat: number } {
  let lng = 0
  let lat = 0
  for (const v of area.vertices) {
    lng += v.longitude
    lat += v.latitude
  }
  const n = area.vertices.length
  return { lng: lng / n, lat: lat / n }
}

/** 构建名称标签 DOM（深色胶囊 + 类型色描边；pointer-events 关闭避免挡地图交互） */
function buildLabelElement(area: TaskArea): HTMLElement {
  const meta = taskAreaTypeMeta(area.type)
  const el = document.createElement('div')
  el.textContent = `${meta.label}·${area.name}`
  el.style.padding = '2px 8px'
  el.style.fontSize = '12px'
  el.style.lineHeight = '18px'
  el.style.color = '#fff'
  el.style.background = 'rgba(0, 0, 0, 0.6)'
  el.style.border = `1px solid ${meta.color}`
  el.style.borderRadius = '999px'
  el.style.whiteSpace = 'nowrap'
  el.style.pointerEvents = 'none'
  return el
}

interface TaskAreaLayerProps {
  /** 地图引擎适配器（未就绪时不渲染） */
  adapter: MapAdapter | null
}

export function TaskAreaLayer({ adapter }: TaskAreaLayerProps) {
  const areas = useTaskAreaStore((s) => s.areas)
  const status = useTaskAreaStore((s) => s.status)
  const load = useTaskAreaStore((s) => s.load)

  // 首次挂载触发拉取（store 已 ready 时不重复请求）
  useEffect(() => {
    if (status === 'idle') void load()
  }, [status, load])

  // 区域数据就绪后绘制多边形 + 标签；areas/adapter 变化时全量重绘（先清理旧的）
  useEffect(() => {
    if (!adapter || status !== 'ready') return

    for (const area of areas) {
      const meta = taskAreaTypeMeta(area.type)
      adapter.addPolygon(
        `${POLYGON_ID_PREFIX}${area.id}`,
        area.vertices.map((v) => ({ lng: v.longitude, lat: v.latitude })),
        {
          fillColor: meta.color,
          fillOpacity: 0.12,
          strokeColor: meta.color,
          strokeWeight: 1.5,
          strokeOpacity: 0.9,
        },
      )
      adapter.addMarker(`${LABEL_ID_PREFIX}${area.id}`, polygonCentroid(area), {
        element: buildLabelElement(area),
      })
    }

    return () => {
      for (const area of areas) {
        adapter.removePolygon(`${POLYGON_ID_PREFIX}${area.id}`)
        adapter.removeMarker(`${LABEL_ID_PREFIX}${area.id}`)
      }
    }
  }, [adapter, areas, status])

  return null
}