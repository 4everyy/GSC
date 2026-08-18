/**
 * TakeoffPanel —— 起飞参数面板。
 *
 * 交互流程（对应设计稿 group_10）：
 * - 底部按钮条点击「起飞」→ 按钮保持弹出状态 + 本面板出现在右上角；
 * - 「参数设置 / 飞机列表」tab 栏复用公共组件 PanelTabs；
 * - 起飞高度：−/+ 步进器复用公共组件 HeightStepper（步长 1m，范围 1~500m）；
 * - 「确认」回调 onConfirm(height)，「取消」回调 onCancel() 关闭面板。
 *
 * 外壳（背景/切角/标题/底部确认取消按钮）复用 PanelShell。
 */
import { useState } from 'react'
import { PanelShell } from '../PanelShell/PanelShell'
import { PanelTabs, type PanelTab } from '../PanelTabs/PanelTabs'
import { HeightStepper } from '../HeightStepper/HeightStepper'
import './TakeoffPanel.css'

export interface TakeoffPanelProps {
  /** 确认起飞：携带当前设置的起飞高度（米） */
  onConfirm: (height: number) => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function TakeoffPanel({ onConfirm, onCancel }: TakeoffPanelProps) {
  const [tab, setTab] = useState<PanelTab>('params')
  const [height, setHeight] = useState(10)

  return (
    <PanelShell
      title="起飞"
      className="takeoff-panel"
      ariaLabel="起飞参数面板"
      onConfirm={() => onConfirm(height)}
      onCancel={onCancel}
    >
      {/* tab 栏：参数设置（默认选中）/ 飞机列表 */}
      <PanelTabs tab={tab} onChange={setTab} />

      {tab === 'params' ? (
        <div className="takeoff-panel__params">
          <HeightStepper
            label="起飞高度"
            height={height}
            onChange={setHeight}
            minusAriaLabel="减小起飞高度"
            plusAriaLabel="增大起飞高度"
          />
        </div>
      ) : (
        /* 飞机列表 tab：占位内容，待机队列表数据接入 */
        <div className="takeoff-panel__aircraft-list">
          <span>待接入</span>
        </div>
      )}
    </PanelShell>
  )
}