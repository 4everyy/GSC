/**
 * Vitest 全局 setup。
 *
 * 当前为最小化占位：jsdom 环境由 vitest.config.ts 的 environment: 'jsdom' 提供，
 * 这里仅启用 React act() 测试环境（React 19 需 IS_REACT_ACT_ENVIRONMENT 全局标志），
 * 否则使用 act(...) 时会打印「The current testing environment is not configured to
 * support act(...)」警告；后续可在此扩展全局 mock（如 matchMedia、IntersectionObserver）。
 */
// 启用 React act() 测试环境，消除 act 警告并保证副作用在断言前刷新。
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export {}