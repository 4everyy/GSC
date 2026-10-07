/**
 * @file FlightOverlays.tsx
 * @description HomePage 飞行航线与图形覆盖层总装（自 HomePage.tsx 拆出）
 * @author 4everyy
 * @date 2026-10-07
 */
import { type useExclusivePanels } from '../../../hooks/useExclusivePanels'
import { type useFlightAnimations } from '../../../hooks/useFlightAnimations'
import { type useMapEngine } from '../../../hooks/index'
import { type FormationFlightFormation } from '../../FlightActionPanels/FlightActionPanels'
import { computeFormationFlightGeometry } from '../../../lib/formationLayout'
import { FlightSimulationOverlays } from './FlightSimulationOverlays'
import { FlightMarkerOverlays } from './FlightMarkerOverlays'

/** FlightOverlays —— HomePage 飞行航线与图形覆盖层总装（自 HomePage.tsx 拆出）。 */

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
