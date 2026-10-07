/**
 * @file ProSteps.tsx
 * @description ProSteps —— 专业模式面板的步骤内容组件（从 TaskProPanel.tsx 抽离）。 按五步流程拆分：策略表单（区域巡检/目标打击）、力量编成列表、任务分配卡片、 航线生成列表、总览统计——每步单一职责、独立变化、props 接口可控。
 * @author 4everyy
 * @date 2026-10-07
 */
import type { CSSProperties } from 'react'
import { taskPanelImages } from '../../assets/task-panel'
import type { NumericErrorMap, ProStrategy } from './ProModel'
import { PRO_OPTIONS, PRO_STEPS } from './ProModel'
import { ProSegmented, ProStepper, ProSwitch } from './ProControls'

/** 设计稿切图资源（src/assets/task-panel/） */
const ProIMAGES = {
  backArrow: taskPanelImages.backArrow,
  check: taskPanelImages.checkIcon,
} as const

/** 步骤指示器（1-5：大号圆点+下方标签；4px 进度条亮蓝至当前步圆心、其后置灰） */
export function ProStepIndicator({ step }: { step: number }) {
  return (
    <div
      className="task-pro__steps"
      aria-label="配置步骤"
      style={
        {
          /* 首末球边距面板 37px → 圆心 53px */
          '--pro-step-pct': `calc(53px + (100% - 106px) * ${(step - 1) * 0.25})`,
        } as CSSProperties
      }
    >
      <span className="task-pro__steps-bar" aria-hidden="true" />
      {PRO_STEPS.map((s) => (
        <span
          key={s.n}
          className={`task-pro__step${step === s.n ? ' task-pro__step--active' : ''}${
            s.n < step ? ' task-pro__step--done' : ''
          }`}
          aria-current={step === s.n ? 'step' : undefined}
        >
          {/* 已完成步骤（当前步之前）：圆点内换白色对勾图标（step-check.svg）替代序号 */}
          <span className="task-pro__step-num">
            {s.n < step ? <img className="task-pro__step-check" src={ProIMAGES.check} alt="" /> : s.n}
          </span>
          <span className="task-pro__step-label">{s.label}</span>
        </span>
      ))}
    </div>
  )
}

/* ==================== 步骤 1·策略适配（区域巡检表单） ==================== */

interface StrategyFormProps {
  strategy: ProStrategy
  errors: NumericErrorMap
  onChange: <K extends keyof ProStrategy>(key: K, value: ProStrategy[K]) => void
}

/** 步骤 1·区域巡检策略表单（设计稿 group_1555 全部字段） */
export function ProStrategyForm({ strategy, errors, onChange }: StrategyFormProps) {
  return (
    <div className="task-pro__form">
      {/* 打击方式 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">打击方式</span>
        <ProSegmented
          value={strategy.strikeMode}
          options={PRO_OPTIONS.strikeMode}
          onChange={(v) => onChange('strikeMode', v)}
        />
      </div>

      {/* 规划方式 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">规划方式</span>
        <ProSegmented
          value={strategy.planMode}
          options={PRO_OPTIONS.planMode}
          onChange={(v) => onChange('planMode', v)}
        />
      </div>

      {/* 区域进入位置 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">区域进入位置</span>
        <ProSegmented
          value={strategy.entryMode}
          options={PRO_OPTIONS.entryMode}
          onChange={(v) => onChange('entryMode', v)}
        />
      </div>

      {/* 分配方式 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">分配方式</span>
        <ProSegmented
          value={strategy.assignMode}
          options={PRO_OPTIONS.assignMode}
          onChange={(v) => onChange('assignMode', v)}
        />
      </div>

      {/* 避让方式 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">避让方式</span>
        <ProSegmented
          value={strategy.avoidMode}
          options={PRO_OPTIONS.avoidMode}
          onChange={(v) => onChange('avoidMode', v)}
        />
      </div>

      {/* 避让距离：避让方式=无时隐去（设计稿红字标注） */}
      {strategy.avoidMode !== '无' && (
        <div className="task-pro__row">
          <span className="task-pro__row-label">避让距离</span>
          <ProStepper
            value={strategy.avoidDist}
            min={0}
            max={1000}
            unit="m"
            invalid={errors.avoidDist}
            ariaLabel="避让距离"
            onChange={(v) => onChange('avoidDist', v)}
          />
        </div>
      )}

      {/* 障碍区准入 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">障碍区准入</span>
        <ProSegmented
          value={strategy.obstacleAccess}
          options={PRO_OPTIONS.obstacleAccess}
          onChange={(v) => onChange('obstacleAccess', v)}
        />
      </div>

      {/* 突防飞行高度 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">突防飞行高度</span>
        <ProStepper
          value={strategy.penHeight}
          min={0}
          max={500}
          unit="m"
          invalid={errors.penHeight}
          ariaLabel="突防飞行高度"
          onChange={(v) => onChange('penHeight', v)}
        />
      </div>

      {/* 突防飞行速度 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">突防飞行速度</span>
        <ProStepper
          value={strategy.penSpeed}
          min={0}
          max={50}
          unit="m/s"
          invalid={errors.penSpeed}
          ariaLabel="突防飞行速度"
          onChange={(v) => onChange('penSpeed', v)}
        />
      </div>

      {/* 突防终点距离目标距离 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">突防终点距离目标距离</span>
        <ProStepper
          value={strategy.penDist}
          min={0}
          max={1000}
          unit="m"
          invalid={errors.penDist}
          ariaLabel="突防终点距离目标距离"
          onChange={(v) => onChange('penDist', v)}
        />
      </div>

      {/* 识别开关 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">识别开关</span>
        <ProSwitch
          checked={strategy.senseSwitch === '开'}
          onChange={(on) => onChange('senseSwitch', on ? '开' : '关')}
          ariaLabel="识别开关"
        />
      </div>
    </div>
  )
}

/* ==================== 步骤 1·策略适配（目标打击表单） ==================== */
/** 步骤1·目标打击策略表单已拆至 ./ProStrikeForm（内聚 InspectTargetsRow）。 */
export { ProStrikeForm } from './ProStrikeForm'
