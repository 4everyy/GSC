/**
 * @file ProStrikeForm.tsx
 * @description ProStrikeForm（自 ProSteps.tsx 拆出）—— 步骤1·目标打击策略表单（设计稿步骤一全部字段）， 含内聚的巡检对象行 InspectTargetsRow。与巡检表单独立变化（单一职责/独立变化）， props 仅 strike/errors/onChange（接口可控）。
 * @author 4everyy
 * @date 2026-10-07
 */
import type { NumericErrorMap, StrikeStrategy } from './ProModel'
import { INSPECT_TARGET_OPTIONS, STRIKE_OPTIONS } from './ProModel'
import { ProSegmented, ProStepper, ProSwitch } from './ProControls'

interface StrikeFormProps {
  strike: StrikeStrategy
  errors: NumericErrorMap
  onChange: <K extends keyof StrikeStrategy>(key: K, value: StrikeStrategy[K]) => void
}

/** 步骤 1·目标打击策略表单（设计稿步骤一全部字段） */
export function ProStrikeForm({ strike, errors, onChange }: StrikeFormProps) {
  return (
    <div className="task-pro__form">
      {/* 巡检对象：总选三态 + 人/车可选、船/装备置灰（设计稿默认态） */}
      <InspectTargetsRow strike={strike} onChange={onChange} />

      {/* 仿地高度 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">仿地高度</span>
        <ProStepper
          value={strike.terrainHeight}
          min={0}
          max={1000}
          unit="m"
          invalid={errors.terrainHeight}
          ariaLabel="仿地高度"
          onChange={(v) => onChange('terrainHeight', v)}
        />
      </div>

      {/* 巡航速度 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">巡航速度</span>
        <ProStepper
          value={strike.cruiseSpeed}
          min={0}
          max={200}
          unit="m/s"
          invalid={errors.cruiseSpeed}
          ariaLabel="巡航速度"
          onChange={(v) => onChange('cruiseSpeed', v)}
        />
      </div>

      {/* 航线间隔 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">航线间隔</span>
        <ProStepper
          value={strike.routeGap}
          min={0}
          max={1000}
          unit="m"
          invalid={errors.routeGap}
          ariaLabel="航线间隔"
          onChange={(v) => onChange('routeGap', v)}
        />
      </div>

      {/* 旁向重叠率 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">旁向重叠率</span>
        <ProStepper
          value={strike.sideOverlap}
          min={0}
          max={100}
          unit="%"
          invalid={errors.sideOverlap}
          ariaLabel="旁向重叠率"
          onChange={(v) => onChange('sideOverlap', v)}
        />
      </div>

      {/* 巡检转动作 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">巡检转动作</span>
        <ProSegmented
          value={strike.inspectAction}
          options={STRIKE_OPTIONS.inspectAction}
          onChange={(v) => onChange('inspectAction', v)}
        />
      </div>

      {/* 白夜模式 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">白夜模式</span>
        <ProSegmented
          value={strike.dayNight}
          options={STRIKE_OPTIONS.dayNight}
          onChange={(v) => onChange('dayNight', v)}
        />
      </div>

      {/* 规划方式 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">规划方式</span>
        <ProSegmented
          value={strike.planMode}
          options={STRIKE_OPTIONS.planMode}
          onChange={(v) => onChange('planMode', v)}
        />
      </div>

      {/* 区域进入位置 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">区域进入位置</span>
        <ProSegmented
          value={strike.entryMode}
          options={STRIKE_OPTIONS.entryMode}
          onChange={(v) => onChange('entryMode', v)}
        />
      </div>

      {/* 分割方式 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">分割方式</span>
        <ProSegmented
          value={strike.splitMode}
          options={STRIKE_OPTIONS.splitMode}
          onChange={(v) => onChange('splitMode', v)}
        />
      </div>

      {/* 区域个数 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">区域个数</span>
        <ProStepper
          value={strike.areaCount}
          min={1}
          max={999}
          unit="个"
          invalid={errors.areaCount}
          ariaLabel="区域个数"
          onChange={(v) => onChange('areaCount', v)}
        />
      </div>

      {/* 切分方向 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">切分方向</span>
        <ProSegmented
          value={strike.splitDir}
          options={STRIKE_OPTIONS.splitDir}
          onChange={(v) => onChange('splitDir', v)}
        />
      </div>

      {/* 分配方式 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">目标打击分配方式</span>
        <ProSegmented
          value={strike.assignMode}
          options={STRIKE_OPTIONS.assignMode}
          onChange={(v) => onChange('assignMode', v)}
        />
      </div>

      {/* 避让方式 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">避让方式</span>
        <ProSegmented
          value={strike.avoidMode}
          options={STRIKE_OPTIONS.avoidMode}
          onChange={(v) => onChange('avoidMode', v)}
        />
      </div>

      {/* 避让距离：避让方式=无时隐去（与区域巡检表单一致） */}
      {strike.avoidMode !== '无' && (
        <div className="task-pro__row">
          <span className="task-pro__row-label">避让距离</span>
          <ProStepper
            value={strike.avoidDist}
            min={0}
            max={1000}
            unit="m"
            invalid={errors.avoidDist}
            ariaLabel="避让距离"
            onChange={(v) => onChange('avoidDist', v)}
          />
        </div>
      )}

      {/* 集结方式 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">集结方式</span>
        <ProSegmented
          value={strike.rallyMode}
          options={STRIKE_OPTIONS.rallyMode}
          onChange={(v) => onChange('rallyMode', v)}
        />
      </div>

      {/* 障碍区准入 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">障碍区准入</span>
        <ProSegmented
          value={strike.obstacleAccess}
          options={STRIKE_OPTIONS.obstacleAccess}
          onChange={(v) => onChange('obstacleAccess', v)}
        />
      </div>

      {/* 突防飞行高度 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">突防飞行高度</span>
        <ProStepper
          value={strike.penHeight}
          min={0}
          max={1000}
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
          value={strike.penSpeed}
          min={0}
          max={200}
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
          value={strike.penDist}
          min={0}
          max={1000}
          unit="m"
          invalid={errors.penDist}
          ariaLabel="突防终点距离目标距离"
          onChange={(v) => onChange('penDist', v)}
        />
      </div>

      {/* 编队方式 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">编队方式</span>
        <ProSegmented
          value={strike.formationMode}
          options={STRIKE_OPTIONS.formationMode}
          onChange={(v) => onChange('formationMode', v)}
        />
      </div>

      {/* 补位方式 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">补位方式</span>
        <ProSegmented
          value={strike.fillMode}
          options={STRIKE_OPTIONS.fillMode}
          onChange={(v) => onChange('fillMode', v)}
        />
      </div>

      {/* 编队队形（4 项分段） */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">编队队形</span>
        <ProSegmented
          value={strike.formationShape}
          options={STRIKE_OPTIONS.formationShape}
          onChange={(v) => onChange('formationShape', v)}
        />
      </div>

      {/* 是否启用编队 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">是否启用编队</span>
        <ProSwitch
          checked={strike.formationEnabled}
          onChange={(on) => onChange('formationEnabled', on)}
          ariaLabel="是否启用编队"
        />
      </div>

      {/* 识别开关 */}
      <div className="task-pro__row">
        <span className="task-pro__row-label">识别开关</span>
        <ProSwitch
          checked={strike.senseSwitch}
          onChange={(on) => onChange('senseSwitch', on)}
          ariaLabel="识别开关"
        />
      </div>
    </div>
  )
}

/** 巡检对象行（总选三态 + 人/车可选、船/装备置灰；从 ProStrikeForm 内聚拆出） */
function InspectTargetsRow({
  strike,
  onChange,
}: {
  strike: StrikeStrategy
  onChange: <K extends keyof StrikeStrategy>(key: K, value: StrikeStrategy[K]) => void
}) {
  /** 巡检对象总选三态：按可选项（人/车）派生，点击在全选/清空间切换 */
  const enabledTargets = INSPECT_TARGET_OPTIONS.filter((o) => !o.disabled).map((o) => o.key)
  const checkedTargetCount = enabledTargets.filter((k) => strike.inspectTargets.includes(k)).length
  const allTargets = checkedTargetCount === enabledTargets.length
  const someTargets = checkedTargetCount > 0 && !allTargets
  const toggleAllTargets = () =>
    onChange('inspectTargets', allTargets ? [] : [...enabledTargets])

  return (
    <div className="task-pro__row">
      <span className="task-pro__row-label task-pro__row-label--inline">
        巡检对象
        <button
          type="button"
          role="checkbox"
          aria-checked={allTargets ? true : someTargets ? 'mixed' : false}
          aria-label="全选巡检对象"
          className={[
            'task-pro__tri',
            allTargets ? 'task-pro__tri--checked' : '',
            someTargets ? 'task-pro__tri--mixed' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={toggleAllTargets}
        >
          <span className="task-pro__tri-mark" aria-hidden="true" />
        </button>
      </span>
      <div className="task-pro__chips">
        {INSPECT_TARGET_OPTIONS.map((opt) => {
          const checked = strike.inspectTargets.includes(opt.key)
          return (
            <button
              key={opt.key}
              type="button"
              role="checkbox"
              aria-checked={checked}
              disabled={opt.disabled}
              className={`task-pro__chip${checked ? ' task-pro__chip--checked' : ''}`}
              onClick={() =>
                onChange(
                  'inspectTargets',
                  checked
                    ? strike.inspectTargets.filter((x) => x !== opt.key)
                    : [...strike.inspectTargets, opt.key],
                )
              }
            >
              <span className="task-pro__chip-box" aria-hidden="true" />
              <span className="task-pro__chip-text">{opt.key}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

