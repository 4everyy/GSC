/**
 * ReturnHomePanel —— 返航面板（底部条第 4 段按钮「返航」）。
 *
 * 结构与起飞面板相同：
 * - 外壳（背景/切角/标题/底部按钮）复用 PanelShell；
 * - 「参数设置 / 飞机列表」tab 栏复用 PanelTabs；
 * - 返航高度：−/+ 步进器复用 HeightStepper（默认 10m）；
 * - 「确认」回调 onConfirm(height)，「取消」回调 onCancel() 关闭面板。
 */
import { useState } from 'react'
import { PanelShell } from '../PanelShell/PanelShell'
import { PanelTabs, type PanelTab } from '../PanelTabs/PanelTabs'
import { HeightStepper } from '../HeightStepper/HeightStepper'
import './ReturnHomePanel.css'

export interface ReturnHomePanelProps {
  /** 确认返航：携带当前设置的返航高度（米） */
  onConfirm: (height: number) => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function ReturnHomePanel({ onConfirm, onCancel }: ReturnHomePanelProps) {
  const [tab, setTab] = useState<PanelTab>('params')
  const [height, setHeight] = useState(10)

  return (
    <PanelShell
      title="返航"
      className="return-home-panel"
      ariaLabel="返航参数面板"
      onConfirm={() => onConfirm(height)}
      onCancel={onCancel}
    >
      {/* tab 栏：参数设置（默认选中）/ 飞机列表 */}
      <PanelTabs tab={tab} onChange={setTab} />

      {tab === 'params' ? (
        <div className="return-home-panel__params">
          <HeightStepper
            label="返航高度"
            height={height}
            onChange={setHeight}
            minusAriaLabel="减小返航高度"
            plusAriaLabel="增大返航高度"
          />
        </div>
      ) : (
        /* 飞机列表 tab：占位内容，待机队列表数据接入 */
        <div className="return-home-panel__aircraft-list">
          <span>待接入</span>
        </div>
      )}
    </PanelShell>
  )
}
