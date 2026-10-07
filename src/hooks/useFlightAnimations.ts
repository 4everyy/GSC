/**
 * @file useFlightAnimations.ts
 * @description Facade: composes the flight animation sub-hooks in ./flight-anims. Public API (return shape + FlightState re-export) is unchanged after splitting the original 1040-line file. Each sub-hook owns its rAF handle, store slice and unmount cleanup (independent change).
 * @author 4everyy
 * @date 2026-10-07
 */
import {
  useTapReturnFlight,
  useWaypointFlight,
  useRouteFlightAnimation,
  useHomeAreaLandingFlights,
  useRallyPointFlights,
  useFormationFlightFlights,
  useOrbitFlight,
} from './flight-anims'

export type { FlightState } from './flight-anims/types'

export function useFlightAnimations() {
  const tapReturn = useTapReturnFlight()
  const waypoint = useWaypointFlight()
  const route = useRouteFlightAnimation()
  const homeArea = useHomeAreaLandingFlights()
  const rally = useRallyPointFlights()
  const formation = useFormationFlightFlights()
  const orbit = useOrbitFlight()

  return {
    // start/stop pairs (stable useCallback refs, invoked on panel confirm/cancel/exclusive switch)
    startTapReturnFlight: tapReturn.startTapReturnFlight,
    stopTapReturnFlight: tapReturn.stopTapReturnFlight,
    startWaypointFlight: waypoint.startWaypointFlight,
    stopWaypointFlight: waypoint.stopWaypointFlight,
    startRouteFlightAnimation: route.startRouteFlightAnimation,
    stopRouteFlightAnimation: route.stopRouteFlightAnimation,
    startReturnHomeFlights: homeArea.startReturnHomeFlights,
    stopReturnHomeFlights: homeArea.stopReturnHomeFlights,
    startAreaLandingFlights: homeArea.startAreaLandingFlights,
    stopAreaLandingFlights: homeArea.stopAreaLandingFlights,
    startRallyPointFlights: rally.startRallyPointFlights,
    stopRallyPointFlights: rally.stopRallyPointFlights,
    startFormationFlightFlights: formation.startFormationFlightFlights,
    stopFormationFlightFlights: formation.stopFormationFlightFlights,
    startOrbitFlight: orbit.startOrbitFlight,
    stopOrbitFlight: orbit.stopOrbitFlight,
    // rally-point flying flag (decides whether to restart animation on formation change)
    rallyPointFlyingRef: rally.rallyPointFlyingRef,
  }
}
