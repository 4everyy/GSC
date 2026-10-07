/**
 * @file AreaPanels.tsx
 * @description 区域类面板：区域列表 / 区域降落 / 集结点等
 * @author 4everyy
 * @date 2026-10-07
 */
import { useRef, useState } from 'react'
import { useTaskAreaStore, useLayerStore } from '../../stores/index'
import { taskAreaTypeMeta } from '../../api/index'
import { deviceImages } from '../../assets/device/index'
import { homeImages } from '../../assets/home/index'
import { taskPanelImages } from '../../assets/task-panel/index'
import './AreaPanels.css'
import { PanelShell, PanelTabs, type PanelTab, HeightStepper } from '../PanelKit/PanelKit'
import { AircraftListSection, type AircraftListItem } from '../AircraftListPanel/AircraftListPanel'

/** AreaListPanel —— 区域列表面板（工具栏「区域规划」按钮，index 1）。 */

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
  // 「添加区域」进入地图六边形绘制的跨层级信号：面板经 MapToolbar 挂载
  const requestAddArea = useTaskAreaStore((s) => s.requestAddArea)
  // 行内「编辑」同款跨层级信号：携带目标区域 id，遮罩挂载后直接进入该区域编辑态
  const requestEditArea = useTaskAreaStore((s) => s.requestEditArea)
  // 行复选框勾选区域聚焦联动信号：HomePage 监听后将地图平滑飞转、框入该区域
  const requestFocusArea = useTaskAreaStore((s) => s.requestFocusArea)
  // 重命名（名称行内编辑失焦/回车提交时调用）
  const renameArea = useTaskAreaStore((s) => s.renameArea)

  // 勾选的区域 id 集合（面板内局部状态）
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // hover 行 id：驱动行背景图切换为橙色 hover 态（与目标列表一致）
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // 名称行内编辑：editingId=正在编辑名称的区域 id（null 无），editingName=草稿（双击进入
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  /** 双击名称进入编辑：以当前名称为草稿，下一帧 input 挂载后聚焦并全选（直接输入即覆盖） */
  const startEditName = (id: string, name: string) => {
    setEditingId(id)
    setEditingName(name)
    requestAnimationFrame(() => {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    })
  }

  /** 提交编辑：trim 后非空才写入 store（纯空格视为未修改，保留原名） */
  const commitEditName = () => {
    if (editingId === null) return
    renameArea(editingId, editingName)
    setEditingId(null)
    setEditingName('')
  }

  /** 取消编辑：丢弃草稿恢复展示原名（Esc 触发；input 随即卸载不再触发 blur） */
  const cancelEditName = () => {
    setEditingId(null)
    setEditingName('')
  }

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

  /** 勾选联动聚焦：区域处于「显示状态」（「任务区域」图层开启 且 未被行内眼睛/批量显示隐藏）时 */
  const focusIfVisible = (id: string) => {
    const s = useTaskAreaStore.getState()
    if (!useLayerStore.getState().taskAreaVisible) return
    if (s.hiddenIds.has(id)) return
    requestFocusArea(id)
  }

  /** 切换行勾选：勾上（原未选中）时按显示状态联动聚焦态势图 */
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

  /** 列表整体可见性：当前列表存在任一可见区域（未被隐藏）即为 true。 */
  const listHasVisible = areas.some((a) => !hiddenIds.has(a.id))

  /** 底部「显示」：按列表整体状态决定方向——存在可见区域则统一隐藏勾选行，否则统一显示勾选行（与图标方向一致） */
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

  /** 行内眼睛图标：隐藏→显示时自动开启「任务区域」图层（与批量显示同款联动 */
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
              // 行背景多态与目标列表面板一致：选中(蓝) > hover(橙) > 普通(灰)
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
                    {editingId === a.id ? (
                      /* 名称编辑态：input 替换 span，回车/失焦保存，Esc 取消 */
                      <input
                        ref={nameInputRef}
                        className="area-row__name-input"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={commitEditName}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            commitEditName()
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            cancelEditName()
                          }
                        }}
                        aria-label="编辑区域名称"
                        title="双击可修改区域名称"
                      />
                    ) : (
                      <span
                        className="area-row__name"
                        title={a.name}
                        onDoubleClick={() => startEditName(a.id, a.name)}
                      >
                        {a.name}
                      </span>
                    )}
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

/** AreaLandingPanel —— 区域降落面板（底部条第 6 段按钮「区域降落」）。 */

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
            max={Number.MAX_SAFE_INTEGER}
            editable
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