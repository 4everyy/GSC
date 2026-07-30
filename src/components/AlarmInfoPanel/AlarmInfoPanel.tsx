import { homeImages } from '../../assets/images/home'
import type { AlarmColor } from '../../types'
import './AlarmInfoPanel.css'

interface AlarmInfoPanelProps {
  alarmColor?: AlarmColor
}

const alarmMessages = [
  '告警信息提示文本告警信息提示文本告警信息提示',
  '告警信息提示文本告警信息提示文本',
  '告警信息提示文本告警信息提示文本告警信息提示',
  '告警信息提示文本告警信息提示文本',
  '告警信息提示文本告警信息提示文本告警信息提示',
  '告警信息提示文本告警信息提示文本告警信息提示',
]

export function AlarmInfoPanel({ alarmColor }: AlarmInfoPanelProps) {
  const colorClass = alarmColor ? `alarm-info-panel--${alarmColor}` : ''

  return (
    <div className={`alarm-info-panel ${colorClass}`} style={{ right: '16px', left: 'auto' }}>
      <div className="alarm-info-header block_14 flex-row">
        <img className="alarm-info-icon thumbnail_1" referrerPolicy="no-referrer" src={homeImages.alarmInfoIcon} />
        <span className="alarm-info-title text_1">告警信息</span>

        <div className="block_1 flex-col align-center">
          <div className="group_8 flex-col align-center">
            <div className="box_4 flex-row align-center">
              <div className="block_2 flex-col"></div>
              <div className="block_2 flex-col"></div>
              <div className="block_2 flex-col"></div>
              <div className="block_2 flex-col"></div>
            </div>
          </div>
        </div>
      </div>

      {alarmMessages.map((message, index) =>
        index % 2 === 0 ? (
          <div key={index} className="alarm-message-wrapper">
            <span className="alarm-message">{message}</span>
          </div>
        ) : (
          <span key={index} className="alarm-message">
            {message}
          </span>
        ),
      )}
    </div>
  )
}