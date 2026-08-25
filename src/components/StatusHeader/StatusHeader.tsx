import { ALARM_BADGES } from '../../config/alarms'
import { homeImages } from '../../assets/images/home'
import './StatusHeader.css'

interface StatusHeaderProps {
  activeAlarm: number | null
  onAlarmClick: (index: number) => void
}

export function StatusHeader({ activeAlarm, onAlarmClick }: StatusHeaderProps) {
  return (
    <header className="status-header">
      <div className="status-header__left">
        <strong>无人机集群控制地面站</strong>
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
            onClick={() => onAlarmClick(index)}
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