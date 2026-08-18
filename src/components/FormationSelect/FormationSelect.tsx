/**
 * FormationSelect —— 队形下拉选择行公共组件（标签居左 + 下拉选择器居右）。
 *
 * 从 RallyPointPanel（集结队形）与 FormationFlightPanel（编队队形）抽取的公共行控件：
 * - 标签 56px 宽（与 HeightStepper 标签一致），下拉框左缘与步进按钮列对齐（label 56 + m-left 16）；
 * - 下拉框白 20% 底 + 60% 白描边，展开菜单深色底，选中项青色高亮；
 * - 受控组件：value/onChange 由父级管理，options 为选项数组。
 */
import { useState } from 'react'
import { deviceImages } from '../../assets/images/device'
import './FormationSelect.css'

export interface FormationSelectProps<T extends string = string> {
  /** 行标签（如「集结队形」「编队队形」） */
  label: string
  /** 选项数组 */
  options: readonly T[]
  /** 当前选中队形 */
  value: T
  /** 选中队形变化 */
  onChange: (value: T) => void
}

export function FormationSelect<T extends string = string>({
  label,
  options,
  value,
  onChange,
}: FormationSelectProps<T>) {
  const [open, setOpen] = useState(false)

  return (
    <div className="formation-select">
      <span className="formation-select__label">{label}</span>
      <div
        className={`formation-select__box${open ? ' formation-select__box--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="formation-select__value">{value}</span>
        <img src={deviceImages.dropdown} alt="" />
        {open && (
          <div className="formation-select__dropdown">
            {options.map((item) => (
              <div
                key={item}
                className={`formation-select__dropdown-item${
                  item === value ? ' formation-select__dropdown-item--active' : ''
                }`}
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(item)
                  setOpen(false)
                }}
              >
                {item}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}