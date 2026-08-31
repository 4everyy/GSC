/**
 * InspectionZone —— 巡检区域区块（自 HomePage.tsx 拆出）。
 *
 * 包含 1 条蛇形巡检轨迹线（已飞白色/待飞绿色），支持拖拽移动（父级注入
 * onMouseDown 启动拖拽）；显隐由父级根据图层控制面板「巡检区域」开关联动。
 */
interface InspectionZoneProps {
  /** 宿主百分比定位（left/top），由父级 useDraggable 持有 */
  position: { x: number; y: number }
  /** 拖拽启动（onMouseDown 直传 useDraggable 的 onDragStart(0, e)） */
  onDragStart: (e: React.MouseEvent) => void
  /** hover 面板边缘自适应方向 class（placementToClasses 结果） */
  panelClasses: string[]
}

export function InspectionZone({ position, onDragStart, panelClasses }: InspectionZoneProps) {
  return (
    <div
      className={`inspection-zone ${panelClasses.join(' ')}`}
      aria-label="巡检区域"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
      }}
      onMouseDown={onDragStart}
    >
      {/* 半透明蓝色背景 */}
      <div className="inspection-zone__bg" />

      {/* Hover 信息面板（右上角）：01号巡检区 */}
      <div className="inspection-zone__panel" data-hover-panel>
        {/* 顶部：标题+分隔线（固定高度，完全复刻禁飞区 .block_7__top 结构） */}
        <div className="inspection-zone__panel-top">
          <span className="inspection-zone__panel-title">01号巡检区</span>
          <div className="inspection-zone__panel-divider" />
        </div>
        <div className="inspection-zone__panel-body">
          <div className="inspection-zone__panel-row inspection-zone__panel-row--area">
            <span className="inspection-zone__panel-bar" />
            <span className="inspection-zone__panel-label">面积</span>
            <span className="inspection-zone__panel-value">109m</span>
            <span className="inspection-zone__panel-sup">2</span>
          </div>
          <div className="inspection-zone__panel-row inspection-zone__panel-row--task">
            <span className="inspection-zone__panel-bar" />
            <span className="inspection-zone__panel-label">关联任务</span>
            <span className="inspection-zone__panel-value">情报侦察</span>
          </div>
        </div>
      </div>

      {/* SVG 轨迹线：viewBox 精确映射巡检区域内部坐标系 */}
      <svg
        className="inspection-zone__trajectories"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* 已飞行轨迹（白色）：从起点到路径中点 (50,50) */}
        <path
          className="inspection-zone__path inspection-zone__path--flown"
          d="M 9,10
             L 91,10
             A 4 4 0 0 1 95,14
             L 95,26
             A 4 4 0 0 1 91,30
             L 9,30
             A 4 4 0 0 0 5,34
             L 5,46
             A 4 4 0 0 0 9,50
             L 50,50"
          fill="none"
          stroke="#ffffff"
          strokeWidth="3.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* 即将飞行轨迹（绿色）：从路径中点 (50,50) 到终点 */}
        <path
          className="inspection-zone__path inspection-zone__path--pending"
          d="M 50,50
             L 91,50
             A 4 4 0 0 1 95,54
             L 95,66
             A 4 4 0 0 1 91,70
             L 9,70
             A 4 4 0 0 0 5,74
             L 5,86
             A 4 4 0 0 0 9,90
             L 91,90"
          fill="none"
          stroke="#00E570"
          strokeWidth="3.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}