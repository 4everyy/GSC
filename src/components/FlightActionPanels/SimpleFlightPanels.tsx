/**
 * @file SimpleFlightPanels.tsx
 * @description 起飞 / 返航 / 降落面板 —— 自 FlightActionPanels.tsx 拆出。
 * @author 4everyy
 * @date 2026-10-07
 */
import { useState } from 'react'
import { PanelShell, PanelTabs, type PanelTab, HeightStepper } from '../PanelKit/PanelKit'
import { AircraftListSection, type AircraftListItem, AircraftListPanel } from '../AircraftListPanel/AircraftListPanel'

export type { AircraftListItem }

export interface TakeoffPanelProps {
  /** 飞机列表：HomePage 依据选中设备计算（名称真实，遥测暂取配置值） */
  aircraft?: AircraftListItem[]
  /** 行删除回调（取消选中该机）；传入后行尾显示删除图标 */
  onRemove?: (id: string) => void
  /** 确认起飞：携带当前设置的起飞高度（米） */
  onConfirm: (height: number) => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function TakeoffPanel({ aircraft, onRemove, onConfirm, onCancel }: TakeoffPanelProps) {
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
            editable
            max={Number.MAX_SAFE_INTEGER}
            minusAriaLabel="减小起飞高度"
            plusAriaLabel="增大起飞高度"
          />
        </div>
      ) : (
        /* 飞机列表 tab：与降落面板同款列表（展示当前选中飞机） */
        <div className="takeoff-panel__aircraft-list">
          <AircraftListSection aircraft={aircraft ?? []} showSectionTitle={false} onRemove={onRemove} />
        </div>
      )}
    </PanelShell>
  )
}

/** ReturnHomePanel —— 返航面板（底部条第 4 段按钮「返航」）。 */

export interface ReturnHomePanelProps {
  /** 飞机列表（当前选中飞机），缺省空列表 */
  aircraft?: AircraftListItem[]
  /** 行删除回调（取消选中该机）；传入后行尾图标变为删除按钮 */
  onRemove?: (id: string) => void
  /** 确认返航：携带当前设置的返航高度（米） */
  onConfirm: (height: number) => void
  /** 确认按钮置灰态：未生成返航航线（HomePage returnHomeLine 为空）前置灰 */
  confirmMuted?: boolean
  /** 「航线生成」中间按钮置灰态：点击生成航线后置灰（统一交互：生成后不可重复点击），默认 false */
  middleMuted?: boolean
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
  middleMuted = false,
  onGenerateRoute,
  onCancel,
}: ReturnHomePanelProps) {
  const [tab, setTab] = useState<PanelTab>('params')
  const [height, setHeight] = useState(10)
  // 高度默认 10m 即有效：「航线生成」打开面板即可点击（不再要求先输入高度）
  const handleHeightChange = (v: number) => {
    setHeight(v)
  }

  return (
    <PanelShell
      title="返航"
      className="return-home-panel"
      ariaLabel="返航参数面板"
      middleText="航线生成"
      middleMuted={middleMuted}
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
            max={Number.MAX_SAFE_INTEGER}
            minusAriaLabel="减小返航高度"
            plusAriaLabel="增大返航高度"
          />
        </div>
      ) : (
        /* shared list section fed by H… */
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
export type LandingAircraft = AircraftListItem

export interface LandingPanelProps {
  /** 飞机列表，缺省使用设计稿示例数据 */
  aircraft?: LandingAircraft[]
  /** 行删除回调（取消选中该机）；传入后行尾显示删除图标 */
  onRemove?: (id: string) => void
  /** 确认降落 */
  onConfirm: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function LandingPanel({ aircraft, onRemove, onConfirm, onCancel }: LandingPanelProps) {
  return (
    <AircraftListPanel
      title="降落"
      className="landing-panel"
      aircraft={aircraft}
      onRemove={onRemove}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
