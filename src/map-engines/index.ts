/**
 * @file index.ts
 * @description 地图引擎抽象层 —— 统一出口。
 * @author 4everyy
 * @date 2026-10-07
 */
export type {
  CircleOptions,
  LngLat,
  MapAdapter,
  MapEngineInstance,
  MapEngineType,
  MarkerHandle,
  MarkerOptions,
  PolylineHandle,
  PolylineHighlightOptions,
  PolylineInteractionOptions,
  PolylineOptions,
} from './types'
export { MapLibreAdapter } from './MapLibreAdapter'