import { useState, useEffect, useCallback, useMemo } from 'react'
import { type PanelTab } from '../components/PanelKit/PanelKit'
import { type AreaLandingFormation } from '../components/AreaPanels/AreaPanels'
import { type RallyPointFormation, type FormationFlightFormation } from '../components/FlightActionPanels/FlightActionPanels'
import { type BottomBarPanel } from '../lib/formationLayout'

/**
 * useExclusivePanels —— 功能面板状态机：11 个功能面板的状态声明（基础：起飞/降落/返航/
 * 指点返航/区域降落与框选取点；高级：航点/航线/环绕/集结点/编队与滑动二次确认）
 * + 互斥开合处理函数 + 底部按钮条查询表，单一 Hook 对外。
 *
 * 2026-09-19 结构重组：原 usePanelStates.ts 两段链式声明扁平化并入本文件
 * （三级 prev 透传冗余且难读，合并后全部状态/处理函数同域可见）。
 *
 * WB-PF-006：open*Panel 全部 useCallback 化（setState 引用稳定，仅读取态入依赖），
 * panelOpenState/panelHandlers 查询表 useMemo 化——引用稳定后 memo 化的
 * BottomBar 可浅比较跳过无关渲染。
 */

export function useExclusivePanels() {
  // ==================== 基础面板状态（起飞/降落/返航/指点返航/区域降落与框选取点）====================

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
  // 'rally-point' 集结点（写入 rallyPointRect，绘制区域不带中心地面标记徽章）/
  // 'area-list' 区域列表「添加区域」（确认后按选区四角经纬度本地新增区域，无对应功能面板）——
  // Esc/右键/取消回到对应面板（area-list 无面板，直接退出），确认写入对应选区并回到对应面板
  const [areaSelectSource, setAreaSelectSource] = useState<
    'area-landing' | 'rally-point' | 'area-list'
  >('area-landing')
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
    if (!areaSelectMode) return
    // 进入框选：清零上一轮选区状态（rAF 异步执行，规避 effect 内同步 setState）
    const raf = window.requestAnimationFrame(() => {
      setAreaSelectAnchor(null)
      setAreaSelectEnd(null)
      setAreaSelectDragging(false)
      setAreaSelectHover(null)
    })
    return () => window.cancelAnimationFrame(raf)
  }, [areaSelectMode])
  const [hoverOpen, setHoverOpen] = useState(false)


  // ==================== 高级面板状态（航点/航线/环绕/集结点/编队面板与滑动二次确认）====================

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

  useEffect(() => {
    if (!areaSelectMode) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAreaSelectMode(false)
        setAreaSelectAnchor(null)
        setAreaSelectEnd(null)
        // 取消绘制并重新展示对应面板（信息已提升保留）；
        // 'area-list'（区域列表添加区域）无对应功能面板，直接退出即可
        if (areaSelectSource === 'rally-point') setRallyPointOpen(true)
        else if (areaSelectSource === 'area-landing') setAreaLandingOpen(true)
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


  // ==================== 互斥开合处理函数与底部按钮条查询表 ====================


  const openTakeoffPanel = useCallback(() => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setTakeoffOpen((v) => !v)
    // setState 引用稳定，无需依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const openLandingPanel = useCallback(() => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setTakeoffOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setLandingOpen((v) => !v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const openReturnHomePanel = useCallback(() => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setReturnHomeOpen((v) => !v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const openTapReturnPanel = useCallback(() => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setAreaLandingOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setTapReturnPoint(null)
    setTapReturnPointConfirmed(false)
    setTapReturnOpen((v) => !v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const openAreaLandingPanel = useCallback(() => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    // 面板弹出 + 首次（未绘制区域）同时进入绘制态：光标变停机坪图标，
    // 按住左键拖拽绘制降落区域，松开定格后「确定/取消」（光标恢复常态）；
    // 已绘制区域则仅弹出面板（「航线生成」已解禁，无需再次绘制）
    if (!areaLandingOpen) {
      setAreaLandingOpen(true)
      if (!areaLandingRect) {
        setAreaSelectSource('area-landing')
        setAreaSelectMode(true)
      }
      return
    }
    // 面板已开：再点按钮收起面板，并退出可能进行中的绘制
    setAreaLandingOpen(false)
    setAreaSelectMode(false)
    // 读取 areaLandingOpen/areaLandingRect 分支
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaLandingOpen, areaLandingRect])
  const openHoverPanel = useCallback(() => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setWaypointFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setHoverOpen((v) => !v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const openWaypointFlightPanel = useCallback(() => {
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setHoverOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    // 面板由关到开：立即进入取点模式（光标变航点图钉），并清除上一次遗留航点
    if (!waypointFlightOpen) {
      setWaypointHover(null)
      setWaypointPoint(null)
      setWaypointRouteGenerated(false)
      setWaypointPickingActive(true)
    }
    setWaypointFlightOpen((v) => !v)
    // 读取 waypointFlightOpen 分支
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypointFlightOpen])
  const openRouteFlightPanel = useCallback(() => {
    setOrbitFlightOpen(false)
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    // 面板由关到开：立即进入取点模式（光标变带编号图钉），并清除上一次遗留航线
    if (!routeFlightOpen) {
      setRouteFlightPoints([])
      setRouteFlightHover(null)
      setRouteFlightFinished(false)
      setRouteFlightGenerated(false)
      setRoutePinMenu(null)
      setRoutePinPinned(null)
      setRouteFlightPicking(true)
    }
    setRouteFlightOpen((v) => !v)
    // 读取 routeFlightOpen 分支
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeFlightOpen])
  const openOrbitFlightPanel = useCallback(() => {
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setRouteFlightOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    // 重新打开时清除上一轮定格的环绕中心与航线生成状态，恢复取点状态
    setOrbitPoint(null)
    setOrbitRouteGenerated(false)
    setOrbitPinMenuOpen(false)
    setOrbitFlightOpen((v) => !v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const openRallyPointPanel = useCallback(() => {
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setFormationFlightOpen(false)
    // 面板弹出 + 首次（未绘制区域）同时进入绘制态（与区域降落同款交互）
    if (!rallyPointOpen) {
      setRallyPointOpen(true)
      if (!rallyPointRect) {
        setAreaSelectSource('rally-point')
        setAreaSelectMode(true)
      }
      return
    }
    // 面板已开：再点按钮收起面板，并退出可能进行中的绘制
    setRallyPointOpen(false)
    setAreaSelectMode(false)
    // 读取 rallyPointOpen/rallyPointRect 分支
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rallyPointOpen, rallyPointRect])
  const openFormationFlightPanel = useCallback(() => {
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setRallyPointOpen(false)
    // 面板由关到开：立即进入取点模式（光标变图钉，与指点返航同方案），并清除上一次遗留航点
    setFormationFlightPoint(null)
    setFormationFlightOpen((v) => !v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // 区域列表「添加区域」进入绘制（area-list 来源）：六边形绘制交互——进入仅图标光标
  // 跟随，按下左键自光标点拉出对称正六边形（按住拖动放大/缩小），松开定格
  // 「确认/取消」；确认后按六边形 6 顶点经纬度本地新增任务区域
  // （无对应功能面板，Esc/绘制阶段右键直接退出不重开面板）。
  // 由 HomePage 监听 taskAreaStore.addAreaRequests 计数器信号调用（跨层级接线）
  const openAreaListSelect = useCallback(() => {
    setTakeoffOpen(false)
    setLandingOpen(false)
    setReturnHomeOpen(false)
    setTapReturnOpen(false)
    setAreaLandingOpen(false)
    setHoverOpen(false)
    setWaypointFlightOpen(false)
    setRouteFlightOpen(false)
    setOrbitFlightOpen(false)
    setRallyPointOpen(false)
    setFormationFlightOpen(false)
    setAreaSelectSource('area-list')
    setAreaSelectMode(true)
    // setState 引用稳定，无需依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 各功能面板展开状态查询表：底部按钮「弹出 + 激活背景」统一由此判断，
  // 替代逐面板的 && 长链（第 2~12 段功能按钮均提供激活态背景切图）；
  // 区域降落/集结点在框选绘制期间（面板收起、光标为标记）按钮同样保持
  // 弹出激活态——按钮选中态与标记光标态同步出现/消失
  const panelOpenState: Record<BottomBarPanel, boolean> = useMemo(
    () => ({
      takeoff: takeoffOpen,
      landing: landingOpen,
      'return-home': returnHomeOpen,
      'tap-return': tapReturnOpen,
      'area-landing': areaLandingOpen || (areaSelectMode && areaSelectSource === 'area-landing'),
      hover: hoverOpen,
      'waypoint-flight': waypointFlightOpen,
      'route-flight': routeFlightOpen,
      'orbit-flight': orbitFlightOpen,
      'rally-point': rallyPointOpen || (areaSelectMode && areaSelectSource === 'rally-point'),
      'formation-flight': formationFlightOpen,
    }),
    // 任一面板开合/框选状态变化才重建引用，供 memo 化的 BottomBar 浅比较
    [
      takeoffOpen,
      landingOpen,
      returnHomeOpen,
      tapReturnOpen,
      areaLandingOpen,
      areaSelectMode,
      areaSelectSource,
      hoverOpen,
      waypointFlightOpen,
      routeFlightOpen,
      orbitFlightOpen,
      rallyPointOpen,
      formationFlightOpen,
    ],
  )

  // 各功能按钮点击处理函数查询表：与 panelOpenState 平行的互斥切换入口，
  // 渲染处据此绑定 onClick（替代逐面板嵌套三元链）
  const panelHandlers: Record<BottomBarPanel, () => void> = useMemo(
    () => ({
      takeoff: openTakeoffPanel,
      landing: openLandingPanel,
      'return-home': openReturnHomePanel,
      'tap-return': openTapReturnPanel,
      'area-landing': openAreaLandingPanel,
      hover: openHoverPanel,
      'waypoint-flight': openWaypointFlightPanel,
      'route-flight': openRouteFlightPanel,
      'orbit-flight': openOrbitFlightPanel,
      'rally-point': openRallyPointPanel,
      'formation-flight': openFormationFlightPanel,
    }),
    // 依赖已 useCallback 化的处理函数，引用随其依赖同步重建
    [
      openTakeoffPanel,
      openLandingPanel,
      openReturnHomePanel,
      openTapReturnPanel,
      openAreaLandingPanel,
      openHoverPanel,
      openWaypointFlightPanel,
      openRouteFlightPanel,
      openOrbitFlightPanel,
      openRallyPointPanel,
      openFormationFlightPanel,
    ],
  )


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
    panelOpenState,
    panelHandlers,
    openAreaListSelect,
  }
}
