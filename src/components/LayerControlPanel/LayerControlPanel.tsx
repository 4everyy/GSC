import { useState, useRef } from 'react'
import { homeImages } from '../../assets/images/home'
import { useLayerStore } from '../../stores/layerStore'
import './LayerControlPanel.css'

interface LayerControlPanelProps {
  /** 面板可见性（由父组件图层按钮控制） */
  visible?: boolean
}

/**
 * 图层开关状态机（4 态）
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │ 状态       │ 视觉                          │ 可点击 │
 * ├────────────┼───────────────────────────────┼────────┤
 * │ on  开启   │ 青绿 PNG（右侧拨钮）          │  ✓     │
 * │ off 关闭   │ 灰 SVG（左实心圆）            │  ✓     │
 * │ error 禁用 │ 灰 SVG（左空心圆 + ⊘）        │  ✓     │
 * │ loading    │ 青绿 SVG（右侧弧形拨钮旋转）  │  ✗     │
 * └─────────────────────────────────────────────────────────┘
 *
 * 注：loading 态按钮自带旋转视觉，无需额外修改 cursor。
 *
 * 切换逻辑（干净一致）：
 *   on      → off      （用户主动关闭，直接切换）
 *   off     → on       （用户主动开启，直接切换）
 *   error   → loading  → on(成功) / error(重试失败)
 *   loading → 不可操作
 *
 * 说明：on ↔ off 是用户控制的简单开关；error 是加载失败异常态，
 * 点击重试走 loading 流程；loading 是中间态，不可操作。
 */
type LayerStatus = 'on' | 'off' | 'error' | 'loading'

interface LayerItem {
  key: string
  label: string
  initialStatus: LayerStatus
}

const STATUS_LABEL: Record<LayerStatus, string> = {
  on: '开启',
  off: '已关闭',
  error: '禁用',
  loading: '加载中',
}

/** 青绿色主题色（取自开启态 PNG 采样 #8bf9eb） */
const ACCENT_COLOR = '#8bf9eb'

/** 模拟异步加载（mock）：默认 70% 成功率、1.5s 延迟 */
function mockLoadLayer(): Promise<boolean> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(Math.random() > 0.3), 1500)
  })
}

const LAYER_ITEMS: LayerItem[] = [
  { key: 'track', label: '航迹', initialStatus: 'off' },
  { key: 'trajectory', label: '轨迹', initialStatus: 'off' },
  { key: 'inspection', label: '巡检区域', initialStatus: 'off' },
  { key: 'nofly', label: '禁飞区', initialStatus: 'off' },
  { key: 'label', label: '设备标签', initialStatus: 'on' },
]

/** 胶囊外壳：48×24，rx=12 圆角，描边 + 半透明填充 */
function ToggleShell({ color }: { color: string }) {
  return (
    <rect
      x="0.75"
      y="0.75"
      width="46.5"
      height="22.5"
      rx="11.25"
      stroke={color}
      strokeWidth="1.5"
      fill={color}
      fillOpacity="0.25"
    />
  )
}

/** 关闭态：灰色外壳 + 左侧实心灰圆 */
function OffSwitch() {
  return (
    <svg width="48" height="24" viewBox="0 0 48 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ToggleShell color="#999" />
      <circle cx="12" cy="12" r="7.5" fill="#999" />
    </svg>
  )
}

/** 禁用态：灰色外壳 + 左侧空心灰圆 + 斜杠 ⊘ */
function ErrorSwitch() {
  return (
    <svg width="48" height="24" viewBox="0 0 48 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ToggleShell color="#999" />
      <circle cx="12" cy="12" r="7.5" fill="transparent" stroke="#999" strokeWidth="1.5" />
      <line x1="6.7" y1="17.3" x2="17.3" y2="6.7" stroke="#999" strokeWidth="1.8" />
    </svg>
  )
}

/** 加载中态：青绿外壳（静止）+ 右侧纯SVG圆环拨钮（持续匀速旋转）。
   完美复刻参考图 layer-toggle-on.png 的视觉特征：
   - 空心圆环（非实心圆），有明确的内外边界
   - 双层渐变色：内缘深青 #60aca2 → 外缘亮青 #7cded2 → 外壳 #8bf9eb
   - 约 75° 缺口（类似参考图），旋转时形成清晰的加载指示
   - 圆环中心 (34, 12)，外半径 9，内半径 5.5（厚度 3.5px）*/
function LoadingSwitch() {
  /* 圆环参数（从参考图像素分析得出，微调位置更靠右） */
  const cx = 37,       // 圆环中心 x（右移3px，更贴近外壳右边缘）
    cy = 12,           // 圆环中心 y（垂直居中）
    rOuter = 8.5,      // 外半径（到达 x≈45.5，距外壳右边缘仅~1.5px）
    rInner = 5         // 内半径（形成明显空心，厚度3.5px）

  /* 圆环平均半径 = (rOuter + rInner) / 2 = 7.25 */
  const rMid = (rOuter + rInner) / 2
  /* 圆环厚度 */
  const thickness = rOuter - rInner // 3.5
  /* 平均周长 */
  const circumference = 2 * Math.PI * rMid // ≈45.6
  /* 弧长占比 ≈ 78%（留约 22% 即 100° 缺口，与参考图一致） */
  const dashLen = Math.round(circumference * 0.78) // ≈36
  const gapLen = Math.round(circumference * 0.22) // ≈10

  return (
    <svg width="48" height="24" viewBox="0 0 48 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 定义渐变：模拟参考图的双色圆环（内深外亮） */}
      <defs>
        <linearGradient id="knobGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60aca2" />   {/* 内缘深青（参考图 x=27-30 采样） */}
          <stop offset="50%" stopColor="#7cded2" />  {/* 中部亮青（参考图 x=41-44 采样） */}
          <stop offset="100%" stopColor="#8bf9eb" />  {/* 外缘主题色（与外壳一致） */}
        </linearGradient>
        {/* 内圆遮罩：将实心圆变为空心圆环 */}
        <mask id="ringMask">
          {/* 白色区域 = 可见（外圆） */}
          <circle cx={cx} cy={cy} r={rOuter} fill="white" />
          {/* 黑色区域 = 遮挡（内圆，形成空心） */}
          <circle cx={cx} cy={cy} r={rInner} fill="black" />
        </mask>
      </defs>

      {/* 外壳：静止不动 */}
      <ToggleShell color={ACCENT_COLOR} />

      {/* 旋转组：围绕圆环中心 (cx, cy) 匀速旋转 */}
      <g>
        {/* 圆环主体：用遮罩实现空心 + 渐变填充 + dasharray 制造缺口 */}
        <circle
          cx={cx}
          cy={cy}
          r={rMid}
          stroke="url(#knobGradient)"
          strokeWidth={thickness}
          fill="none"
          strokeDasharray={`${dashLen} ${gapLen}`}
          strokeLinecap="round"
          mask="url(#ringMask)"
        />
        {/* 围绕圆心匀速旋转，1s/圈 */}
        <animateTransform
          attributeName="transform"
          type="rotate"
          from={`0 ${cx} ${cy}`}
          to={`360 ${cx} ${cy}`}
          dur="1s"
          repeatCount="indefinite"
        />
      </g>
    </svg>
  )
}

export function LayerControlPanel({ visible = true }: LayerControlPanelProps) {
  const [statuses, setStatuses] = useState<Record<string, LayerStatus>>(() =>
    Object.fromEntries(LAYER_ITEMS.map((item) => [item.key, item.initialStatus])),
  )

  // 图层显隐联动 store：三个功能开关同步控制首页对应元素显隐
  const setNoflyZoneVisible = useLayerStore((s) => s.setNoflyZoneVisible)
  const setInspectionZoneVisible = useLayerStore((s) => s.setInspectionZoneVisible)
  const setDeviceLabelsVisible = useLayerStore((s) => s.setDeviceLabelsVisible)

  /** 开关状态 → 首页元素显隐同步（track/trajectory 暂无对应元素，仅记录开关状态） */
  const applyVisibility = (key: string, on: boolean) => {
    if (key === 'nofly') setNoflyZoneVisible(on)
    else if (key === 'inspection') setInspectionZoneVisible(on)
    else if (key === 'label') setDeviceLabelsVisible(on)
  }

  // 防止竞态：记录正在加载的图层 key
  const loadingKeys = useRef<Set<string>>(new Set())

  /** 触发异步加载流程：→ loading → on(成功) / error(失败) */
  const loadLayer = async (key: string) => {
    if (loadingKeys.current.has(key)) return
    loadingKeys.current.add(key)

    setStatuses((prev) => ({ ...prev, [key]: 'loading' }))

    const success = await mockLoadLayer()

    loadingKeys.current.delete(key)
    setStatuses((prev) => ({ ...prev, [key]: success ? 'on' : 'error' }))
    applyVisibility(key, success)
  }

  /** 点击处理：状态机转换 */
  const handleToggle = (item: LayerItem) => {
    const status = statuses[item.key]

    switch (status) {
      case 'on':
        // 开启 → 关闭：同步隐藏首页对应元素
        setStatuses((prev) => ({ ...prev, [item.key]: 'off' }))
        applyVisibility(item.key, false)
        return
      case 'off':
        // 关闭 → 开启：同步显示首页对应元素
        setStatuses((prev) => ({ ...prev, [item.key]: 'on' }))
        applyVisibility(item.key, true)
        return
      case 'error':
        // 禁用 → 重试加载（正常 70% 成功率）
        loadLayer(item.key)
        return
      case 'loading':
        // 加载中：不可操作
        return
    }
  }

  return (
    <div className={`layer-panel${visible ? ' layer-panel--visible' : ''}`}>
      <div className="layer-panel__content">
        <h3 className="layer-panel__title">图层控制</h3>
        <div className="layer-panel__divider" />

        <div className="layer-panel__list">
          {LAYER_ITEMS.map((item) => {
            const status = statuses[item.key]
            const dimmed = status !== 'on'
            return (
              <div className="layer-panel__item" key={item.key}>
                <span className={`layer-panel__label${dimmed ? ' layer-panel__label--dimmed' : ''}`}>
                  {item.label}
                </span>
                <button
                  type="button"
                  className="layer-panel__toggle"
                  onClick={() => handleToggle(item)}
                  aria-pressed={status === 'on'}
                  aria-label={`${item.label}图层（当前：${STATUS_LABEL[status]}），点击切换状态`}
                >
                  {status === 'on' && <img src={homeImages.layerToggleOn} alt="" draggable={false} />}
                  {status === 'off' && <OffSwitch />}
                  {status === 'error' && <ErrorSwitch />}
                  {status === 'loading' && <LoadingSwitch />}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}