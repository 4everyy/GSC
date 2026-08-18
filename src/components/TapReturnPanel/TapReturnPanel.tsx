/**
 * TapReturnPanel —— 指点返航面板（底部条第 5 段按钮「指点返航」）。
 *
 * 结构：
 * - 外壳（背景/切角/标题/底部按钮）复用 PanelShell；
 * - 「参数设置」区块头 + 返航高度 −/+ 步进行（HeightStepper，默认 10m）；
 * - 环绕飞行面板复用时可通过 radiusLabel 追加第二行步进（盘旋半径，默认 50m）；
 * - 编队飞行面板复用时可通过 children 在步进行与航点信息行之间插入队形选择行；
 * - 航点信息行：纬度 000.00 N° / 经度 000.00 E° 两个坐标输入框；
 * - 底部三按钮「确认 / 航线生成 / 取消」（PanelShell middleText）。
 */
import { useState, type ReactNode } from 'react'
import { PanelShell } from '../PanelShell/PanelShell'
import { HeightStepper } from '../HeightStepper/HeightStepper'
import './TapReturnPanel.css'

export interface TapReturnPanelProps {
  /** 面板标题，默认「指点返航」（航点飞行面板复用时传「航点飞行」） */
  title?: string
  /** 高度步进行标签，默认「返航高度」（航点飞行传「飞行高度」） */
  heightLabel?: string
  /** 半径步进行标签：传入即在高度行下方追加第二行步进（环绕飞行传「盘旋半径」），默认不显示 */
  radiusLabel?: string
  /** 页面级定位钩子类名，默认「tap-return-panel」 */
  className?: string
  /** 确认按钮置灰态（航点飞行设计稿确认钮为灰色），默认 false */
  confirmMuted?: boolean
  /** 「航线生成」中间按钮置灰态（航线飞行设计稿为灰边灰字），默认 false */
  middleMuted?: boolean
  /** 是否显示航点信息行（航线飞行面板无此行），默认 true */
  showWaypoint?: boolean
  /** 额外参数行（如编队飞行的队形选择行），渲染在步进行与航点信息行之间 */
  children?: ReactNode
  /** 确认：携带当前设置的高度（米） */
  onConfirm: (height: number) => void
  /** 航线生成（暂记录日志，待接入真实链路） */
  onGenerateRoute?: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function TapReturnPanel({
  title = '指点返航',
  heightLabel = '返航高度',
  radiusLabel,
  className = 'tap-return-panel',
  confirmMuted = false,
  middleMuted = false,
  showWaypoint = true,
  children,
  onConfirm,
  onGenerateRoute,
  onCancel,
}: TapReturnPanelProps) {
  const [height, setHeight] = useState(10)
  const [radius, setRadius] = useState(50)
  const [lat, setLat] = useState('000.00')
  const [lng, setLng] = useState('000.00')

  return (
    <PanelShell
      title={title}
      className={className}
      ariaLabel={`${title}面板`}
      middleText="航线生成"
      confirmMuted={confirmMuted}
      middleMuted={middleMuted}
      onConfirm={() => onConfirm(height)}
      onMiddle={onGenerateRoute}
      onCancel={onCancel}
    >
      {/* 区块头「参数设置」：渐变底 + 下缘青色渐隐线 */}
      <div className="tap-return-panel__section">
        <span className="tap-return-panel__section-title">参数设置</span>
        <div className="tap-return-panel__section-divider" />
      </div>

      <div className="tap-return-panel__params">
        {/* 高度：−/+ 步进，默认 10m */}
        <HeightStepper
          label={heightLabel}
          height={height}
          onChange={setHeight}
          minusAriaLabel={`减小${heightLabel}`}
          plusAriaLabel={`增大${heightLabel}`}
        />

        {/* 半径：−/+ 步进，默认 50m（环绕飞行面板「盘旋半径」行） */}
        {radiusLabel && (
          <HeightStepper
            label={radiusLabel}
            height={radius}
            onChange={setRadius}
            minusAriaLabel={`减小${radiusLabel}`}
            plusAriaLabel={`增大${radiusLabel}`}
          />
        )}

        {/* 额外参数行（编队飞行的队形选择行等） */}
        {children}

        {/* 航点信息：纬度/经度两个坐标框 + N°/E° 单位（航线飞行面板无此行） */}
        {showWaypoint && (
        <div className="tap-return-panel__waypoint">
          <span className="tap-return-panel__waypoint-label">航点信息</span>
          <input
            className="tap-return-panel__waypoint-input"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            aria-label="纬度"
            inputMode="decimal"
          />
          <span className="tap-return-panel__waypoint-unit">N°</span>
          <input
            className="tap-return-panel__waypoint-input"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            aria-label="经度"
            inputMode="decimal"
          />
          <span className="tap-return-panel__waypoint-unit">E°</span>
        </div>
        )}
      </div>
    </PanelShell>
  )
}