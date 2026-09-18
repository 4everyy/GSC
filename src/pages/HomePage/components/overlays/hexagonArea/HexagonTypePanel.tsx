/**
 * HexagonTypePanel —— 六边形定格后「选择区域类型」面板（2×2 单选 + 确定/取消）。
 *
 * 仅定格态展示：单选切换即时预览六边形填充视觉（父组件低频 setState）；
 * 「确定」写入 store 进入确认态、「取消」清除重画；位置由父组件
 * computeTypePanelPos 计算（六边形右上顶点右侧 8px、右侧空间不足翻转左侧）。
 */
import { AREA_TYPE_OPTIONS } from './constants'

export interface HexagonTypePanelProps {
  /** 面板视口定位（left/top；翻转场景已换算） */
  pos: { left: number; top: number }
  /** 当前选中类型 value（AREA_TYPE_OPTIONS 之一） */
  areaType: string
  /** 单选切换（父组件 setState → 六边形实时预览新类型视觉） */
  onSelect: (type: string) => void
  /** 确定：按 6 顶点经纬度 + 所选类型写入 store，进入确认态 */
  onConfirm: () => void
  /** 取消：清除六边形回到绘制态 */
  onCancel: () => void
}

export function HexagonTypePanel({
  pos,
  areaType,
  onSelect,
  onConfirm,
  onCancel,
}: HexagonTypePanelProps) {
  return (
    <div
      className='hexagon-area-type-panel'
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div className='hexagon-area-type-panel__title'>选择区域类型</div>
      {AREA_TYPE_OPTIONS.map((opt) => {
        const checked = areaType === opt.value
        const radioCls = checked
          ? 'hexagon-area-type-panel__radio hexagon-area-type-panel__radio--on'
          : 'hexagon-area-type-panel__radio'
        return (
          <label
            key={opt.value}
            className='hexagon-area-type-panel__option'
            style={{ left: opt.left, top: opt.top }}
          >
            <span
              className={radioCls}
              style={checked ? { borderColor: opt.color } : undefined}
            >
              {checked && (
                <span
                  className='hexagon-area-type-panel__radio-inner'
                  style={{ background: opt.color }}
                />
              )}
            </span>
            <span className='hexagon-area-type-panel__swatch' style={{ background: opt.color }} />
            <span className='hexagon-area-type-panel__label'>{opt.label}</span>
            <input
              type='radio'
              name='hexagon-area-type'
              value={opt.value}
              checked={checked}
              onChange={() => onSelect(opt.value)}
            />
          </label>
        )
      })}
      <div className='hexagon-area-type-panel__actions'>
        <button type='button' className='hexagon-area-type-panel__btn' onClick={onCancel}>
          取消
        </button>
        <button
          type='button'
          className='hexagon-area-type-panel__btn hexagon-area-type-panel__btn--primary'
          onClick={onConfirm}
        >
          确定
        </button>
      </div>
    </div>
  )
}
