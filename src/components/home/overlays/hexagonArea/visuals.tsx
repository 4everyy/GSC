/**
 * @file visuals.tsx
 * @description HexagonAreaOverlay 阶段性视觉组件（自 HexagonAreaOverlay.tsx 拆出）： LandingCenterIcon / DrawingCursorImg / HexagonInfoCard / ConfirmedEditPanel。 均为纯展示或命令式定位的哑组件——状态机、refs 编排与事件语义留在主组件。
 * @author 4everyy
 * @date 2026-10-07
 */
import type { RefObject } from 'react'
import { homeImages } from '../../../../assets/home'
import type { HexGeometry, HexInfo } from './rendering'

/** 降落区中心地面图标：定格且选中「降落区」时的预览——与指点返航落点圆圈
 *  同款视觉（48×48 白 2px 描边半透明圆 + 内含 20×24 H 停机坪图标），居中于
 *  六边形质心；确认后由 TaskAreaLayer 在质心挂同款图标（持久渲染） */
export function LandingCenterIcon({ hex }: { hex: HexGeometry }) {
  return (
    <div
      className="hexagon-area-overlay__landing-center"
      style={{ left: hex.cx, top: hex.cy }}
      aria-hidden="true"
    >
      <img src={homeImages.tapReturnZoneIcon} alt="" draggable={false} />
    </div>
  )
}

/** 绘制阶段跟随光标的停机坪图标（与框选遮罩同方案/样式）；
 *  拖动中光标即右下顶点 → 图标与右下顶点精确重合。
 *  left/top 固定 0，仅命令式 transform 位移（保留 CSS 居中，合成层平移）；
 *  定格/确认后由主组件卸载——恢复正常系统光标；点「取消」/定格后右键清除/
 *  确认态「删除」回到绘制态（图标重新挂载恢复跟随）。
 *  ref 回调按最近鼠标位置做仅首次挂载初始化。 */
export function DrawingCursorImg({
  cursorImgRef,
  mouseRef,
}: {
  cursorImgRef: RefObject<HTMLImageElement | null>
  mouseRef: RefObject<{ x: number; y: number } | null>
}) {
  return (
    <img
      ref={(el) => {
        // 仅首次挂载初始化
        cursorImgRef.current = el
        if (el && !el.dataset.init) {
          el.dataset.init = '1'
          const m = mouseRef.current
          if (m) {
            el.style.transform = `translate(${m.x}px, ${m.y}px) translate(-50%, -50%)`
            el.style.opacity = '1'
          } else {
            el.style.transform = 'translate(-100px, -100px) translate(-50%, -50%)'
          }
        }
      }}
      className="area-select-cursor"
      src={homeImages.areaLandingCursor}
      style={{ left: 0, top: 0 }}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}

/** 定格后右下顶点信息卡：经度/纬度（真实反投影值）+ 面积（㎡）。
 *  置于绘制区域外——右下顶点右侧 8px、垂直居中对齐；右侧空间不足时
 *  翻转到顶点左侧（仍在六边形外），防止溢出视口；确认态收起
 *  （该位置改挂「编辑 | 删除」面板） */
export function HexagonInfoCard({
  info,
  viewSize,
}: {
  info: HexInfo
  viewSize: { w: number; h: number }
}) {
  return (
    <div
      className="hexagon-area-overlay__info"
      style={{
        left: info.x + 8,
        top: Math.min(Math.max(info.y - 9, 8), viewSize.h - 26),
        ...(info.x + 232 > viewSize.w
          ? { left: Math.max(8, info.x - 8), transform: 'translateX(-100%)' }
          : {}),
      }}
    >
      经度：{info.lng}°，纬度：{info.lat}°
      <br />
      面积：{info.area}㎡
    </div>
  )
}

/** 确认态「编辑 | 删除」面板：hover 区域时才出现（主组件 window mousemove
 *  射线法命中多边形，或鼠标位于面板矩形近旁外扩 8px 内保持显示以便点击）、
 *  初始隐藏；右下顶点右侧 8px、垂直居中（右侧空间不足翻转到左侧）——设计稿
 *  121×32 毛玻璃（rgba(75,188,249,0.4) 底 + #4BBCF9 描边 + blur(3px) + 投影），
 *  中缝 1px 竖线分隔，文字 14px MiSans 330 白色；位置由主组件 onMove 投影命令式
 *  更新（随地图精确跟随）；编辑中整体收起（右键退出编辑态后随重挂载恢复初始
 *  隐藏，hover 区域再现） */
export function ConfirmedEditPanel({
  panelRef,
  onEdit,
  onDelete,
}: {
  panelRef: RefObject<HTMLDivElement | null>
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div ref={panelRef} className="hexagon-area-edit-panel" style={{ display: 'none' }}>
      <div
        className="hexagon-area-edit-panel__btn hexagon-area-edit-panel__btn--edit"
        onClick={onEdit}
      >
        编辑
      </div>
      <div className="hexagon-area-edit-panel__divider" />
      <div
        className="hexagon-area-edit-panel__btn hexagon-area-edit-panel__btn--delete"
        onClick={onDelete}
      >
        删除
      </div>
    </div>
  )
}