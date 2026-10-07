/**
 * @file ErrorBoundary.tsx
 * @description ErrorBoundary —— 全局渲染错误兜底边界。
 * @author 4everyy
 * @date 2026-10-07
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import './ErrorBoundary.css'

interface Props {
  children: ReactNode
  /** 点击「重试」时回调（先于内部状态重置）：联动外层重建懒加载实例等资源 */
  onReset?: () => void
  /** 捕获渲染错误时回调（携带错误 message）：供外层按错误类型自愈（模块失效自动刷新等） */
  onError?: (message: string) => void
}
interface State {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<Props, State> {
  // 注意：不用 class fields（state = ... / handleRetry = ...）——它们会被编译为 _definePr…
  declare state: State
  private declare handleRetry: () => void
  private declare handleReload: () => void

  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, message: '' }
    this.handleRetry = () => {
      // 先通知外层（重建 lazy 实例等），再重置内部 error 态重新挂载子树
      this.props.onReset?.()
      this.setState({ hasError: false, message: '' })
    }
    this.handleReload = () => window.location.reload()
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? String(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 输出到控制台，便于开发期定位真实堆栈（不依赖任何外部日志服务，严格离线友好）。
    console.error('[ErrorBoundary] 子组件渲染崩溃：', error, info)
    // 上报外层：按错误类型自愈（如动态模块失效 → App 自动整页刷新，见 App.tsx）
    this.props.onError?.(error?.message ?? String(error))
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary__card">
            <div className="error-boundary__title">页面渲染出错</div>
            <div className="error-boundary__msg">{this.state.message}</div>
            <div className="error-boundary__actions">
              <button type="button" className="error-boundary__retry" onClick={this.handleRetry}>
                重试
              </button>
              <button type="button" className="error-boundary__reload" onClick={this.handleReload}>
                刷新页面
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}