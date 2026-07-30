import { useState } from 'react'
import { deviceList, type DeviceTelemetry } from '../../config/devices'
import { deviceImages } from '../../assets/images/device'
import { homeImages } from '../../assets/images/home'
import './DeviceManagementPanel.css'

interface DeviceManagementPanelProps {
  onClose: () => void
  visible?: boolean
}

// 遥测参数项配置
const TELEMETRY_ROWS: { items: { label: string; key: keyof DeviceTelemetry }[] }[] = [
  {
    items: [
      { label: '经度', key: 'longitude' },
      { label: '高\u3000度', key: 'altitude' },
    ],
  },
  {
    items: [
      { label: '纬度', key: 'latitude' },
      { label: '偏航角', key: 'yaw' },
    ],
  },
  {
    items: [
      { label: '海拔', key: 'elevation' },
      { label: '横滚角', key: 'roll' },
    ],
  },
  {
    items: [
      { label: '空速', key: 'airspeed' },
      { label: '俯仰角', key: 'pitch' },
    ],
  },
]

export function DeviceManagementPanel({ onClose, visible = true }: DeviceManagementPanelProps) {
  // 选中状态：记录每个设备是否被勾选
  const [selectedDevices, setSelectedDevices] = useState<Set<number>>(new Set([0, 1]))
  // hover 状态：记录当前 hover 的行索引
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  // 展开状态：当前展开详情的设备索引（同一时间只展开一个）
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  // 切换选中状态
  const toggleSelect = (index: number) => {
    setSelectedDevices((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  // 切换展开详情（再次点击同一行则收起）
  const toggleExpand = (index: number) => {
    setExpandedIndex((prev) => (prev === index ? null : index))
  }

  return (
    <div className={`device-panel${visible ? ' device-panel--visible' : ''}`}>
      {/* 标题栏 */}
      <div className="device-panel__header">
        <div className="device-panel__header-icon">
          <img src={deviceImages.headerIcon} alt="" />
        </div>
        <span className="device-panel__title">设备管理</span>
        {/* 关闭按钮：点击调用 onClose 关闭面板；样式含扩大热区与悬停/按下反馈 */}
        <button className="device-panel__close" type="button" onClick={onClose} aria-label="关闭设备管理面板">
          <img src={deviceImages.closeBtn} alt="" />
        </button>
      </div>

      {/* 分隔线 */}
      <div className="device-panel__separator">
        <span className="device-panel__separator-dot" />
        <span className="device-panel__separator-line" />
      </div>

      {/* 筛选栏 */}
      <div className="device-panel__filters">
        <span className="device-panel__filter-label">状态</span>
        <div className="device-panel__select">
          <span>请选择</span>
          <img src={deviceImages.dropdownArrow} alt="" />
        </div>
        <span className="device-panel__filter-label">类型</span>
        <div className="device-panel__select">
          <span>请选择</span>
          <img src={deviceImages.dropdownArrow} alt="" />
        </div>
      </div>

      {/* 设备列表 */}
      <div className="device-panel__body">
        <div className="device-panel__list-wrapper">
          <div className="device-panel__list">
            {deviceList.map((device, index) => {
              const isSelected = selectedDevices.has(index)
              const rowState = isSelected ? 'selected' : hoveredIndex === index ? 'hover' : 'normal'
              const bgImage =
                rowState === 'selected'
                  ? deviceImages.rowSelected
                  : rowState === 'hover'
                    ? deviceImages.rowHover
                    : deviceImages.rowNormal

              const isExpanded = expandedIndex === index

              return (
                <div className="device-row-wrapper" key={index}>
                  <div
                    className={`device-row${isSelected ? ' device-row--selected' : ''}`}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <img className="device-row__bg" src={bgImage} alt="" width={288} height={40} draggable={false} />

                    <div
                      className={`device-row__checkbox${isSelected ? ' device-row__checkbox--checked' : ''}`}
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

                    <span className="device-row__name" title={device.name}>{device.name}</span>

                    {/* 编队控制图标（位于信号图标前一列） */}
                    <img className="device-row__label-icon" src={homeImages.iconFormation} alt="" />

                    {device.icons.map((name, i) => (
                      <img key={i} className="device-row__action-icon" src={name} alt="" />
                    ))}

                    {/* 下/上箭头（最右侧）：点击展开/收起该行详情 */}
                    <button
                      className={`device-row__expand${isExpanded ? ' device-row__expand--active' : ''}`}
                      type="button"
                      onClick={() => toggleExpand(index)}
                      aria-label={isExpanded ? '收起详情' : '展开详情'}
                      aria-expanded={isExpanded}
                    >
                      <img src={isExpanded ? deviceImages.upArrow : deviceImages.downArrow} alt="" />
                    </button>
                  </div>

                  {/* 行详情：经度/纬度/高度等遥测指标，内联展开，不覆盖其他行 */}
                  {isExpanded && device.telemetry && (
                    <>
                    <div className="device-row__detail">
                      <div className="device-row__detail-grid">
                        {TELEMETRY_ROWS.map((row, ri) => (
                          <div className="device-row__detail-row" key={ri}>
                            {row.items.map((item, ii) => (
                              <div className="device-row__detail-item" key={ii}>
                                <span className="device-row__detail-bar" />
                                <span className="device-row__detail-label">{item.label}</span>
                                <span className="device-row__detail-value">{device.telemetry![item.key]}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>

                      <div className="device-row__detail-divider" />

                      <div className="device-row__detail-footer">
                        <span className="device-row__detail-label">时间</span>
                        <span className="device-row__detail-time">{device.telemetry.time}</span>
                        <span className="device-row__detail-label">延迟</span>
                        <span className="device-row__detail-delay">{device.telemetry.delay}</span>
                      </div>
                    </div>

                    {/* 底部装饰图：与详情块同级，贴底显示 */}
                    <img className="device-row__detail-deco" src={deviceImages.detailDeco} alt="" draggable={false} />
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}