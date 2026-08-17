/**
 * ErrorBoundary —— 全局渲染错误兜底边界。
 *
 * 职责：捕获子组件树在渲染、生命周期、构造函数中抛出的同步错误，
 *       展示降级 UI 而非整页白屏，并提供「重试」（重置内部 error 态以重新挂载子树）。
 *
 * 使用场景：包裹 HomePage（含地图引擎等复杂异步 / 第三方逻辑），保证任意单个模块
 *           崩溃都不波及整个地面站界面，并便于在控制台定位真实错误。
 *
 * 设计动机：React 渲染阶段抛出的异常若没有被任何 ErrorBoundary 捕获，
 *           会导致整个根组件树卸载 → 整页白屏（如「启用苏州离线包即白屏」事故）。
 *           本组件作为最后防线，避免同类问题再次造成不可恢复的白屏。
 *
 * 限制：不捕获事件回调、异步代码（setTimeout / Promise rejection）、SSR 错误。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import './ErrorBoundary.css'

interface Props {
  children: ReactNode
}
interface State {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? String(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 输出到控制台，便于开发期定位真实堆栈（不依赖任何外部日志服务，严格离线友好）。
    console.error('[ErrorBoundary] 子组件渲染崩溃：', error, info)
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, message: '' })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary__card">
            <div className="error-boundary__title">页面渲染出错</div>
            <div className="error-boundary__msg">{this.state.message}</div>
            <button type="button" className="error-boundary__retry" onClick={this.handleRetry}>
              重试
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
