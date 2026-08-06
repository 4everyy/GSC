import { useState, useRef, useLayoutEffect, useCallback } from 'react'
import {
  deviceList,
  getBatteryIcon,
  getStatusColor,
  type DeviceTelemetry,
} from '../../config/devices'
import { deviceImages } from '../../assets/images/device'
import { homeImages } from '../../assets/images/home'
import './DeviceManagementPanel.css'

interface DeviceManagementPanelProps {
  onClose: () => void
  visible?: boolean
}

// 筛选选项配置
const STATUS_OPTIONS = ['任务中', '待命', '离线'] as const
const TYPE_OPTIONS = ['无人机', '无人车', '无人船', '机器狗'] as const

// 左列参数配置（3 行）
const TELEMETRY_COL_LEFT: { label: string; key: keyof DeviceTelemetry }[] = [
  { label: '经度', key: 'longitude' },
  { label: '纬度', key: 'latitude' },
  { label: '海拔', key: 'elevation' },
]

// 右列参数配置（3 行）
const TELEMETRY_COL_RIGHT: { label: string; key: keyof DeviceTelemetry }[] = [
  { label: '速度(Y)', key: 'velocityY' },
  { label: '偏航角', key: 'yaw' },
  { label: '横滚角', key: 'roll' },
]

// 第三行左列（高度/电压/延迟）
const TELEMETRY_COL_LEFT_2: { label: string; key: keyof DeviceTelemetry }[] = [
  { label: '高度', key: 'altitude' },
  { label: '电压', key: 'voltage' },
  { label: '延迟', key: 'delay' },
]

// 第三行右列（俯仰角/电量/GPS）
const TELEMETRY_COL_RIGHT_2: { label: string; key: keyof DeviceTelemetry }[] = [
  { label: '俯仰角', key: 'pitch' },
  { label: '电\u3000量', key: 'battery' },
  { label: 'GPS', key: 'gps' },
]

export function DeviceManagementPanel({ onClose, visible = true }: DeviceManagementPanelProps) {
  const [selectedDevices, setSelectedDevices] = useState<Set<number>>(new Set([0, 1]))
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [openDropdown, setOpenDropdown] = useState<'status' | 'type' | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('请选择')
  const [typeFilter, setTypeFilter] = useState<string>('请选择')

  // 运行时对齐"最后更新时间"行与右列数值的右边：
  // ref 指向当前展开行的 footer 与第二行右列（含最右数值的列）
  const footerRef = useRef<HTMLDivElement | null>(null)
  const [footerPadRight, setFooterPadRight] = useState<number>(33)

  // 测量并设置 footer 的 padding-right，使其内容右边对齐右列数值右边
  const measure = useCallback(() => {
    const footer = footerRef.current
    if (!footer) return
    // 从 footer 向上找到详情容器，再查所有右列数值
    const detail = footer.closest('.device-row__detail')
    if (!detail) return

    // 跨所有 detail-row 统一等宽：遍历 detail 内全部列（2行×2列=4列），
    // 取全局最大宽度统一设置，保证左右两列及上下两行的标签/数值起始位置
    // 完全对齐；配合 justify-content:center 让每行两列作为整体居中。
    const allCols = detail.querySelectorAll<HTMLElement>('.device-row__detail-col')
    // 先清除行内 width，让列回到内容自然宽度（flex:0 0 auto）
    allCols.forEach((c) => {
      c.style.width = ''
    })
    // 取所有列中最宽者
    let maxColW = 0
    allCols.forEach((c) => {
      const w = c.offsetWidth
      if (w > maxColW) maxColW = w
    })
    // 统一设置所有列宽度，实现跨行等宽对齐
    allCols.forEach((c) => {
      c.style.width = `${maxColW}px`
    })
    const footerRect = footer.getBoundingClientRect()
    // 只取第一个 detail-row（速度Y/偏航角/横滚角所在行）的右列数值，
    // 让 footer 与"速度那一列"的数值右边缘对齐，而非所有右列数值的最右者。
    const firstRow = detail.querySelector<HTMLElement>('.device-row__detail-row')
    const values = firstRow
      ? firstRow.querySelectorAll<HTMLElement>(
          '.device-row__detail-col:last-child .device-row__detail-value',
        )
      : []
    let maxValueRight = -Infinity
    values.forEach((v) => {
      const r = v.getBoundingClientRect()
      if (r.right > maxValueRight) maxValueRight = r.right
    })
    if (!Number.isFinite(maxValueRight)) return
    // footer 内容右边 = footerRect.right - paddingRight；想要 == maxValueRight
    const desired = footerRect.right - maxValueRight
    if (desired >= 0 && desired <= footerRect.width) {
      setFooterPadRight(Math.round(desired))
    }
  }, [])

  useLayoutEffect(() => {
    if (expandedIndex === null) return
    // 等布局稳定后测量（含字体/动画首帧）
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(measure)
    })
    // 字体加载完成后重测（MiSans 可能异步加载，影响数值宽度）
    let cancelled = false
    document.fonts?.ready.then(() => {
      if (!cancelled) measure()
    })
    // 监听尺寸变化（面板宽度 clamp 随 vw 变化）
    const ro = new ResizeObserver(() => measure())
    if (footerRef.current) ro.observe(footerRef.current)
    window.addEventListener('resize', measure)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(id)
      window.removeEventListener('resize', measure)
      ro.disconnect()
    }
  }, [expandedIndex, measure])

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

  const toggleExpand = (index: number) => {
    setExpandedIndex((prev) => (prev === index ? null : index))
  }

  // 全选 / 全不选联动
  const isAllSelected = selectedDevices.size === deviceList.length
  const isIndeterminate = selectedDevices.size > 0 && selectedDevices.size < deviceList.length

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedDevices(new Set())
    } else {
      setSelectedDevices(new Set(deviceList.map((_, i) => i)))
    }
  }

  const toggleDropdown = (which: 'status' | 'type') => {
    setOpenDropdown((prev) => (prev === which ? null : which))
  }

  const selectOption = (which: 'status' | 'type', value: string) => {
    if (which === 'status') {
      setStatusFilter(value)
    } else {
      setTypeFilter(value)
    }
    setOpenDropdown(null)
  }

  return (
    <div className={`device-panel${visible ? ' device-panel--visible' : ''}`}>
      {/* 标题栏 */}
      <div className="device-panel__header">
        <div className="device-panel__header-icon">
          <img src={deviceImages.headerIcon} alt="" />
        </div>
        <span className="device-panel__title">设备管理</span>
        <button
          className="device-panel__close"
          type="button"
          onClick={onClose}
          aria-label="关闭设备管理面板"
        >
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
        {/* 全选复选框 */}
        <div
          className={`device-panel__select-all${isAllSelected ? ' device-panel__select-all--checked' : ''}${isIndeterminate ? ' device-panel__select-all--indeterminate' : ''}`}
          onClick={toggleSelectAll}
          role="checkbox"
          aria-checked={isAllSelected ? 'true' : isIndeterminate ? 'mixed' : 'false'}
          tabIndex={0}
          onKeyDown={(e) => e.key === ' ' && (e.preventDefault(), toggleSelectAll())}
        >
          {isAllSelected && (
            <svg
              viewBox="0 0 12 12"
              width="10"
              height="10"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="2,6 5,9 10,3" />
            </svg>
          )}
          {isIndeterminate && (
            <svg
              viewBox="0 0 12 12"
              width="10"
              height="10"
              fill="none"
              stroke="#fff"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="2" y1="6" x2="10" y2="6" />
            </svg>
          )}
        </div>
        <span className="device-panel__filter-label">状态</span>
        <div
          className={`device-panel__select${openDropdown === 'status' ? ' device-panel__select--open' : ''}`}
          onClick={() => toggleDropdown('status')}
        >
          <span className={statusFilter !== '请选择' ? '' : 'device-panel__select-placeholder'}>
            {statusFilter}
          </span>
          <img src={deviceImages.dropdown} alt="" />
          {openDropdown === 'status' && (
            <div className="device-panel__dropdown">
              {STATUS_OPTIONS.map((opt) => (
                <div
                  key={opt}
                  className="device-panel__dropdown-item"
                  onClick={(e) => {
                    e.stopPropagation()
                    selectOption('status', opt)
                  }}
                >
                  {opt}
                </div>
              ))}
            </div>
          )}
        </div>
        <span className="device-panel__filter-label">类型</span>
        <div
          className={`device-panel__select${openDropdown === 'type' ? ' device-panel__select--open' : ''}`}
          onClick={() => toggleDropdown('type')}
        >
          <span className={typeFilter !== '请选择' ? '' : 'device-panel__select-placeholder'}>
            {typeFilter}
          </span>
          <img src={deviceImages.dropdown} alt="" />
          {openDropdown === 'type' && (
            <div className="device-panel__dropdown">
              {TYPE_OPTIONS.map((opt) => (
                <div
                  key={opt}
                  className="device-panel__dropdown-item"
                  onClick={(e) => {
                    e.stopPropagation()
                    selectOption('type', opt)
                  }}
                >
                  {opt}
                </div>
              ))}
            </div>
          )}
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
                  ? deviceImages.rowBgBlue
                  : rowState === 'hover'
                    ? deviceImages.rowBgOrange
                    : deviceImages.rowBgGray

              const isExpanded = expandedIndex === index
              const batteryIcon = device.isCharging
                ? deviceImages.batteryCharging
                : getBatteryIcon(device.batteryLevel)

              return (
                <div className="device-row-wrapper" key={index}>
                  <div
                    className={`device-row${isSelected ? ' device-row--selected' : ''}`}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <img className="device-row__bg" src={bgImage} alt="" draggable={false} />

                    {/* 勾选框 */}
                    <div
                      className={`device-row__checkbox${isSelected ? ' device-row__checkbox--checked' : ''}`}
                      onClick={() => toggleSelect(index)}
                      role="checkbox"
                      aria-checked={isSelected}
                      tabIndex={0}
                      onKeyDown={(e) =>
                        e.key === ' ' && (e.preventDefault(), toggleSelect(index))
                      }
                    >
                      {isSelected && (
                        <svg
                          viewBox="0 0 12 12"
                          width="10"
                          height="10"
                          fill="none"
                          stroke="#fff"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="2,6 5,9 10,3" />
                        </svg>
                      )}
                    </div>

                    {/* 编队图标 + 设备名 */}
                    <img
                      className="device-row__label-icon"
                      src={homeImages.iconFormation}
                      alt=""
                      draggable={false}
                    />
                    <span className="device-row__name" title={device.name}>
                      {device.name}
                    </span>

                    {/* 状态文字 */}
                    <span
                      className="device-row__status"
                      style={{ color: getStatusColor(device.status) }}
                    >
                      {device.statusText}
                    </span>

                    {/* 高度 */}
                    <div className="device-row__metric">
                      <img src={deviceImages.altitudeIcon} alt="" draggable={false} />
                      <span className="device-row__metric-value">{device.altitudeValue}</span>
                    </div>

                    {/* 电量 */}
                    <div className="device-row__metric">
                      <img src={batteryIcon} alt="" draggable={false} />
                      <span className="device-row__metric-value">{device.batteryValue}</span>
                    </div>

                    {/* 信号图标 */}
                    <img
                      className="device-row__signal"
                      src={deviceImages.signalIcon}
                      alt=""
                      draggable={false}
                    />

                    {/* 展开/收起箭头 */}
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

                  {/* 行详情 */}
                  {isExpanded && (
                    <>
                      {index === 1 ? (
                        /* 第二行：加载详情失败占位状态 */
                        <div className="device-row__detail-failed">
                          <div className="device-row__detail-failed-content">
                            <img
                              className="device-row__detail-failed-icon"
                              src={deviceImages.loadFail}
                              alt="加载详情失败"
                              draggable={false}
                            />
                            <span className="device-row__detail-failed-text">加载详情失败</span>
                          </div>
                        </div>
                      ) : device.telemetry ? (
                        <>
                          <div className="device-row__detail">
                            {/* 统一两列布局 */}
                            <div className="device-row__detail-row device-row__detail-row--multi">
                              {/* 左列 */}
                              <div className="device-row__detail-col">
                                {TELEMETRY_COL_LEFT.map((item, ci) => (
                                  <div className="device-row__detail-item" key={ci}>
                                    <span className="device-row__detail-bar" />
                                    <span className="device-row__detail-label">
                                      {item.label}
                                    </span>
                                    <span className="device-row__detail-value">
                                      {device.telemetry![item.key]}
                                    </span>
                                  </div>
                                ))}
                              </div>

                              {/* 右列 */}
                              <div className="device-row__detail-col">
                                {TELEMETRY_COL_RIGHT.map((item, ci) => (
                                  <div className="device-row__detail-item" key={ci}>
                                    <span className="device-row__detail-bar" />
                                    <span className="device-row__detail-label">
                                      {item.label}
                                    </span>
                                    <span className="device-row__detail-value">
                                      {device.telemetry![item.key]}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* 第二行：高度/电压/延迟 | 俯仰角/电量/GPS */}
                            <div className="device-row__detail-row device-row__detail-row--multi">
                              {/* 左列 */}
                              <div className="device-row__detail-col">
                                {TELEMETRY_COL_LEFT_2.map((item, ci) => (
                                  <div className="device-row__detail-item" key={ci}>
                                    <span className="device-row__detail-bar" />
                                    <span className="device-row__detail-label">
                                      {item.label}
                                    </span>
                                    {item.key === 'delay' ? (
                                      <span className="device-row__detail-value device-row__detail-value--green">
                                        {device.telemetry![item.key]}
                                        <img
                                          className="device-row__detail-delay-icon"
                                          src={deviceImages.wifiIcon}
                                          alt=""
                                          draggable={false}
                                        />
                                      </span>
                                    ) : (
                                      <span className="device-row__detail-value">
                                        {device.telemetry![item.key]}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>

                              {/* 右列 */}
                              <div className="device-row__detail-col">
                                {TELEMETRY_COL_RIGHT_2.map((item, ci) => (
                                  <div className="device-row__detail-item" key={ci}>
                                    <span className="device-row__detail-bar" />
                                    <span
                                      className={`device-row__detail-label${item.key === 'gps' ? ' device-row__detail-label--spaced' : ''}`}
                                    >
                                      {item.label}
                                    </span>
                                    {item.key === 'gps' ? (
                                      <span className="device-row__detail-value device-row__detail-value--yellow">
                                        {device.telemetry![item.key]}
                                      </span>
                                    ) : (
                                      <span className="device-row__detail-value">
                                        {device.telemetry![item.key]}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* 分割线 */}
                            <div className="device-row__detail-divider" />

                            {/* 底部：最后更新时间 */}
                            <div
                              className="device-row__detail-footer"
                              ref={footerRef}
                              style={{ paddingRight: `${footerPadRight}px` }}
                            >
                              <span className="device-row__detail-label">最后更新时间</span>
                              <span className="device-row__detail-time">
                                {device.telemetry.time}
                              </span>
                            </div>
                          </div>

                          <img
                            className="device-row__detail-deco"
                            src={deviceImages.detailDeco}
                            alt=""
                            draggable={false}
                          />
                        </>
                      ) : null}
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