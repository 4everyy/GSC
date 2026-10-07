/**
 * @file main.tsx
 * @description 应用入口：StrictMode 下挂载 React 根节点
 * @author 4everyy
 * @date 2026-10-07
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
