/**
 * 地图引擎抽象层 —— 统一出口。
 *
 * 上层（HomePage / 业务组件）通过此 barrel 导入适配器与类型，
 * 避免直接引用具体引擎实现，降低耦合。
 *
 * 使用示例：
 * ```ts
 * import type { MapAdapter, MapEngineInstance } from '../map-engines'
 * ```
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
  PolylineOptions,
} from './types'
export { BMapAdapter } from './BMapAdapter'
export { MapLibreAdapter } from './MapLibreAdapter'