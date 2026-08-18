/**
 * PanelTabs —— 功能面板内「参数设置 / 飞机列表」tab 栏（公共组件）。
 *
 * 从 TakeoffPanel 抽取：260×36 半透明轨道 + 126×32 蓝色渐变选中块，
 * 起飞（TakeoffPanel）/ 返航（ReturnHomePanel）等同类参数面板共用。
 */
import './PanelTabs.css'

export type PanelTab = 'params' | 'aircraft'

export interface PanelTabsProps {
  /** 当前选中 tab（受控） */
  tab: PanelTab
  /** 切换 tab */
  onChange: (tab: PanelTab) => void
  /** 参数设置 tab 文案，默认「参数设置」 */
  paramsText?: string
  /** 飞机列表 tab 文案，默认「飞机列表」 */
  aircraftText?: string
}

export function PanelTabs({
  tab,
  onChange,
  paramsText = '参数设置',
  aircraftText = '飞机列表',
}: PanelTabsProps) {
  return (
    <div className="panel-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'params'}
        className={`panel-tabs__tab${tab === 'params' ? ' panel-tabs__tab--active' : ''}`}
        onClick={() => onChange('params')}
      >
        {paramsText}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'aircraft'}
        className={`panel-tabs__tab${tab === 'aircraft' ? ' panel-tabs__tab--active panel-tabs__tab--active-last' : ''}`}
        onClick={() => onChange('aircraft')}
      >
        {aircraftText}
      </button>
    </div>
  )
}