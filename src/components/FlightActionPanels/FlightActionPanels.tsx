import { homeImages } from '../../assets/images/home/index'
import './FlightActionPanels.css'
import { useState, useEffect, type ReactNode } from 'react'
import { PanelShell, PanelTabs, type PanelTab, HeightStepper, FormationSelect } from '../PanelKit/PanelKit'
import { AircraftListSection, type AircraftListItem, AircraftListPanel } from '../home/panels/FlightCommandPanels'


interface MissionRoute {
  id: number
  color: string
  selected: boolean
}

const routes: MissionRoute[] = [
  { id: 1, color: '#8B9DAE', selected: false },
  { id: 2, color: '#8B9DAE', selected: false },
  { id: 3, color: '#8B9DAE', selected: false },
  { id: 4, color: '#8B9DAE', selected: false },
  { id: 5, color: '#4CAF50', selected: true },
  { id: 6, color: '#4CAF50', selected: true },
]

export function MissionPanel() {
  return (
    <section className="mission-panel" aria-label="编队任务">
      <div className="mission-routes">
        {routes.map((route) => (
          <div
            key={route.id}
            className={`mission-route ${route.selected ? 'mission-route--selected' : ''}`}
            style={{ borderColor: route.color }}
          >
            <span className="mission-route__dot" style={{ backgroundColor: route.color }}></span>
          </div>
        ))}
      </div>

      <div className="mission-aircraft-center">
        <img
          className="mission-aircraft-icon"
          src={homeImages.aircraftRed}
          alt="执行任务的飞行器"
        />
      </div>
    </section>
  )
}

/**
 * TakeoffPanel —— 起飞参数面板。
 *
 * 交互流程（对应设计稿 group_10）：
 * - 底部按钮条点击「起飞」→ 按钮保持弹出状态 + 本面板出现在右上角；
 * - 「参数设置 / 飞机列表」tab 栏复用公共组件 PanelTabs；
 * - 起飞高度：−/+ 步进器复用公共组件 HeightStepper（步长 1m，最低 1m，不设上限，
 *   PRD DC-P0-01 仅约束「大于 0 的数字」）；
 * - 飞机列表 tab：复用 AircraftListSection（与降落面板同款列表样式），
 *   数据由 HomePage 依据 deviceLinkStore 选中设备计算后传入；
 * - 「确认」回调 onConfirm(height)，「取消」回调 onCancel() 关闭面板。
 *
 * 外壳（背景/切角/标题/底部确认取消按钮）复用 PanelShell。
 */

export type { AircraftListItem }

export interface TakeoffPanelProps {
  /** 飞机列表：HomePage 依据选中设备计算（名称真实，遥测暂取配置值） */
  aircraft?: AircraftListItem[]
  /** 行删除回调（取消选中该机）；传入后行尾显示删除图标 */
  onRemove?: (id: string) => void
  /** 确认起飞：携带当前设置的起飞高度（米） */
  onConfirm: (height: number) => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function TakeoffPanel({ aircraft, onRemove, onConfirm, onCancel }: TakeoffPanelProps) {
  const [tab, setTab] = useState<PanelTab>('params')
  const [height, setHeight] = useState(10)

  return (
    <PanelShell
      title="起飞"
      className="takeoff-panel"
      ariaLabel="起飞参数面板"
      onConfirm={() => onConfirm(height)}
      onCancel={onCancel}
    >
      {/* tab 栏：参数设置（默认选中）/ 飞机列表 */}
      <PanelTabs tab={tab} onChange={setTab} />

      {tab === 'params' ? (
        <div className="takeoff-panel__params">
          <HeightStepper
            label="起飞高度"
            height={height}
            onChange={setHeight}
            editable
            max={Number.MAX_SAFE_INTEGER}
            minusAriaLabel="减小起飞高度"
            plusAriaLabel="增大起飞高度"
          />
        </div>
      ) : (
        /* 飞机列表 tab：与降落面板同款列表（展示当前选中飞机） */
        <div className="takeoff-panel__aircraft-list">
          <AircraftListSection aircraft={aircraft ?? []} showSectionTitle={false} onRemove={onRemove} />
        </div>
      )}
    </PanelShell>
  )
}

/**
 * ReturnHomePanel —— 返航面板（底部条第 4 段按钮「返航」）。
 *
 * 结构与起飞面板相同：
 * - 外壳（背景/切角/标题/底部按钮）复用 PanelShell；
 * - 「参数设置 / 飞机列表」tab 栏复用 PanelTabs；
 * - 返航高度：−/+ 步进器复用 HeightStepper（默认 10m，支持手动键入 editable，
 *   最低 1m 不设上限，与起飞面板一致）；
 * - 交互状态流：打开面板即可点「航线生成」（高度默认 10m 有效），
 *   点击「航线生成」画出航线后「确认」解除置灰（confirmMuted 由 HomePage 联动），
 *   「航线生成」点击后置灰（middleMuted 由 HomePage 联动，统一交互规范）；
 * - 「确认」回调 onConfirm(height)，「取消」回调 onCancel() 关闭面板。
 */

export interface ReturnHomePanelProps {
  /** 飞机列表（当前选中飞机），缺省空列表 */
  aircraft?: AircraftListItem[]
  /** 行删除回调（取消选中该机）；传入后行尾图标变为删除按钮 */
  onRemove?: (id: string) => void
  /** 确认返航：携带当前设置的返航高度（米） */
  onConfirm: (height: number) => void
  /** 确认按钮置灰态：未生成返航航线（HomePage returnHomeLine 为空）前置灰，生成后解除；二次滑窗确认后再置灰 */
  confirmMuted?: boolean
  /** 「航线生成」中间按钮置灰态：点击生成航线后置灰（统一交互：生成后不可重复点击），默认 false */
  middleMuted?: boolean
  /** 航线生成：选中飞机 → 上方返航点连线（中间按钮）；面板打开即可点击 */
  onGenerateRoute?: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function ReturnHomePanel({
  aircraft,
  onRemove,
  onConfirm,
  confirmMuted = false,
  middleMuted = false,
  onGenerateRoute,
  onCancel,
}: ReturnHomePanelProps) {
  const [tab, setTab] = useState<PanelTab>('params')
  const [height, setHeight] = useState(10)
  // 高度默认 10m 即有效：「航线生成」打开面板即可点击（不再要求先输入高度），
  // 「确认」仍由 HomePage 依据航线连线是否已生成（confirmMuted）解除
  const handleHeightChange = (v: number) => {
    setHeight(v)
  }

  return (
    <PanelShell
      title="返航"
      className="return-home-panel"
      ariaLabel="返航参数面板"
      middleText="航线生成"
      middleMuted={middleMuted}
      confirmMuted={confirmMuted}
      onConfirm={() => onConfirm(height)}
      // 航线生成：直接触发（高度默认值有效，不再静默拦截）
      onMiddle={() => onGenerateRoute?.()}
      onCancel={onCancel}
    >
      {/* tab 栏：参数设置（默认选中）/ 飞机列表 */}
      <PanelTabs tab={tab} onChange={setTab} />

      {tab === 'params' ? (
        <div className="return-home-panel__params">
          <HeightStepper
            label="返航高度"
            height={height}
            onChange={handleHeightChange}
            editable
            max={Number.MAX_SAFE_INTEGER}
            minusAriaLabel="减小返航高度"
            plusAriaLabel="增大返航高度"
          />
        </div>
      ) : (
        /* Aircraft list tab: shared list section fed by HomePage selected aircraft */
        <div className="return-home-panel__aircraft-list">
          <AircraftListSection
            aircraft={aircraft ?? []}
            showSectionTitle={false}
            onRemove={onRemove}
          />
        </div>
      )}
    </PanelShell>
  )
}

/**
 * TapReturnPanel —— 指点返航面板（底部条第 5 段按钮「指点返航」）。
 *
 * 结构：
 * - 外壳（背景/切角/标题/底部按钮）复用 PanelShell；
 * - 「参数设置」区块头 + 返航高度 −/+ 步进行（HeightStepper，默认 10m）；
 * - 环绕飞行面板复用时可通过 radiusLabel 追加第二行步进（盘旋半径，默认 50m）；
 * - 高度/半径两行数值默认不设上限（最低 1m），需收紧的复用方经 heightMax/radiusMax 传入；
 * - editable 开启后两行数值框支持手动键入数字（环绕飞行）；
 * - 编队飞行面板复用时可通过 children 在步进行与航点信息行之间插入队形选择行；
 * - 航点信息行：纬度 000.00 N° / 经度 000.00 E° 两个坐标输入框；
 * - 底部三按钮「确认 / 航线生成 / 取消」（PanelShell middleText）。
 */

export interface TapReturnPanelProps {
  /** 面板标题，默认「指点返航」（航点飞行面板复用时传「航点飞行」） */
  title?: string
  /** 高度步进行标签，默认「返航高度」（航点飞行传「飞行高度」） */
  heightLabel?: string
  /** 半径步进行标签：传入即在高度行下方追加第二行步进（环绕飞行传「盘旋半径」），默认不显示 */
  radiusLabel?: string
  /** 数值框可手动输入数字（环绕飞行盘旋高度/盘旋半径），默认 false 仅 −/+ 步进 */
  editable?: boolean
  /** 高度行数值上限，默认不设上限（最低 1m）；需收紧的复用方显式传入 */
  heightMax?: number
  /** 半径行数值上限（仅 radiusLabel 存在的复用方生效），默认不设上限（最低 1m） */
  radiusMax?: number
  /** 页面级定位钩子类名，默认「tap-return-panel」 */
  className?: string
  /** 确认按钮置灰态（航点飞行设计稿确认钮为灰色），默认 false */
  confirmMuted?: boolean
  /** 「航线生成」中间按钮置灰态（航线飞行设计稿为灰边灰字），默认 false */
  middleMuted?: boolean
  /** 是否显示航点信息行（航线飞行面板无此行），默认 true */
  showWaypoint?: boolean
  /** 地图取点回填的航点坐标（指点返航取点模式），变化时同步进坐标输入框 */
  waypoint?: { lat: number; lng: number } | null
  /** 额外参数行（如编队飞行的队形选择行），渲染在步进行与航点信息行之间 */
  children?: ReactNode
  /** 确认：携带当前设置的高度（米）；带半径步进行的面板（环绕飞行）追加盘旋半径（米） */
  onConfirm: (height: number, radius?: number) => void
  /** 半径步进值变化回调（环绕飞行面板用于联动地图盘旋圆），默认不触发 */
  onRadiusChange?: (radius: number) => void
  /** 航线生成（暂记录日志，待接入真实链路） */
  onGenerateRoute?: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function TapReturnPanel({
  title = '指点返航',
  heightLabel = '返航高度',
  radiusLabel,
  editable = false,
  heightMax = Number.MAX_SAFE_INTEGER,
  radiusMax = Number.MAX_SAFE_INTEGER,
  className = 'tap-return-panel',
  confirmMuted = false,
  middleMuted = false,
  showWaypoint = true,
  waypoint,
  children,
  onConfirm,
  onRadiusChange,
  onGenerateRoute,
  onCancel,
}: TapReturnPanelProps) {
  const [height, setHeight] = useState(10)
  const [radius, setRadius] = useState(50)
  const [lat, setLat] = useState('000.00')
  const [lng, setLng] = useState('000.00')

  // 地图取点回填：格式化为 6 位（xxx.xx，不足前补 0；N°/E° 单位语义下取绝对值）。
  // 坐标在渲染期依据 waypoint 引用变化直接派生（避免 effect 内同步 setState）。
  const [prevWaypoint, setPrevWaypoint] = useState(waypoint)
  if (prevWaypoint !== waypoint) {
    setPrevWaypoint(waypoint)
    if (waypoint) {
      setLat(Math.abs(waypoint.lat).toFixed(2).padStart(6, '0'))
      setLng(Math.abs(waypoint.lng).toFixed(2).padStart(6, '0'))
    }
  }

  // 半径变化（−/+ 步进或手动输入）时通知页面联动地图盘旋圆
  useEffect(() => {
    onRadiusChange?.(radius)
  }, [radius, onRadiusChange])

  return (
    <PanelShell
      title={title}
      className={className}
      ariaLabel={`${title}面板`}
      middleText="航线生成"
      confirmMuted={confirmMuted}
      middleMuted={middleMuted}
      onConfirm={() => onConfirm(height, radiusLabel ? radius : undefined)}
      onMiddle={onGenerateRoute}
      onCancel={onCancel}
    >
      {/* 区块头「参数设置」：渐变底 */}
      <div className="tap-return-panel__section">
        <span className="tap-return-panel__section-title">参数设置</span>
      </div>

      <div className="tap-return-panel__params">
        {/* 高度：−/+ 步进，默认 10m；editable 时支持手动键入；上限默认不设（heightMax 可收紧） */}
        <HeightStepper
          label={heightLabel}
          height={height}
          onChange={setHeight}
          editable={editable}
          max={heightMax}
          minusAriaLabel={`减小${heightLabel}`}
          plusAriaLabel={`增大${heightLabel}`}
        />

        {/* 半径：−/+ 步进，默认 50m（环绕飞行面板「盘旋半径」行）；editable 时支持手动键入；上限默认不设（radiusMax 可收紧） */}
        {radiusLabel && (
          <HeightStepper
            label={radiusLabel}
            height={radius}
            onChange={setRadius}
            editable={editable}
            max={radiusMax}
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

/**
 * LandingPanel —— 降落面板。
 *
 * 降落面板与起飞面板结构类似：外壳（背景/切角/标题/底部确认取消按钮）与
 * 「飞机列表」区块均已抽取为公共组件，此处仅做标题定制（title=降落）与
 * 页面级定位（className=landing-panel，定位规则声明于 HomePage.css）。
 *
 * 列表内容/样式实现详见 AircraftListPanel。
 */

export type LandingAircraft = AircraftListItem

export interface LandingPanelProps {
  /** 飞机列表，缺省使用设计稿示例数据 */
  aircraft?: LandingAircraft[]
  /** 行删除回调（取消选中该机）；传入后行尾显示删除图标 */
  onRemove?: (id: string) => void
  /** 确认降落 */
  onConfirm: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function LandingPanel({ aircraft, onRemove, onConfirm, onCancel }: LandingPanelProps) {
  return (
    <AircraftListPanel
      title="降落"
      className="landing-panel"
      aircraft={aircraft}
      onRemove={onRemove}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}

/**
 * FormationFlightPanel —— 编队飞行面板（底部条第 12 段按钮「编队飞行」）。
 *
 * 设计稿结构与指点返航/航点飞行同族，最大化复用 TapReturnPanel：
 * - 标题「编队飞行」+ 「参数设置」区块头 + 飞行高度 −/+ 步进（默认 10m）；
 * - children 插槽注入「队形选择」下拉选择行（公共 FormationSelect，默认「人字形」）；
 * - 航点信息行：纬度 000.00 N° / 经度 000.00 E° 两个坐标输入框；
 * - 底部「确认（灰）/ 航线生成 / 取消」三按钮。
 */

/** 编队队形选项（默认「人字形」，其余为常见队形，待指令链路确认后调整） */
const FORMATIONS = ['人字形', '一字型', '三角型'] as const
export type FormationFlightFormation = (typeof FORMATIONS)[number]

export interface FormationFlightPanelProps {
  /** 地图取点回填的航点坐标（编队飞行取点模式），变化时同步进坐标输入框 */
  waypoint?: { lat: number; lng: number } | null
  /** 「确认」置灰态：默认置灰，航线生成成功后由父层解除（传 false） */
  confirmMuted?: boolean
  /** 「航线生成」中间按钮置灰态：航线已生成（实线）后置灰防重复生成，默认 false */
  middleMuted?: boolean
  /* ---- 受控状态（可选）：父层持有可在面板收起/重开间保留已设置信息 ---- */
  /** 编队队形 */
  formation?: FormationFlightFormation
  onFormationChange?: (formation: FormationFlightFormation) => void
  /** 确认编队飞行：携带当前设置的飞行高度（m）与所选队形 */
  onConfirm: (height: number, formation: FormationFlightFormation) => void
  /** 航线生成（暂记录日志，待接入真实指令链路） */
  onGenerateRoute: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function FormationFlightPanel({
  waypoint,
  confirmMuted = false,
  middleMuted = false,
  formation: formationProp,
  onFormationChange,
  onConfirm,
  onGenerateRoute,
  onCancel,
}: FormationFlightPanelProps) {
  // 内部兜底状态：父层未传受控 props 时使用；传了则以 props 为准
  const [innerFormation, setInnerFormation] = useState<FormationFlightFormation>('人字形')
  const formation = formationProp ?? innerFormation
  const setFormation = onFormationChange ?? setInnerFormation

  return (
    <TapReturnPanel
      title="编队飞行"
      heightLabel="飞行高度"
      className="formation-flight-panel"
      // 飞行高度支持手动键入（上限默认不设，TapReturnPanel 内置，最低 1m）
      editable
      confirmMuted={confirmMuted}
      middleMuted={middleMuted}
      waypoint={waypoint}
      onConfirm={(height) => onConfirm(height, formation)}
      onGenerateRoute={onGenerateRoute}
      onCancel={onCancel}
    >
      {/* 队形选择：标签居左、下拉选择器居右（公共 FormationSelect 组件） */}
      <FormationSelect
        label="队形选择"
        options={FORMATIONS}
        value={formation}
        onChange={setFormation}
      />
    </TapReturnPanel>
  )
}

/**
 * OrbitFlightPanel —— 环绕飞行面板（底部条第 10 段按钮「环绕飞行」）。
 *
 * 与指点返航/航点飞行面板结构一致（参数设置区块头 + 盘旋高度 + 盘旋半径 + 航点信息 +
 * 确认/航线生成/取消），仅多一行「盘旋半径」步进，通过 TapReturnPanel 的 radiusLabel
 * 参数化追加，不重复任何样式。盘旋高度/盘旋半径除 −/+ 步进外支持手动键入数字（editable）。
 * 环绕中心取点与半径步进由 HomePage 驱动地图图钉/盘旋圆；点击「航线生成」后盘旋圆/
 * 最近点连线由虚线定格为实线并解除「确认」置灰，确认走二次滑动确认弹窗。
 */

export interface OrbitFlightPanelProps {
  /** 环绕中心航点（地图取点回填，null = 尚未取点） */
  waypoint?: { lat: number; lng: number } | null
  /** 确认按钮置灰态：未点击「航线生成」定格实线前置灰，生成后解除 */
  confirmMuted?: boolean
  /** 「航线生成」中间按钮置灰态：航线已生成（实线）后置灰防重复生成，默认 false */
  middleMuted?: boolean
  /** 确认：携带当前设置的盘旋高度（米）与盘旋半径（米，未开启半径步进时缺省） */
  onConfirm: (height: number, radius?: number) => void
  /** 盘旋半径步进回调：驱动地图盘旋圆像素半径实时刷新 */
  onRadiusChange: (radius: number) => void
  /** 航线生成：已取点（虚线）→ 虚线定格为实线并解除确认置灰；已生成实线 → 清除旧航点重新取点 */
  onGenerateRoute?: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function OrbitFlightPanel({
  waypoint,
  confirmMuted = false,
  middleMuted = false,
  onConfirm,
  onRadiusChange,
  onGenerateRoute,
  onCancel,
}: OrbitFlightPanelProps) {
  return (
    <TapReturnPanel
      title="环绕飞行"
      heightLabel="盘旋高度"
      radiusLabel="盘旋半径"
      editable
      className="orbit-flight-panel"
      waypoint={waypoint}
      confirmMuted={confirmMuted}
      middleMuted={middleMuted}
      onConfirm={onConfirm}
      onRadiusChange={onRadiusChange}
      onGenerateRoute={onGenerateRoute}
      onCancel={onCancel}
    />
  )
}

/**
 * WaypointFlightPanel —— 航点飞行面板（底部条第 8 段按钮「航点飞行」）。
 *
 * 与指点返航面板结构完全一致（参数设置区块头 + 高度步进 + 航点信息 + 确认/航线生成/取消），
 * 仅标题（航点飞行）、高度标签（飞行高度）与按钮置灰透传几处不同，
 * 飞行高度数值框支持手动键入（editable）且不设上限，故直接复用参数化后的
 * TapReturnPanel，不重复任何样式。
 */

export interface WaypointFlightPanelProps {
  /** 航点坐标回填（跟随/定格后的 WGS84 经纬度，展示在航点信息输入框） */
  waypoint?: { lat: number; lng: number } | null
  /** 确认按钮置灰态：取点完成（waypoint 定格）前置灰，定格后取消置灰，默认 false */
  confirmMuted?: boolean
  /** 「航线生成」中间按钮置灰态：航线已生成（实线）后置灰防重复生成，默认 false */
  middleMuted?: boolean
  /** 确认：携带当前设置的飞行高度（米） */
  onConfirm: (height: number) => void
  /** 航线生成（暂记录日志，待接入真实链路） */
  onGenerateRoute?: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

export function WaypointFlightPanel({
  waypoint,
  confirmMuted = false,
  middleMuted = false,
  onConfirm,
  onGenerateRoute,
  onCancel,
}: WaypointFlightPanelProps) {
  return (
    <TapReturnPanel
      title="航点飞行"
      heightLabel="飞行高度"
      className="waypoint-flight-panel"
      // 飞行高度支持手动键入（上限默认不设，TapReturnPanel 内置，最低 1m）
      editable
      confirmMuted={confirmMuted}
      middleMuted={middleMuted}
      waypoint={waypoint}
      onConfirm={onConfirm}
      onGenerateRoute={onGenerateRoute}
      onCancel={onCancel}
    />
  )
}

/**
 * RallyPointPanel —— 集结点面板（底部条第 11 段按钮「集结点」）。
 *
 * 结构与区域降落/环绕飞行面板相同（最大化复用公共组件）：
 * - 外壳（背景/切角/标题/底部按钮）复用 PanelShell，确认按钮为设计稿置灰态（confirmMuted）；
 * - 「参数设置 / 飞机列表」tab 栏复用 PanelTabs；
 * - 参数设置 tab：起飞高度 −/+ 步进器复用 HeightStepper（单位 m，默认 10，
 *   支持手动键入 editable，最低 1 不设上限）
 *   + 集结速度步进器（单位 m/s，默认 10，支持手动键入，最低 1 不设上限）
 *   + 集结队形下拉选择行复用 FormationSelect（标签居左、选择器居右，默认「人字形」）；
 * - 飞机列表 tab：复用 AircraftListSection（区块头 + 列表行，与降落面板共用）；
 * - 底部「确认（灰）/ 航线生成 / 取消」三按钮（middleText 三按钮布局）。
 */

/** 集结队形选项（默认「人字形」，其余为常见队形，待指令链路确认后调整） */
export type RallyPointFormation = FormationFlightFormation

export interface RallyPointPanelProps {
  /** 确认集结：携带当前设置的起飞高度（m）、集结速度（m/s）与所选队形 */
  aircraft?: AircraftListItem[]
  onRemove?: (id: string) => void
  onConfirm: (height: number, speed: number, formation: RallyPointFormation) => void
  /** 航线生成（暂记录日志，待接入真实指令链路） */
  onGenerateRoute: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
  /** 「航线生成」置灰态：未确定集结区域前置灰，区域框选「确定」后解禁可点击 */
  routeMuted?: boolean
  /** 「确认」置灰态：默认置灰，航线生成成功后由父层解除（传 false） */
  confirmMuted?: boolean
  /* ---- 受控状态（可选）：父层持有可在面板收起/重开间保留已设置信息 ---- */
  /** 集结队形 */
  formation?: RallyPointFormation
  onFormationChange?: (formation: RallyPointFormation) => void
}

export function RallyPointPanel({
  aircraft,
  onRemove,
  onConfirm,
  onGenerateRoute,
  onCancel,
  routeMuted,
  confirmMuted = true,
  formation: formationProp,
  onFormationChange,
}: RallyPointPanelProps) {
  // 内部兜底状态：父层未传受控 props 时使用；传了则以 props 为准
  const [tab, setTab] = useState<PanelTab>('params')
  const [height, setHeight] = useState(10)
  const [speed, setSpeed] = useState(10)
  const [innerFormation, setInnerFormation] = useState<RallyPointFormation>('人字形')
  const formation = formationProp ?? innerFormation
  const setFormation = onFormationChange ?? setInnerFormation

  return (
    <PanelShell
      title="集结点"
      className="rally-point-panel"
      ariaLabel="集结点参数面板"
      confirmMuted={confirmMuted}
      middleText="航线生成"
      middleMuted={routeMuted}
      onConfirm={() => onConfirm(height, speed, formation)}
      onMiddle={onGenerateRoute}
      onCancel={onCancel}
    >
      {/* tab 栏：参数设置（默认选中）/ 飞机列表 */}
      <PanelTabs tab={tab} onChange={setTab} />

      {tab === 'params' ? (
        <div className="rally-point-panel__params">
          <HeightStepper
            label="起飞高度"
            height={height}
            onChange={setHeight}
            unit="m"
            editable
            max={Number.MAX_SAFE_INTEGER}
            minusAriaLabel="减小起飞高度"
            plusAriaLabel="增大起飞高度"
          />
          <HeightStepper
            label="集结速度"
            height={speed}
            onChange={setSpeed}
            unit="m/s"
            min={1}
            max={Number.MAX_SAFE_INTEGER}
            editable
            minusAriaLabel="减小集结速度"
            plusAriaLabel="增大集结速度"
          />
          {/* 集结队形：标签居左、下拉选择器居右（公共 FormationSelect 组件） */}
          <FormationSelect
            label="集结队形"
            options={FORMATIONS}
            value={formation}
            onChange={setFormation}
          />
        </div>
      ) : (
        /* 飞机列表 tab：复用飞机列表区块 */
        <AircraftListSection
          aircraft={aircraft ?? []}
          showSectionTitle={false}
          onRemove={onRemove}
        />
      )}
    </PanelShell>
  )
}

/**
 * RouteFlightPanel —— 航线飞行面板（底部条第 9 段按钮「航线飞行」）。
 *
 * 与指点返航面板结构基本一致（参数设置区块头 + 飞行高度步进 + 确认/航线生成/取消），
 * 差异：
 * - 无单点航点信息行、确认与「航线生成」按钮初始置灰——点击「航线生成」进入取点
 *   （光标变带编号的航线图钉，左键逐点追加航点），右键/Esc 结束取点后航线定格，「确认」解除置灰；
 * - 飞行高度下方蓝色分割线 + 「航线信息」区：标题行 + 逐航点行
 *   （航点 + 圆形序号 + 纬度 000.00 N° / 经度 000.00 E°，设计稿 group_8）。
 * 参数区复用参数化后的 TapReturnPanel（飞行高度支持手动键入且不设上限），
 * 航线信息区经 children 槽位插入，不重复外壳样式。
 */

/** 航点信息行：地图取点回传的经纬度（面板内仅只读展示） */
export interface RouteWaypoint {
  lat: number
  lng: number
}

export interface RouteFlightPanelProps {
  /** 航线就绪（已取点定格）后解除「确认」置灰，默认 false 保持置灰 */
  confirmReady?: boolean
  /** 「航线生成」中间按钮置灰态：默认随 confirmReady（未就绪置灰），
   *  传入 true 强制置灰（航线已生成后防重复生成） */
  routeMuted?: boolean
  /** 航点列表：逐行展示（航点 序号 纬度 N° / 经度 E°），随地图取点实时更新 */
  waypoints?: RouteWaypoint[]
  /** 确认：携带当前设置的飞行高度（米） */
  onConfirm: (height: number) => void
  /** 航线生成：进入地图取点模式（暂记录日志，待接入真实链路） */
  onGenerateRoute?: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
}

/** 经纬度格式化：6 位 xxx.xx，不足前补 0（N°/E° 单位语义下取绝对值） */
const formatCoord = (v: number) => Math.abs(v).toFixed(2).padStart(6, '0')

export function RouteFlightPanel({
  confirmReady = false,
  routeMuted,
  waypoints = [],
  onConfirm,
  onGenerateRoute,
  onCancel,
}: RouteFlightPanelProps) {
  return (
    <TapReturnPanel
      title="航线飞行"
      heightLabel="飞行高度"
      className="route-flight-panel"
      // 飞行高度支持手动键入（上限默认不设，TapReturnPanel 内置，最低 1m）
      editable
      confirmMuted={!confirmReady}
      middleMuted={routeMuted ?? !confirmReady}
      showWaypoint={false}
      onConfirm={onConfirm}
      onGenerateRoute={onGenerateRoute}
      onCancel={onCancel}
    >
      {/* 航线信息区：蓝色分割线 + 标题行 + 逐航点行（无航点时仅展示分割线与标题） */}
      <div className="route-flight-panel__routes">
        <div className="route-flight-panel__divider" />
        <span className="route-flight-panel__routes-title">航线信息</span>
        <div className="route-flight-panel__waypoint-list">
          {waypoints.map((wp, i) => (
            <div className="route-flight-panel__waypoint-row" key={i}>
              <span className="route-flight-panel__waypoint-label">航点</span>
              <span className="route-flight-panel__waypoint-index">{i + 1}</span>
              <span className="route-flight-panel__waypoint-coord">{formatCoord(wp.lat)}</span>
              <span className="route-flight-panel__waypoint-unit">N°</span>
              <span className="route-flight-panel__waypoint-coord">{formatCoord(wp.lng)}</span>
              <span className="route-flight-panel__waypoint-unit route-flight-panel__waypoint-unit--last">
                E°
              </span>
            </div>
          ))}
        </div>
      </div>
    </TapReturnPanel>
  )
}
