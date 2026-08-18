/**
 * RallyPointPanel —— 集结点面板（底部条第 11 段按钮「集结点」）。
 *
 * 结构与区域降落/环绕飞行面板相同（最大化复用公共组件）：
 * - 外壳（背景/切角/标题/底部按钮）复用 PanelShell，确认按钮为设计稿置灰态（confirmMuted）；
 * - 「参数设置 / 飞机列表」tab 栏复用 PanelTabs；
 * - 参数设置 tab：起飞高度 −/+ 步进器复用 HeightStepper（单位 m，默认 10，1~500）
 *   + 集结速度步进器（单位 m/s，默认 10，1~20）
 *   + 集结队形下拉选择行复用 FormationSelect（标签居左、选择器居右，默认「人字形」）；
 * - 飞机列表 tab：复用 AircraftListSection（区块头 + 列表行，与降落面板共用）；
 * - 底部「确认（灰）/ 航线生成 / 取消」三按钮（middleText 三按钮布局）。
 */
import { useState } from 'react'
import { PanelShell } from '../PanelShell/PanelShell'
import { PanelTabs, type PanelTab } from '../PanelTabs/PanelTabs'
import { HeightStepper } from '../HeightStepper/HeightStepper'
import { AircraftListSection } from '../AircraftListPanel/AircraftListSection'
import { FormationSelect } from '../FormationSelect/FormationSelect'
import './RallyPointPanel.css'

/** 集结队形选项（默认「人字形」，其余为常见队形，待指令链路确认后调整） */
const FORMATIONS = ['人字形', '一字型', '三角型'] as const
export type RallyPointFormation = (typeof FORMATIONS)[number]

export interface RallyPointPanelProps {
  /** 确认集结：携带当前设置的起飞高度（m）、集结速度（m/s）与所选队形 */
  onConfirm: (height: number, speed: number, formation: RallyPointFormation) => void
  /** 航线生成（暂记录日志，待接入真实指令链路） */
  onGenerateRoute: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function RallyPointPanel({
  onConfirm,
  onGenerateRoute,
  onCancel,
}: RallyPointPanelProps) {
  const [tab, setTab] = useState<PanelTab>('params')
  const [height, setHeight] = useState(10)
  const [speed, setSpeed] = useState(10)
  const [formation, setFormation] = useState<RallyPointFormation>('人字形')

  return (
    <PanelShell
      title="集结点"
      className="rally-point-panel"
      ariaLabel="集结点参数面板"
      confirmMuted
      middleText="航线生成"
      onConfirm={() => onConfirm(height, speed, formation)}
      onMiddle={onGenerateRoute}
      onCancel={onCancel}
    >
      {/* tab 栏：参数设置（默认选中）/ 飞机列表 */}
      <PanelTabs tab={tab} onChange={setTab} />

      {tab === 'params' ? (
        <div className="rally-point-panel__params">
          <HeightStepper
            label="起飞高度"
            height={height}
            onChange={setHeight}
            unit="m"
            minusAriaLabel="减小起飞高度"
            plusAriaLabel="增大起飞高度"
          />
          <HeightStepper
            label="集结速度"
            height={speed}
            onChange={setSpeed}
            unit="m/s"
            min={1}
            max={20}
            minusAriaLabel="减小集结速度"
            plusAriaLabel="增大集结速度"
          />
          {/* 集结队形：标签居左、下拉选择器居右（公共 FormationSelect 组件） */}
          <FormationSelect
            label="集结队形"
            options={FORMATIONS}
            value={formation}
            onChange={setFormation}
          />
        </div>
      ) : (
        /* 飞机列表 tab：复用飞机列表区块 */
        <AircraftListSection />
      )}
    </PanelShell>
  )
}