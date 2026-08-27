/**
 * ReturnHomePanel —— 返航面板（底部条第 4 段按钮「返航」）。
 *
 * 结构与起飞面板相同：
 * - 外壳（背景/切角/标题/底部按钮）复用 PanelShell；
 * - 「参数设置 / 飞机列表」tab 栏复用 PanelTabs；
 * - 返航高度：−/+ 步进器复用 HeightStepper（默认 10m，支持手动键入 editable）；
 * - 交互状态流：打开面板即可点「航线生成」（高度默认 10m 有效），
 *   点击「航线生成」画出航线后「确认」解除置灰（confirmMuted 由 HomePage 联动）；
 * - 「确认」回调 onConfirm(height)，「取消」回调 onCancel() 关闭面板。
 */
import { useState } from 'react'
import { PanelShell } from '../PanelShell/PanelShell'
import { PanelTabs, type PanelTab } from '../PanelTabs/PanelTabs'
import { HeightStepper } from '../HeightStepper/HeightStepper'
import {
  AircraftListSection,
  type AircraftListItem,
} from '../AircraftListPanel/AircraftListSection'
import './ReturnHomePanel.css'

export interface ReturnHomePanelProps {
  /** 飞机列表（当前选中飞机），缺省空列表 */
  aircraft?: AircraftListItem[]
  /** 行删除回调（取消选中该机）；传入后行尾图标变为删除按钮 */
  onRemove?: (id: string) => void
  /** 确认返航：携带当前设置的返航高度（米） */
  onConfirm: (height: number) => void
  /** 确认按钮置灰态：未生成返航航线（HomePage returnHomeLine 为空）前置灰，生成后解除 */
  confirmMuted?: boolean
  /** 航线生成：选中飞机 → 上方返航点连线（中间按钮）；面板打开即可点击 */
  onGenerateRoute?: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function ReturnHomePanel({
  aircraft,
  onRemove,
  onConfirm,
  confirmMuted = false,
  onGenerateRoute,
  onCancel,
}: ReturnHomePanelProps) {
  const [tab, setTab] = useState<PanelTab>('params')
  const [height, setHeight] = useState(10)
  // 高度默认 10m 即有效：「航线生成」打开面板即可点击（不再要求先输入高度），
  // 「确认」仍由 HomePage 依据航线连线是否已生成（confirmMuted）解除
  const handleHeightChange = (v: number) => {
    setHeight(v)
  }

  return (
    <PanelShell
      title="返航"
      className="return-home-panel"
      ariaLabel="返航参数面板"
      middleText="航线生成"
      middleMuted={false}
      confirmMuted={confirmMuted}
      onConfirm={() => onConfirm(height)}
      // 航线生成：直接触发（高度默认值有效，不再静默拦截）
      onMiddle={() => onGenerateRoute?.()}
      onCancel={onCancel}
    >
      {/* tab 栏：参数设置（默认选中）/ 飞机列表 */}
      <PanelTabs tab={tab} onChange={setTab} />

      {tab === 'params' ? (
        <div className="return-home-panel__params">
          <HeightStepper
            label="返航高度"
            height={height}
            onChange={handleHeightChange}
            editable
            minusAriaLabel="减小返航高度"
            plusAriaLabel="增大返航高度"
          />
        </div>
      ) : (
        /* Aircraft list tab: shared list section fed by HomePage selected aircraft */
        <div className="return-home-panel__aircraft-list">
          <AircraftListSection
            aircraft={aircraft ?? []}
            showSectionTitle={false}
            onRemove={onRemove}
          />
        </div>
      )}
    </PanelShell>
  )
}