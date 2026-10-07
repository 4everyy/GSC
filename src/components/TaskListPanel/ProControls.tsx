/**
 * @file ProControls.tsx
 * @description ProControls —— 专业模式面板通用控件（从 TaskPanels.tsx 抽离，供 TaskProPanel 使用）。 分段选择器 / 四键步进器 / 拨动开关 / 数值过滤工具。
 * @author 4everyy
 * @date 2026-10-07
 */

/** 数值输入：过滤非数字，NaN 归 0 */
export const toNumber = (v: string) => {
  const n = Number(v.replace(/[^\d.-]/g, ''))
  return Number.isNaN(n) ? 0 : n
}

/** 分段选择器（设计稿 group_1555：白透明底胶囊容器 + 蓝底白描边滑块）：支持 2/3 项 */
export function ProSegmented({
  value,
  options,
  onChange,
}: {
  value: string
  options: readonly string[]
  onChange: (v: string) => void
}) {
  const PAD = 2
  const activeIndex = Math.max(0, options.indexOf(value))
  /** 滑块宽 = 等分容器（仅扣两侧 2px 内边距、无项间距），位移 = 索引 × 自身宽… */
  const width = `calc((100% - ${PAD * 2}px) / ${options.length})`
  const offset = `translateX(${activeIndex * 100}%)`
  return (
    <div className="task-pro__segment" role="radiogroup">
      <span
        className="task-pro__segment-indicator"
        style={{ width, transform: offset }}
        aria-hidden="true"
      />
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          role="radio"
          aria-checked={value === opt}
          className={`task-pro__segment-item${value === opt ? ' task-pro__segment-item--active' : ''}`}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

/** 四键步进器（设计稿 group_1555：-10 -1 [值+单位] +1 +10）：按键夹取在合法区间 */
export function ProStepper({
  value,
  min,
  max,
  unit,
  invalid,
  ariaLabel,
  onChange,
}: { 
  value: number
  min: number
  max: number
  unit: string
  /** 越界标红（负数/超限实时反馈） */
  invalid?: boolean
  ariaLabel?: string
  onChange: (v: number) => void
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  return (
    <div className={`task-pro__stepper4${invalid ? ' task-pro__stepper4--error' : ''}`}>
      <button type="button" className="task-pro__stepper4-btn" aria-label={`减少10`} onClick={() => onChange(clamp(value - 10))}>
        -10
      </button>
      <button type="button" className="task-pro__stepper4-btn" aria-label={`减少1`} onClick={() => onChange(clamp(value - 1))}>
        -1
      </button>
      <div className="task-pro__stepper4-value">
        <input
          value={value}
          aria-label={ariaLabel ?? '数值'}
          onChange={(e) => onChange(toNumber(e.target.value))}
        />
        <span className="task-pro__stepper4-unit">{unit}</span>
      </div>
      <button type="button" className="task-pro__stepper4-btn" aria-label={`增加1`} onClick={() => onChange(clamp(value + 1))}>
        +1
      </button>
      <button type="button" className="task-pro__stepper4-btn" aria-label={`增加10`} onClick={() => onChange(clamp(value + 10))}>
        +10
      </button>
    </div>
  )
}

/** 拨动开关（识别开关）：关=灰（#C3C3C3 描边圆点居左）/ 开=青（#55CEDE 白圆点居右） */
export function ProSwitch({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean
  onChange: (on: boolean) => void
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? '开关'}
      className={`task-pro__switch${checked ? ' task-pro__switch--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="task-pro__switch-knob" />
    </button>
  )
}
