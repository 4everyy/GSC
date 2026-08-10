/**
 * AircraftFocusPanel —— 无人机聚焦视图面板。
 *
 * 双击首页无人机图标后触发，显示固定尺寸（229×569px）的设备详情面板，
 * 包含：设备名称+电池信号指示、视频画面、变焦控制、云台参数、设备详情。
 *
 * 设计稿还原（.box_10）：
 * - 顶部标题栏（group_5）：名称 + 电池 + 信号 + 关闭按钮
 * - 分隔线（group_6）
 * - 视频画面（image_3）：213×213
 * - 变焦控制（group_7）：左右切换框 + 下拉箭头
 * - 变焦倍数按钮组（group_8）：2x / 5x / 10x
 * - 分隔线（group_9）
 * - 云台参数（text_10 + group_10/11）
 * - 分隔线（group_12）
 * - 设备详情（text_17 + group_13/14/16）
 */
import { useState } from 'react'
import { deviceImages } from '../../assets/images/device'
import { homeImages } from '../../assets/images/home'
import './AircraftFocusPanel.css'

// 面板固定高度，用于计算垂直居中偏移
const PANEL_HEIGHT = 569

interface AircraftFocusPanelProps {
  /** 设备名称，例如 "08号无人机" */
  name: string
  /** 电量百分比，默认 46 */
  batteryLevel?: number
  /** 关闭回调 */
  onClose: () => void
  /** 是否可见（控制淡入/滑入动画） */
  visible?: boolean
  /**
   * 触发面板的无人机图标位置（百分比，相对 .map-stage）。
   * 面板将出现在图标右侧，且图标正好卡在面板左边缘的垂直中心。
   * - left = iconX% + 48px（图标宽度，面板紧贴图标右边缘，不遮挡图标）
   * - top = iconY% + 24px - PANEL_HEIGHT/2（让面板垂直中心对齐图标中心）
   */
  aircraftPosition?: { x: number; y: number }
  /** 方向罗盘操作回调 */
  onDirection?: (direction: 'up' | 'down' | 'left' | 'right') => void
}

// 变焦倍数选项
const ZOOM_LEVELS = ['2x', '5x', '10x'] as const

export function AircraftFocusPanel({
  name,
  batteryLevel = 46,
  onClose,
  visible = true,
  aircraftPosition,
  onDirection,
}: AircraftFocusPanelProps) {
  const [activeZoom, setActiveZoom] = useState<string>('2x')

  const handleDirection = (direction: 'up' | 'down' | 'left' | 'right') => {
    onDirection?.(direction)
  }

  return (
    <div
      className={`aircraft-focus-panel${visible ? ' aircraft-focus-panel--visible' : ''}`}
      role="dialog"
      aria-label={`${name} 聚焦视图`}
      // data-hover-panel 让 usePanelClamp 将本面板纳入边缘自适应平移兜底，
      // 避免面板在 .map-stage（overflow:hidden）边缘被裁剪显示不全。
      // 平移通过独立的 `translate` 属性注入，与下方 transform 滑入动画互不干扰。
      data-hover-panel
      style={
        aircraftPosition
          ? {
              left: `calc(${aircraftPosition.x}% + 48px)`,
              top: `calc(${aircraftPosition.y}% + 24px - ${PANEL_HEIGHT / 2}px)`,
            }
          : undefined
      }
    >
      {/* ====== 标题栏：名称 + 电池 + 信号 + 关闭 ====== */}
      <div className="aircraft-focus-panel__header">
        <span className="aircraft-focus-panel__name">{name}</span>
        <div className="aircraft-focus-panel__indicators">
          <img
            className="aircraft-focus-panel__battery-icon"
            src={deviceImages.batteryMid}
            alt="电量"
            draggable={false}
          />
          <span className="aircraft-focus-panel__battery-text">{batteryLevel}%</span>
          <img
            className="aircraft-focus-panel__signal-icon"
            src={homeImages.signalIcon}
            alt="信号"
            draggable={false}
          />
        </div>
        <button
          type="button"
          className="aircraft-focus-panel__close"
          onClick={onClose}
          aria-label="关闭聚焦视图"
        >
          <span className="aircraft-focus-panel__close-x" aria-hidden="true" />
        </button>
      </div>

      {/* 分隔线 */}
      <div className="aircraft-focus-panel__separator" />

      {/* ====== 视频画面（213×213，无人机视频回放） ====== */}
      <div className="aircraft-focus-panel__video">
        <video
          className="aircraft-focus-panel__video-stream"
          src="/videos/drone-preview.mp4"
          autoPlay
          loop
          muted
          playsInline
        />
      </div>

      {/* ====== 变焦区域（+/- 按钮 + 倍数按钮 + 右侧罗盘） ====== */}
      <div className="aircraft-focus-panel__zoom-area">
        {/* 左侧：变焦控制行 + 倍数按钮行 */}
        <div className="aircraft-focus-panel__zoom-left">
          {/* 变焦控制（group_7）：左右切换框 + 下拉箭头 */}
          <div className="aircraft-focus-panel__zoom-control">
            <div className="aircraft-focus-panel__zoom-frame">
              <button
                type="button"
                className="aircraft-focus-panel__zoom-side"
                aria-label="放大"
              >
                <span className="aircraft-focus-panel__zoom-plus" />
              </button>
              <span className="aircraft-focus-panel__zoom-divider" />
              <button
                type="button"
                className="aircraft-focus-panel__zoom-side"
                aria-label="缩小"
              >
                <span className="aircraft-focus-panel__zoom-minus" />
              </button>
            </div>
          </div>

          {/* ====== 变焦倍数按钮组（group_8）：2x / 5x / 10x ====== */}
          <div className="aircraft-focus-panel__zoom-levels">
        {ZOOM_LEVELS.map((zoom) => (
          <button
            key={zoom}
            type="button"
            className={`aircraft-focus-panel__zoom-level${activeZoom === zoom ? ' aircraft-focus-panel__zoom-level--active' : ''}`}
            onClick={() => setActiveZoom(zoom)}
          >
            {zoom}
          </button>
        ))}
          </div>
        </div>
        {/* 方向操作罗盘：4等分扇形 + 箭头 + 分割线 */}
        <div className="aircraft-focus-panel__compass" aria-label="方向控制罗盘">
          {/* X形圆环分割线（在4个箭头之间）*/}
          <div className="aircraft-focus-panel__compass-dividers" />
          {/* 上扇形 */}
          <button
            type="button"
            className="aircraft-focus-panel__sector aircraft-focus-panel__sector--up"
            onClick={() => handleDirection('up')}
            aria-label="向上"
          >
            <span className="aircraft-focus-panel__compass-arrow aircraft-focus-panel__compass-arrow--up" />
          </button>
          {/* 右扇形 */}
          <button
            type="button"
            className="aircraft-focus-panel__sector aircraft-focus-panel__sector--right"
            onClick={() => handleDirection('right')}
            aria-label="向右"
          >
            <span className="aircraft-focus-panel__compass-arrow aircraft-focus-panel__compass-arrow--right" />
          </button>
          {/* 下扇形 */}
          <button
            type="button"
            className="aircraft-focus-panel__sector aircraft-focus-panel__sector--down"
            onClick={() => handleDirection('down')}
            aria-label="向下"
          >
            <span className="aircraft-focus-panel__compass-arrow aircraft-focus-panel__compass-arrow--down" />
          </button>
          {/* 左扇形 */}
          <button
            type="button"
            className="aircraft-focus-panel__sector aircraft-focus-panel__sector--left"
            onClick={() => handleDirection('left')}
            aria-label="向左"
          >
            <span className="aircraft-focus-panel__compass-arrow aircraft-focus-panel__compass-arrow--left" />
          </button>
          {/* 中心圆环（覆盖在扇形之上） */}
          <div className="aircraft-focus-panel__compass-center" />
        </div>
      </div>

      {/* 分隔线 */}
      <div className="aircraft-focus-panel__separator" />

      {/* ====== 云台参数 ====== */}
      <div className="aircraft-focus-panel__section-title">云台参数</div>
      <div className="aircraft-focus-panel__info-row aircraft-focus-panel__info-row--dual">
        <span className="aircraft-focus-panel__bar" />
        <span className="aircraft-focus-panel__label">俯仰角</span>
        <span className="aircraft-focus-panel__value">32</span>
        <span className="aircraft-focus-panel__bar aircraft-focus-panel__bar--gap" />
        <span className="aircraft-focus-panel__label">偏航角</span>
        <span className="aircraft-focus-panel__value">12</span>
      </div>
      <div className="aircraft-focus-panel__info-row">
        <span className="aircraft-focus-panel__bar" />
        <span className="aircraft-focus-panel__label">变焦倍数</span>
        <span className="aircraft-focus-panel__value">{activeZoom}</span>
      </div>

      {/* 分隔线 */}
      <div className="aircraft-focus-panel__separator" />

      {/* ====== 设备详情 ====== */}
      <div className="aircraft-focus-panel__section-title">设备详情</div>
      <div className="aircraft-focus-panel__info-row">
        <span className="aircraft-focus-panel__bar" />
        <span className="aircraft-focus-panel__label">位置</span>
        <span className="aircraft-focus-panel__value">
          Lat:0000,&nbsp;Lon:0000,&nbsp;H:0000
        </span>
      </div>
      <div className="aircraft-focus-panel__info-row">
        <span className="aircraft-focus-panel__bar" />
        <span className="aircraft-focus-panel__label">速度</span>
        <span className="aircraft-focus-panel__value">
          X:000&nbsp;Y:000&nbsp;Z:000
        </span>
      </div>
      <div className="aircraft-focus-panel__info-row aircraft-focus-panel__info-row--dual aircraft-focus-panel__info-row--last">
        <span className="aircraft-focus-panel__bar" />
        <span className="aircraft-focus-panel__label">模式</span>
        <span className="aircraft-focus-panel__value">悬停</span>
        <span className="aircraft-focus-panel__bar aircraft-focus-panel__bar--gap" />
        <span className="aircraft-focus-panel__label">状态</span>
        <span className="aircraft-focus-panel__value">待命</span>
      </div>
    </div>
  )
}