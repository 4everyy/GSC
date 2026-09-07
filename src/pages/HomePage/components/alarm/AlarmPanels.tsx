/**
 * AlarmPanels —— 告警面板组（WB-PF-002 修复：自 HomePage 根部抽离为独立组件）。
 *
 * 订阅 alarmPanelStore：activeAlarm/alarmCollapsing 驱动 --expanded/--collapsing
 * CSS 过渡（grid-template-rows 0fr→1fr），色调随激活徽标切换；
 * 「点击面板组外部收起」监听亦内聚于此（捕获阶段，排除面板组内部与顶栏 .alarm 徽标）。
 * HomePage 不再持有任何告警状态，告警切换只重渲染本组件与 StatusHeader。
 */
import { useEffect, useRef } from 'react'
import { AlarmInfoPanel } from '../../../../components/AlarmInfoPanel/AlarmInfoPanel'
import { AlarmDetailPanel } from '../../../../components/AlarmDetailPanel/AlarmDetailPanel'
import { useAlarmPanelStore } from '../../../../stores/alarmPanelStore'
import { ALARM_COLORS } from '../../constants'

export function AlarmPanels() {
  const activeAlarm = useAlarmPanelStore((s) => s.activeAlarm)
  const pendingAlarm = useAlarmPanelStore((s) => s.pendingAlarm)
  const alarmCollapsing = useAlarmPanelStore((s) => s.alarmCollapsing)
  // 告警信息面板色调：当前激活徽标（红/橙/蓝）映射为面板边框色调
  const currentAlarmColor = activeAlarm !== null ? ALARM_COLORS[activeAlarm] : undefined

  // 详情面板收起：点击面板组外部区域时收起（原 HomePage 逻辑原样迁移）。
  // 顶栏告警徽标（.alarm）排除——其点击由 StatusHeader 内订阅的 handleAlarmClick
  // toggle 承担（展开/收起同一入口），避免双重切换。面板未展开时不挂监听。
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
      <AlarmInfoPanel alarmColor={currentAlarmColor} />
      <div className="alarm-panels__detail">
        <AlarmDetailPanel alarmColor={currentAlarmColor} />
      </div>
    </div>
  )
}