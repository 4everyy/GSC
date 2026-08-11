import { useEffect, useState } from 'react'
import { homeImages } from '../../assets/images/home'
import { useDistanceMeasure } from '../../hooks/useDistanceMeasure'
import type { MapAdapter } from '../../map-engines'
import { LayerControlPanel } from '../LayerControlPanel/LayerControlPanel'
import './MapControls.css'

/**
 * 测距模式自定义光标（内联 SVG data URI）。
 *
 * 设计稿参考蓝湖标注：十字准线 + 测距标尺样式。
 * 使用 32×32 SVG，热点位于中心 (16,16)，回退到 crosshair。
 * PNG 远程资源（lanhu-oss）为内网设计稿，离线不可达，故内联 SVG 替代。
 */
const MEASURE_CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <g fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round">
    <circle cx="16" cy="16" r="7"/>
    <line x1="16" y1="3" x2="16" y2="9"/>
    <line x1="16" y1="23" x2="16" y2="29"/>
    <line x1="3" y1="16" x2="9" y2="16"/>
    <line x1="23" y1="16" x2="29" y2="16"/>
    <circle cx="16" cy="16" r="1.6" fill="#ffffff" stroke="none"/>
  </g>
</svg>`

const MEASURE_CURSOR = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  MEASURE_CURSOR_SVG,
)}") 16 16, crosshair`

/** MapControls 组件属性 */
interface MapControlsProps {
  /** 地图适配器，用于缩放控制（引擎无关） */
  adapter?: MapAdapter | null
}

export function MapControls({ adapter }: MapControlsProps) {
  // 图层控制面板显隐状态（点击图层按钮切换）
  const [layerPanelVisible, setLayerPanelVisible] = useState(false)
  // 测距工具（标记/折线/距离计算均在 hook 内管理）
  const measure = useDistanceMeasure({ adapter: adapter ?? null })

  // 测距模式光标切换：激活时设置自定义光标，退出时恢复默认
  useEffect(() => {
    if (!adapter) return
    if (measure.active) {
      adapter.setDefaultCursor(MEASURE_CURSOR)
    } else {
      adapter.setDefaultCursor('')
    }
    // 组件卸载或 adapter 变化时恢复默认光标
    return () => {
      adapter.setDefaultCursor('')
    }
  }, [measure.active, adapter])

  // 动态提示文案：多段连续测距，每次点击延伸一段
  const hintText =
    measure.points.length === 0
      ? '点击地图选择起点'
      : `总距离 ${formatDistanceLocal(measure.totalDistance)} · 继续点击添加点`

  return (
    <>
      {/* 图层控制面板：紧贴图层按钮左侧展开 */}
      <LayerControlPanel visible={layerPanelVisible} />

      {/* 测距模式顶部提示条 */}
      {measure.active && (
        <div className="measure-hint" role="status">
          {hintText}
          {measure.points.length > 0 && (
            <button
              type="button"
              className="measure-hint__btn"
              onClick={measure.undo}
              title="撤销上一个点"
            >
              撤销
            </button>
          )}
        </div>
      )}

      <aside className="view-controls">
        <button
          type="button"
          aria-label="测距"
          className={measure.active ? 'active' : undefined}
          aria-pressed={measure.active}
          onClick={measure.toggle}
        >
          <img src={homeImages.iconMeasure} alt="测距" />
        </button>
        <button type="button">2D</button>
        <button
          type="button"
          className={layerPanelVisible ? 'active' : undefined}
          onClick={() => setLayerPanelVisible((prev) => !prev)}
          aria-pressed={layerPanelVisible}
          aria-label="图层控制"
        >
          <img src={homeImages.iconLayer} alt="图层" />
        </button>
      </aside>
      <aside className="zoom-controls">
        <button type="button" onClick={() => adapter?.zoomIn()} disabled={!adapter}>
          <img src={homeImages.iconZoomIn} alt="放大" />
        </button>
        <button type="button" onClick={() => adapter?.zoomOut()} disabled={!adapter}>
          <img src={homeImages.iconZoomOut} alt="缩小" />
        </button>
      </aside>
    </>
  )
}

// 本地格式化（避免引入 hook 内部导出污染）
function formatDistanceLocal(meters: number): string {
  if (meters < 1000) return `${meters.toFixed(0)} 米`
  return `${(meters / 1000).toFixed(2)} 公里`
}