/**
 * @file VideoMonitorIcons.tsx
 * @description Inline SVG icons extracted from VideoMonitorPage.tsx.
 * @author 4everyy
 * @date 2026-10-07
 */

/* ---------------- 小图标（内联 SVG，白色 currentColor） ---------------- */

export function IconDrone({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="2.4" y="2.4" width="6.75" height="6.75" rx="1" />
      <rect x="14.85" y="2.4" width="6.75" height="6.75" rx="1" />
      <rect x="2.4" y="14.85" width="6.75" height="6.75" rx="1" />
      <rect x="14.85" y="14.85" width="6.75" height="6.75" rx="1" />
      <circle cx="12" cy="12" r="1.2" />
    </svg>
  )
}

export function IconBattery({ size = 24, pct = 100 }: { size?: number; pct?: number }) {
  const w = (14 * Math.min(100, Math.max(0, pct))) / 100
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {/* 旋转 90° 的电池本体：外壳 + 电量填充 + 正极触点 */}
      <g transform="rotate(90 12 12)">
        <rect
          x="2.5"
          y="7"
          width="19"
          height="10"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <rect x="4.5" y="9" width={w} height="6" rx="0.5" />
        <rect x="22.4" y="10" width="1.6" height="4" rx="0.8" />
      </g>
    </svg>
  )
}

export function IconChevron({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M5 3.5 L10.5 8 L5 12.5 Z" />
    </svg>
  )
}

export function IconClose({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M2.5 2.5 L11.5 11.5 M11.5 2.5 L2.5 11.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconGrid4() {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden>
      <rect x="4" y="4" width="10" height="10" rx="1" />
      <rect x="18" y="4" width="10" height="10" rx="1" />
      <rect x="4" y="18" width="10" height="10" rx="1" />
      <rect x="18" y="18" width="10" height="10" rx="1" />
    </svg>
  )
}

export function IconTile() {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
        <rect
          key={i}
          x={4 + (i % 3) * 9}
          y={4 + Math.floor(i / 3) * 9}
          width="6"
          height="6"
          rx="0.5"
        />
      ))}
    </svg>
  )
}
