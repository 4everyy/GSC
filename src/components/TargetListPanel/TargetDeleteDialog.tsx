/**
 * @file TargetDeleteDialog.tsx
 * @description 目标删除确认弹窗（portal 挂载到 body）
 * @author 4everyy
 * @date 2026-10-07
 */
import { createPortal } from 'react-dom'

interface TargetDeleteDialogProps {
  /** 待删除目标数量：>1 时提示「删除选中的 N 个目标」 */
  count: number
  onConfirm: () => void
  onClose: () => void
}

/** 删除确认弹窗（设计稿 box_27）：portal 到 body 的全局弹窗 */
export function TargetDeleteDialog({ count, onConfirm, onClose }: TargetDeleteDialogProps) {
  return createPortal(
    <div className="target-panel__delete-overlay" onClick={onClose}>
      <div
        className="target-panel__delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="删除目标确认"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="target-panel__delete-dialog-accent" aria-hidden="true" />
        <span className="target-panel__delete-dialog-title">删除</span>
        <span className="target-panel__delete-dialog-message">
          {count > 1 ? `是否删除选中的 ${count} 个目标` : '是否删除该目标'}
        </span>
        <div className="target-panel__delete-dialog-actions">
          <button
            className="target-panel__delete-dialog-btn target-panel__delete-dialog-btn--confirm"
            type="button"
            onClick={onConfirm}
          >
            确认
          </button>
          <button
            className="target-panel__delete-dialog-btn target-panel__delete-dialog-btn--cancel"
            type="button"
            onClick={onClose}
          >
            取消
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
