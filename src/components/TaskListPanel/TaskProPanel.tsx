/**
 * @file TaskProPanel.tsx
 * @description TaskProPanel —— 「专业模式」策略配置面板（PRD TSK-P0-03，内嵌于任务管理面板）。 进入路径：任务管理 → 创建任务 → 专业模式（携带创建表单当前任务类型）。 五步流程：策略适配 → 力量编成 → 任务分配 → 航线生成 → 总览。 职责拆分（单一职责）： - ProModel.ts    纯数据与校验（策略默认值/选项/区间、编成 mock、派生函数） - ProIcons.tsx   SVG 遥测图标 - ProSteps.tsx   步骤指示器 + 步骤 1 两类策略表单 - ProListSteps.tsx 步骤 2~5 列表类步骤（编成/分配/航线/总览） - 本文件          流程状态与步骤编排（持有状态、派生校验、步骤切换与底部操作）
 * @author 4everyy
 * @date 2026-10-07
 */
import { useState } from 'react'
import { taskPanelImages } from '../../assets/task-panel'
import { TARGETS, type TaskCreateType } from './TaskCreatePanel'
import {
  AREAS,
  DEFAULT_STRIKE,
  DEFAULT_STRATEGY,
  FORCE_DRONES,
  NUMERIC_RULES,
  PRO_STEPS,
  STRIKE_NUMERIC_RULES,
  numericErrors,
  type ProStrategy,
  type StrikeStrategy,
} from './ProModel'
import { ProStepIndicator, ProStrategyForm, ProStrikeForm } from './ProSteps'
import { ProAssignStep, ProForceStep, ProRoutesStep, ProSummaryStep } from './ProListSteps'
import './TaskProPanel.css'

/** 设计稿切图资源（src/assets/task-panel/） */
const ProIMAGES = {
  backArrow: taskPanelImages.backArrow,
} as const

export interface TaskProPanelProps {
  /** 面板可见性（任务管理面板内嵌切换） */
  visible: boolean
  /** 进入专业模式时携带的任务类型（决定步骤 1 表单：打击任务=目标打击表单） */
  taskType: TaskCreateType
  /** 返回上一步（步骤 1 时触发 / 标题栏返回箭头）：回到创建任务基础信息页，已填数据保留 */
  onBack: () => void
  /** 生成任务（步骤 5 总览确认 / 步骤 1 快速创建）：提交后由父组件按任务类型追加任务 */
  onSubmit: () => void
}

export function TaskProPanel({ visible, taskType, onBack, onSubmit }: TaskProPanelProps) {
  const [step, setStep] = useState(1)
  /** 区域巡检策略参数（进入专业模式期间保留，与目标打击参数互不覆盖） */
  const [strategy, setStrategy] = useState<ProStrategy>(DEFAULT_STRATEGY)
  /** 目标打击策略参数（进入专业模式期间保留，与区域巡检参数互不覆盖） */
  const [strike, setStrike] = useState<StrikeStrategy>(DEFAULT_STRIKE)
  /** 步骤 2 力量编成：勾选的无人机 id 集合（默认编入全部待命机；任务中机不默认编入，仍可手动勾选） */
  const [forceDrones, setForceDrones] = useState<string[]>(() =>
    FORCE_DRONES.filter((d) => !d.disabled && d.status === '待命').map((d) => d.id),
  )
  /** 步骤 3 任务分配：无人机 id → 已勾选目标/任务区 id 列表（未编辑时默认勾选第一项 */
  const [assignMap, setAssignMap] = useState<Record<string, string[]>>({})
  /** 步骤 3 当前展开分配下拉的设备卡片 id（同一时间仅一张卡片的选项层展开） */
  const [openAssign, setOpenAssign] = useState<string | null>(null)

  /** 步骤 1 表单按任务类型二选一展示 */
  const isStrike = taskType === '打击任务'

  /** 数值越界实时派生（负数/超限标红并禁用保存下一步/快速创建） */
  const errors = isStrike
    ? numericErrors(strike, STRIKE_NUMERIC_RULES)
    : numericErrors(strategy, NUMERIC_RULES)
  const hasError = Object.values(errors).some(Boolean)

  const update = <K extends keyof ProStrategy>(key: K, value: ProStrategy[K]) => {
    setStrategy((prev) => ({ ...prev, [key]: value }))
  }

  const updateStrike = <K extends keyof StrikeStrategy>(key: K, value: StrikeStrategy[K]) => {
    setStrike((prev) => ({ ...prev, [key]: value }))
  }

  /** 步骤 2 力量编成：无人机总选与单机切换（置灰机不参与勾选） */
  const enabledDrones = FORCE_DRONES.filter((d) => !d.disabled).map((d) => d.id)
  const toggleAllDrones = () =>
    setForceDrones((prev) =>
      prev.length > 0 && prev.length === enabledDrones.length ? [] : [...enabledDrones],
    )
  const toggleDrone = (id: string) =>
    setForceDrones((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  /** 步骤 3 任务分配：待分配选项（目标打击=目标列表 / 区域巡检=任务区列表） */
  const assignOptions: { id: string; tag: string }[] = isStrike
    ? TARGETS.map((t) => ({ id: t.id, tag: `${t.code}·${t.type}` }))
    : AREAS.map((a, i) => ({ id: a.id, tag: `${String(i + 1).padStart(2, '0')} ${a.name}` }))
  const optionIds = assignOptions.map((o) => o.id)
  const selectedForceDrones = FORCE_DRONES.filter((d) => forceDrones.includes(d.id))

  /** 展示用分配表：无人机 id → 已勾选选项 id 列表（未编辑时默认勾选第一项） */
  const effectiveAssignMap: Record<string, string[]> = {}
  selectedForceDrones.forEach((d) => {
    const cur = (assignMap[d.id] ?? []).filter((id) => optionIds.includes(id))
    effectiveAssignMap[d.id] = cur.length > 0 ? cur : optionIds.length > 0 ? [optionIds[0]!] : []
  })

  /** 勾选/取消某台设备的目标（打击）/任务区（巡检）分配 */
  const toggleAssign = (droneId: string, itemId: string) => {
    const cur = effectiveAssignMap[droneId] ?? []
    setAssignMap((prev) => ({
      ...prev,
      [droneId]: cur.includes(itemId) ? cur.filter((x) => x !== itemId) : [...cur, itemId],
    }))
  }

  /** 自动规划：按设备顺序轮转分配，保证每个目标/任务区仅归属一台设备（模拟按设备类型/状态自动匹配） */
  const handleAutoPlan = () => {
    const n = selectedForceDrones.length
    if (n === 0 || assignOptions.length === 0) return
    const next: Record<string, string[]> = {}
    selectedForceDrones.forEach((d, i) => {
      next[d.id] = assignOptions.filter((_, idx) => idx % n === i).map((o) => o.id)
    })
    setAssignMap(next)
  }

  /** 步骤 2/3 前置校验：未选择无人机时禁用「保存下一步」 */
  const stepInvalid =
    ((step === 2 || step === 3) && forceDrones.length === 0) ||
    (step === 3 && selectedForceDrones.every((d) => (effectiveAssignMap[d.id] ?? []).length === 0))

  /** 保存下一步：参数非法/前置条件不满足时点击无效（PRD 验收 6）；离开当前步骤时收起分配下拉 */
  const handleNext = () => {
    if (hasError || stepInvalid) return
    setOpenAssign(null)
    setStep((s) => Math.min(PRO_STEPS.length, s + 1))
  }

  /** 返回上一步：步骤 1 返回基础信息页（本面板卸载即参数清空） */
  const handlePrev = () => {
    if (step <= 1) onBack()
    else {
      if (step === 3) setAssignMap({})
      setOpenAssign(null)
      setStep((s) => s - 1)
    }
  }

  if (!visible) return null

  return (
    <section
      className={`task-pro${visible ? ' task-pro--visible' : ''}`}
      aria-label="创建任务-专业模式面板"
    >
      {/* ====== 子标题栏：与常规模式创建任务同款（返回箭头 + 标题） ====== */}
      <header className="task-pro__header">
        {/* 返回箭头：点击返回创建任务基础信息页（已填数据保留） */}
        <button type="button" className="task-pro__back" onClick={onBack} aria-label="返回创建任务">
          <img src={ProIMAGES.backArrow} alt="" />
        </button>
        <span className="task-pro__title">创建任务</span>
      </header>

      {/* ====== 步骤指示器（1-5：大号圆点+下方标签；4px 进度条亮蓝至当前步圆心、其后置灰） ====== */}
      <ProStepIndicator step={step} />

      {/* ====== 可滚动内容区（步骤 1 参数配置 / 2 编成 / 3 分配 / 4 航线 / 5 总览） ====== */}
      <div className="task-pro__body">
        {step === 1 && !isStrike && (
          <ProStrategyForm strategy={strategy} errors={errors} onChange={update} />
        )}
        {step === 1 && isStrike && (
          <ProStrikeForm strike={strike} errors={errors} onChange={updateStrike} />
        )}

        {/* ====== 步骤 2 力量编成：无人机遥测列表勾选编成（设计稿：全选栏 + 逐行状态/高度/电量/经纬度） ====== */}
        {step === 2 && (
          <ProForceStep
            selectedIds={forceDrones}
            onToggleDrone={toggleDrone}
            onToggleAll={toggleAllDrones}
          />
        )}

        {/* ====== 步骤 3 任务分配：设备信息 + 任务区/目标合并卡片（434×108 卡片，卡片数=步骤 2 所选设备数） ====== */}
        {step === 3 && (
          <ProAssignStep
            drones={selectedForceDrones}
            options={assignOptions}
            assignMap={effectiveAssignMap}
            onToggleAssign={toggleAssign}
            openId={openAssign}
            onOpenChange={setOpenAssign}
            isStrike={isStrike}
          />
        )}

        {/* ====== 步骤 4 航线生成：按步骤 2 编成无人机逐行展示航线摘要（434×48 白透底行 + 类型胶囊） ====== */}
        {step === 4 && <ProRoutesStep drones={selectedForceDrones} isStrike={isStrike} />}

        {/* ====== 步骤 5 总览：全局统计行 + 编成无人机遥测卡片（434×100，头行 48px 实时遥测） ====== */}
        {step === 5 && <ProSummaryStep drones={selectedForceDrones} />}
      </div>

      {/* ====== 底部操作（设计稿 group_1555：保存下一步 / 快速创建 / 返回上一步；总览页为生成任务） ====== */}
      <footer className="task-pro__footer">
        {step < 5 ? (
          <button
            type="button"
            className="task-pro__btn task-pro__btn--primary"
            disabled={hasError || stepInvalid}
            onClick={handleNext}
          >
            保存下一步
          </button>
        ) : (
          <button
            type="button"
            className="task-pro__btn task-pro__btn--primary"
            onClick={() => onSubmit()}
          >
            完成
          </button>
        )}
        {(step === 1 || step === 4) && (
          <button
            type="button"
            className="task-pro__btn task-pro__btn--outline"
            disabled={hasError || stepInvalid}
            onClick={() => onSubmit()}
          >
            快速创建
          </button>
        )}
        {step === 3 && (
          <button
            type="button"
            className="task-pro__btn task-pro__btn--outline"
            onClick={handleAutoPlan}
          >
            自动规划
          </button>
        )}
        <button type="button" className="task-pro__btn task-pro__btn--outline" onClick={handlePrev}>
          返回上一步
        </button>
      </footer>
    </section>
  )
}