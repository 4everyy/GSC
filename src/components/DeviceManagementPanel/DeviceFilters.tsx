/**
 * @file DeviceFilters.tsx
 * @description 设备管理面板筛选栏：全选三态复选框 + 状态/类型下拉筛选（自 DeviceManagementPanel 拆出）。
 * @author 4everyy
 * @date 2026-10-07
 */
import { deviceImages } from '../../assets/device'

/** 状态筛选选项：与 queryPlaneStatus 状态文本一一对应（执行中/待命/离线/在线） */
export const STATUS_OPTIONS = ['执行中', '待命', '离线', '在线'] as const
export const TYPE_OPTIONS = ['无人机', '无人车', '无人船', '机器狗'] as const
/** 类型文本 → typeId 码（联调口径：1-无人机；其余类型后端暂未定义，选中时列表为空） */
export const TYPE_ID_BY_LABEL: Record<string, string> = {
  无人机: '1',
}

/** 下拉筛选维度标识（status/type 二选一）。 */
export type FilterKey = 'status' | 'type'

/** 筛选占位符文本（未选择任何筛选时显示）。 */
export const FILTER_PLACEHOLDER = '请选择'

interface TriStateCheckboxProps {
  checked: boolean
  indeterminate: boolean
  onToggle: () => void
  ariaLabel: string
}

/** 三态复选框：全选（勾）/ 部分选中（横线）/ 未选（空）。 */
export function TriStateCheckbox({
  checked,
  indeterminate,
  onToggle,
  ariaLabel,
}: TriStateCheckboxProps) {
  return (
    <div
      className={`device-panel__select-all${checked ? ' device-panel__select-all--checked' : ''}${indeterminate ? ' device-panel__select-all--indeterminate' : ''}`}
      onClick={onToggle}
      role="checkbox"
      aria-checked={checked ? 'true' : indeterminate ? 'mixed' : 'false'}
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
      {indeterminate && (
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
  )
}

interface FilterSelectProps {
  label: string
  filterKey: FilterKey
  options: readonly string[]
  value: string
  isOpen: boolean
  onToggleDropdown: (key: FilterKey) => void
  onSelect: (key: FilterKey, value: string) => void
  onClear: (key: FilterKey) => void
}

/** 单个下拉筛选：占位文本 / 已选值 + 清除按钮 + 选项列表。 */
function FilterSelect({
  label,
  filterKey,
  options,
  value,
  isOpen,
  onToggleDropdown,
  onSelect,
  onClear,
}: FilterSelectProps) {
  return (
    <>
      <span className="device-panel__filter-label">{label}</span>
      <div
        className={`device-panel__select${isOpen ? ' device-panel__select--open' : ''}`}
        onClick={() => onToggleDropdown(filterKey)}
      >
        <span className={value !== FILTER_PLACEHOLDER ? '' : 'device-panel__select-placeholder'}>
          {value}
        </span>
        {value !== FILTER_PLACEHOLDER && (
          <button
            type="button"
            className="device-panel__select-clear"
            onClick={(e) => {
              e.stopPropagation()
              onClear(filterKey)
            }}
            aria-label={`清除${label}筛选`}
          >
            <svg
              viewBox="0 0 12 12"
              width="8"
              height="8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="2" y1="2" x2="10" y2="10" />
              <line x1="10" y1="2" x2="2" y2="10" />
            </svg>
          </button>
        )}
        <img src={deviceImages.dropdown} alt="" />
        {isOpen && (
          <div className="device-panel__dropdown">
            {options.map((opt) => (
              <div
                key={opt}
                className="device-panel__dropdown-item"
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect(filterKey, opt)
                }}
              >
                {opt}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

export interface DeviceFiltersProps {
  isAllSelected: boolean
  isIndeterminate: boolean
  statusFilter: string
  typeFilter: string
  openDropdown: FilterKey | null
  onToggleSelectAll: () => void
  onToggleDropdown: (key: FilterKey) => void
  onSelectOption: (key: FilterKey, value: string) => void
  onClearFilter: (key: FilterKey) => void
}

/** 筛选栏：全选复选框 + 状态下拉 + 类型下拉。 */
export function DeviceFilters({
  isAllSelected,
  isIndeterminate,
  statusFilter,
  typeFilter,
  openDropdown,
  onToggleSelectAll,
  onToggleDropdown,
  onSelectOption,
  onClearFilter,
}: DeviceFiltersProps) {
  return (
    <div className="device-panel__filters">
      <TriStateCheckbox
        checked={isAllSelected}
        indeterminate={isIndeterminate}
        onToggle={onToggleSelectAll}
        ariaLabel="全选当前筛选结果"
      />
      <FilterSelect
        label="状态"
        filterKey="status"
        options={STATUS_OPTIONS}
        value={statusFilter}
        isOpen={openDropdown === 'status'}
        onToggleDropdown={onToggleDropdown}
        onSelect={onSelectOption}
        onClear={onClearFilter}
      />
      <FilterSelect
        label="类型"
        filterKey="type"
        options={TYPE_OPTIONS}
        value={typeFilter}
        isOpen={openDropdown === 'type'}
        onToggleDropdown={onToggleDropdown}
        onSelect={onSelectOption}
        onClear={onClearFilter}
      />
    </div>
  )
}