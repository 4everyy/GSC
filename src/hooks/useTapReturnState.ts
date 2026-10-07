/**
 * @file useTapReturnState.ts
 * @description 指点返航面板域状态：开合/地图取点/航线连线与确认
 * @author 4everyy
 * @date 2026-10-07
 */
import { useState } from 'react'

/** 指点返航面板域状态：面板开合、地图取点/跟随、航线连线与确认（自 useExclusivePanels 拆出） */
export function useTapReturnState() {
  const [tapReturnOpen, setTapReturnOpen] = useState(false)
  // 指点返航地图取点：面板打开期间点击地图记录落点（视口坐标 + WGS84 经纬度），用于渲染图钉标记并回填面板「航点信息」坐标
  const [tapReturnPoint, setTapReturnPoint] = useState<{
    x: number
    y: number
    lat: number
    lng: number
  } | null>(null)
  // 指点返航落点确认状态：落点定格后显示「确定 | 取消」按钮条——确定保留落点并隐藏按钮条
  const [tapReturnPointConfirmed, setTapReturnPointConfirmed] = useState(false)
  // 指点返航图钉跟随点：面板打开期间鼠标在地图上的实时位置（视口坐标，仅视觉不参与取点）
  const [tapReturnHover, setTapReturnHover] = useState<{ x: number; y: number } | null>(null)
  // 指点返航航线就绪：点击「航线生成」且确实画出 飞机→落点 连线后置 true，「确认」按钮据此解除置灰
  const [tapReturnRouteReady, setTapReturnRouteReady] = useState(false)
  // 指点返航连线（视口屏幕坐标，SVG 绘制）：飞机图标中心 → 落点图钉
  const [tapReturnLine, setTapReturnLine] = useState<{
    x1: number
    y1: number
    x2: number
    y2: number
  } | null>(null)
  // 指点返航指令已确认：滑动二次确认成功后置 true，「确认」按钮随之置灰（防止重复下发指令）
  const [tapReturnConfirmed, setTapReturnConfirmed] = useState(false)

  return {
    tapReturnOpen,
    setTapReturnOpen,
    tapReturnPoint,
    setTapReturnPoint,
    tapReturnPointConfirmed,
    setTapReturnPointConfirmed,
    tapReturnHover,
    setTapReturnHover,
    tapReturnRouteReady,
    setTapReturnRouteReady,
    tapReturnLine,
    setTapReturnLine,
    tapReturnConfirmed,
    setTapReturnConfirmed,
  }
}