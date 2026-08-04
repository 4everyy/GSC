/**
 * EngineSwitch —— 地图引擎切换按钮。
 *
 * 职责：
 * - 在百度地图（BMap）与 MapLibre 之间切换；
 * - 视觉上与 MapControls 的 2D/图层按钮风格一致（暗色科技风）。
 *
 * 解耦设计：本组件只关心 engineType 与 onSwitch，不感知 Container / adapter，
 * 由父组件（HomePage）通过 useMapEngine 提供状态与切换函数。
 */
import type { MapEngineType } from '../../map-engines'
import './EngineSwitch.css'

interface EngineSwitchProps {
  /** 当前引擎类型 */
  engine: MapEngineType
  /** 切换引擎回调 */
  onSwitch: (engine: MapEngineType) => void
}

/** 引擎显示名 */
const ENGINE_LABELS: Record<MapEngineType, string> = {
  baidu: '百度',
  maplibre: 'MapLibre',
}

export function EngineSwitch({ engine, onSwitch }: EngineSwitchProps) {
  return (
    <div className="engine-switch" role="group" aria-label="地图引擎切换">
      {(Object.keys(ENGINE_LABELS) as MapEngineType[]).map((key) => (
        <button
          key={key}
          type="button"
          className={`engine-switch__btn ${engine === key ? 'is-active' : ''}`}
          onClick={() => onSwitch(key)}
          aria-pressed={engine === key}
        >
          {ENGINE_LABELS[key]}
        </button>
      ))}
    </div>
  )
}