/**
 * @file alarmPanelStore.ts
 * @description alarmPanelStore.ts（自 stores/index.ts 拆出）—— 告警面板状态机：展开/收起动画衔接、 中转切换、外部点击收起。独立变化的 UI 状态机。
 * @author 4everyy
 * @date 2026-10-07
 */
import { create } from 'zustand'
import { ALARM_COLLAPSE_MS } from '../lib/formationLayout'

/** alarmPanelStore —— 告警面板状态机（WB-PF-002 修复：自 HomePage 根组件抽离）。 */

interface AlarmPanelState {
  /** 当前展开的告警级别（下标），null = 未展开 */
  activeAlarm: number | null
  /** 收起动画期间待展开的目标级别，null = 无中转 */
  pendingAlarm: number | null
  /** 收起衔接态：收起动画播放全程保持 true（面板缺口补齐），定时器复位 */
  alarmCollapsing: boolean
  /** 顶栏徽标点击（展开/toggle/中转切换，见函数内注释） */
  handleAlarmClick: (index: number) => void
  /** 常驻告警面板行点击：直接展开该级别详情面板（非 toggle；已在展开其它级别时立即切换 */
  openAlarm: (index: number) => void
  /** 面板组外部点击收起：取消待展开目标并收起当前面板 */
  collapseFromOutside: () => void
}

/** 收起动画复位定时器（alarmCollapsing → false） */
let collapseTimer: number | null = null
/** 待展开定时器（收起动画播完后展开 pendingAlarm 目标级别） */
let pendingTimer: number | null = null

const clearCollapseTimer = () => {
  if (collapseTimer !== null) {
    window.clearTimeout(collapseTimer)
    collapseTimer = null
  }
}

const clearPendingTimer = () => {
  if (pendingTimer !== null) {
    window.clearTimeout(pendingTimer)
    pendingTimer = null
  }
}

export const useAlarmPanelStore = create<AlarmPanelState>((set, get) => {
  /** 挂收起动画复位定时器（开始收起时调用） */
  const armCollapseTimer = () => {
    clearCollapseTimer()
    collapseTimer = window.setTimeout(() => {
      collapseTimer = null
      set({ alarmCollapsing: false })
    }, ALARM_COLLAPSE_MS)
  }

  /** 挂待展开定时器：收起动画播完后展开目标级别（并立即清除 collapsing） */
  const armPendingTimer = (target: number) => {
    clearPendingTimer()
    pendingTimer = window.setTimeout(() => {
      pendingTimer = null
      set({ activeAlarm: target, pendingAlarm: null, alarmCollapsing: false })
    }, ALARM_COLLAPSE_MS)
  }

  /** 开始收起：置 collapsing 并挂复位定时器 */
  const startCollapse = () => {
    set({ alarmCollapsing: true })
    armCollapseTimer()
  }

  return {
    activeAlarm: null,
    pendingAlarm: null,
    alarmCollapsing: false,

    /** 顶栏徽标点击：- 收起中转期间点击：点待展开徽标本身＝取消（保持收起），点其他徽标＝改目标 */
    handleAlarmClick: (index) => {
      const { pendingAlarm, activeAlarm } = get()
      if (pendingAlarm !== null) {
        const next = pendingAlarm === index ? null : index
        clearPendingTimer()
        set({ pendingAlarm: next })
        if (next !== null) armPendingTimer(next)
        return
      }
      if (activeAlarm === index) {
        startCollapse()
        set({ activeAlarm: null })
        return
      }
      if (activeAlarm !== null) {
        set({ pendingAlarm: index, activeAlarm: null })
        startCollapse()
        armPendingTimer(index)
        return
      }
      set({ activeAlarm: index })
    },

    /** 常驻面板行点击：直接展开指定级别（收起中转/收起动画期间也立即切换，不播收起动画） */
    openAlarm: (index) => {
      clearPendingTimer()
      set({ activeAlarm: index, pendingAlarm: null, alarmCollapsing: false })
    },

    /** 面板组外部点击：收起当前面板并取消待展开目标（无展开/无中转时不动作） */
    collapseFromOutside: () => {
      const { activeAlarm, pendingAlarm } = get()
      if (activeAlarm === null && pendingAlarm === null) return
      clearPendingTimer()
      if (activeAlarm !== null) {
        startCollapse()
        set({ activeAlarm: null, pendingAlarm: null })
      } else {
        set({ pendingAlarm: null })
      }
    },
  }
})

