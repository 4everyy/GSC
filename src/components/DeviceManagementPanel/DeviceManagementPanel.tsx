/**
 * @file DeviceManagementPanel.tsx
 * @description 设备管理面板：标题栏 + 筛选栏（DeviceFilters）+ 设备列表（DeviceRow）+ 聚焦视图（AircraftFocusPanel）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { useState, useRef, useCallback } from 'react'
import { useDeviceLinkStore, usePlaneStatusStore } from '../../stores/index'
import { deviceImages } from '../../assets/device'
import { AircraftFocusPanel } from '../AircraftFocusPanel/AircraftFocusPanel'
import { DeviceRow } from './DeviceRow'
import { DeviceFilters, FILTER_PLACEHOLDER, TYPE_ID_BY_LABEL, type FilterKey } from './DeviceFilters'
import './DeviceManagementPanel.css'

interface DeviceManagementPanelProps {
  onClose: () => void
  visible?: boolean
}

export function DeviceManagementPanel({ onClose, visible = true }: DeviceManagementPanelProps) {
  // 设备列表：订阅 planeStatusStore
  const deviceList = usePlaneStatusStore((s) => s.devices)
  // 选中/hover 状态迁移至全局 store，与首页飞机图标联动
  const selectedDevices = useDeviceLinkStore((s) => s.selectedDevices)
  const hoveredIndex = useDeviceLinkStore((s) => s.hoveredDevice)
  const setHoveredIndex = useDeviceLinkStore((s) => s.setHoveredDevice)
  const toggleDevice = useDeviceLinkStore((s) => s.toggleDevice)
  const replaceSelectedDevices = useDeviceLinkStore((s) => s.setSelectedDevices)
  // 地图聚焦请求：单行勾上时飞转地图到该设备（全选走整体替换不触发）
  const requestMapFocusDevice = useDeviceLinkStore((s) => s.requestMapFocusDevice)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [openDropdown, setOpenDropdown] = useState<FilterKey | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>(FILTER_PLACEHOLDER)
  const [typeFilter, setTypeFilter] = useState<string>(FILTER_PLACEHOLDER)

  // ====== 聚焦视图面板：位于设备管理面板右侧、间距 8px（定位见 CSS） ======
  const [focusIndex, setFocusIndex] = useState<number | null>(null)
  const [focusVisible, setFocusVisible] = useState(false)
  const focusHideTimer = useRef<number | null>(null)

  // 关闭聚焦面板：先淡出（250ms 与面板过渡一致）再卸载
  const closeFocus = useCallback(() => {
    setFocusVisible(false)
    if (focusHideTimer.current) window.clearTimeout(focusHideTimer.current)
    focusHideTimer.current = window.setTimeout(() => setFocusIndex(null), 250)
  }, [])

  // 打开/切换聚焦面板
  const openFocus = useCallback((index: number) => {
    if (focusHideTimer.current) window.clearTimeout(focusHideTimer.current)
    setFocusIndex(index)
    // 双 rAF：等挂载首帧渲染后再触发淡入 class
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setFocusVisible(true))
    })
  }, [])

  const toggleSelect = (index: number) => {
    // 勾上（原未选中）时请求地图飞转聚焦该设备；取消勾选不触发
    if (!selectedDevices.has(index)) requestMapFocusDevice(index)
    toggleDevice(index)
  }

  const toggleExpand = (index: number) => {
    setExpandedIndex((prev) => (prev === index ? null : index))
  }

  // 筛选后的可见设备（保留原始 index 以维持选中/展开等状态一致性）
  const filteredDevices = deviceList
    .map((device, index) => ({ device, index }))
    .filter(({ device }) => {
      // 类型筛选：按接口 typeId 匹配（1-无人机；其余类型后端暂未定义，选中时结果为空）
      if (typeFilter !== FILTER_PLACEHOLDER) {
        const expectId = TYPE_ID_BY_LABEL[typeFilter]
        if (expectId === undefined || device.typeId !== expectId) return false
      }
      // 状态筛选：按设备状态文字精确匹配
      if (statusFilter !== FILTER_PLACEHOLDER && device.statusText !== statusFilter) return false
      return true
    })

  // 全选 / 全不选联动（作用于当前筛选后的可见列表）
  const visibleSelectedCount = filteredDevices.filter(({ index }) =>
    selectedDevices.has(index),
  ).length
  const isAllSelected =
    filteredDevices.length > 0 && visibleSelectedCount === filteredDevices.length
  const isIndeterminate =
    visibleSelectedCount > 0 && visibleSelectedCount < filteredDevices.length

  const toggleSelectAll = () => {
    const next = new Set(selectedDevices)
    // 当前可见项已全部选中 → 取消这些项；否则全部选中
    if (filteredDevices.length > 0 && visibleSelectedCount === filteredDevices.length) {
      filteredDevices.forEach(({ index }) => next.delete(index))
    } else {
      filteredDevices.forEach(({ index }) => next.add(index))
    }
    replaceSelectedDevices(next)
  }

  const toggleDropdown = (which: FilterKey) => {
    setOpenDropdown((prev) => (prev === which ? null : which))
  }

  const selectOption = (which: FilterKey, value: string) => {
    if (which === 'status') {
      setStatusFilter(value)
    } else {
      setTypeFilter(value)
    }
    setOpenDropdown(null)
  }

  // 清除筛选：重置为占位文本并关闭下拉
  const clearFilter = (which: FilterKey) => {
    if (which === 'status') {
      setStatusFilter(FILTER_PLACEHOLDER)
    } else {
      setTypeFilter(FILTER_PLACEHOLDER)
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
      <DeviceFilters
        isAllSelected={isAllSelected}
        isIndeterminate={isIndeterminate}
        statusFilter={statusFilter}
        typeFilter={typeFilter}
        openDropdown={openDropdown}
        onToggleSelectAll={toggleSelectAll}
        onToggleDropdown={toggleDropdown}
        onSelectOption={selectOption}
        onClearFilter={clearFilter}
      />

      {/* 设备列表 */}
      <div className="device-panel__body">
        <div className="device-panel__list-wrapper">
          <div className="device-panel__list">
            {filteredDevices.length === 0 ? (
              <div className="device-panel__list-empty">
                <img
                  className="device-panel__list-empty-icon"
                  src={deviceImages.noData}
                  alt="暂无设备"
                  draggable={false}
                />
                <span className="device-panel__list-empty-text">暂无设备</span>
              </div>
            ) : (
              filteredDevices.map(({ device, index }) => (
                <DeviceRow
                  key={index}
                  device={device}
                  isSelected={selectedDevices.has(index)}
                  isHovered={hoveredIndex === index}
                  isExpanded={expandedIndex === index}
                  onHover={(hovered) => setHoveredIndex(hovered ? index : null)}
                  onToggleSelect={() => toggleSelect(index)}
                  onToggleExpand={() => toggleExpand(index)}
                  onToggleFocus={() =>
                    focusIndex === index ? closeFocus() : openFocus(index)
                  }
                />
              ))
            )}
          </div>
        </div>
      </div>
      {/* 聚焦视图面板：位于设备管理面板右侧、间距 8px（定位见 CSS） */}
      {focusIndex !== null && deviceList[focusIndex] && (
        <AircraftFocusPanel
          name={deviceList[focusIndex].name}
          batteryLevel={Number(deviceList[focusIndex].batteryValue.replace(/[^\d.]/g, '')) || 0}
          visible={focusVisible}
          onClose={closeFocus}
          showHeaderIndicators={false}
          showDeviceDetails={false}
        />
      )}
    </div>
  )
}