import { useTargetLinkStore } from '../../stores/targetLinkStore'
import { deviceImages } from '../../assets/images/device'
import { homeImages } from '../../assets/images/home'
import type { TargetItem } from '../../config/targets'

/** 目标类型 → 行首图标（车辆 → tank / 人员 → people） */
export const typeIcon: Record<TargetItem['type'], string> = {
  车辆: deviceImages.tank,
  人员: deviceImages.people,
}

interface TargetRowProps {
  target: TargetItem
  isExpanded: boolean
  onToggleSelect: (id: string) => void
  onToggleMark: (id: string) => void
  onToggleExpand: (id: string) => void
  onDeleteRequest: (ids: string[]) => void
}

/** 目标列表行：行背景多态（选中(蓝) > 点击联动(蓝) > hover(橙) > 普通(灰)）+ 行内展开详情 */
export function TargetRow({
  target: t,
  isExpanded,
  onToggleSelect,
  onToggleMark,
  onToggleExpand,
  onDeleteRequest,
}: TargetRowProps) {
  const selectedIds = useTargetLinkStore((s) => s.selectedTargetIds)
  const hoveredId = useTargetLinkStore((s) => s.hoveredTargetId)
  const setHoveredId = useTargetLinkStore((s) => s.setHoveredTargetId)
  const clickedTargetId = useTargetLinkStore((s) => s.clickedTargetId)
  const toggleClickedTarget = useTargetLinkStore((s) => s.toggleClickedTarget)
  const markedIds = useTargetLinkStore((s) => s.markedIds)
              const isSelected = selectedIds.has(t.id)
              const isClicked = clickedTargetId === t.id
              // 行背景多态与设备管理面板一致：
              // 选中(蓝) > 点击联动(蓝) > hover(橙) > 普通(灰)
              const bgImage =
                isSelected || isClicked
                  ? deviceImages.rowBgBlue
                  : hoveredId === t.id
                    ? deviceImages.rowBgOrange
                    : deviceImages.rowBgGray
              return (
                <div
                  className={`target-row-wrapper${isExpanded ? ' target-row-wrapper--expanded' : ''}`}
                  key={t.id}
                  data-target-id={t.id}
                >
                  <div
                    className={`target-row${isSelected ? ' target-row--selected' : ''}${clickedTargetId === t.id ? ' target-row--clicked' : ''}`}
                    onMouseEnter={() => setHoveredId(t.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => toggleClickedTarget(t.id)}
                  >
                    <img className="target-row__bg" src={bgImage} alt="" draggable={false} />
                    {/* 行首三列组（复选框/类型图标/名称）：组内间距固定 8px，整组作为行内单一 flex 项 */}
                    <div className="target-row__lead">
                      <div
                        className={`target-row__checkbox${isSelected ? ' target-row__checkbox--checked' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleSelect(t.id)
                        }}
                        role="checkbox"
                        aria-checked={isSelected}
                        tabIndex={0}
                        onKeyDown={(e) => e.key === ' ' && (e.preventDefault(), onToggleSelect(t.id))}
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
                      <img
                        className="target-row__icon"
                        src={typeIcon[t.type]}
                        alt={t.type}
                        title={t.type}
                        draggable={false}
                      />
                      <span className="target-row__name" title={t.name}>
                        {t.name}
                      </span>
                    </div>
                    <span className="target-row__model" title={t.model ?? '—'}>
                      {t.model ?? '—'}
                    </span>
                    <span className="target-row__value" title={t.value}>
                      {t.value}
                    </span>
                    <span className="target-row__status" title={t.status}>
                      {t.status}
                    </span>
                    {/* 行尾操作图标组（标记/删除/展开详情）：组内间距固定 8px，整组作为行内单一 flex 项 */}
                    <div className="target-row__actions">
                      <img
                        className="target-row__action target-row__action--locate"
                        src={markedIds.has(t.id) ? deviceImages.flagMarked : deviceImages.flag}
                        alt={markedIds.has(t.id) ? '取消重点标记' : '标记为重点'}
                        title={markedIds.has(t.id) ? '取消重点标记' : '标记为重点'}
                        draggable={false}
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleMark(t.id)
                        }}
                      />
                      <img
                        className="target-row__action target-row__action--delete"
                        src={homeImages.iconDelete}
                        alt="删除"
                        title="删除"
                        draggable={false}
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteRequest([t.id])
                        }}
                      />
                      <img
                        className="target-row__action target-row__action--more"
                        src={isExpanded ? deviceImages.upArrow : deviceImages.downArrow}
                        alt={isExpanded ? '收起详情' : '展开详情'}
                        title={isExpanded ? '收起详情' : '展开详情'}
                        draggable={false}
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleExpand(t.id)
                        }}
                      />
                    </div>
                  </div>

                  {/* ====== 行内目标详情（设计稿 434×308 基准） ====== */}
                  {isExpanded && (
                    <div className="target-row__detail">
                      {/* 信息行 1：发现源 / 目标位置（10 轨 grid，第二组竖条对齐 x=189/434） */}
                      <div className="target-row__detail-row">
                        <span className="target-row__detail-bar" />
                        <span className="target-row__detail-label">发现源</span>
                        <span className="target-row__detail-value">{t.source}</span>
                        <span className="target-row__detail-bar" />
                        <span className="target-row__detail-label">目标位置</span>
                        <span className="target-row__detail-value">{t.position}</span>
                      </div>

                      {/* 信息行 2：打击方式 / 直角坐标系 */}
                      <div className="target-row__detail-row">
                        <span className="target-row__detail-bar" />
                        <span className="target-row__detail-label">打击方式</span>
                        <span className="target-row__detail-value">{t.strikeMode}</span>
                        <span className="target-row__detail-bar" />
                        <span className="target-row__detail-label">直角坐标系</span>
                        <span className="target-row__detail-value">{t.coordinates ?? '—'}</span>
                      </div>

                      {/* 图片预览区：宽度与信息行一致、高 146px，四角放置角标图（原图为右上角预设，通过 rotate 旋转适配四角） */}
                      <div className="target-row__detail-preview">
                        {/* 预览图：宽度=顶部虚线整体长度（左右各 28px 内缩），高度自适应垂直居中 */}
                        <img
                          className="target-row__detail-preview-img"
                          src={deviceImages.previewImage}
                          alt="目标预览图"
                          draggable={false}
                        />
                        {/* 四角连接线：取角标 45° 斜线中点，垂直于斜线（135° 方向）实线连到预览图 */}
                        <div className="target-row__detail-preview-link target-row__detail-preview-link--tl" />
                        <div className="target-row__detail-preview-link target-row__detail-preview-link--tr" />
                        <div className="target-row__detail-preview-link target-row__detail-preview-link--bl" />
                        <div className="target-row__detail-preview-link target-row__detail-preview-link--br" />
                        <img
                          className="target-row__detail-preview-corner target-row__detail-preview-corner--tl"
                          src={deviceImages.previewCorner}
                          alt=""
                          draggable={false}
                        />
                        <img
                          className="target-row__detail-preview-corner target-row__detail-preview-corner--tr"
                          src={deviceImages.previewCorner}
                          alt=""
                          draggable={false}
                        />
                        <img
                          className="target-row__detail-preview-corner target-row__detail-preview-corner--bl"
                          src={deviceImages.previewCorner}
                          alt=""
                          draggable={false}
                        />
                        <img
                          className="target-row__detail-preview-corner target-row__detail-preview-corner--br"
                          src={deviceImages.previewCorner}
                          alt=""
                          draggable={false}
                        />
                        {/* 四边同色系虚线：衔接四角角标的线条端点 */}
                        <div className="target-row__detail-preview-edge target-row__detail-preview-edge--top" />
                        <div className="target-row__detail-preview-edge target-row__detail-preview-edge--right" />
                        <div className="target-row__detail-preview-edge target-row__detail-preview-edge--bottom" />
                        <div className="target-row__detail-preview-edge target-row__detail-preview-edge--left" />
                      </div>

                      {/* 分隔线 */}
                      <div className="target-row__detail-divider" />

                      {/* 时间行 1：首次发现时间（青色） */}
                      <div className="target-row__detail-footer">
                        <span className="target-row__detail-label target-row__detail-label--teal">
                          首次发现时间
                        </span>
                        <span className="target-row__detail-time target-row__detail-time--teal">
                          {t.firstSeenAt}
                        </span>
                      </div>

                      {/* 时间行 2：最后更新时间（白色） */}
                      <div className="target-row__detail-footer">
                        <span className="target-row__detail-label">最后更新时间</span>
                        <span className="target-row__detail-time">{t.lastUpdatedAt}</span>
                      </div>

                      {/* 底部装饰图 */}
                      <img className="target-row__detail-deco" src={deviceImages.detailDeco} alt="" draggable={false} />
                    </div>
                  )}
                </div>
              )
}
