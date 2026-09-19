import { useState } from 'react'
import { useTaskAreaStore, useLayerStore } from '../../stores/index'
import { taskAreaTypeMeta } from '../../api/index'
import { deviceImages } from '../../assets/images/device/index'
import { homeImages } from '../../assets/images/home/index'
import { taskPanelImages } from '../../assets/images/task-panel/index'
import './AreaPanels.css'
import { PanelShell, PanelTabs, type PanelTab, HeightStepper } from '../PanelKit/PanelKit'
import { AircraftListSection, type AircraftListItem } from '../home/panels/FlightCommandPanels'

/**
 * AreaListPanel —— 区域列表面板（工具栏「区域规划」按钮，index 1）。
 *
 * 数据源：taskAreaStore（与态势图 TaskAreaLayer 渲染的是同一份数据）——
 * 列表与地图多边形天然一致；初始为本地 mock 数据（config/taskAreas.ts），
 * 支持绘制新增与编辑（纯前端，无 HTTP 请求）。
 * 交互：
 * - 筛选栏「全选」复选框（三态：全选/部分选中/未选，作用于当前列表全部区域）；
 * - 行首复选框勾选区域（勾上且区域处于显示状态时联动聚焦态势图，
 *   取消勾选不触发）；行常规(灰)/hover(橙)/选中(蓝) 三态背景图
 *   与目标列表面板（TargetListPanel）完全一致；
 * - 行尾操作图标组：编辑（进入地图绘制编辑态）/ 显示（控制该区域在态势图上的
 *   显隐，经 taskAreaStore.hiddenIds 与 TaskAreaLayer 联动；图标双态——
 *   可见时睁眼 eyes.svg / 隐藏时闭眼斜杠 eyes-off.svg）/ 删除（本地移除）；
 * - 底部操作（按钮组布局同目标列表面板）：「添加区域」（主按钮：iconAdd 图标
 *   + 实心蓝底 #0EA7F9，点击进入六边形地图绘制——按下左键自光标点拉出）/「显示」批量显隐勾选区域
 *   （图标双态由当前列表全部区域的显隐状态决定——存在可见→睁眼 / 全部隐藏→闭眼，
 *   与按钮是否置灰、勾选了哪些行无关；点击时按图标方向对勾选区域统一显示/隐藏）
 *   /「删除」批量删除勾选区域；
 * - 空数据展示「暂无区域」。
 * 外观与 TargetListPanel / DeviceManagementPanel 同一套视觉语言。
 */

interface AreaListPanelProps {
  onClose: () => void
  visible?: boolean
}

/** km² -> ㎡（1 km² = 1,000,000 ㎡），保留整数展示 */
function formatAreaM2(areaKm2: number): string {
  const m2 = Math.round(areaKm2 * 1_000_000)
  return m2.toLocaleString('zh-CN')
}

export function AreaListPanel({ onClose, visible = true }: AreaListPanelProps) {
  const areas = useTaskAreaStore((s) => s.areas)
  const hiddenIds = useTaskAreaStore((s) => s.hiddenIds)
  const toggleHidden = useTaskAreaStore((s) => s.toggleHidden)
  const removeArea = useTaskAreaStore((s) => s.removeArea)
  // 「添加区域」进入地图六边形绘制的跨层级信号：面板经 MapToolbar 挂载、与 HomePage 平级，
  // 无法经 props 传递，点击时计数 +1，HomePage 监听计数变化进入 area-list 绘制模式
  const requestAddArea = useTaskAreaStore((s) => s.requestAddArea)
  // 行内「编辑」同款跨层级信号：携带目标区域 id，遮罩挂载后直接进入该区域编辑态
  const requestEditArea = useTaskAreaStore((s) => s.requestEditArea)
  // 行复选框勾选区域聚焦联动信号：HomePage 监听后将地图平滑飞转、框入该区域
  const requestFocusArea = useTaskAreaStore((s) => s.requestFocusArea)

  // 勾选的区域 id 集合（面板内局部状态）
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // hover 行 id：驱动行背景图切换为橙色 hover 态（与目标列表一致）
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  /** 全选 / 全不选联动（作用于当前列表全部区域） */
  const isAllSelected = areas.length > 0 && areas.every((a) => selectedIds.has(a.id))
  const isIndeterminate = areas.some((a) => selectedIds.has(a.id)) && !isAllSelected

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (isAllSelected) {
        areas.forEach((a) => next.delete(a.id))
      } else {
        areas.forEach((a) => next.add(a.id))
      }
      return next
    })
  }

  /** 勾选联动聚焦：区域处于「显示状态」（「任务区域」图层开启 且 未被行内眼睛/
   *  批量显示隐藏）时，请求态势图平滑聚焦到该区域（HomePage 监听
   *  areaFocusRequest fitBounds 完整框入）；隐藏或图层关闭的区域不触发——
   *  态势图上无对应渲染，聚焦无意义 */
  const focusIfVisible = (id: string) => {
    const s = useTaskAreaStore.getState()
    if (!useLayerStore.getState().taskAreaVisible) return
    if (s.hiddenIds.has(id)) return
    requestFocusArea(id)
  }

  /** 切换行勾选：勾上（原未选中）时按显示状态联动聚焦态势图；取消勾选不触发
   *  （与设备/目标面板单行勾选聚焦同款约定，「全选」批量勾选亦不产生聚焦请求） */
  const toggleSelect = (id: string) => {
    if (!selectedIds.has(id)) focusIfVisible(id)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  /** 列表整体可见性：当前列表存在任一可见区域（未被隐藏）即为 true。
      底部「显示」按钮的图标态完全由此决定（置灰/可点击均同源）——
      存在可见→睁眼（下一步动作：隐藏）/ 全部隐藏→闭眼（下一步动作：显示） */
  const listHasVisible = areas.some((a) => !hiddenIds.has(a.id))

  /** 底部「显示」：按列表整体状态决定方向——存在可见区域则统一隐藏勾选行，
      否则统一显示勾选行（与图标方向一致）；方向为「显示」时自动开启
      「任务区域」图层（开关可能已被用户手动关闭，自动开启保证显示立即可见） */
  const toggleShowSelected = () => {
    const hide = listHasVisible
    if (!hide && !useLayerStore.getState().taskAreaVisible) {
      useLayerStore.getState().setTaskAreaVisible(true)
    }
    selectedIds.forEach((id) => {
      if (hide === hiddenIds.has(id)) return // 已处于目标态则跳过
      toggleHidden(id)
    })
  }

  /** 行内眼睛图标：隐藏→显示时自动开启「任务区域」图层（与批量显示同款联动，
      显隐操作立即在态势图可见；隐藏方向不动图层开关——由图层控制面板管理） */
  const toggleAreaVisible = (id: string, isHidden: boolean) => {
    if (isHidden && !useLayerStore.getState().taskAreaVisible) {
      useLayerStore.getState().setTaskAreaVisible(true)
    }
    toggleHidden(id)
  }

  /** 底部「删除」：批量删除勾选区域并清空勾选 */
  const deleteSelected = () => {
    selectedIds.forEach((id) => removeArea(id))
    setSelectedIds(new Set())
  }

  return (
    <div className={`area-panel${visible ? ' area-panel--visible' : ''}`}>
      {/* 标题栏 */}
      <div className="area-panel__header">
        <div className="area-panel__header-icon">
          <img src={deviceImages.headerIcon} alt="" />
        </div>
        <span className="area-panel__title">区域列表</span>
        <button
          className="area-panel__close"
          type="button"
          onClick={onClose}
          aria-label="关闭区域列表面板"
        >
          <img src={deviceImages.closeBtn} alt="" />
        </button>
      </div>

      {/* 分隔线 */}
      <div className="area-panel__separator">
        <span className="area-panel__separator-dot" />
        <span className="area-panel__separator-line" />
      </div>

      {/* 筛选栏：全选复选框（三态） */}
      <div className="area-panel__filters">
        <div
          className={`area-panel__checkbox${isAllSelected ? ' area-panel__checkbox--checked' : ''}${isIndeterminate ? ' area-panel__checkbox--indeterminate' : ''}`}
          onClick={toggleSelectAll}
          role="checkbox"
          aria-checked={isAllSelected ? 'true' : isIndeterminate ? 'mixed' : 'false'}
          aria-label="全选区域"
          tabIndex={0}
          onKeyDown={(e) => e.key === ' ' && (e.preventDefault(), toggleSelectAll())}
        >
          {isAllSelected && (
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
          {isIndeterminate && (
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
        <span className="area-panel__filter-label">全选</span>
      </div>

      {/* 区域列表 */}
      <div className="area-panel__body">
        <div className="area-panel__list">
          {areas.length === 0 ? (
            /* 空列表 */
            <div className="area-panel__state">
              <img src={deviceImages.noData} alt="暂无区域" draggable={false} />
              <span>暂无区域</span>
            </div>
          ) : (
            areas.map((a) => {
              const meta = taskAreaTypeMeta(a.type)
              const isSelected = selectedIds.has(a.id)
              const isHidden = hiddenIds.has(a.id)
              // 行背景多态与目标列表面板一致：
              // 选中(蓝) > hover(橙) > 普通(灰)
              const bgImage = isSelected
                ? deviceImages.rowBgBlue
                : hoveredId === a.id
                  ? deviceImages.rowBgOrange
                  : deviceImages.rowBgGray
              return (
                <div
                  className={`area-row${isSelected ? ' area-row--selected' : ''}`}
                  key={a.id}
                  onMouseEnter={() => setHoveredId(a.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <img className="area-row__bg" src={bgImage} alt="" draggable={false} />
                  {/* 行首两列组（复选框/区域名称）：组内间距固定 8px，整组作为行内单一 flex 项并吸收剩余宽度 */}
                  <div className="area-row__lead">
                    <div
                      className={`area-row__checkbox${isSelected ? ' area-row__checkbox--checked' : ''}`}
                      onClick={() => toggleSelect(a.id)}
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-label={`勾选区域 ${a.name}`}
                      tabIndex={0}
                      onKeyDown={(e) => e.key === ' ' && (e.preventDefault(), toggleSelect(a.id))}
                    >
                      {isSelected && (
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
                    </div>
                    <span className="area-row__name" title="01区域名称">
                      01区域名称
                    </span>
                  </div>
                  <span className="area-row__type" title={meta.label}>
                    {meta.label}
                  </span>
                  <span className="area-row__area" title={`面积：${formatAreaM2(a.areaKm2)}㎡`}>
                    面积：{formatAreaM2(a.areaKm2)}㎡
                  </span>
                  {/* 行尾操作：编辑 / 显示 / 删除（设计稿顺序，间距 8px） */}
                  <div className="area-row__actions">
                    <button
                      type="button"
                      className="area-row__icon-btn"
                      onClick={() => requestEditArea(a.id)}
                      title="编辑区域"
                      aria-label={`编辑区域 ${a.name}`}
                    >
                      <img src={taskPanelImages.editIcon} alt="" draggable={false} />
                    </button>
                    <button
                      type="button"
                      className={`area-row__icon-btn${isHidden ? ' area-row__icon-btn--off' : ''}`}
                      onClick={() => toggleAreaVisible(a.id, isHidden)}
                      title={isHidden ? '在地图上显示' : '在地图上隐藏'}
                      aria-label={isHidden ? `在地图上显示区域 ${a.name}` : `在地图上隐藏区域 ${a.name}`}
                    >
                      {/* 图标双态：可见=睁眼 / 隐藏=闭眼斜杠 */}
                      <img
                        src={isHidden ? taskPanelImages.eyesOffIcon : taskPanelImages.eyesIcon}
                        alt=""
                        draggable={false}
                      />
                    </button>
                    <button
                      type="button"
                      className="area-row__icon-btn"
                      onClick={() => removeArea(a.id)}
                      title="删除区域"
                      aria-label={`删除区域 ${a.name}`}
                    >
                      <img src={homeImages.iconDelete} alt="" draggable={false} />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* 底部操作：添加区域 / 显示 / 删除（布局同目标列表面板） */}
      <div className="area-panel__actions">
        {/* 添加区域（主按钮）：iconAdd 图标 + 实心蓝底 #0EA7F9；点击进入与区域降落
            地图六边形绘制（按下左键自光标点拉出对称六边形 + 按住拖动放大/缩小），确认后按六边形 6 顶点经纬度本地新增区域 */}
        <button
          className="area-panel__action-btn area-panel__action-btn--primary"
          type="button"
          onClick={requestAddArea}
          title="添加区域：在地图上绘制六边形新增区域"
        >
          <img src={deviceImages.iconAdd} alt="" />
          添加区域
        </button>
        {/* 显示：图标态由当前列表全部区域的显隐决定（存在可见→睁眼 / 全部隐藏→闭眼），
            与置灰/可点击、勾选内容无关；未勾选时置灰（灰度滤镜），点击按图标方向批量处理勾选行 */}
        <button
          className="area-panel__action-btn"
          type="button"
          disabled={selectedIds.size === 0}
          aria-disabled={selectedIds.size === 0}
          onClick={toggleShowSelected}
          title="显示/隐藏勾选的区域"
        >
          <img src={listHasVisible ? taskPanelImages.eyesIcon : taskPanelImages.eyesOffIcon} alt="" />
          显示
        </button>
        {/* 未选中任何行时置灰不可点击（disabled 阻断点击 + :disabled 样式置灰） */}
        <button
          className="area-panel__action-btn"
          type="button"
          disabled={selectedIds.size === 0}
          aria-disabled={selectedIds.size === 0}
          onClick={deleteSelected}
        >
          <img src={homeImages.iconDelete} alt="" />
          删除
        </button>
      </div>
    </div>
  )
}

/**
 * AreaLandingPanel —— 区域降落面板（底部条第 6 段按钮「区域降落」）。
 *
 * 结构与起飞/返航面板相同（最大化复用公共组件）：
 * - 外壳（背景/切角/标题/底部按钮）复用 PanelShell，确认按钮为设计稿置灰态（confirmMuted）；
 * - 「参数设置 / 飞机列表」tab 栏复用 PanelTabs；
 * - 参数设置 tab：降落速度 −/+ 步进器复用 HeightStepper（单位 m/s，默认 10，1~20）
 *   + 降落编队下拉选择器（设计稿 group_11：标签居左、选择器居右，默认「一字型」）；
 * - 飞机列表 tab：复用 AircraftListSection（区块头 + 列表行，与降落面板共用）；
 * - 底部「确认（灰）/ 航线生成 / 取消」三按钮（middleText 三按钮布局）。
 */

/** 降落编队选项（设计稿默认「一字型」，其余为常见队形，待指令链路确认后调整） */
const FORMATIONS = ['一字型', '三角型', '环形'] as const
export type AreaLandingFormation = (typeof FORMATIONS)[number]

export interface AreaLandingPanelProps {
  /** 确认区域降落：携带当前设置的降落速度（m/s）与所选编队 */
  aircraft?: AircraftListItem[]
  onRemove?: (id: string) => void
  onConfirm: (speed: number, formation: AreaLandingFormation) => void
  /** 航线生成（暂记录日志，待接入真实指令链路） */
  onGenerateRoute: () => void
  /** 取消并关闭面板 */
  onCancel: () => void
  /* ---- 受控状态（可选）：父层持有可在面板收起/重开间保留已设置信息 ---- */
  /** 当前 tab（params=参数设置 / list=飞机列表） */
  tab?: PanelTab
  onTabChange?: (tab: PanelTab) => void
  /** 降落速度（m/s） */
  speed?: number
  onSpeedChange?: (speed: number) => void
  /** 降落编队 */
  formation?: AreaLandingFormation
  onFormationChange?: (formation: AreaLandingFormation) => void
  /** 选区四角经纬度（WGS84，框选确认后由父层计算）：参数 tab「区域信息」实时显示 */
  corners?: { lat: number; lng: number }[] | null
  /** 「航线生成」置灰态：未确定降落区域前置灰，区域框选「确定」后解禁可点击 */
  routeMuted?: boolean
  /** 「确认」置灰态：默认置灰，航线生成成功后由父层解除（传 false） */
  confirmMuted?: boolean
}

export function AreaLandingPanel({
  aircraft,
  onRemove,
  onConfirm,
  onGenerateRoute,
  onCancel,
  tab: tabProp,
  onTabChange,
  speed: speedProp,
  onSpeedChange,
  formation: formationProp,
  onFormationChange,
  corners,
  routeMuted,
  confirmMuted = true,
}: AreaLandingPanelProps) {
  // 内部兜底状态：父层未传受控 props 时使用；传了则以 props 为准
  const [innerTab, setInnerTab] = useState<PanelTab>('params')
  const [innerSpeed, setInnerSpeed] = useState(10)
  const [innerFormation, setInnerFormation] = useState<AreaLandingFormation>('一字型')
  const [formationOpen, setFormationOpen] = useState(false)
  const tab = tabProp ?? innerTab
  const setTab = onTabChange ?? setInnerTab
  const speed = speedProp ?? innerSpeed
  const setSpeed = onSpeedChange ?? setInnerSpeed
  const formation = formationProp ?? innerFormation
  const setFormation = onFormationChange ?? setInnerFormation

  return (
    <PanelShell
      title="区域降落"
      className="area-landing-panel"
      ariaLabel="区域降落参数面板"
      confirmMuted={confirmMuted}
      middleText="航线生成"
      middleMuted={routeMuted}
      onConfirm={() => onConfirm(speed, formation)}
      onMiddle={onGenerateRoute}
      onCancel={onCancel}
    >
      {/* tab 栏：参数设置（默认选中）/ 飞机列表 */}
      <PanelTabs tab={tab} onChange={setTab} />

      {tab === 'params' ? (
        <div className="area-landing-panel__params">
          <HeightStepper
            label="降落速度"
            height={speed}
            onChange={setSpeed}
            unit="m/s"
            min={1}
            max={20}
            minusAriaLabel="减小降落速度"
            plusAriaLabel="增大降落速度"
          />
          {/* 降落编队（设计稿 group_11）：标签居左、下拉选择器居右（justify-between） */}
          <div className="area-landing-panel__formation">
            <span className="area-landing-panel__formation-label">降落编队</span>
            <div
              className={`area-landing-panel__select${
                formationOpen ? ' area-landing-panel__select--open' : ''
              }`}
              onClick={() => setFormationOpen((v) => !v)}
            >
              <span className="area-landing-panel__select-value">{formation}</span>
              <img src={deviceImages.dropdown} alt="" />
              {formationOpen && (
                <div className="area-landing-panel__dropdown">
                  {FORMATIONS.map((item) => (
                    <div
                      key={item}
                      className={`area-landing-panel__dropdown-item${
                        item === formation ? ' area-landing-panel__dropdown-item--active' : ''
                      }`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setFormation(item)
                        setFormationOpen(false)
                      }}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* 区域信息：框选确认后实时显示选区四角经纬度（蓝色分割线分隔降落编队行） */}
          {corners && corners.length > 0 && (
            <>
              <div className="area-landing-panel__area-divider" />
              <div className="area-landing-panel__area-info">
                <span className="area-landing-panel__area-info-title">区域信息</span>
                {corners.map((corner, idx) => (
                  <div className="area-landing-panel__area-info-row" key={idx}>
                    <span className="area-landing-panel__area-info-index">{idx + 1}</span>
                    <span className="area-landing-panel__area-info-coord">
                      Lat:{corner.lat.toFixed(4)},&nbsp;Lon:{corner.lng.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        /* 飞机列表 tab：复用降落面板的飞机列表区块 */
        <AircraftListSection
          aircraft={aircraft ?? []}
          showSectionTitle={false}
          onRemove={onRemove}
        />
      )}
    </PanelShell>
  )
}
