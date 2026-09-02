/**
 * useBasicPanelStates —— 基础面板状态声明（起飞/降落/返航/指点返航/区域降落与框选取点）。
 *
 * 面板 useState 声明上半：基础开合/返航航线/指点返航/区域降落与框选等。
 * 下半在 useAdvancedPanelStates，链式衔接，返回值合并后与拆分前一致。
 */
import { useState, useEffect } from 'react'
import type { PanelTab } from '../../../components/PanelTabs/PanelTabs'
import type { AreaLandingFormation } from '../../../components/AreaLandingPanel/AreaLandingPanel'

export function useBasicPanelStates() {
  // 功能面板（起飞/降落/返航/指点返航/区域降落/悬停/航点飞行）：点击底部按钮后按钮保持弹出状态，面板展开于右上角；
  // 各面板互斥——打开一个会关闭其他（底部按钮条同一时刻只有一个功能处于激活态）
  const [takeoffOpen, setTakeoffOpen] = useState(false)
  const [landingOpen, setLandingOpen] = useState(false)
  const [returnHomeOpen, setReturnHomeOpen] = useState(false)
  // 返航航线连线（视口屏幕坐标，SVG 绘制）：点击返航面板「航线生成」后，
  // 每架选中飞机一条航线（图标中心 → 各自 H 返航标记底部，3px #00FF95 绿色实线）；
  // 再次点击整体重画，面板关闭（取消/互斥切换）时自动清除；null = 未生成
  const [returnHomeLines, setReturnHomeLines] = useState<
    { x1: number; y1: number; x2: number; y2: number }[] | null
  >(null)
  // 返航指令已确认：滑动二次确认成功后置 true，「确认」按钮随之置灰（防止重复下发指令）；
  // 面板关闭（取消/互斥切换）时随航线一并复位，重开面板恢复可确认
  const [returnHomeConfirmed, setReturnHomeConfirmed] = useState(false)
  const [tapReturnOpen, setTapReturnOpen] = useState(false)
  // 指点返航地图取点：面板打开期间点击地图记录落点（视口坐标 + WGS84 经纬度），
  // 用于渲染图钉标记并回填面板「航点信息」坐标；确认后保留，取消面板时清除
  const [tapReturnPoint, setTapReturnPoint] = useState<{
    x: number
    y: number
    lat: number
    lng: number
  } | null>(null)
  // 指点返航落点确认状态：落点定格后显示「确定 | 取消」按钮条——确定保留落点并隐藏
  // 按钮条；取消清除落点恢复取点（光标变标记继续点选新落点）；重新点选/重开面板时复位
  const [tapReturnPointConfirmed, setTapReturnPointConfirmed] = useState(false)
  // 指点返航图钉跟随点：面板打开期间鼠标在地图上的实时位置（视口坐标，仅视觉不参与取点）。
  // 原取点光标切图 54×54 超出浏览器 32×32 光标上限会回退成十字准线，
  // 故改为 cursor:none + DOM 图钉跟随鼠标（与航点飞行取点同方案）
  const [tapReturnHover, setTapReturnHover] = useState<{ x: number; y: number } | null>(null)
  // 航点飞行跟随点：面板打开期间鼠标在地图上移动时的实时位置
  // （视口坐标 + 经纬度），驱动图钉跟随与实时虚线连线
  const [waypointHover, setWaypointHover] = useState<{
    x: number
    y: number
    lat: number
    lng: number
  } | null>(null)
  // 航点飞行定格航点：左键点击地图后确定（视口坐标 + 经纬度），
  // 虚线随之定格为实线；再次点击覆盖，取消/切换面板时清除
  const [waypointPoint, setWaypointPoint] = useState<{
    x: number
    y: number
    lat: number
    lng: number
  } | null>(null)
  // 指点返航航线就绪：点击「航线生成」且确实画出 飞机→落点 连线后置 true，
  // 「确认」按钮据此解除置灰；落点清除（取消/重开面板）时随之复位
  const [tapReturnRouteReady, setTapReturnRouteReady] = useState(false)
  // 指点返航连线（视口屏幕坐标，SVG 绘制）：飞机图标中心 → 落点图钉；
  // 两端锚定不随地图移动的 DOM 图标（飞机百分比定位/图钉 fixed 定位），
  // 地图缩放/平移时连线始终贴合两端，不会断开漂移
  const [tapReturnLine, setTapReturnLine] = useState<{
    x1: number
    y1: number
    x2: number
    y2: number
  } | null>(null)
  // 指点返航指令已确认：滑动二次确认成功后置 true，「确认」按钮随之置灰（防止重复下发指令）；
  // 面板关闭（取消/互斥切换）或重新取点时复位，重开面板恢复可确认
  const [tapReturnConfirmed, setTapReturnConfirmed] = useState(false)
  const [areaLandingOpen, setAreaLandingOpen] = useState(false)
  // 区域降落面板信息（提升到 HomePage：面板收起（进入框选）/重开之间保留）：
  // 当前 tab、降落速度（m/s）、降落编队；rect 为框选「确认」定格的选区（视口坐标）
  const [areaLandingTab, setAreaLandingTab] = useState<PanelTab>('params')
  const [areaLandingSpeed, setAreaLandingSpeed] = useState(10)
  const [areaLandingFormation, setAreaLandingFormation] =
    useState<AreaLandingFormation>('一字型')
  const [areaLandingRect, setAreaLandingRect] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  // 选区四角经纬度（WGS84，框选确认时由视口坐标换算）：
  // 供区域降落面板「区域信息」实时显示，随选区一并创建/清除
  const [areaLandingCorners, setAreaLandingCorners] = useState<
    { lat: number; lng: number }[] | null
  >(null)
  // 区域降落航线已生成：点击「航线生成」后按所选降落编队在已确认区域内布置降落坪
  // 图标（数量=选中飞机数）并与各飞机画绿色实线；重绘区域/取消时复位
  const [areaLandingRouteGenerated, setAreaLandingRouteGenerated] = useState(false)
  // 区域降落指令已确认：滑动二次确认成功后置 true，「确认」按钮随之置灰（防止重复下发指令）；
  // 面板关闭（取消/互斥切换）或重绘选区时复位，重开面板恢复可确认
  const [areaLandingConfirmed, setAreaLandingConfirmed] = useState(false)
  // 区域降落/集结点框选模式：由区域降落/集结点面板内「航线生成」进入——首页全屏遮罩 + 拖拽自定义大小紫色虚线框；
  // 光标为停机坪图标图片跟随鼠标；按住左键时框实时跟随光标
  // （光标锚定框右下角），松开定格，Esc/右键退出；areaSelectSource 标记选区归属面板
  const [areaSelectMode, setAreaSelectMode] = useState(false)
  // 框选起点（视口坐标 clientX/clientY），null = 尚未开始框选
  const [areaSelectAnchor, setAreaSelectAnchor] = useState<{ x: number; y: number } | null>(null)
  // 框选当前终点（拖动中的视口坐标），与起点共同确定选区矩形
  const [areaSelectEnd, setAreaSelectEnd] = useState<{ x: number; y: number } | null>(null)
  // 是否处于按住左键拖动状态（拖动期间矩形实时拉伸）
  const [areaSelectDragging, setAreaSelectDragging] = useState(false)
  // 框选跟随光标点：绘制阶段鼠标在遮罩上的实时位置（视口坐标）。
  // area-landing-cursor 切图 54×54 超出浏览器 32×32 光标上限，cursor:url() 会回退成
  // 十字准线，故 cursor:none + DOM 图片跟随鼠标（与指点返航/环绕飞行取点同方案），
  // 图片中心（27,27）对准鼠标；框选模式全程保持（含选区定格后点「确认/取消」）
  const [areaSelectHover, setAreaSelectHover] = useState<{ x: number; y: number } | null>(null)
  // 框选模式归属：'area-landing' 区域降落（写入 areaLandingRect/corners，面板显示区域信息）/
  // 'rally-point' 集结点（写入 rallyPointRect，绘制区域不带中心地面标记徽章）——
  // Esc/右键/取消回到对应面板，确认写入对应选区并回到对应面板
  const [areaSelectSource, setAreaSelectSource] = useState<'area-landing' | 'rally-point'>(
    'area-landing',
  )
  // 集结点已确认的框选区域（视口坐标）：与区域降落同款截图式矩形，但无中心徽章
  const [rallyPointRect, setRallyPointRect] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  // 进入框选模式时清零上一轮遗留的选区状态（起点/终点/拖动标记），
  // 确保每次进入均为空白可绘制状态（兜底：任何退出路径未清干净也不影响再次绘制）
  useEffect(() => {
    if (areaSelectMode) {
      setAreaSelectAnchor(null)
      setAreaSelectEnd(null)
      setAreaSelectDragging(false)
      setAreaSelectHover(null)
    }
  }, [areaSelectMode])
  const [hoverOpen, setHoverOpen] = useState(false)

  return {
    takeoffOpen,
    setTakeoffOpen,
    landingOpen,
    setLandingOpen,
    returnHomeOpen,
    setReturnHomeOpen,
    returnHomeLines,
    setReturnHomeLines,
    returnHomeConfirmed,
    setReturnHomeConfirmed,
    tapReturnOpen,
    setTapReturnOpen,
    tapReturnPoint,
    setTapReturnPoint,
    tapReturnPointConfirmed,
    setTapReturnPointConfirmed,
    tapReturnHover,
    setTapReturnHover,
    waypointHover,
    setWaypointHover,
    waypointPoint,
    setWaypointPoint,
    tapReturnRouteReady,
    setTapReturnRouteReady,
    tapReturnLine,
    setTapReturnLine,
    tapReturnConfirmed,
    setTapReturnConfirmed,
    areaLandingOpen,
    setAreaLandingOpen,
    areaLandingTab,
    setAreaLandingTab,
    areaLandingSpeed,
    setAreaLandingSpeed,
    areaLandingFormation,
    setAreaLandingFormation,
    areaLandingRect,
    setAreaLandingRect,
    areaLandingCorners,
    setAreaLandingCorners,
    areaLandingRouteGenerated,
    setAreaLandingRouteGenerated,
    areaLandingConfirmed,
    setAreaLandingConfirmed,
    areaSelectMode,
    setAreaSelectMode,
    areaSelectAnchor,
    setAreaSelectAnchor,
    areaSelectEnd,
    setAreaSelectEnd,
    areaSelectDragging,
    setAreaSelectDragging,
    areaSelectHover,
    setAreaSelectHover,
    areaSelectSource,
    setAreaSelectSource,
    rallyPointRect,
    setRallyPointRect,
    hoverOpen,
    setHoverOpen,
  }
}
