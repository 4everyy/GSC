/**
 * FlightOverlays —— HomePage 飞行航线与图形覆盖层总装（自 HomePage.tsx 拆出）。
 *
 * 按渲染顺序组合 FlightMarkerOverlays（返航线/指点返航/编队/环绕取点/航点取点）
 * 与 FlightSimulationOverlays（模拟飞行图标/区域降落/集结点）；props 分组传递，
 * 子组件按需解构。类型定义见本文件导出的 FlightOverlaysProps。
 */
import type { useExclusivePanels } from '../../hooks/useExclusivePanels'
import type { useFlightAnimations } from '../../hooks/useFlightAnimations'
import type { useMapEngine } from '../../../../hooks/useMapEngine'
import type { FormationFlightFormation } from '../../../../components/FormationFlightPanel/FormationFlightPanel'
import { computeFormationFlightGeometry } from '../../formationLayout'
import { FlightMarkerOverlays } from './FlightMarkerOverlays'
import { FlightSimulationOverlays } from './FlightSimulationOverlays'

export type Panels = ReturnType<typeof useExclusivePanels>
export type Anims = ReturnType<typeof useFlightAnimations>

export interface FlightOverlaysProps {
  panels: Panels
  anims: Anims
  adapter: ReturnType<typeof useMapEngine>['adapter']
  aircraftPositions: { x: number; y: number }[]
  selectedDevices: Set<number>
  getFormationFlightGeometry: (
    formation?: FormationFlightFormation,
  ) => ReturnType<typeof computeFormationFlightGeometry>
  areaLandingSpots: { x: number; y: number }[]
  rallyPointSpots: { x: number; y: number }[]
  handleDeleteRoutePoint: (index: number) => void
}

export function FlightOverlays(props: FlightOverlaysProps) {
  return (
    <>
      <FlightMarkerOverlays {...props} />
      <FlightSimulationOverlays {...props} />
    </>
  )
}
