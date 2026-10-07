/**
 * @file useRallyFormationState.ts
 * @description 集结点面板域状态：框选区域/航线生成/确认与队形
 * @author 4everyy
 * @date 2026-10-07
 */
import { useState } from 'react'
import {
  type RallyPointFormation,
  type FormationFlightFormation,
} from '../components/FlightActionPanels/FlightActionPanels'

/** 集结点面板域状态：已确认框选区域（视口+地理）、航线生成、确认与队形（自 useExclusivePanels 拆出） */
export function useRallyPointState() {
  // 集结点已确认的框选区域（视口坐标）：与区域降落同款截图式矩形，但无中心徽章
  const [rallyPointRect, setRallyPointRect] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  // 集结区域四角经纬度（WGS84，框选确认时由视口坐标换算）：地理锚定用——地图拖拽/缩放后经 adapter.project 重投影回当前视口
  const [rallyPointRectGeo, setRallyPointRectGeo] = useState<
    { lat: number; lng: number }[] | null
  >(null)
  // 集结点航线已生成态：「航线生成」后置 true——在已确认集结区域内按当前队形布置集结坪（area-landing-spot）图标并绘制飞机连线
  const [rallyPointRouteGenerated, setRallyPointRouteGenerated] = useState(false)
  // 集结指令已确认：滑动二次确认成功后置 true，「确认」按钮随之置灰（防止重复下发指令）
  const [rallyPointConfirmed, setRallyPointConfirmed] = useState(false)
  // 集结队形（受控状态，面板下拉与地图集结坪布置联动）：变化时即时重排集结坪布局
  const [rallyPointFormation, setRallyPointFormation] = useState<RallyPointFormation>('人字形')

  return {
    rallyPointRect,
    setRallyPointRect,
    rallyPointRectGeo,
    setRallyPointRectGeo,
    rallyPointRouteGenerated,
    setRallyPointRouteGenerated,
    rallyPointConfirmed,
    setRallyPointConfirmed,
    rallyPointFormation,
    setRallyPointFormation,
  }
}

/** 编队飞行面板域状态：取点/跟随点、航线生成、确认与队形（自 useExclusivePanels 拆出） */
export function useFormationFlightState() {
  const [formationFlightOpen, setFormationFlightOpen] = useState(false)
  // 编队飞行图钉跟随点：面板打开期间鼠标在地图上的实时位置（视口坐标，仅视觉不参与取点）
  const [formationFlightHover, setFormationFlightHover] = useState<{
    x: number
    y: number
  } | null>(null)
  // 编队飞行取点：左键点击地图定格的航点（视口坐标 + 经纬度），回填面板「航点信息」坐标输入框
  const [formationFlightPoint, setFormationFlightPoint] = useState<{
    x: number
    y: number
    lat: number
    lng: number
  } | null>(null)
  // 编队飞行航线已生成态：「航线生成」后置 true——在最左选中飞机图标上方按当前队形布置降落点（area-landing-spot）图标并绘制连线
  const [formationFlightRouteGenerated, setFormationFlightRouteGenerated] = useState(false)
  // 编队飞行指令已确认：滑动二次确认成功后置 true，「确认」按钮随之置灰（防止重复下发指令）
  const [formationFlightConfirmed, setFormationFlightConfirmed] = useState(false)
  // 编队队形（受控状态，面板下拉与地图降落点布置联动）：变化时即时重排降落点布局，模拟飞行进行中则以新队形重启动画
  const [formationFlightFormation, setFormationFlightFormation] =
    useState<FormationFlightFormation>('人字形')

  return {
    formationFlightOpen,
    setFormationFlightOpen,
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
