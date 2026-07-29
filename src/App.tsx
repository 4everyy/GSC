import { useState } from 'react'
import './App.css'

const asset = (name: string) => `/lanhu-generated-home/img/home/${name}`

const toolbarItems = [
  { 
    label: '设备管理', 
    icon: 'icon-formation.png', 
    background: {
      normal: 'toolbar-btn-normal.png',
      hover: 'toolbar-btn-hover.png',
      active: 'toolbar-btn-active.png'
    }
  },
  { 
    label: '区域规划', 
    icon: 'icon-area-planning.png', 
    background: {
      normal: 'toolbar-btn-normal.png',
      hover: 'toolbar-btn-hover.png',
      active: 'toolbar-btn-active.png'
    }
  },
  { 
    label: '目标定位', 
    icon: 'icon-target.png', 
    background: {
      normal: 'toolbar-btn-normal.png',
      hover: 'toolbar-btn-hover.png',
      active: 'toolbar-btn-active.png'
    }
  },
  { 
    label: '历史轨迹', 
    icon: 'icon-history.png', 
    background: {
      normal: 'toolbar-btn-normal.png',
      hover: 'toolbar-btn-hover.png',
      active: 'toolbar-btn-active.png'
    }
  },
  { 
    label: '任务列表', 
    icon: 'icon-task.png', 
    background: {
      normal: 'toolbar-btn-normal.png',
      hover: 'toolbar-btn-hover.png',
      active: 'toolbar-btn-active.png'
    }
  },
]

const aircraft = [
  { src: 'aircraft-red.png', className: 'aircraft aircraft--red', label: '红色飞行器' },
  { src: 'aircraft-gray.png', className: 'aircraft aircraft--gray', label: '灰色飞行器' },
  { src: 'aircraft-yellow.png', className: 'aircraft aircraft--yellow', label: '黄色飞行器' },
  { src: 'aircraft-blue.png', className: 'aircraft aircraft--blue', label: '蓝色飞行器' },
]

// 4种告警类型 - 按截图顺序：红、橙、蓝、绿
const ALARM_TYPES = [
  { badge: 'alarm-badge-4.png', color: 'red' as const },
  { badge: 'alarm-badge-1.png', color: 'orange' as const },
  { badge: 'alarm-badge-2.png', color: 'blue' as const },
  { badge: 'alarm-badge-3.png', color: 'green' as const },
]

type AlarmColor = 'orange' | 'blue' | 'green' | 'red'

// 设备管理面板 - 本地图标路径（已缓存到 public/lanhu-generated-home/img/device/）
const dev = (name: string) => `/lanhu-generated-home/img/device/${name}`

// 设备管理面板 - 图标文件名
const DEVICE_ICON_BLUE = 'icon-blue.png'
const DEVICE_ICON_GRAY = 'icon-gray.png'
const ICON_ARROW = 'icon-arrow.png'
const ICON_SETTINGS = 'icon-settings.png'

// 设备管理面板 - 设备列表数据
const deviceList = [
  { name: '01中科晶锐', deviceIcon: DEVICE_ICON_BLUE, highlighted: true, icons: ['action-icon1.png', 'action-icon2.png'] },
  { name: '01中科晶锐', deviceIcon: DEVICE_ICON_BLUE, highlighted: true, icons: ['action-icon1.png', 'action-icon2.png'] },
  { name: '01中科晶...', deviceIcon: DEVICE_ICON_GRAY, highlighted: false, icons: ['action-icon1.png', 'action-icon2.png'] },
  { name: '02大疆', deviceIcon: DEVICE_ICON_GRAY, highlighted: false, icons: ['action-icon3.png', 'action-icon4.png'] },
  { name: '02大疆', deviceIcon: DEVICE_ICON_GRAY, highlighted: false, icons: ['action-icon3.png', 'action-icon4.png'] },
  { name: '02大疆', deviceIcon: DEVICE_ICON_GRAY, highlighted: false, icons: ['action-icon5.png', 'action-icon6.png'] },
  { name: '02大疆', deviceIcon: DEVICE_ICON_GRAY, highlighted: false, icons: ['action-icon5.png', 'action-icon6.png'] },
]

function StatusHeader({ 
  activeAlarm, 
  onAlarmClick 
}: { 
  activeAlarm: number | null
  onAlarmClick: (index: number) => void 
}) {
  return (
    <header className="status-header">
      <div className="status-header__left">
        <strong>无人机集群控制地面站</strong>
        <div className="status-metric status-metric--online">
          <img src={asset('status-online-icon.png')} alt="" />
          <span>在线<br />数量</span>
          <b>18/<i>20</i></b>
        </div>
        <div className="status-metric status-metric--takeoff">
          <img src={asset('status-takeoff-icon.png')} alt="" />
          <span>起飞<br />数量</span>
          <b>15/<i>18</i></b>
        </div>
      </div>
      <div className="status-header__right">
        {ALARM_TYPES.map((alarm, index) => (
          <span 
            className={`alarm ${activeAlarm === index ? 'is-active' : ''}`}
            key={alarm.badge}
            onClick={() => onAlarmClick(index)}
            style={{ cursor: 'pointer' }}
          >
            <img src={asset(alarm.badge)} alt="告警" />
            <img className="alarm__symbol" src={asset('alarm-symbol.png')} alt="" />
            <em>99</em>
          </span>
        ))}
        <img className="avatar" src={asset('user-avatar.png')} alt="用户" />
        <img className="signal" src={asset('signal-icon.png')} alt="信号" />
      </div>
    </header>
  )
}

function MapToolbar() {
  const [active, setActive] = useState(0)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  return (
    <div className="map-toolbar-wrapper">
      <aside className="map-toolbar" aria-label="地图工具栏">
        {toolbarItems.map((item, index) => {
          let bgImage = item.background.normal
          if (active === index) {
            bgImage = item.background.active
          } else if (hoveredIndex === index) {
            bgImage = item.background.hover
          }

          return (
            <button
              className={active === index ? 'is-active' : ''}
              key={item.label}
              onClick={() => setActive(index)}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              title={item.label}
              type="button"
              style={{ backgroundImage: `url(${asset(bgImage)})` }}
            >
              <img className={`toolbar-icon toolbar-icon--${index + 1}`} src={asset(item.icon)} alt="" />
            </button>
          )
        })}
      </aside>
      {active === 0 && <DeviceManagementPanel onClose={() => setActive(-1)} />}
    </div>
  )
}

function DeviceManagementPanel({ onClose }: { onClose: () => void }) {
  // 选中状态：记录每个设备是否被勾选
  const [selectedDevices, setSelectedDevices] = useState<Set<number>>(new Set([0, 1])) // 默认前2个选中

  // 切换选中状态
  const toggleSelect = (index: number) => {
    setSelectedDevices(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  return (
    <div className="device-panel">
      {/* 标题栏 */}
      <div className="device-panel__header">
        <div className="device-panel__header-icon">
          <img src={dev('header-icon.png')} alt="" />
        </div>
        <span className="device-panel__title">设备管理</span>
        <button className="device-panel__close" type="button" onClick={onClose}>
          <img src={dev('close-btn.png')} alt="关闭" />
        </button>
      </div>

      {/* 分隔线 */}
      <div className="device-panel__separator">
        <img src={dev('separator.png')} alt="" />
      </div>

      {/* 筛选栏 */}
      <div className="device-panel__filters">
        <span className="device-panel__filter-label">状态</span>
        <div className="device-panel__select">
          <span>请选择</span>
          <img src={dev('dropdown-arrow.png')} alt="" />
        </div>
        <span className="device-panel__filter-label">类型</span>
        <div className="device-panel__select">
          <span>请选择</span>
          <img src={dev('dropdown-arrow.png')} alt="" />
        </div>
      </div>

      {/* 设备列表 */}
      <div className="device-panel__list">
        {deviceList.map((device, index) => {
          const isSelected = selectedDevices.has(index)
          return (
            <div
              key={index}
              className={`device-row ${device.highlighted ? 'device-row--highlighted' : ''}`}
            >
              {/* ✅ 可点击的复选框 */}
              <div
                className={`device-row__checkbox ${isSelected ? 'device-row__checkbox--checked' : ''}`}
                onClick={() => toggleSelect(index)}
                role="checkbox"
                aria-checked={isSelected}
                tabIndex={0}
                onKeyDown={(e) => e.key === ' ' && (e.preventDefault(), toggleSelect(index))}
              >
                {isSelected && (
                  <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="2,6 5,9 10,3" />
                  </svg>
                )}
              </div>
              <span className="device-row__name">{device.name}</span>
              <img className="device-row__action-icon" src={dev(ICON_ARROW)} alt="" />
              {device.icons.map((name, i) => (
                <img key={i} className="device-row__action-icon" src={dev(name)} alt="" />
              ))}
              <img className="device-row__label-icon" src={dev(ICON_SETTINGS)} alt="" />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MissionPanel() {
  const routes = [
    { id: 1, color: '#8B9DAE', selected: false },
    { id: 2, color: '#8B9DAE', selected: false },
    { id: 3, color: '#8B9DAE', selected: false },
    { id: 4, color: '#8B9DAE', selected: false },
    { id: 5, color: '#4CAF50', selected: true },
    { id: 6, color: '#4CAF50', selected: true },
  ]

  return (
    <section className="mission-panel" aria-label="编队任务">
      <div className="mission-routes">
        {routes.map((route) => (
          <div 
            key={route.id}
            className={`mission-route ${route.selected ? 'mission-route--selected' : ''}`}
            style={{ borderColor: route.color }}
          >
            <span className="mission-route__dot" style={{ backgroundColor: route.color }}></span>
          </div>
        ))}
      </div>

      <div className="mission-aircraft-center">
        <img 
          className="mission-aircraft-icon" 
          src={asset('aircraft-red.png')} 
          alt="执行任务的飞行器"
        />
      </div>
    </section>
  )
}

function AlarmInfoPanel({ alarmColor }: { alarmColor?: AlarmColor }) {
  const alarmMessages = [
    '告警信息提示文本告警信息提示文本告警信息提示',
    '告警信息提示文本告警信息提示文本',
    '告警信息提示文本告警信息提示文本告警信息提示',
    '告警信息提示文本告警信息提示文本',
    '告警信息提示文本告警信息提示文本告警信息提示',
    '告警信息提示文本告警信息提示文本告警信息提示',
  ]

  const colorClass = alarmColor ? `alarm-info-panel--${alarmColor}` : ''

  return (
    <div className={`alarm-info-panel ${colorClass}`} style={{ right: '16px', left: 'auto' }}>
      <div className="alarm-info-header block_14 flex-row">
        <img
          className="alarm-info-icon thumbnail_1"
          referrerPolicy="no-referrer"
          src={asset('alarm-info-icon.png')}
        />
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

      {alarmMessages.map((message, index) => (
        index % 2 === 0 ? (
          <div key={index} className="alarm-message-wrapper">
            <span className="alarm-message">{message}</span>
          </div>
        ) : (
          <span key={index} className="alarm-message">{message}</span>
        )
      ))}
    </div>
  )
}

function MapControls() {
  return (
    <>
      <aside className="view-controls">
        <button type="button">2D</button>
        <button type="button"><img src={asset('icon-layer.png')} alt="图层" /></button>
      </aside>
      <aside className="zoom-controls">
        <button type="button"><img src={asset('icon-zoom-in.png')} alt="放大" /></button>
        <button type="button"><img src={asset('icon-zoom-out.png')} alt="缩小" /></button>
      </aside>
    </>
  )
}

function HomePage() {
  const [activeAlarm, setActiveAlarm] = useState<number | null>(null)
  
  const currentAlarmColor = activeAlarm !== null ? ALARM_TYPES[activeAlarm]?.color : undefined

  return (
    <main className="design-viewport" aria-label="无人机集群控制地面站">
      <div className="design-canvas">
        <StatusHeader 
          activeAlarm={activeAlarm} 
          onAlarmClick={setActiveAlarm} 
        />
        <section className="map-stage">
          <MapToolbar />
          <MissionPanel />
          <AlarmInfoPanel alarmColor={currentAlarmColor} />
          <div className="restricted-zone restricted-zone--red"><img src={asset('restricted-zone-red.png')} alt="红色限制区域" /></div>
          <div className="restricted-zone restricted-zone--orange" />
          {aircraft.map((item) => (
            <span className={item.className} key={item.label}>
              <img src={asset(item.src)} alt={item.label} />
            </span>
          ))}
          <MapControls />
          <footer className="map-footer">
            <div className="emergency-actions"><button type="button">一键RTL</button><button type="button">一键迫降</button><button className="danger" type="button">急停</button></div>
            <div className="scale"><span />200m</div>
          </footer>
        </section>
      </div>
    </main>
  )
}

function App() {
  return <HomePage />
}

export default App