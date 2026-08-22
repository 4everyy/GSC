/**
 * HeightStepper —— 数值设置行（公共组件）。
 *
 * 从 TakeoffPanel 抽取：标签（起飞高度/返航高度/降落速度）+ −/+ 步进器 + 数值框 + 单位（默认 m）。
 * 起飞（TakeoffPanel）/ 返航（ReturnHomePanel）/ 集结（AreaLandingPanel）等参数面板共用。
 * editable 开启后数值框本身即原生输入框（不再嵌套内层 input，点击框内任意位置直接聚焦）：
 * 仅数字键入、实时 clamp 联动 −/+、聚焦全选便于整值覆盖、失焦/回车归一化——
 * 环绕飞行「盘旋高度/盘旋半径」使用。
 */
import { useState } from 'react'
import './HeightStepper.css'

export interface HeightStepperProps {
  /** 行标签，如「起飞高度」「返航高度」「降落速度」 */
  label: string
  /** 当前数值（高度为米，速度为米/秒） */
  height: number
  /** 数值变化（已 clamp） */
  onChange: (height: number) => void
  /** 单位文案，默认「m」（速度场景传「m/s」） */
  unit?: string
  /** 最小值，默认 1 */
  min?: number
  /** 最大值，默认 500 */
  max?: number
  /** 减小按钮无障碍名称 */
  minusAriaLabel?: string
  /** 增大按钮无障碍名称 */
  plusAriaLabel?: string
  /** 数值框可编辑（手动输入数字），默认 false 仅展示 */
  editable?: boolean
}

export function HeightStepper({
  label,
  height,
  onChange,
  unit = 'm',
  min = 1,
  max = 500,
  minusAriaLabel = '减小高度',
  plusAriaLabel = '增大高度',
  editable = false,
}: HeightStepperProps) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))

  /* 聚焦期间的本机草稿：null = 未聚焦，直接展示外部值 height。
   * 草稿不再由 effect 从 height 回写——聚焦键入不会被外部重渲染（半径联动地图、
   * mousemove 等）打断还原；未聚焦时 −/+ 步进与外部联动照常刷新展示。 */
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? String(height)

  /** 失焦/回车提交：有效数字 clamp 后写回，空串忽略（保持原值） */
  const commitDraft = (raw: string) => {
    const n = Number(raw)
    if (raw !== '' && Number.isFinite(n)) onChange(clamp(n))
    setDraft(null)
  }

  /* 宽单位（如 m/s）：加修饰类收紧单位左间距，避免整行超出面板宽度（见 HeightStepper.css） */
  const fieldClassName = `height-stepper__field${unit.length > 2 ? ' height-stepper__field--wide-unit' : ''}`

  return (
    <div className={fieldClassName}>
      <span className="height-stepper__label">{label}</span>
      <button
        type="button"
        className="height-stepper__btn height-stepper__btn--minus"
        aria-label={minusAriaLabel}
        onClick={() => onChange(clamp(height - 1))}
      />
      {editable ? (
        <input
          type="text"
          className="height-stepper__value-box height-stepper__value-box--editable"
          value={shown}
          onFocus={(e) => {
            setDraft(String(height))
            e.target.select() // 聚焦全选：直接键入即整值覆盖
          }}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '') // 仅数字
            setDraft(digits)
            if (digits !== '') onChange(clamp(Number(digits))) // 实时 clamp 联动
          }}
          onBlur={(e) => commitDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          inputMode="numeric"
          autoComplete="off"
          aria-label={`${label}输入`}
          spellCheck={false}
        />
      ) : (
        <div className="height-stepper__value-box">
          <span className="height-stepper__value">{height}</span>
        </div>
      )}
      <button
        type="button"
        className="height-stepper__btn height-stepper__btn--plus"
        aria-label={plusAriaLabel}
        onClick={() => onChange(clamp(height + 1))}
      />
      <span className="height-stepper__unit">{unit}</span>
    </div>
  )
}