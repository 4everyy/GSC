import { ALARM_BADGES } from '../../config/alarms'
import { homeImages } from '../../assets/images/home'
import { useAlarmPanelStore } from '../../stores/alarmPanelStore'
import './StatusHeader.css'

/** 顶栏（WB-PF-002）：告警徽标状态自 alarmPanelStore 订阅（无 props），
 *  徽标点击直接调 store action，HomePage 不参与告警交互渲染 */
export function StatusHeader() {
  const activeAlarm = useAlarmPanelStore((s) => s.activeAlarm)
  const handleAlarmClick = useAlarmPanelStore((s) => s.handleAlarmClick)
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
            18/<i>20</i>
          </b>
        </div>
        <div className="status-metric status-metric--takeoff">
          <img src={homeImages.statusTakeoffIcon} alt="" />
          <span>
            起飞<br />
            数量
          </span>
          <b>
            15/<i>18</i>
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
        <img className="signal" src={homeImages.signalIcon} alt="信号" />
      </div>
    </header>
  )
}