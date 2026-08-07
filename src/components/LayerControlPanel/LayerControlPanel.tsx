import { useState, useRef } from 'react'
import { homeImages } from '../../assets/images/home'
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
  /** 演示标记：从 off 开启时走 loading 流程并固定失败（仅巡检区域演示用） */
  demoFailLoad?: boolean
}

const STATUS_LABEL: Record<LayerStatus, string> = {
  on: '开启',
  off: '已关闭',
  error: '禁用',
  loading: '加载中',
}

/** 青绿色主题色（取自开启态 PNG 采样 #8bf9eb） */
const ACCENT_COLOR = '#8bf9eb'

/** 模拟异步加载（mock）：默认 70% 成功率、1.5s 延迟；forceFail=true 时固定失败 */
function mockLoadLayer(forceFail = false): Promise<boolean> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(!forceFail && Math.random() > 0.3), 1500)
  })
}

const LAYER_ITEMS: LayerItem[] = [
  { key: 'track', label: '航迹', initialStatus: 'off' },
  { key: 'trajectory', label: '轨迹', initialStatus: 'off' },
  { key: 'inspection', label: '巡检区域', initialStatus: 'off', demoFailLoad: true },
  { key: 'nofly', label: '禁飞区', initialStatus: 'on' },
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

/** 加载中态：青绿外壳 + 右侧从设计稿抠出的圆环拨钮旋转。
   圆环 PNG（20×20）从 layer-toggle-on-2.png 精确居中抠取，
   圆环质心 (37.77, 11.53) 作为 PNG 几何中心 → 旋转零偏心，不超出外壳。 */
function LoadingSwitch() {
  return (
    <svg width="48" height="24" viewBox="0 0 48 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ToggleShell color={ACCENT_COLOR} />
      {/* 圆环 PNG：20×20，左上角定位 (27.77, 1.53) 使中心 = 圆环质心 (37.77, 11.53) */}
      <image
        className="layer-panel__spinner"
        href={homeImages.layerToggleKnob}
        x="27.77"
        y="1.53"
        width="20"
        height="20"
      />
    </svg>
  )
}

export function LayerControlPanel({ visible = true }: LayerControlPanelProps) {
  const [statuses, setStatuses] = useState<Record<string, LayerStatus>>(() =>
    Object.fromEntries(LAYER_ITEMS.map((item) => [item.key, item.initialStatus])),
  )

  // 防止竞态：记录正在加载的图层 key
  const loadingKeys = useRef<Set<string>>(new Set())

  /** 触发异步加载流程：→ loading → on(成功) / error(失败) */
  const loadLayer = async (key: string, forceFail = false) => {
    if (loadingKeys.current.has(key)) return
    loadingKeys.current.add(key)

    setStatuses((prev) => ({ ...prev, [key]: 'loading' }))

    const success = await mockLoadLayer(forceFail)

    loadingKeys.current.delete(key)
    setStatuses((prev) => ({ ...prev, [key]: success ? 'on' : 'error' }))
  }

  /** 点击处理：状态机转换 */
  const handleToggle = (item: LayerItem) => {
    const status = statuses[item.key]

    switch (status) {
      case 'on':
        // 开启 → 关闭
        setStatuses((prev) => ({ ...prev, [item.key]: 'off' }))
        return
      case 'off':
        // 关闭 → 开启
        if (item.demoFailLoad) {
          // 巡检区域演示：off → loading → error（固定加载失败）
          loadLayer(item.key, true)
        } else {
          setStatuses((prev) => ({ ...prev, [item.key]: 'on' }))
        }
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
                  {status === 'on' && <img src={homeImages.layerToggleOn3} alt="" draggable={false} />}
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