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
import {
  AircraftListSection,
  type AircraftListItem,
} from '../AircraftListPanel/AircraftListSection'
import { deviceImages } from '../../assets/images/device'
import './AreaLandingPanel.css'

/** 降落编队选项（设计稿默认「一字型」，其余为常见队形，待指令链路确认后调整） */
const FORMATIONS = ['一字型', '三角型', '环形'] as const
export type AreaLandingFormation = (typeof FORMATIONS)[number]

export interface AreaLandingPanelProps {
  /** 确认区域降落：携带当前设置的降落速度（m/s）与所选编队 */
  aircraft?: AircraftListItem[]
  onRemove?: (id: string) => void
  onConfirm: (speed: number, formation: AreaLandingFormation) => void
  /** 航线生成（暂记录日志，待接入真实指令链路） */
  onGenerateRoute: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
  /* ---- 受控状态（可选）：父层持有可在面板收起/重开间保留已设置信息 ---- */
  /** 当前 tab（params=参数设置 / list=飞机列表） */
  tab?: PanelTab
  onTabChange?: (tab: PanelTab) => void
  /** 降落速度（m/s） */
  speed?: number
  onSpeedChange?: (speed: number) => void
  /** 降落编队 */
  formation?: AreaLandingFormation
  onFormationChange?: (formation: AreaLandingFormation) => void
  /** 选区四角经纬度（WGS84，框选确认后由父层计算）：参数 tab「区域信息」实时显示 */
  corners?: { lat: number; lng: number }[] | null
  /** 「航线生成」置灰态：未确定降落区域前置灰，区域框选「确定」后解禁可点击 */
  routeMuted?: boolean
  /** 「确认」置灰态：默认置灰，航线生成成功后由父层解除（传 false） */
  confirmMuted?: boolean
}

export function AreaLandingPanel({
  aircraft,
  onRemove,
  onConfirm,
  onGenerateRoute,
  onCancel,
  tab: tabProp,
  onTabChange,
  speed: speedProp,
  onSpeedChange,
  formation: formationProp,
  onFormationChange,
  corners,
  routeMuted,
  confirmMuted = true,
}: AreaLandingPanelProps) {
  // 内部兜底状态：父层未传受控 props 时使用；传了则以 props 为准
  const [innerTab, setInnerTab] = useState<PanelTab>('params')
  const [innerSpeed, setInnerSpeed] = useState(10)
  const [innerFormation, setInnerFormation] = useState<AreaLandingFormation>('一字型')
  const [formationOpen, setFormationOpen] = useState(false)
  const tab = tabProp ?? innerTab
  const setTab = onTabChange ?? setInnerTab
  const speed = speedProp ?? innerSpeed
  const setSpeed = onSpeedChange ?? setInnerSpeed
  const formation = formationProp ?? innerFormation
  const setFormation = onFormationChange ?? setInnerFormation

  return (
    <PanelShell
      title="区域降落"
      className="area-landing-panel"
      ariaLabel="区域降落参数面板"
      confirmMuted={confirmMuted}
      middleText="航线生成"
      middleMuted={routeMuted}
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
          {/* 区域信息：框选确认后实时显示选区四角经纬度（蓝色分割线分隔降落编队行） */}
          {corners && corners.length > 0 && (
            <>
              <div className="area-landing-panel__area-divider" />
              <div className="area-landing-panel__area-info">
                <span className="area-landing-panel__area-info-title">区域信息</span>
                {corners.map((corner, idx) => (
                  <div className="area-landing-panel__area-info-row" key={idx}>
                    <span className="area-landing-panel__area-info-index">{idx + 1}</span>
                    <span className="area-landing-panel__area-info-coord">
                      Lat:{corner.lat.toFixed(4)},&nbsp;Lon:{corner.lng.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        /* 飞机列表 tab：复用降落面板的飞机列表区块 */
        <AircraftListSection
          aircraft={aircraft ?? []}
          showSectionTitle={false}
          onRemove={onRemove}
        />
      )}
    </PanelShell>
  )
}