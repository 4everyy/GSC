/**
 * @file ProIcons.tsx
 * @description ProIcons —— 专业模式面板共享图标（从 TaskProPanel.tsx 抽离）。 Force 系列遥测图标在步骤 2 编成列表 / 步骤 3 分配卡片 / 步骤 4 航线行 / 步骤 5 总览卡片 四处复用（复用性 ≥2），Stat 系列用于总览统计行。
 * @author 4everyy
 * @date 2026-10-07
 */
import { deviceImages } from '../../assets/device'
import iconFormation from '../../assets/home/icon-formation-crop.png'

/** home 模块编队切图 i…（无人机机图标，步骤 2/3/4/5 行首共用） */
export function ForceDroneIcon() {
  return (
    <img
      className="task-pro__force-ic task-pro__force-ic--drone"
      src={iconFormation}
      alt=""
      draggable={false}
    />
  )
}

/** 高度图标：复用设备管理面板数据行同款切图…（步骤 2/3/5 遥测行共用） */
export function ForceAltitudeIcon() {
  return (
    <img
      className="task-pro__force-ic task-pro__force-ic--alt"
      src={deviceImages.altitudeIcon}
      alt=""
      draggable={false}
    />
  )
}

/** 电量图标：复用设备管理面板数据行同款切图（deviceImages.batteryFull/Mid/Low；步骤 2/3/5 共用） */
export function ForceBatteryIcon({ level, low, mid }: { level: number; low: boolean; mid?: boolean }) {
  const isMid = mid ?? (!low && level <= 60)
  const src = low ? deviceImages.batteryLow : isMid ? deviceImages.batteryMid : deviceImages.batteryFull
  return <img className="task-pro__force-ic" src={src} alt="" draggable={false} />
}

/** 时钟图标（总览统计·预计总完成时间：外圈 + 时针分针，白 60%） */
export function StatClockIcon() {
  return (
    <svg className="task-pro__stat-ic" viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="8.25"
        fill="none"
        stroke="rgba(255, 255, 255, 0.6)"
        strokeWidth="1.5"
      />
      <path
        d="M12 7.5V12l3.4 2.2"
        stroke="rgba(255, 255, 255, 0.6)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

/** 航程图标（总览统计·飞行总长：斜向航线段 + 箭头，对应设计稿旋转斜条） */
export function StatRouteIcon() {
  return (
    <svg className="task-pro__stat-ic" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4.5 17.5L14 8"
        stroke="rgba(255, 255, 255, 0.6)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M11.5 6.5H15V10"
        stroke="rgba(255, 255, 255, 0.6)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

/** 下拉箭头（设计稿 data-状态=向下）：展开态由 CSS 旋转 180°（步骤 3 分配卡片） */
export function AssignChevronIcon() {
  return (
    <svg className="task-pro__assign-arrow-ic" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M5 8l5 5 5-5"
        stroke="rgba(255, 255, 255, 0.85)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}