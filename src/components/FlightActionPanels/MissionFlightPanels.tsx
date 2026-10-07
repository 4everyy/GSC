/**
 * @file MissionFlightPanels.tsx
 * @description 编队 / 环绕 / 航点飞行面板 —— 自 FlightActionPanels.tsx 拆出（均基于 TapReturnPanel 参数基板）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { useState } from 'react'
import { FormationSelect } from '../PanelKit/PanelKit'
import { TapReturnPanel } from './TapReturnPanel'

/** 编队队形选项（默认「人字形」，其余为常见队形，待指令链路确认后调整） */
export const FORMATIONS = ['人字形', '一字型', '三角型'] as const
export type FormationFlightFormation = (typeof FORMATIONS)[number]

export interface FormationFlightPanelProps {
  /** 地图取点回填的航点坐标（编队飞行取点模式），变化时同步进坐标输入框 */
  waypoint?: { lat: number; lng: number } | null
  /** 「确认」置灰态：默认置灰，航线生成成功后由父层解除（传 false） */
  confirmMuted?: boolean
  /** 「航线生成」中间按钮置灰态：航线已生成（实线）后置灰防重复生成，默认 false */
  middleMuted?: boolean
  /* ---- 受控状态（可选）：父层持有可在面板收起/重开间保留已设置信息 ---- */
  /** 编队队形 */
  formation?: FormationFlightFormation
  onFormationChange?: (formation: FormationFlightFormation) => void
  /** 确认编队飞行：携带当前设置的飞行高度（m）与所选队形 */
  onConfirm: (height: number, formation: FormationFlightFormation) => void
  /** 航线生成（暂记录日志，待接入真实指令链路） */
  onGenerateRoute: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function FormationFlightPanel({
  waypoint,
  confirmMuted = false,
  middleMuted = false,
  formation: formationProp,
  onFormationChange,
  onConfirm,
  onGenerateRoute,
  onCancel,
}: FormationFlightPanelProps) {
  // 内部兜底状态：父层未传受控 props 时使用；传了则以 props 为准
  const [innerFormation, setInnerFormation] = useState<FormationFlightFormation>('人字形')
  const formation = formationProp ?? innerFormation
  const setFormation = onFormationChange ?? setInnerFormation

  return (
    <TapReturnPanel
      title="编队飞行"
      heightLabel="飞行高度"
      className="formation-flight-panel"
      // 飞行高度支持手动键入（上限默认不设，TapReturnPanel 内置，最低 1m）
      editable
      confirmMuted={confirmMuted}
      middleMuted={middleMuted}
      waypoint={waypoint}
      onConfirm={(height) => onConfirm(height, formation)}
      onGenerateRoute={onGenerateRoute}
      onCancel={onCancel}
    >
      {/* 队形选择：标签居左、下拉选择器居右（公共 FormationSelect 组件） */}
      <FormationSelect
        label="队形选择"
        options={FORMATIONS}
        value={formation}
        onChange={setFormation}
      />
    </TapReturnPanel>
  )
}

/** OrbitFlightPanel —— 环绕飞行面板（底部条第 10 段按钮「环绕飞行」）。 */

export interface OrbitFlightPanelProps {
  /** 环绕中心航点（地图取点回填，null = 尚未取点） */
  waypoint?: { lat: number; lng: number } | null
  /** 确认按钮置灰态：未点击「航线生成」定格实线前置灰，生成后解除 */
  confirmMuted?: boolean
  /** 「航线生成」中间按钮置灰态：航线已生成（实线）后置灰防重复生成，默认 false */
  middleMuted?: boolean
  /** 确认：携带当前设置的盘旋高度（米）与盘旋半径（米，未开启半径步进时缺省） */
  onConfirm: (height: number, radius?: number) => void
  /** 盘旋半径步进回调：驱动地图盘旋圆像素半径实时刷新 */
  onRadiusChange: (radius: number) => void
  /** 航线生成：已取点（虚线）→ 虚线定格为实线并解除确认置灰；已生成实线 → 清除旧航点重新取点 */
  onGenerateRoute?: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function OrbitFlightPanel({
  waypoint,
  confirmMuted = false,
  middleMuted = false,
  onConfirm,
  onRadiusChange,
  onGenerateRoute,
  onCancel,
}: OrbitFlightPanelProps) {
  return (
    <TapReturnPanel
      title="环绕飞行"
      heightLabel="盘旋高度"
      radiusLabel="盘旋半径"
      editable
      className="orbit-flight-panel"
      waypoint={waypoint}
      confirmMuted={confirmMuted}
      middleMuted={middleMuted}
      onConfirm={onConfirm}
      onRadiusChange={onRadiusChange}
      onGenerateRoute={onGenerateRoute}
      onCancel={onCancel}
    />
  )
}

/** WaypointFlightPanel —— 航点飞行面板（底部条第 8 段按钮「航点飞行」）。 */

export interface WaypointFlightPanelProps {
  /** 航点坐标回填（跟随/定格后的 WGS84 经纬度，展示在航点信息输入框） */
  waypoint?: { lat: number; lng: number } | null
  /** 确认按钮置灰态：取点完成（waypoint 定格）前置灰，定格后取消置灰，默认 false */
  confirmMuted?: boolean
  /** 「航线生成」中间按钮置灰态：航线已生成（实线）后置灰防重复生成，默认 false */
  middleMuted?: boolean
  /** 确认：携带当前设置的飞行高度（米） */
  onConfirm: (height: number) => void
  /** 航线生成（暂记录日志，待接入真实链路） */
  onGenerateRoute?: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function WaypointFlightPanel({
  waypoint,
  confirmMuted = false,
  middleMuted = false,
  onConfirm,
  onGenerateRoute,
  onCancel,
}: WaypointFlightPanelProps) {
  return (
    <TapReturnPanel
      title="航点飞行"
      heightLabel="飞行高度"
      className="waypoint-flight-panel"
      // 飞行高度支持手动键入（上限默认不设，TapReturnPanel 内置，最低 1m）
      editable
      confirmMuted={confirmMuted}
      middleMuted={middleMuted}
      waypoint={waypoint}
      onConfirm={onConfirm}
      onGenerateRoute={onGenerateRoute}
      onCancel={onCancel}
    />
  )
}
