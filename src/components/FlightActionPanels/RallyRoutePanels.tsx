/**
 * @file RallyRoutePanels.tsx
 * @description 集结点 / 航线飞行面板 —— 自 FlightActionPanels.tsx 拆出。
 * @author 4everyy
 * @date 2026-10-07
 */
import { useState } from 'react'
import { PanelShell, PanelTabs, type PanelTab, HeightStepper, FormationSelect } from '../PanelKit/PanelKit'
import { AircraftListSection, type AircraftListItem } from '../AircraftListPanel/AircraftListPanel'
import { TapReturnPanel } from './TapReturnPanel'
import { FORMATIONS, type FormationFlightFormation } from './MissionFlightPanels'

export type RallyPointFormation = FormationFlightFormation

export interface RallyPointPanelProps {
  /** 确认集结：携带当前设置的起飞高度（m）、集结速度（m/s）与所选队形 */
  aircraft?: AircraftListItem[]
  onRemove?: (id: string) => void
  onConfirm: (height: number, speed: number, formation: RallyPointFormation) => void
  /** 航线生成（暂记录日志，待接入真实指令链路） */
  onGenerateRoute: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
  /** 「航线生成」置灰态：未确定集结区域前置灰，区域框选「确定」后解禁可点击 */
  routeMuted?: boolean
  /** 「确认」置灰态：默认置灰，航线生成成功后由父层解除（传 false） */
  confirmMuted?: boolean
  /* ---- 受控状态（可选）：父层持有可在面板收起/重开间保留已设置信息 ---- */
  /** 集结队形 */
  formation?: RallyPointFormation
  onFormationChange?: (formation: RallyPointFormation) => void
}

export function RallyPointPanel({
  aircraft,
  onRemove,
  onConfirm,
  onGenerateRoute,
  onCancel,
  routeMuted,
  confirmMuted = true,
  formation: formationProp,
  onFormationChange,
}: RallyPointPanelProps) {
  // 内部兜底状态：父层未传受控 props 时使用；传了则以 props 为准
  const [tab, setTab] = useState<PanelTab>('params')
  const [height, setHeight] = useState(10)
  const [speed, setSpeed] = useState(10)
  const [innerFormation, setInnerFormation] = useState<RallyPointFormation>('人字形')
  const formation = formationProp ?? innerFormation
  const setFormation = onFormationChange ?? setInnerFormation

  return (
    <PanelShell
      title="集结点"
      className="rally-point-panel"
      ariaLabel="集结点参数面板"
      confirmMuted={confirmMuted}
      middleText="航线生成"
      middleMuted={routeMuted}
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
            editable
            max={Number.MAX_SAFE_INTEGER}
            minusAriaLabel="减小起飞高度"
            plusAriaLabel="增大起飞高度"
          />
          <HeightStepper
            label="集结速度"
            height={speed}
            onChange={setSpeed}
            unit="m/s"
            min={1}
            max={Number.MAX_SAFE_INTEGER}
            editable
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
        <AircraftListSection
          aircraft={aircraft ?? []}
          showSectionTitle={false}
          onRemove={onRemove}
        />
      )}
    </PanelShell>
  )
}

/** RouteFlightPanel —— 航线飞行面板（底部条第 9 段按钮「航线飞行」）。 */

/** 航点信息行：地图取点回传的经纬度（面板内仅只读展示） */
export interface RouteWaypoint {
  lat: number
  lng: number
}

export interface RouteFlightPanelProps {
  /** 航线就绪（已取点定格）后解除「确认」置灰，默认 false 保持置灰 */
  confirmReady?: boolean
  /** 「航线生成」中间按钮置灰态：默认随 confirmReady（未就绪置灰），传入 true 强制置灰（航线已生成后防重复生成） */
  routeMuted?: boolean
  /** 航点列表：逐行展示（航点 序号 纬度 N° / 经度 E°），随地图取点实时更新 */
  waypoints?: RouteWaypoint[]
  /** 确认：携带当前设置的飞行高度（米） */
  onConfirm: (height: number) => void
  /** 航线生成：进入地图取点模式（暂记录日志，待接入真实链路） */
  onGenerateRoute?: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

/** 经纬度格式化：6 位 xxx.xx，不足前补 0（N°/E° 单位语义下取绝对值） */
const formatCoord = (v: number) => Math.abs(v).toFixed(2).padStart(6, '0')

export function RouteFlightPanel({
  confirmReady = false,
  routeMuted,
  waypoints = [],
  onConfirm,
  onGenerateRoute,
  onCancel,
}: RouteFlightPanelProps) {
  return (
    <TapReturnPanel
      title="航线飞行"
      heightLabel="飞行高度"
      className="route-flight-panel"
      // 飞行高度支持手动键入（上限默认不设，TapReturnPanel 内置，最低 1m）
      editable
      confirmMuted={!confirmReady}
      middleMuted={routeMuted ?? !confirmReady}
      showWaypoint={false}
      onConfirm={onConfirm}
      onGenerateRoute={onGenerateRoute}
      onCancel={onCancel}
    >
      {/* 航线信息区：蓝色分割线 + 标题行 + 逐航点行（无航点时仅展示分割线与标题） */}
      <div className="route-flight-panel__routes">
        <div className="route-flight-panel__divider" />
        <span className="route-flight-panel__routes-title">航线信息</span>
        <div className="route-flight-panel__waypoint-list">
          {waypoints.map((wp, i) => (
            <div className="route-flight-panel__waypoint-row" key={i}>
              <span className="route-flight-panel__waypoint-label">航点</span>
              <span className="route-flight-panel__waypoint-index">{i + 1}</span>
              <span className="route-flight-panel__waypoint-coord">{formatCoord(wp.lat)}</span>
              <span className="route-flight-panel__waypoint-unit">N°</span>
              <span className="route-flight-panel__waypoint-coord">{formatCoord(wp.lng)}</span>
              <span className="route-flight-panel__waypoint-unit route-flight-panel__waypoint-unit--last">
                E°
              </span>
            </div>
          ))}
        </div>
      </div>
    </TapReturnPanel>
  )
}
