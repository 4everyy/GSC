/**
 * useAdvancedPanelStates —— 高级面板状态声明（航点/航线/环绕/集结点/编队面板与滑动二次确认）。
 *
 * 面板 useState 声明下半：滑出动画/航点飞行/航线飞行/绕轨/集合点/编队等。
 * 调用 useBasicPanelStates 并原样上抛，返回值为两段声明合集。
 */
import { useState, useEffect } from 'react'
import type { AreaLandingFormation } from '../../../components/AreaLandingPanel/AreaLandingPanel'
import type { RallyPointFormation } from '../../../components/RallyPointPanel/RallyPointPanel'
import type { FormationFlightFormation } from '../../../components/FormationFlightPanel/FormationFlightPanel'
import { useBasicPanelStates } from './useBasicPanelStates'

export function useAdvancedPanelStates() {
  const prev = useBasicPanelStates()
  const [waypointFlightOpen, setWaypointFlightOpen] = useState(false)
  // 航点飞行二次确认：面板「确认」先暂存飞行高度并弹出滑动确认弹窗，滑到最右才真正执行
  const [waypointSlide, setWaypointSlide] = useState<{ open: boolean; height: number }>({
    open: false,
    height: 10,
  })
  // 起飞二次确认：面板「确认」先暂存起飞高度并弹出滑动确认弹窗，滑到最右才真正执行
  const [takeoffSlide, setTakeoffSlide] = useState<{ open: boolean; height?: number }>({
    open: false,
  })
  // 降落二次确认：面板「确认」直接弹出滑动确认弹窗，滑到最右才真正执行
  const [landingSlide, setLandingSlide] = useState<{ open: boolean }>({ open: false })
  // 返航二次确认：面板「确认」先暂存返航高度并弹出滑动确认弹窗，滑到最右才真正执行
  const [returnHomeSlide, setReturnHomeSlide] = useState<{ open: boolean; height?: number }>({
    open: false,
  })
  // 指点返航二次确认：面板「确认」先暂存返航高度并弹出滑动确认弹窗，滑到最右才真正执行
  const [tapReturnSlide, setTapReturnSlide] = useState<{ open: boolean; height?: number }>({
    open: false,
  })
  // 区域降落二次确认：面板「确认」先暂存速度/编队并弹出滑动确认弹窗，滑到最右才真正执行
  const [areaLandingSlide, setAreaLandingSlide] = useState<{
    open: boolean
    speed?: number
    formation?: AreaLandingFormation
  }>({ open: false })
  // 悬停二次确认：面板「确认」直接弹出滑动确认弹窗，滑到最右才真正执行
  const [hoverSlide, setHoverSlide] = useState<{ open: boolean }>({ open: false })
  // 航线飞行二次确认：面板「确认」先暂存飞行高度并弹出滑动确认弹窗，滑到最右才真正执行
  const [routeSlide, setRouteSlide] = useState<{ open: boolean; height: number }>({
    open: false,
    height: 10,
  })
  const [routeFlightOpen, setRouteFlightOpen] = useState(false)
  // 航点飞行取点模式：点击面板「航线生成」后进入——光标变航点图钉、虚线连线，
  // 左键定格航点后退出取点（面板保留，可继续确认/取消）；再次「航线生成」重新取点
  const [waypointPickingActive, setWaypointPickingActive] = useState(false)
  // 航线生成状态：定格航点（保持虚线）后点击「航线生成」，虚线定格为实线；重新取点/关闭面板时复位
  const [waypointRouteGenerated, setWaypointRouteGenerated] = useState(false)
  // 航点飞行指令已确认：滑动二次确认成功后置 true，「确认」按钮随之置灰（防止重复下发指令）；
  // 面板关闭（取消/互斥切换）时复位，重开面板恢复可确认
  const [waypointFlightConfirmed, setWaypointFlightConfirmed] = useState(false)
  // 航线飞行取点：点击「航线生成」后进入——光标变带编号的航线图钉，
  // 左键逐点追加航点（1、2、3…），航点1 → 航点2 → … 连线（全程虚线，不与飞机连线）；
  // 右键/Esc 结束取点（保持虚线）并解除「确认」置灰，面板保留可继续操作
  const [routeFlightPicking, setRouteFlightPicking] = useState(false)
  const [routeFlightPoints, setRouteFlightPoints] = useState<
    { x: number; y: number; lat: number; lng: number }[]
  >([])
  const [routeFlightHover, setRouteFlightHover] = useState<{
    x: number
    y: number
    lat: number
    lng: number
  } | null>(null)
  const [routeFlightFinished, setRouteFlightFinished] = useState(false)
  // 航线生成状态：标记完成（保持虚线）后点击「航线生成」，虚线定格为实线；重新取点/关闭面板时复位
  const [routeFlightGenerated, setRouteFlightGenerated] = useState(false)
  // 航线飞行指令已确认：滑动二次确认成功后置 true，「确认」按钮随之置灰（防止重复下发指令）；
  // 面板关闭（取消/互斥切换）或航点全部删除（航线失效）时复位，重开面板恢复可确认
  const [routeFlightConfirmed, setRouteFlightConfirmed] = useState(false)
  // 航点删除菜单：menu = 当前显示「删除航点」按钮的航点下标（悬浮或双击触发），
  // pinned = 双击固定的下标（鼠标移出图钉后仍保留）；删除航点/重新取点/关闭面板时清除
  const [routePinMenu, setRoutePinMenu] = useState<number | null>(null)
  const [routePinPinned, setRoutePinPinned] = useState<number | null>(null)
  const [orbitFlightOpen, setOrbitFlightOpen] = useState(false)
  // 环绕飞行图钉跟随点：面板打开期间鼠标在地图上的实时位置（视口坐标，仅视觉不参与取点）。
  // 与指点返航同方案——tap-return-marker 切图 32×56 超出浏览器 32×32 光标上限，
  // 故 cursor:none + DOM 图钉跟随鼠标
  const [orbitFlightHover, setOrbitFlightHover] = useState<{ x: number; y: number } | null>(null)
  // 环绕飞行取点：左键点击地图定格的环绕中心（视口坐标 + 经纬度），盘旋圆与最近点连线的锚点
  const [orbitPoint, setOrbitPoint] = useState<{
    x: number
    y: number
    lat: number
    lng: number
  } | null>(null)
  // 盘旋半径（米）：与面板「盘旋半径」步进联动，驱动地图盘旋圆像素半径，默认 50m
  const [orbitRadius, setOrbitRadius] = useState(50)
  // 盘旋圆随缩放刷新：缩放级别变化后 getMetersPerPixel 改变，触发重渲染重算像素半径
  const [, setOrbitZoomTick] = useState(0)
  // 航线生成状态：定格环绕中心（保持虚线）后点击「航线生成」，盘旋圆/最近点连线由虚线定格为实线；
  // 重新取点/关闭面板时复位，生成前「确认」保持置灰
  const [orbitRouteGenerated, setOrbitRouteGenerated] = useState(false)
  // 环绕飞行指令已确认：滑动二次确认成功后置 true，「确认」按钮随之置灰（防止重复下发指令）；
  // 面板关闭（取消/互斥切换）或重新取点（航线失效）时复位，重开面板恢复可确认
  const [orbitFlightConfirmed, setOrbitFlightConfirmed] = useState(false)
  // 环绕飞行已标记态：hover/点击定格图钉显示「取消重绘」按钮，点击按钮清除环绕中心
  // 与实线回到取点模式（跟随 tap-return-marker 图钉 + 隐藏原生光标，可继续标记）
  const [orbitPinMenuOpen, setOrbitPinMenuOpen] = useState(false)
  // 环绕飞行二次确认：面板「确认」先暂存盘旋高度/半径并弹出滑动确认弹窗，滑到最右才真正执行
  const [orbitSlide, setOrbitSlide] = useState<{ open: boolean; height: number; radius?: number }>({
    open: false,
    height: 10,
    radius: 50,
  })
  const [rallyPointOpen, setRallyPointOpen] = useState(false)
  const [formationFlightOpen, setFormationFlightOpen] = useState(false)
  // 集结点二次确认：面板「确认」先暂存高度/速度/队形并弹出滑动确认弹窗，滑到最右才真正执行
  const [rallyPointSlide, setRallyPointSlide] = useState<{
    open: boolean
    height?: number
    speed?: number
    formation?: RallyPointFormation
  }>({ open: false })
  // 集结点航线已生成态：「航线生成」后置 true——在已确认集结区域内按当前队形布置
  // 集结坪（area-landing-spot）图标并绘制飞机中心→集结坪 1px #00FF95 绿色实线，
  // 同时解除「确认」置灰；重绘区域/取消/删除重绘时清除
  const [rallyPointRouteGenerated, setRallyPointRouteGenerated] = useState(false)
  // 集结指令已确认：滑动二次确认成功后置 true，「确认」按钮随之置灰（防止重复下发指令）；
  // 面板关闭（取消/互斥切换）或航线失效（删除重绘/区域清除/重新生成）时复位，重开面板恢复可确认
  const [rallyPointConfirmed, setRallyPointConfirmed] = useState(false)
  // 集结队形（受控状态，面板下拉与地图集结坪布置联动）：变化时即时重排集结坪布局
  const [rallyPointFormation, setRallyPointFormation] = useState<RallyPointFormation>('人字形')
  // 编队飞行二次确认：面板「确认」先暂存高度/队形并弹出滑动确认弹窗，滑到最右才真正执行
  const [formationFlightSlide, setFormationFlightSlide] = useState<{
    open: boolean
    height?: number
    formation?: FormationFlightFormation
  }>({ open: false })
  // 编队飞行图钉跟随点：面板打开期间鼠标在地图上的实时位置（视口坐标，仅视觉不参与取点）。
  // 与指点返航同方案——tap-return-marker 切图 32×56 超出浏览器 32×32 光标上限，
  // 故 cursor:none + DOM 图钉跟随鼠标
  const [formationFlightHover, setFormationFlightHover] = useState<{
    x: number
    y: number
  } | null>(null)
  // 编队飞行取点：左键点击地图定格的航点（视口坐标 + 经纬度），
  // 回填面板「航点信息」坐标输入框；再次点击可重取，取消/关闭面板时清除
  const [formationFlightPoint, setFormationFlightPoint] = useState<{
    x: number
    y: number
    lat: number
    lng: number
  } | null>(null)
  // 编队飞行航线已生成态：「航线生成」后置 true——在最左选中飞机图标上方按当前队形
  // 布置降落点（area-landing-spot）图标并绘制飞机中心→降落点 1px #00FF95 绿色实线，
  // 同时解除「确认」置灰；取消/关闭面板时清除
  const [formationFlightRouteGenerated, setFormationFlightRouteGenerated] = useState(false)
  // 编队飞行指令已确认：滑动二次确认成功后置 true，「确认」按钮随之置灰（防止重复下发指令）；
  // 面板关闭（取消/互斥切换）时复位，重开面板恢复可确认
  const [formationFlightConfirmed, setFormationFlightConfirmed] = useState(false)
  // 编队队形（受控状态，面板下拉与地图降落点布置联动）：变化时即时重排降落点布局，
  // 模拟飞行进行中则以新队形重启动画
  const [formationFlightFormation, setFormationFlightFormation] =
    useState<FormationFlightFormation>('人字形')

  // Esc 退出框选模式（键盘兜底退出；自 useBasicPanelStates 移入：需同时触达
  // 上半段声明的框选状态与下半段声明的集结点面板开合状态）
  const {
    setAreaLandingOpen,
    areaSelectMode,
    setAreaSelectMode,
    setAreaSelectAnchor,
    setAreaSelectEnd,
    areaSelectSource,
  } = prev
  useEffect(() => {
    if (!areaSelectMode) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAreaSelectMode(false)
        setAreaSelectAnchor(null)
        setAreaSelectEnd(null)
        // 取消绘制并重新展示对应面板（信息已提升保留）
        if (areaSelectSource === 'rally-point') setRallyPointOpen(true)
        else setAreaLandingOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    areaSelectMode,
    areaSelectSource,
    setAreaSelectMode,
    setAreaSelectAnchor,
    setAreaSelectEnd,
    setRallyPointOpen,
    setAreaLandingOpen,
  ])

  return {
    ...prev,
    waypointFlightOpen,
    setWaypointFlightOpen,
    waypointSlide,
    setWaypointSlide,
    takeoffSlide,
    setTakeoffSlide,
    landingSlide,
    setLandingSlide,
    returnHomeSlide,
    setReturnHomeSlide,
    tapReturnSlide,
    setTapReturnSlide,
    areaLandingSlide,
    setAreaLandingSlide,
    hoverSlide,
    setHoverSlide,
    routeSlide,
    setRouteSlide,
    routeFlightOpen,
    setRouteFlightOpen,
    waypointPickingActive,
    setWaypointPickingActive,
    waypointRouteGenerated,
    setWaypointRouteGenerated,
    waypointFlightConfirmed,
    setWaypointFlightConfirmed,
    routeFlightPicking,
    setRouteFlightPicking,
    routeFlightPoints,
    setRouteFlightPoints,
    routeFlightHover,
    setRouteFlightHover,
    routeFlightFinished,
    setRouteFlightFinished,
    routeFlightGenerated,
    setRouteFlightGenerated,
    routeFlightConfirmed,
    setRouteFlightConfirmed,
    routePinMenu,
    setRoutePinMenu,
    routePinPinned,
    setRoutePinPinned,
    orbitFlightOpen,
    setOrbitFlightOpen,
    orbitFlightHover,
    setOrbitFlightHover,
    orbitPoint,
    setOrbitPoint,
    orbitRadius,
    setOrbitRadius,
    setOrbitZoomTick,
    orbitRouteGenerated,
    setOrbitRouteGenerated,
    orbitFlightConfirmed,
    setOrbitFlightConfirmed,
    orbitPinMenuOpen,
    setOrbitPinMenuOpen,
    orbitSlide,
    setOrbitSlide,
    rallyPointOpen,
    setRallyPointOpen,
    formationFlightOpen,
    setFormationFlightOpen,
    rallyPointSlide,
    setRallyPointSlide,
    rallyPointRouteGenerated,
    setRallyPointRouteGenerated,
    rallyPointConfirmed,
    setRallyPointConfirmed,
    rallyPointFormation,
    setRallyPointFormation,
    formationFlightSlide,
    setFormationFlightSlide,
    formationFlightHover,
    setFormationFlightHover,
    formationFlightPoint,
    setFormationFlightPoint,
    formationFlightRouteGenerated,
    setFormationFlightRouteGenerated,
    formationFlightConfirmed,
    setFormationFlightConfirmed,
    formationFlightFormation,
    setFormationFlightFormation,
  }
}