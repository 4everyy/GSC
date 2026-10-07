/**
 * @file DeviceRow.tsx
 * @description 设备管理面板行组件：行首信息 + 状态/高度/电量 + 尾部操作 + 展开遥测详情（自 DeviceManagementPanel 拆出）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { type ReactNode } from 'react'
import { getBatteryIcon, getStatusColor, type Device, type DeviceTelemetry } from '../../config/index'
import { deviceImages } from '../../assets/device'
import { homeImages } from '../../assets/home'
import { useDetailFooterAlign } from './useDetailFooterAlign'

/** 遥测详情列配置：label + telemetry 字段键（DeviceRow 内部使用）。 */
export type TelemetryColumn = { label: string; key: keyof DeviceTelemetry }

// 第一行左列（经度/纬度/海拔）
const TELEMETRY_COL_LEFT: TelemetryColumn[] = [
  { label: '经度', key: 'longitude' },
  { label: '纬度', key: 'latitude' },
  { label: '海拔', key: 'elevation' },
]

// 第一行右列（速度Y/偏航角/横滚角）
const TELEMETRY_COL_RIGHT: TelemetryColumn[] = [
  { label: '速度(Y)', key: 'velocityY' },
  { label: '偏航角', key: 'yaw' },
  { label: '横滚角', key: 'roll' },
]

// 第二行左列（高度/电压/延迟）
const TELEMETRY_COL_LEFT_2: TelemetryColumn[] = [
  { label: '高度', key: 'altitude' },
  { label: '电压', key: 'voltage' },
  { label: '延迟', key: 'delay' },
]

// 第二行右列（俯仰角/电量/GPS）
const TELEMETRY_COL_RIGHT_2: TelemetryColumn[] = [
  { label: '俯仰角', key: 'pitch' },
  { label: '电\u3000量', key: 'battery' },
  { label: 'GPS', key: 'gps' },
]

interface DeviceRowCheckboxProps {
  checked: boolean
  onToggle: () => void
  ariaLabel: string
}

/** 行首复选框（勾选态切换，含键盘空格触发）。 */
function DeviceRowCheckbox({ checked, onToggle, ariaLabel }: DeviceRowCheckboxProps) {
  return (
    <div
      className={`device-row__checkbox${checked ? ' device-row__checkbox--checked' : ''}`}
      onClick={onToggle}
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={(e) => e.key === ' ' && (e.preventDefault(), onToggle())}
    >
      {checked && (
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
  )
}

interface TelemetryColumnViewProps {
  columns: TelemetryColumn[]
  telemetry: DeviceTelemetry
}

/** 单列遥测项渲染：延迟绿色带 WiFi 图标、GPS 黄色加宽标签，其余默认。 */
function TelemetryColumnView({ columns, telemetry }: TelemetryColumnViewProps) {
  return (
    <div className="device-row__detail-col">
      {columns.map((item, ci) => (
        <div className="device-row__detail-item" key={ci}>
          <span className="device-row__detail-bar" />
          <span
            className={`device-row__detail-label${item.key === 'gps' ? ' device-row__detail-label--spaced' : ''}`}
          >
            {item.label}
          </span>
          {item.key === 'delay' ? (
            <span className="device-row__detail-value device-row__detail-value--green">
              {telemetry[item.key]}
              <img
                className="device-row__detail-delay-icon"
                src={deviceImages.wifiIcon}
                alt=""
                draggable={false}
              />
            </span>
          ) : item.key === 'gps' ? (
            <span className="device-row__detail-value device-row__detail-value--yellow">
              {telemetry[item.key]}
            </span>
          ) : (
            <span className="device-row__detail-value">{telemetry[item.key]}</span>
          )}
        </div>
      ))}
    </div>
  )
}

/** 遥测详情展开区：两行四列 + 分割线 + footer（时间行与右列数值右对齐）。 */
function TelemetryDetail({ telemetry }: { telemetry: DeviceTelemetry }) {
  const { footerRef, footerPadRight } = useDetailFooterAlign()

  return (
    <div className="device-row__detail">
      <div className="device-row__detail-row device-row__detail-row--multi">
        <TelemetryColumnView columns={TELEMETRY_COL_LEFT} telemetry={telemetry} />
        <TelemetryColumnView columns={TELEMETRY_COL_RIGHT} telemetry={telemetry} />
      </div>
      <div className="device-row__detail-row device-row__detail-row--multi">
        <TelemetryColumnView columns={TELEMETRY_COL_LEFT_2} telemetry={telemetry} />
        <TelemetryColumnView columns={TELEMETRY_COL_RIGHT_2} telemetry={telemetry} />
      </div>

      <div className="device-row__detail-divider" />

      <div
        className="device-row__detail-footer"
        ref={footerRef}
        style={{ paddingRight: `${footerPadRight}px` }}
      >
        <span className="device-row__detail-label">最后更新时间</span>
        <span className="device-row__detail-time">{telemetry.time}</span>
      </div>
    </div>
  )
}

export interface DeviceRowProps {
  device: Device
  isSelected: boolean
  isHovered: boolean
  isExpanded: boolean
  onHover: (hovered: boolean) => void
  onToggleSelect: () => void
  onToggleExpand: () => void
  onToggleFocus: () => void
  /** 展开态右侧装饰图插槽（默认渲染内置装饰图） */
  detailDeco?: ReactNode
}

/** 设备行：背景随选中/hover 切换，含遥测详情展开区。 */
export function DeviceRow({
  device,
  isSelected,
  isHovered,
  isExpanded,
  onHover,
  onToggleSelect,
  onToggleExpand,
  onToggleFocus,
  detailDeco,
}: DeviceRowProps) {
  const rowState = isSelected ? 'selected' : isHovered ? 'hover' : 'normal'
  const bgImage =
    rowState === 'selected'
      ? deviceImages.rowBgBlue
      : rowState === 'hover'
        ? deviceImages.rowBgOrange
        : deviceImages.rowBgGray

  const batteryIcon = device.isCharging
    ? deviceImages.batteryCharging
    : getBatteryIcon(device.batteryLevel)

  return (
    <div className="device-row-wrapper">
      <div
        className={`device-row${isSelected ? ' device-row--selected' : ''}`}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
      >
        <img className="device-row__bg" src={bgImage} alt="" draggable={false} />

        {/* 行首组：复选框 + 设备图标 + 设备名称（组内固定 8px 间距） */}
        <div className="device-row__lead">
          <DeviceRowCheckbox
            checked={isSelected}
            onToggle={onToggleSelect}
            ariaLabel={`选择设备 ${device.name}`}
          />
          <img
            className="device-row__label-icon"
            src={homeImages.iconFormation}
            alt=""
            draggable={false}
          />
          <span className="device-row__name" title={device.name}>
            {device.name}
          </span>
        </div>

        {/* 状态文字 */}
        <span className="device-row__status">
          <span
            className="device-row__status-dot"
            style={{ backgroundColor: getStatusColor(device.status) }}
          />
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

        {/* 尾部组：信号图标（打开云台）+ 展开箭头（查看详情），组内固定 8px 间距 */}
        <div className="device-row__tail">
          {/* 信号图标：点击显示该无人机的聚焦视图面板 */}
          <img
            className="device-row__signal device-row__signal--clickable"
            src={deviceImages.signalIcon}
            alt=""
            draggable={false}
            role="button"
            tabIndex={0}
            title="打开云台"
            aria-label="打开云台"
            onClick={onToggleFocus}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onToggleFocus()
              }
            }}
          />

          {/* 展开/收起箭头 */}
          <button
            className={`device-row__expand${isExpanded ? ' device-row__expand--active' : ''}`}
            type="button"
            onClick={onToggleExpand}
            aria-label={isExpanded ? '收起详情' : '展开详情'}
            aria-expanded={isExpanded}
          >
            <img src={isExpanded ? deviceImages.upArrow : deviceImages.downArrow} alt="" />
          </button>
        </div>
      </div>

      {/* 行详情 */}
      {isExpanded && (
        <>
          {device.status === 'offline' ? (
            /* 离线占位状态 */
            <div className="device-row__detail-failed">
              <div className="device-row__detail-failed-content">
                <img
                  className="device-row__detail-failed-icon"
                  src={deviceImages.loadFail}
                  alt="设备已离线"
                  draggable={false}
                />
                <span className="device-row__detail-failed-text">设备已离线</span>
              </div>
            </div>
          ) : device.telemetry ? (
            <>
              <TelemetryDetail telemetry={device.telemetry} />
              {detailDeco ?? (
                <img
                  className="device-row__detail-deco"
                  src={deviceImages.detailDeco}
                  alt=""
                  draggable={false}
                />
              )}
            </>
          ) : null}
        </>
      )}
    </div>
  )
}