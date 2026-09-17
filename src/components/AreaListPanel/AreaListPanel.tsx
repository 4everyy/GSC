/**
 * AreaListPanel —— 区域列表面板（工具栏「区域规划」按钮，index 1）。
 *
 * 数据源：taskAreaStore（/api/v1/control/queryTaskAreaList，与态势图
 * TaskAreaLayer 渲染的是同一份数据）——列表与地图多边形天然一致；
 * 后端未开启或接口失败时保留 mock 兜底（config/taskAreas.ts）。
 * 交互：
 * - 筛选栏「全选」复选框（三态：全选/部分选中/未选，作用于当前列表全部区域）；
 * - 行首复选框勾选区域；行常规(灰)/hover(橙)/选中(蓝) 三态背景图
 *   与目标列表面板（TargetListPanel）完全一致；
 * - 行尾操作图标组：编辑（后端暂无接口，占位）/ 显示（控制该区域在态势图上的
 *   显隐，经 taskAreaStore.hiddenIds 与 TaskAreaLayer 联动；图标双态——
 *   可见时睁眼 eyes.svg / 隐藏时闭眼斜杠 eyes-off.svg）/ 删除（本地移除，
 *   后端暂无删除接口，刷新 load() 后恢复）；
 * - 底部操作（按钮组布局同目标列表面板）：「添加区域」（主按钮：iconAdd 图标
 *   + 实心蓝底 #0EA7F9，点击进入六边形地图绘制——按下左键自光标点拉出）/「显示」批量显隐勾选区域
 *   （图标双态由当前列表全部区域的显隐状态决定——存在可见→睁眼 / 全部隐藏→闭眼，
 *   与按钮是否置灰、勾选了哪些行无关；点击时按图标方向对勾选区域统一显示/隐藏）
 *   /「删除」批量删除勾选区域；
 * - 加载失败展示错误与「重试」，空数据展示「暂无区域」。
 * 外观与 TargetListPanel / DeviceManagementPanel 同一套视觉语言。
 */
import { useEffect, useState } from 'react'
import { useTaskAreaStore } from '../../stores/taskAreaStore'
import { useLayerStore } from '../../stores/layerStore'
import { taskAreaTypeMeta } from '../../api/taskArea'
import { deviceImages } from '../../assets/images/device'
import { homeImages } from '../../assets/images/home'
import { taskPanelImages } from '../../assets/images/task-panel'
import './AreaListPanel.css'

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
  const status = useTaskAreaStore((s) => s.status)
  const error = useTaskAreaStore((s) => s.error)
  const load = useTaskAreaStore((s) => s.load)
  // 「添加区域」进入地图六边形绘制的跨层级信号：面板经 MapToolbar 挂载、与 HomePage 平级，
  // 无法经 props 传递，点击时计数 +1，HomePage 监听计数变化进入 area-list 绘制模式
  const requestAddArea = useTaskAreaStore((s) => s.requestAddArea)
  // 行内「编辑」同款跨层级信号：携带目标区域 id，遮罩挂载后直接进入该区域编辑态
  const requestEditArea = useTaskAreaStore((s) => s.requestEditArea)

  // 勾选的区域 id 集合（面板内局部状态）
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // hover 行 id：驱动行背景图切换为橙色 hover 态（与目标列表一致）
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // 兜底加载：态势图区域层通常已触发过 load（store 内部 loading 防重入），
  // 地图层未挂载场景下直接打开面板也能拉到数据
  useEffect(() => {
    if (useTaskAreaStore.getState().status === 'idle') void load()
  }, [load])

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

  /** 切换行勾选 */
  const toggleSelect = (id: string) => {
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
      「任务区域」图层（图层开关默认关，否则态势图无任何变化形同虚设） */
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
          {status === 'loading' && areas.length === 0 ? (
            /* 首次加载中 */
            <div className="area-panel__state">
              <img
                className="area-panel__state-spinner"
                src={deviceImages.iconRefresh}
                alt=""
                draggable={false}
              />
              <span>正在加载区域</span>
            </div>
          ) : status === 'error' && areas.length === 0 ? (
            /* 加载失败（无缓存数据）：错误提示 + 重试 */
            <div className="area-panel__state area-panel__state--error">
              <span title={error ?? undefined}>区域加载失败</span>
              <button type="button" className="area-panel__retry" onClick={() => void load()}>
                重试
              </button>
            </div>
          ) : areas.length === 0 ? (
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