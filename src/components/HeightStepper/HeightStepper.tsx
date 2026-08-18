/**
 * HeightStepper —— 数值设置行（公共组件）。
 *
 * 从 TakeoffPanel 抽取：标签（起飞高度/返航高度/降落速度）+ −/+ 步进器 + 数值框 + 单位（默认 m）。
 * 起飞（TakeoffPanel）/ 返航（ReturnHomePanel）/ 集结（AreaLandingPanel）等参数面板共用。
 */
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
}: HeightStepperProps) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))

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
      <div className="height-stepper__value-box">
        <span className="height-stepper__value">{height}</span>
      </div>
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