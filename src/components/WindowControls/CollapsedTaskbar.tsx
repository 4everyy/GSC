/**
 * @file CollapsedTaskbar.tsx
 * @description CollapsedTaskbar —— 页面收起态（纯浏览器收纳方案）的底部任务栏：
 *              页签左键还原整页，右键弹出「关闭页签」菜单。桌面壳内缩小走系统任务栏，
 *              本组件仅在浏览器收纳回退方案下渲染。
 * @author 4everyy
 * @date 2026-10-12
 */
import { useEffect, useState } from 'react'

interface CollapsedTaskbarProps {
  /** 页签标题（对应页面/窗口名） */
  title: string
  /** 页签图标（可选） */
  icon?: string
  /** 左键页签：还原整页 */
  onRestore: () => void
  /** 右键菜单「关闭页签」 */
  onClose: () => void
}

export function CollapsedTaskbar({ title, icon, onRestore, onClose }: CollapsedTaskbarProps) {
  /** 右键菜单锚点（视口坐标；null 为菜单关闭） */
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  /* 菜单开启期间：点击任意处 / 再次右键 / ESC 均关闭菜单 */
  useEffect(() => {
    if (!menu) return
    const dismiss = () => setMenu(null)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('click', dismiss)
    window.addEventListener('contextmenu', dismiss)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('click', dismiss)
      window.removeEventListener('contextmenu', dismiss)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menu])

  return (
    <>
      <div className="taskbar">
        <button
          type="button"
          className="taskbar__tab"
          title="点击还原，右键关闭页签"
          onClick={onRestore}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu({ x: e.clientX, y: e.clientY })
          }}
        >
          {icon && <img className="taskbar__tab-icon" src={icon} alt="" />}
          <span className="taskbar__tab-title">{title}</span>
        </button>
      </div>
      {menu && (
        <>
          {/* 透明遮罩：承接菜单外点击/右键，避免穿透下方页面 */}
          <div
            className="taskbar__menu-backdrop"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu(null)
            }}
          />
          <div
            className="taskbar__menu"
            style={{ left: Math.max(8, menu.x - 8), top: Math.max(8, menu.y - 88) }}
          >
            <button
              type="button"
              className="taskbar__menu-item"
              onClick={() => {
                setMenu(null)
                onClose()
              }}
            >
              关闭页签
            </button>
          </div>
        </>
      )}
    </>
  )
}
