import type { LngLat, PolylineHandle } from '../../map-engines'

/**
 * 一条已「确定」的测距记录。
 * finish() 时把当前进行中覆盖物的 id 快照进来；之后 cleanup()/toggle()/Esc/右键
 * 都不再移除它们，使多次测距结果可累积保留在地图上。
 */
export interface CommittedMeasurement {
  markerIds: string[]
  polylineId: string | null
  segmentLabelIds: string[]
  /** 提交时的测距点序列（删除悬停段后按剩余点重连重绘） */
  points: LngLat[]
  /** 折线句柄（删段后 setPolylinePoints 重连复用） */
  polylineHandle: PolylineHandle | null
  /** 取消该折线悬停交互绑定（删除该条测距 / 卸载时调用） */
  unbindInteractive?: () => void
}