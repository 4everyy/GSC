import { BOTTOM_BAR_ITEMS, type BottomBarPanel } from '../../constants'

/** 底部按钮条渲染 props：选中设备集合（禁用态判定）+ 各面板开合状态与互斥切换入口 */
interface BottomBarProps {
  selectedDevices: Set<number>
  panelOpenState: Record<BottomBarPanel, boolean>
  panelHandlers: Record<BottomBarPanel, () => void>
}

/* 底部水平居中按钮条（自 HomePage.tsx 拆出）：13 段背景图拼接，第 2~12 段叠加功能图标。
 * 三层结构：.bottom-bar__item（负 margin + tooltip，pointer-events:none）>
 * .bottom-bar__btn（72px 命中层：clip-path 并集轮廓，静止不动）>
 * .bottom-bar__visual（60px 视觉层：底部对齐，hover 弹性向上顶出）。
 * 命中层不动 + 视觉层上移，鼠标不会因按钮顶出而脱离 hover（避免抖动循环） */
export function BottomBar({ selectedDevices, panelOpenState, panelHandlers }: BottomBarProps) {
  return (
    <nav className="bottom-bar" aria-label="底部功能按钮条">
      {BOTTOM_BAR_ITEMS.map((item, index) => {
        // 禁用态（按选中设备数量）：单机功能需恰好选中 1 台，多机功能需至少选中 1 台；
        // 不满足时按钮进入禁用态（禁用态切图替换默认背景，激活态视觉与 tooltip
        // 一并抑制）。不用原生 disabled 属性——它会抑制浏览器 :hover 匹配，
        // 导致置灰按钮 hover 不顶出；改用 aria-disabled 语义标记 + 点击拦截，
        // 悬停反馈（置灰态顶出）仍可用
        const disabled =
          !!item.disabledBackground &&
          (item.mode === 'single' ? selectedDevices.size !== 1 : selectedDevices.size < 1)
        return (
          <span
            className={`bottom-bar__item${
              item.panel && panelOpenState[item.panel] && item.activeBackground && !disabled
                ? ' bottom-bar__item--active-bg'
                : ''
            }`}
            key={item.background}
          >
            <button
              type="button"
              aria-disabled={disabled || undefined}
              className={`bottom-bar__btn${item.icon ? '' : ' bottom-bar__btn--static'}${disabled ? ' bottom-bar__btn--disabled' : ''}${item.panel && panelOpenState[item.panel] && !disabled ? ' bottom-bar__btn--active' : ''}`}
              aria-label={item.tooltip ?? `功能按钮${index + 1}`}
              style={{ aspectRatio: `${item.width} / 72` }}
              onClick={disabled || !item.panel ? undefined : panelHandlers[item.panel]}
            >
              <span
                className="bottom-bar__visual"
                style={{
                  // 切图文件名（bottom-bar-seg-01.png 等）含连字符，url() 统一加引号
                  // 以避免 unquoted URL 的解析歧义；激活态高亮背景由下方独立层
                  // .bottom-bar__active-glow 承载（button 的 clip-path 会裁剪发光边缘，
                  // 且元素背景无法绘制到自身盒外，视觉层内无法完整呈现激活态切图）
                  // 禁用态直接替换默认背景（两套切图规格一致，几何像素级兼容）
                  backgroundImage: `url("${disabled ? (item.disabledBackground ?? item.background) : item.background}")`,
                }}
              >
                {item.icon && (
                  <img
                    className="bottom-bar__icon"
                    src={item.icon}
                    alt=""
                    draggable={false}
                  />
                )}
              </span>
            </button>
            {/* 激活态背景独立层（第 2~12 段功能按钮均提供 activeBackground）：
              切图画布统一 76px 高，实体区 60px 高、宽与默认段一致，四周为发光/投影边缘。
              置于 button 之外避免被其 clip-path 裁剪；内含图标副本与视觉层图标重合，
              激活时淡入覆盖默认段，关闭时淡出，与默认背景形成交叉过渡 */}
            {item.activeBackground && !disabled && (
              <span
                className="bottom-bar__active-glow"
                style={{
                  backgroundImage: `url("${item.activeBackground}")`,
                  // 画布宽 = 段宽 + 16（左右各 8px 发光边缘）：left/width 按段宽换算百分比
                  // （left = -8/段宽、width = (段宽+16)/段宽），实体区与默认段像素级重合
                  left: `${Math.round((-8 / item.width) * 100 * 100) / 100}%`,
                  width: `${Math.round(((item.width + 16) / item.width) * 100 * 100) / 100}%`,
                }}
                aria-hidden="true"
              >
                {item.icon && (
                  <img
                    className="bottom-bar__icon bottom-bar__icon--active-glow"
                    src={item.icon}
                    alt=""
                    draggable={false}
                  />
                )}
              </span>
            )}
            {item.tooltip && !disabled && (
              <span className="bottom-bar__tip">{item.tooltip}</span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
