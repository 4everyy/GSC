/**
 * @file FollowSettingsPanel.tsx
 * @description Follow/track/strike settings panel extracted from VideoMonitorPage.tsx.
 * @author 4everyy
 * @date 2026-10-07
 */
import { useState } from 'react'
import { type VideoChannel } from './videoMonitorData'
import { IconChevron } from './VideoMonitorIcons'

/* ---------------- 目标跟随参数设置面板（底部操作条「跟随」展开） ---------------- */

/** 跟随方位选项（按设计稿四段：自动 | 左后 | 右后 | 右后） */
const FOLLOW_DIRS = ['自动', '左后', '右后', '右后'] as const

/** 目标类型显示名（对应 videoMonitorData.ts 的 kind 字段） */
const TARGET_KIND_LABELS: Record<'person' | 'vehicle', string> = {
  person: '人员',
  vehicle: '车辆',
}

/** 目标下拉选项：画面检测目标优先，无目标时回退设计稿样例「人员 | P-102」 */
function buildTargetOptions(channel: VideoChannel): { id: string; label: string }[] {
  if (channel.targets.length) {
    return channel.targets.map((t) => ({
      id: t.id,
      label: `${TARGET_KIND_LABELS[t.kind]} | ${t.targetId}`,
    }))
  }
  return [{ id: 'sample', label: '人员 | P-102' }]
}

/** 跟随数值步进器：-1(43×28) / 数值输入(93×28)+m / +1（按设计稿还原） */
function FollowStepper({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  const clamp = (n: number) => Math.min(9999, Math.max(0, n))
  return (
    <div className="vm-follow-field">
      <div className="vm-follow-label">{label}</div>
      <div className="vm-follow-stepper">
        <button
          type="button"
          className="vm-follow-step-btn"
          onClick={() => onChange(clamp(value - 1))}
        >
          -1
        </button>
        <div className="vm-follow-step-input">
          <input
            className="vm-follow-input"
            type="text"
            inputMode="numeric"
            aria-label={`${label}（米）`}
            value={value}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value.trim(), 10)
              onChange(Number.isNaN(n) ? 0 : clamp(n))
            }}
          />
          <span className="vm-follow-unit">m</span>
        </div>
        <button
          type="button"
          className="vm-follow-step-btn"
          onClick={() => onChange(clamp(value + 1))}
        >
          +1
        </button>
      </div>
    </div>
  )
}

/**
 * 目标参数设置面板（按设计稿还原，标题随操作变化）：跟踪→「目标跟踪参数设置」/ 跟随→「目标跟随参数设置」/ 打击→「目标打击参数设置」+
 * 目标ID（下拉）/ 跟随距离 / 跟随高度（-1/数值/+1 步进，单位 m）/
 * 跟随方位（自动|左后|右后|右后 四段）/ 确认（文案随打开面板的操作按钮变化）/ 取消；
 * 确认与取消均收起面板（接真实指令链路后在此下发跟随/打击命令）。
 * 注：页面锁定时面板会被直接收起（锁定即禁一切操作），故面板内部无需感知锁定。
 */
export function FollowSettingsPanel({
  channel,
  title,
  confirmLabel,
  onClose,
}: {
  channel: VideoChannel
  /** 面板标题：目标跟踪参数设置 / 目标跟随参数设置 / 目标打击参数设置（随操作按钮变化） */
  title: string
  /** 确认按钮文案：确认跟踪 / 确认跟随 / 确认打击（随打开面板的操作按钮变化） */
  confirmLabel: string
  onClose: () => void
}) {
  /** 目标ID 下拉展开态 */
  const [idOpen, setIdOpen] = useState(false)
  const targetOptions = buildTargetOptions(channel)
  const [selectedTarget, setSelectedTarget] = useState(targetOptions[0])
  /** 跟随距离 / 跟随高度（米），默认 10 */
  const [distance, setDistance] = useState(10)
  const [height, setHeight] = useState(10)
  /** 跟随方位选中段（0=自动 默认选中，白底黑字） */
  const [dirIndex, setDirIndex] = useState(0)

  return (
    <div className="vm-follow">
      <div className="vm-follow-title">{title}</div>
      <div className="vm-follow-body">
        {/* 目标ID */}
        <div className="vm-follow-field vm-follow-field--id">
          <div className="vm-follow-label">目标ID</div>
          <button
            type="button"
            className="vm-follow-id-toggle"
            aria-expanded={idOpen}
            aria-label={`选择目标ID，当前 ${selectedTarget.label}`}
            onClick={() => setIdOpen((v) => !v)}
          >
            <span className="vm-follow-id-value">{selectedTarget.label}</span>
            <span className={`vm-follow-id-arrow ${idOpen ? 'vm-follow-id-arrow--up' : ''}`}>
              <IconChevron size={14} />
            </span>
          </button>
          {idOpen && (
            <div className="vm-follow-id-list" role="listbox" aria-label="目标ID 列表">
              {targetOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={opt.id === selectedTarget.id}
                  className={`vm-follow-id-item ${opt.id === selectedTarget.id ? 'vm-follow-id-item--active' : ''}`}
                  onClick={() => {
                    setSelectedTarget(opt)
                    setIdOpen(false)
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 跟随距离 / 跟随高度 */}
        <FollowStepper label="跟随距离" value={distance} onChange={setDistance} />
        <FollowStepper label="跟随高度" value={height} onChange={setHeight} />

        {/* 跟随方位 */}
        <div className="vm-follow-field vm-follow-field--dir">
          <div className="vm-follow-label">跟随方位</div>
          <div className="vm-follow-dir" role="radiogroup" aria-label="跟随方位">
            {FOLLOW_DIRS.map((d, i) => (
              <button
                key={`dir-${i}`}
                type="button"
                role="radio"
                aria-checked={dirIndex === i}
                className={`vm-follow-dir-item ${dirIndex === i ? 'vm-follow-dir-item--active' : ''}`}
                onClick={() => setDirIndex(i)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* 确认（文案随操作变化）/ 取消：均收起面板（接真实指令链路后在此下发命令） */}
        <div className="vm-follow-actions">
          <button type="button" className="vm-follow-btn vm-follow-btn--primary" onClick={onClose}>
            {confirmLabel}
          </button>
          <button type="button" className="vm-follow-btn vm-follow-btn--ghost" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
