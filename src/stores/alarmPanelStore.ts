/**
 * alarmPanelStore —— 告警面板状态机（WB-PF-002 修复：自 HomePage 根组件抽离）。
 *
 * 原实现：4 个 useState（activeAlarm/pendingAlarm/prevAlarm/alarmCollapsing）+ 渲染期
 * setState 对比 + 2 个定时器 effect 全部挂在 HomePage 根部，任一变化都令整树重渲染。
 * 现迁移至 Zustand store：StatusHeader / AlarmPanels 各自按选择器订阅，
 * 告警切换/收起只重渲染这两个消费组件，HomePage 与地图/面板子树不再参与。
 *
 * 语义与原实现完全一致：
 * - activeAlarm：当前展开的告警级别（null = 未展开）；
 * - pendingAlarm：级别切换中转——已展开 A 时点击另一徽标，先收起（activeAlarm=null）
 *   播放收起动画，ALARM_COLLAPSE_MS 后再展开目标级别；收起期间可改点/取消；
 * - alarmCollapsing：收起衔接标记——activeAlarm 非 null → null 的瞬间置 true，
 *   常驻面板缺口在收起动画全程保持补齐，ALARM_COLLAPSE_MS 后复位；展开时立即清除。
 *
 * 定时器在 actions 内以模块级句柄管理（store 无组件生命周期，无需 effect）。
 */
import { create } from 'zustand'
import { ALARM_COLLAPSE_MS } from '../pages/HomePage/constants'

interface AlarmPanelState {
  /** 当前展开的告警级别（下标），null = 未展开 */
  activeAlarm: number | null
  /** 收起动画期间待展开的目标级别，null = 无中转 */
  pendingAlarm: number | null
  /** 收起衔接态：收起动画播放全程保持 true（面板缺口补齐），定时器复位 */
  alarmCollapsing: boolean
  /** 顶栏徽标点击（展开/toggle/中转切换，见函数内注释） */
  handleAlarmClick: (index: number) => void
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

    /** 顶栏徽标点击：
     *  - 收起中转期间点击：点待展开徽标本身＝取消（保持收起），点其他徽标＝改目标；
     *  - 已展开同一徽标：toggle 收起（挂 collapsing 定时器）；
     *  - 已展开另一级别：先收起 + 记录 pendingAlarm，动画播完后展开新级别；
     *  - 未展开：直接展开。 */
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