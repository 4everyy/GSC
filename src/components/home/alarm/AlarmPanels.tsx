/**
 * @file AlarmPanels.tsx
 * @description AlarmPanels —— 告警面板组（WB-PF-002 修复：自 HomePage 根部抽离为独立组件）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlarmInfoPanel, AlarmDetailPanel } from '../../AlarmPanels/AlarmPanels'
import { useAlarmPanelStore } from '../../../stores/index'
import { ALARM_COLORS } from '../../../lib/formationLayout'

export function AlarmPanels() {
  const activeAlarm = useAlarmPanelStore((s) => s.activeAlarm)
  const pendingAlarm = useAlarmPanelStore((s) => s.pendingAlarm)
  const alarmCollapsing = useAlarmPanelStore((s) => s.alarmCollapsing)

  // 行点击联动（常驻告警框 → 详情面板）：点击行后直接展开该级别详情面板（openAlarm 非 toggle，不播收起中转动画）
  const [focusRequest, setFocusRequest] = useState<{ alarmId: string; nonce: number } | null>(null)
  const focusNonceRef = useRef(0)
  const openAlarm = useAlarmPanelStore((s) => s.openAlarm)
  const handleRowClick = useCallback(
    (alarmId: string, tone: 'red' | 'orange' | 'blue') => {
      openAlarm(ALARM_COLORS.indexOf(tone))
      setFocusRequest({ alarmId, nonce: ++focusNonceRef.current })
    },
    [openAlarm],
  )
  const clearFocusRequest = useCallback(() => setFocusRequest(null), [])

  // 告警信息面板色调：当前激活徽标（红/橙/蓝）映射为面板边框色调
  const currentAlarmColor = activeAlarm !== null ? ALARM_COLORS[activeAlarm] : undefined

  // 详情面板收起：点击面板组外部区域时收起（原 HomePage 逻辑原样迁移）。
  const alarmPanelsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // 展开中或切换收起中（存在待展开目标）均挂监听：点击外部即收起并取消待展开目标
    if (activeAlarm === null && pendingAlarm === null) return
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target) return
      // 面板组内部（常驻告警框 + 详情面板）：不收起
      if (alarmPanelsRef.current?.contains(target)) return
      // 顶栏告警徽标及其子元素：交给徽标自身 toggle
      if (target instanceof Element && target.closest('.alarm')) return
      useAlarmPanelStore.getState().collapseFromOutside()
    }
    // 捕获阶段监听：不受子元素（地图画布等）stopPropagation 阻断
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [activeAlarm, pendingAlarm])

  return (
    <div
      ref={alarmPanelsRef}
      className={`alarm-panels${activeAlarm !== null ? ' alarm-panels--expanded' : ''}${alarmCollapsing ? ' alarm-panels--collapsing' : ''}`}
    >
      <AlarmInfoPanel alarmColor={currentAlarmColor} onRowClick={handleRowClick} />
      <div className="alarm-panels__detail">
        <AlarmDetailPanel
          alarmColor={currentAlarmColor}
          focusRequest={focusRequest}
          onFocusConsumed={clearFocusRequest}
        />
      </div>
    </div>
  )
}