/**
 * FormationFlightPanel —— 编队飞行面板（底部条第 12 段按钮「编队飞行」）。
 *
 * 设计稿结构与指点返航/航点飞行同族，最大化复用 TapReturnPanel：
 * - 标题「编队飞行」+ 「参数设置」区块头 + 飞行高度 −/+ 步进（默认 10m）；
 * - children 插槽注入「队形选择」下拉选择行（公共 FormationSelect，默认「人字形」）；
 * - 航点信息行：纬度 000.00 N° / 经度 000.00 E° 两个坐标输入框；
 * - 底部「确认（灰）/ 航线生成 / 取消」三按钮。
 */
import { useState } from 'react'
import { TapReturnPanel } from '../TapReturnPanel/TapReturnPanel'
import { FormationSelect } from '../FormationSelect/FormationSelect'
import './FormationFlightPanel.css'

/** 编队队形选项（默认「人字形」，其余为常见队形，待指令链路确认后调整） */
const FORMATIONS = ['人字形', '一字型', '三角型'] as const
export type FormationFlightFormation = (typeof FORMATIONS)[number]

export interface FormationFlightPanelProps {
  /** 地图取点回填的航点坐标（编队飞行取点模式），变化时同步进坐标输入框 */
  waypoint?: { lat: number; lng: number } | null
  /** 确认编队飞行：携带当前设置的飞行高度（m）与所选队形 */
  onConfirm: (height: number, formation: FormationFlightFormation) => void
  /** 航线生成（暂记录日志，待接入真实指令链路） */
  onGenerateRoute: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function FormationFlightPanel({
  waypoint,
  onConfirm,
  onGenerateRoute,
  onCancel,
}: FormationFlightPanelProps) {
  const [formation, setFormation] = useState<FormationFlightFormation>('人字形')

  return (
    <TapReturnPanel
      title="编队飞行"
      heightLabel="飞行高度"
      className="formation-flight-panel"
      confirmMuted
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