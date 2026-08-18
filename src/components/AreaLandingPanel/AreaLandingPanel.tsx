/**
 * AreaLandingPanel —— 区域降落面板（底部条第 6 段按钮「区域降落」）。
 *
 * 结构与起飞/返航面板相同（最大化复用公共组件）：
 * - 外壳（背景/切角/标题/底部按钮）复用 PanelShell，确认按钮为设计稿置灰态（confirmMuted）；
 * - 「参数设置 / 飞机列表」tab 栏复用 PanelTabs；
 * - 参数设置 tab：降落速度 −/+ 步进器复用 HeightStepper（单位 m/s，默认 10，1~20）
 *   + 降落编队下拉选择器（设计稿 group_11：标签居左、选择器居右，默认「一字型」）；
 * - 飞机列表 tab：复用 AircraftListSection（区块头 + 列表行，与降落面板共用）；
 * - 底部「确认（灰）/ 航线生成 / 取消」三按钮（middleText 三按钮布局）。
 */
import { useState } from 'react'
import { PanelShell } from '../PanelShell/PanelShell'
import { PanelTabs, type PanelTab } from '../PanelTabs/PanelTabs'
import { HeightStepper } from '../HeightStepper/HeightStepper'
import { AircraftListSection } from '../AircraftListPanel/AircraftListSection'
import { deviceImages } from '../../assets/images/device'
import './AreaLandingPanel.css'

/** 降落编队选项（设计稿默认「一字型」，其余为常见队形，待指令链路确认后调整） */
const FORMATIONS = ['一字型', '三角型', '环形'] as const
export type AreaLandingFormation = (typeof FORMATIONS)[number]

export interface AreaLandingPanelProps {
  /** 确认区域降落：携带当前设置的降落速度（m/s）与所选编队 */
  onConfirm: (speed: number, formation: AreaLandingFormation) => void
  /** 航线生成（暂记录日志，待接入真实指令链路） */
  onGenerateRoute: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function AreaLandingPanel({
  onConfirm,
  onGenerateRoute,
  onCancel,
}: AreaLandingPanelProps) {
  const [tab, setTab] = useState<PanelTab>('params')
  const [speed, setSpeed] = useState(10)
  const [formation, setFormation] = useState<AreaLandingFormation>('一字型')
  const [formationOpen, setFormationOpen] = useState(false)

  return (
    <PanelShell
      title="区域降落"
      className="area-landing-panel"
      ariaLabel="区域降落参数面板"
      confirmMuted
      middleText="航线生成"
      onConfirm={() => onConfirm(speed, formation)}
      onMiddle={onGenerateRoute}
      onCancel={onCancel}
    >
      {/* tab 栏：参数设置（默认选中）/ 飞机列表 */}
      <PanelTabs tab={tab} onChange={setTab} />

      {tab === 'params' ? (
        <div className="area-landing-panel__params">
          <HeightStepper
            label="降落速度"
            height={speed}
            onChange={setSpeed}
            unit="m/s"
            min={1}
            max={20}
            minusAriaLabel="减小降落速度"
            plusAriaLabel="增大降落速度"
          />
          {/* 降落编队（设计稿 group_11）：标签居左、下拉选择器居右（justify-between） */}
          <div className="area-landing-panel__formation">
            <span className="area-landing-panel__formation-label">降落编队</span>
            <div
              className={`area-landing-panel__select${
                formationOpen ? ' area-landing-panel__select--open' : ''
              }`}
              onClick={() => setFormationOpen((v) => !v)}
            >
              <span className="area-landing-panel__select-value">{formation}</span>
              <img src={deviceImages.dropdown} alt="" />
              {formationOpen && (
                <div className="area-landing-panel__dropdown">
                  {FORMATIONS.map((item) => (
                    <div
                      key={item}
                      className={`area-landing-panel__dropdown-item${
                        item === formation ? ' area-landing-panel__dropdown-item--active' : ''
                      }`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setFormation(item)
                        setFormationOpen(false)
                      }}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* 飞机列表 tab：复用降落面板的飞机列表区块 */
        <AircraftListSection />
      )}
    </PanelShell>
  )
}