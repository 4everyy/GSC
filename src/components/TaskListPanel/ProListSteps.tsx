/**
 * @file ProListSteps.tsx
 * @description ProListSteps —— 专业模式面板步骤 2~5 的列表类步骤组件（从 TaskProPanel.tsx 抽离）。 - ProForceStep  力量编成（步骤 2） - ProAssignStep 任务分配卡片（步骤 3） - ProRoutesStep 航线生成列表（步骤 4） - ProSummaryStep 总览遥测卡片（步骤 5） 每个组件单一职责、props 接口可控（≤7），与主控面板解耦、可独立变化。
 * @author 4everyy
 * @date 2026-10-07
 */
import type { ForceDrone } from './ProModel'
import { FORCE_DRONES, forceStatusMod } from './ProModel'
import {
  AssignChevronIcon,
  ForceAltitudeIcon,
  ForceBatteryIcon,
  ForceDroneIcon,
  StatClockIcon,
  StatRouteIcon,
} from './ProIcons'

/** 步骤 3 分配选项（目标打击=目标列表 / 区域巡检=任务区列表 映射而来） */
export interface AssignOption {
  id: string
  tag: string
}

/* ==================== 步骤 2·力量编成 ==================== */

interface ProForceStepProps {
  /** 已编入无人机 id 集合 */
  selectedIds: string[]
  /** 勾选/取消勾选某架无人机 */
  onToggleDrone: (id: string) => void
  /** 全选/清空（三态复选框） */
  onToggleAll: () => void
}

/** 步骤 2·力量编成：全选栏 + 无人机遥测列表逐行勾选编成 */
export function ProForceStep({ selectedIds, onToggleDrone, onToggleAll }: ProForceStepProps) {
  const allDrones = selectedIds.length === FORCE_DRONES.length
  const someDrones = selectedIds.length > 0 && !allDrones

  return (
    <div className="task-pro__force">
      {/* 全选栏：三态复选框 + 文案 */}
      <div className="task-pro__force-all">
        <button
          type="button"
          role="checkbox"
          aria-checked={allDrones ? true : someDrones ? 'mixed' : false}
          aria-label="全选无人机"
          className={[
            'task-pro__tri',
            allDrones ? 'task-pro__tri--checked' : '',
            someDrones ? 'task-pro__tri--mixed' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={onToggleAll}
        >
          <span className="task-pro__tri-mark" aria-hidden="true" />
        </button>
        <span className="task-pro__force-all-label">全选</span>
      </div>

      {/* 无人机行：复选框 + 机图标 + 名称 + 状态点文案 + 高度 + 电量 + 经纬度 */}
      <ul className="task-pro__force-list">
        {FORCE_DRONES.map((d) => (
          <ForceDroneRow
            key={d.id}
            drone={d}
            checked={selectedIds.includes(d.id)}
            onToggle={() => onToggleDrone(d.id)}
          />
        ))}
      </ul>
      {selectedIds.length === 0 && (
        <p className="task-pro__hint">请至少选择一架无人机后再进入下一步</p>
      )}
    </div>
  )
}

/** 力量编成单行（复选框 16 + 机图标 24 组合首列 + 遥测各列） */
function ForceDroneRow({
  drone: d,
  checked,
  onToggle,
}: {
  drone: ForceDrone
  checked: boolean
  onToggle: () => void
}) {
  const lowBatt = d.battery < 20
  return (
    <li className="task-pro__force-item">
      {/* 复合首列：复选框(16) + 间距(8) + 机图标(24) = 48px，列内 flex gap 显式控制
          「复选框→图标」间距精确 8px，与网格 gap 求解/图片透明边无关 */}
      <span className="task-pro__force-lead">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={`编入 ${d.name}`}
          disabled={d.disabled}
          className={`task-pro__force-check${checked ? ' task-pro__force-check--checked' : ''}`}
          onClick={onToggle}
        >
          <span className="task-pro__force-check-mark" aria-hidden="true" />
        </button>
        <ForceDroneIcon />
      </span>
      <span className="task-pro__force-name">{d.name}</span>
      <span className={`task-pro__force-status${forceStatusMod(d.status)}`}>
        <i className="task-pro__force-status-dot" aria-hidden="true" />
        {d.status}
      </span>
      <span className="task-pro__force-alt">
        <ForceAltitudeIcon />
        {d.altitude}m
      </span>
      <span className={`task-pro__force-batt${lowBatt ? ' task-pro__force-batt--low' : ''}`}>
        <ForceBatteryIcon level={d.battery} low={lowBatt} />
        {d.battery}%
      </span>
      <span className="task-pro__force-geo">
        <span>经度:{d.lon}</span>
        <span>纬度:{d.lat}</span>
      </span>
    </li>
  )
}

/* ==================== 步骤 3·任务分配 ==================== */

interface ProAssignStepProps {
  /** 已编入的无人机（来自步骤 2） */
  drones: ForceDrone[]
  /** 待分配选项（目标打击=目标 / 区域巡检=任务区） */
  options: AssignOption[]
  /** 无人机 id → 已勾选选项 id 列表 */
  assignMap: Record<string, string[]>
  /** 勾选/取消某个分配项 */
  onToggleAssign: (droneId: string, itemId: string) => void
  /** 展开状态（当前展开的无人机 id；null=全部收起） */
  openId: string | null
  /** 展开/收起某台无人机的下拉 */
  onOpenChange: (id: string | null) => void
  /** 目标打击模式（文案用：目标 / 任务区） */
  isStrike: boolean
}

/** 步骤 3·任务分配：设备信息 + 任务区/目标合并卡片（434×108 卡片，卡片数=步骤 2 所选设备数） */
export function ProAssignStep({
  drones,
  options,
  assignMap,
  onToggleAssign,
  openId,
  onOpenChange,
  isStrike,
}: ProAssignStepProps) {
  return (
    <div className="task-pro__assign">
      {drones.map((d) => (
        <AssignCard
          key={d.id}
          drone={d}
          options={options}
          assigned={assignMap[d.id] ?? []}
          open={openId === d.id}
          isStrike={isStrike}
          onToggleItem={(itemId) => onToggleAssign(d.id, itemId)}
          onToggleOpen={() => onOpenChange(openId === d.id ? null : d.id)}
        />
      ))}
      {drones.length === 0 && (
        <p className="task-pro__hint">请返回步骤二选择无人机后再进行任务分配</p>
      )}
    </div>
  )
}

/** 任务分配单卡：行 1 设备遥测（复用步骤 2 行内元素样式）+ 行 2 分配勾选栏与下拉多选 */
function AssignCard({
  drone: d,
  options,
  assigned,
  open,
  isStrike,
  onToggleItem,
  onToggleOpen,
}: {
  drone: ForceDrone
  options: AssignOption[]
  assigned: string[]
  open: boolean
  isStrike: boolean
  onToggleItem: (itemId: string) => void
  onToggleOpen: () => void
}) {
  const lowBatt = d.battery < 20
  return (
    <article className="task-pro__assign-card" aria-label={`${d.name} 分配卡片`}>
      {/* 行 1：设备遥测（图标/名称/状态/高度/电量/经纬度，复用步骤 2 行内元素样式） */}
      <div className="task-pro__assign-head">
        <ForceDroneIcon />
        <span className="task-pro__force-name">{d.name}</span>
        <span className={`task-pro__force-status${forceStatusMod(d.status)}`}>
          <i className="task-pro__force-status-dot" aria-hidden="true" />
          {d.status}
        </span>
        <span className="task-pro__force-alt">
          <ForceAltitudeIcon />
          {d.altitude}m
        </span>
        <span className={`task-pro__force-batt${lowBatt ? ' task-pro__force-batt--low' : ''}`}>
          <ForceBatteryIcon level={d.battery} low={lowBatt} />
          {d.battery}%
        </span>
        <span className="task-pro__force-geo">
          <span>经度:{d.lon}</span>
          <span>纬度:{d.lat}</span>
        </span>
      </div>

      {/* 行 2：分配勾选栏（已选标签横向滑动 + 右侧箭头展开下拉多选） */}
      <div className="task-pro__assign-barwrap">
        <div className="task-pro__assign-bar">
          <div className="task-pro__assign-tags">
            {assigned.length === 0 && <span className="task-pro__assign-empty">未分配</span>}
            {assigned.map((id) => {
              const opt = options.find((o) => o.id === id)
              if (!opt) return null
              return (
                <button
                  type="button"
                  key={id}
                  className="task-pro__assign-tag"
                  aria-label={`取消分配 ${opt.tag}`}
                  title={`点击取消 ${opt.tag}`}
                  onClick={() => onToggleItem(id)}
                >
                  <span className="task-pro__tri task-pro__tri--checked" aria-hidden="true">
                    <span className="task-pro__tri-mark" />
                  </span>
                  <span className="task-pro__assign-tag-text">{opt.tag}</span>
                </button>
              )
            })}
          </div>
          <button
            type="button"
            className={`task-pro__assign-arrow${open ? ' task-pro__assign-arrow--open' : ''}`}
            aria-expanded={open}
            aria-label={`${d.name} 展开${isStrike ? '目标' : '任务区'}选项`}
            onClick={onToggleOpen}
          >
            <AssignChevronIcon />
          </button>
        </div>

        {/* 下拉选项：复选框 + 编号名称胶囊，过多自动换行（PRD 验收 4） */}
        {open && (
          <div className="task-pro__assign-drop" role="group" aria-label="分配选项列表">
            {options.map((o) => {
              const checked = assigned.includes(o.id)
              return (
                <button
                  type="button"
                  key={o.id}
                  role="checkbox"
                  aria-checked={checked}
                  className={`task-pro__assign-opt${checked ? ' task-pro__assign-opt--checked' : ''}`}
                  onClick={() => onToggleItem(o.id)}
                >
                  <span
                    className={`task-pro__tri${checked ? ' task-pro__tri--checked' : ''}`}
                    aria-hidden="true"
                  >
                    <span className="task-pro__tri-mark" />
                  </span>
                  <span className="task-pro__assign-tag-text">{o.tag}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </article>
  )
}

/* ==================== 步骤 4·航线生成 ==================== */

interface ProRoutesStepProps {
  /** 已编入的无人机（按步骤 2 勾选顺序） */
  drones: ForceDrone[]
  /** 目标打击模式（打击/侦查文案与胶囊配色） */
  isStrike: boolean
}

/** 步骤 4·航线生成：逐行展示航线摘要（434×48 白透底行 + 右侧打击橙/侦查青类型胶囊） */
export function ProRoutesStep({ drones, isStrike }: ProRoutesStepProps) {
  return (
    <ul className="task-pro__routes">
      {drones.map((d, i) => (
        <li className="task-pro__route" key={d.id} aria-label={`${d.name} 航线摘要`}>
          <ForceDroneIcon />
          <span className="task-pro__route-name">{d.name}</span>
          <span className="task-pro__route-line">
            {String(i + 1).padStart(2, '0')}
            {isStrike ? '打击航线' : '侦查航线'}
          </span>
          <span className="task-pro__route-meta">时间:12min</span>
          <span className="task-pro__route-meta">长度:12km</span>
          <span className={`task-pro__route-tag${isStrike ? ' task-pro__route-tag--strike' : ''}`}>
            {isStrike ? '打击' : '侦查'}
          </span>
        </li>
      ))}
      {drones.length === 0 && (
        <p className="task-pro__hint">请返回步骤二选择无人机后再生成航线</p>
      )}
    </ul>
  )
}

/* ==================== 步骤 5·总览 ==================== */

/** 步骤 5·总览：全局统计行 + 编成无人机遥测卡片（434×100，头行 48px 实时遥测） */
export function ProSummaryStep({ drones }: { drones: ForceDrone[] }) {
  return (
    <div className="task-pro__summary">
      {/* 全局统计行（设计稿步骤五）：预计总完成时间 / 飞行总长，与步骤 4 演示数据 12min·12km/机联动 */}
      <div className="task-pro__stats">
        <span className="task-pro__stat">
          <StatClockIcon />
          <span className="task-pro__stat-label">预计总完成时间：</span>
          <span className="task-pro__stat-value">{drones.length * 12}分钟</span>
        </span>
        <span className="task-pro__stat">
          <StatRouteIcon />
          <span className="task-pro__stat-label">飞行总长：</span>
          <span className="task-pro__stat-value">
            {String(drones.length * 12).padStart(3, '0')}km
          </span>
        </span>
      </div>

      {/* 编成无人机遥测卡片（设计稿步骤五）：每台无人机 434×100 卡片，头行 48px 实时遥测 */}
      <div className="task-pro__ov-list">
        {drones.map((d) => (
          <OverviewCard key={d.id} drone={d} />
        ))}
      </div>
    </div>
  )
}

/** 总览单卡：头行遥测（图标/名称/状态/高度/电量/经纬度） */
function OverviewCard({ drone: d }: { drone: ForceDrone }) {
  const lowBatt = d.battery < 20
  const midBatt = !lowBatt && d.battery <= 60
  return (
    <div className="task-pro__ov-card">
      <div className="task-pro__ov-head">
        <ForceDroneIcon />
        <span className="task-pro__ov-name">{d.name}</span>
        <span
          className={`task-pro__ov-status${d.status === '任务中' ? ' task-pro__ov-status--busy' : ''}`}
        >
          <i className="task-pro__ov-status-dot" aria-hidden="true" />
          {d.status}
        </span>
        <span className="task-pro__ov-alt">
          <ForceAltitudeIcon />
          {d.altitude}m
        </span>
        <span className={`task-pro__ov-batt${lowBatt ? ' task-pro__ov-batt--low' : ''}`}>
          <ForceBatteryIcon level={d.battery} low={lowBatt} mid={midBatt} />
          {d.battery}%
        </span>
        <span className="task-pro__ov-geo">
          <span>经度:{d.lon}</span>
          <span>纬度:{d.lat}</span>
        </span>
      </div>
    </div>
  )
}