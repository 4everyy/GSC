/**
 * @file TopBarClock.tsx
 * @description Top bar live clock extracted from VideoMonitorPage.tsx.
 * @author 4everyy
 * @date 2026-10-07
 */
import { useEffect, useRef } from 'react'

/* ---------------- 顶栏实时时钟（写 textContent，避免整树重渲染） ---------------- */

export function TopBarClock() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const fmt = (d: Date) => {
      const p = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}  ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    }
    const el = ref.current
    if (el) el.textContent = fmt(new Date())
    const timer = window.setInterval(() => {
      if (ref.current) ref.current.textContent = fmt(new Date())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])
  return <span ref={ref} className="vm-clock" />
}
