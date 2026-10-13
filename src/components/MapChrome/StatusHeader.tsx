/**
 * @file StatusHeader.tsx
 * @description StatusHeader（自 MapChrome.tsx 拆出）—— 顶栏：标题 + 在线/起飞统计 + 告警徽标。 数据全部自 store 订阅、无 props（接口可控），职责仅“态势概览展示”（单一职责）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { ALARM_BADGES } from '../../config/index'
import { homeImages } from '../../assets/home/index'
import { useAlarmPanelStore, usePlaneStatusStore } from '../../stores/index'
import { WindowControls } from '../WindowControls/WindowControls'
import { ScreenToggle } from '../ScreenToggle'

/** 顶栏（WB-PF-002）：告警徽标状态自 alarmPanelStore 订阅（无 props）；
 *  onMinimize：缩小按钮回调（页面据此收纳为底部任务栏页签，见 HomePage） */
export function StatusHeader({ onMinimize }: { onMinimize?: () => void }) {
  const activeAlarm = useAlarmPanelStore((s) => s.activeAlarm)
  const handleAlarmClick = useAlarmPanelStore((s) => s.handleAlarmClick)
  // 集群统计（queryPlaneStatus data 顶层字段）：在线 = planeOnline/planeTotal
  const stats = usePlaneStatusStore((s) => s.stats)
  return (
    <header className="status-header">
      <div className="status-header__left">
        <strong>智能无人集群控制系统</strong>
        <div className="status-metric status-metric--online">
          <img src={homeImages.statusOnlineIcon} alt="" />
          <span>
            在线<br />
            数量
          </span>
          <b>
            {stats.planeOnline}/<i>{stats.planeTotal}</i>
          </b>
        </div>
        <div className="status-metric status-metric--takeoff">
          <img src={homeImages.statusTakeoffIcon} alt="" />
          <span>
            起飞<br />
            数量
          </span>
          <b>
            {stats.planeInAir}/<i>{stats.planeTotal}</i>
          </b>
        </div>
      </div>
      <div className="status-header__right">
        {ALARM_BADGES.map((badge, index) => (
          <span
            className={`alarm ${activeAlarm === index ? 'is-active' : ''}`}
            key={badge}
            onClick={() => handleAlarmClick(index)}
            style={{ cursor: 'pointer' }}
          >
            <img src={badge} alt="告警" />
            <img className="alarm__symbol" src={homeImages.alarmSymbol} alt="" />
            <em>99</em>
          </span>
        ))}
        <img className="avatar" src={homeImages.userAvatar} alt="用户" />
        {/* 顶栏窗口控制组：leading 槽放「视频监测屏」开关（对方屏关掉后可从此唤醒），缩小 ─ / 叉号 ✕ */}
        <WindowControls onMinimize={onMinimize} leading={<ScreenToggle self="#/" />} />
      </div>
    </header>
  )
}
