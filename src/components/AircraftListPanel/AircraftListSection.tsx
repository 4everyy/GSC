/**
 * AircraftListSection —— 「飞机列表」区块（从 AircraftListPanel 抽取的公共子组件）。
 *
 * 包含区块头（渐变底 + 下划青色渐隐线，可隐藏）+ 可滚动列表行（名称/高度/电量/信号/删除）。
 * 供 AircraftListPanel（降落等列表面板）、ReturnHomePanel（返航面板的飞机列表 tab）
 * 及 TakeoffPanel（起飞面板的飞机列表 tab）共用。
 *
 * 传入 onRemove 时行尾渲染删除图标（取消该机选中）；未传入则不渲染，
 * 默认示例数据场景（无联动）不受影响。
 */
import { deviceImages } from '../../assets/images/device'
import { homeImages } from '../../assets/images/home'
import './AircraftListPanel.css'

export interface AircraftListItem {
  /** 唯一标识 */
  id: string
  /** 显示名称，如「01中科曙光」 */
  name: string
  /** 当前高度（米） */
  altitude: number
  /** 电量百分比（0~100） */
  battery: number
}

export interface AircraftListSectionProps {
  /** 区块标题，默认「飞机列表」 */
  sectionTitle?: string
  /** 是否显示区块头标题（起飞面板等 tab 下不需要重复标题时置 false） */
  showSectionTitle?: boolean
  /** 飞机列表，缺省使用设计稿示例数据 */
  aircraft?: AircraftListItem[]
  /** 行删除回调（取消选中该机）；传入后行尾显示删除图标 */
  onRemove?: (id: string) => void
}

/** 设计稿示例数据（group_6/7/8） */
export const DEFAULT_AIRCRAFT: AircraftListItem[] = [
  { id: '01', name: '01中科曙光', altitude: 40, battery: 100 },
  { id: '02', name: '02中科曙光', altitude: 40, battery: 100 },
  { id: '03', name: '03中科曙光', altitude: 40, battery: 100 },
]

export function AircraftListSection({
  sectionTitle = '飞机列表',
  showSectionTitle = true,
  aircraft = DEFAULT_AIRCRAFT,
  onRemove,
}: AircraftListSectionProps) {
  return (
    <>
      {/* 区块头「飞机列表」（group_3/group_4）：渐变底 + 下划青色渐隐线（可隐藏） */}
      {showSectionTitle && (
        <div className="aircraft-list-panel__section">
          <span className="aircraft-list-panel__section-title">{sectionTitle}</span>
        </div>
      )}

      {/* 列表区（group_5）：244px 静态行，行多时可滚动 */}
      <div className="aircraft-list-panel__list">
        <div className="aircraft-list-panel__scrollwrap">
          <div className="aircraft-list-panel__rows">
            {aircraft.map((item) => {
              // 电量填充宽度按百分比折算（电池内框最大 9px 宽）
              const batteryFill = Math.max(2, Math.round((item.battery / 100) * 9))
              return (
                <div className="aircraft-list-panel__row" key={item.id}>
                  <span className="aircraft-list-panel__name">{item.name}</span>

                  {/* 高度：↑ 切图（14×14）+ 数值 */}
                  <span className="aircraft-list-panel__metric">
                    <img
                      className="aircraft-list-panel__metric-icon"
                      src={deviceImages.altitudeIcon}
                      alt=""
                      draggable={false}
                    />
                    <span className="aircraft-list-panel__metric-value">{item.altitude}m</span>
                  </span>

                  {/* 电量：电池图标（18×18）+ 百分比 */}
                  <span className="aircraft-list-panel__metric">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                      <rect x="0.5" y="5.5" width="13" height="7" rx="1" stroke="#fff" />
                      <rect x="14.5" y="7.5" width="2.5" height="3" rx="0.5" fill="#fff" />
                      <rect x="2.5" y="7.5" width={batteryFill} height="3" rx="0.5" fill="#fff" />
                    </svg>
                    <span className="aircraft-list-panel__metric-value">{item.battery}%</span>
                  </span>

                  {/* Delete (last icon in row): clickable remove button when onRemove passed */}
                  {onRemove ? (
                    <button
                      type="button"
                      className="aircraft-list-panel__signal aircraft-list-panel__signal-btn"
                      aria-label={`取消选中 ${item.name}`}
                      title={`取消选中 ${item.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemove(item.id)
                      }}
                    >
                    <img
                      className="aircraft-list-panel__signal-img"
                      src={homeImages.signalAircraft}
                      alt=""
                      draggable={false}
                    />
                    </button>
                  ) : (
                    <img className="aircraft-list-panel__signal aircraft-list-panel__signal-img" src={homeImages.signalAircraft} alt="" draggable={false} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
