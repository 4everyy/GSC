# 方案 A：MapLibre GL JS 实施工作计划

> **文档版本**：v1.0  
> **更新日期**：2026-08-03  
> **前置文档**：[离线内网2D地图方案调研](./离线内网2D地图方案调研.md)  
> **约束条件**：保留现有百度地图方案，支持运行时按钮切换

---

## 目录

1. [目标与范围](#1-目标与范围)
2. [现有代码耦合点分析](#2-现有代码耦合点分析)
3. [架构设计：地图引擎抽象层](#3-架构设计地图引擎抽象层)
4. [工作分解（WBS）](#4-工作分解wbs)
5. [分阶段实施计划](#5-分阶段实施计划)
6. [瓦片数据准备清单](#6-瓦片数据准备清单)
7. [风险与应对](#7-风险与应对)
8. [验收标准](#8-验收标准)

---

## 1. 目标与范围

### 1.1 目标

1. **新增 MapLibre GL JS 地图引擎**，完全本地化，零公网依赖
2. **保留现有百度地图方案**，通过 UI 按钮运行时切换
3. **完整迁移现有功能**：航线编辑、无人机模拟、缩放控制、定位、比例尺
4. **离线瓦片服务就绪**：tileserver-gl + 苏州区域矢量瓦片

### 1.2 范围内（本次实施）

| 功能 | 迁移优先级 | 说明 |
|------|-----------|------|
| 底图渲染 | P0 | MapLibre 地图初始化、样式加载 |
| 航线编辑 | P0 | 点击加点、拖拽航点、右键删除、折线渲染 |
| 航线只读渲染 | P0 | 航点展示、折线光晕效果 |
| 无人机模拟飞行 | P1 | 位置动画、航向旋转、拖尾轨迹 |
| 缩放控制 | P0 | zoomIn / zoomOut 按钮 |
| 自动定位 | P1 | 浏览器 Geolocation（WGS84 直用，无需转换） |
| 地图比例尺 | P2 | 基于缩放级别计算比例尺 |

### 1.3 范围外（本次不做，需降级处理）

| 功能 | 原因 | 降级方案 |
|------|------|----------|
| **地址搜索（PlaceSearch）** | 百度 `LocalSearch` 是在线服务，离线无替代 | 切换至 MapLibre 时隐藏搜索框，或接入内网 POI 数据库（后续迭代） |
| **百度卫星底图** | 百度瓦片需在线请求 | 使用 OpenMapTiles 矢量底图 + 可选栅格卫星瓦片 |
| **百度专有样式（setMapStyleV2）** | 百度 API 专属 | 使用 MapLibre Style JSON 控制样式 |

---

## 2. 现有代码耦合点分析

### 2.1 BMapGL 耦合全景图

经代码审查，以下文件直接依赖 `BMapGL`：

| 文件 | 耦合度 | 涉及 API | 迁移难度 |
|------|--------|----------|----------|
| `types/bmap.d.ts` | 类型声明 | 全局 `BMapGL` 命名空间类型 | 低（替换为 maplibre 类型） |
| `utils/loadBMapGL.ts` | SDK 加载 | 动态 script 注入 | 低（MapLibre 无需动态加载） |
| `utils/coordTransform.ts` | 坐标转换 | `wgs84ToBd09` | 低（MapLibre 用 WGS84，无需转换） |
| `config/map.ts` | 配置 | `MapStyleFeature[]` 百度样式 | 低（替换为 Style JSON 路径） |
| `components/BMapContainer/BMapContainer.tsx` | **核心容器** | Map/Point/Geolocation/Circle/Marker/Icon | **高（完全重写）** |
| `pages/HomePage/HomePage.tsx` | 入口 | `BMapGL.Map` 类型 + `mapInstance` 状态 | 中（类型抽象化） |
| `features/routePlanning/RouteEditor.tsx` | **航线编辑** | Marker/Label/Polyline/Icon/Point/事件 | **高（API 映射重写）** |
| `features/routePlanning/RouteOverlay.tsx` | 航线渲染 | Marker/Label/Polyline/Point | 中（同上，可复用映射逻辑） |
| `features/routePlanning/DroneSimulator.tsx` | **无人机模拟** | Label/Polyline/Point + setPosition/setPath/setContent 动画 | **高（动画逻辑重写）** |
| `components/MapControls/MapControls.tsx` | 缩放控制 | `map.zoomIn()` / `map.zoomOut()` | 低（API 名称相近） |
| `components/MapScale/MapScale.tsx` | 比例尺 | 缩放事件 + 比例计算 | 低（重写计算逻辑） |
| `components/PlaceSearch/PlaceSearch.tsx` | 地址搜索 | `BMapGL.LocalSearch`（**在线服务**） | **不迁移，降级处理** |

### 2.2 关键 API 映射表

| 功能 | 百度 BMapGL | MapLibre GL JS | 迁移说明 |
|------|-------------|----------------|----------|
| 地图实例 | `new BMapGL.Map(el, opts)` | `new maplibregl.Map({container, style})` | 构造参数不同 |
| 设置中心 | `map.centerAndZoom(point, zoom)` | `map.setCenter([lng,lat]); map.setZoom(n)` | 拆分为两个调用 |
| 坐标点 | `new BMapGL.Point(lng, lat)` | `[lng, lat]` 数组 | 简化 |
| 标注 | `new BMapGL.Marker(point, {icon})` | `new maplibregl.Marker(el).setLngLat([lng,lat])` | DOM 元素自定义 |
| 折线 | `new BMapGL.Polyline(points, opts)` | `map.addLayer({type:'line', source})` + GeoJSON | 数据驱动 |
| 文字标签 | `new BMapGL.Label(html, {position})` | `new maplibregl.Popup()` 或自定义 Marker | 可用 HTML Marker 替代 |
| 圆形 | `new BMapGL.Circle(point, radius, opts)` | `map.addLayer({type:'fill', source: GeoJSON circle})` | 需生成多边形近似 |
| 缩放 | `map.zoomIn()` / `map.zoomOut()` | `map.zoomIn()` / `map.zoomOut()` | ✅ API 一致 |
| 点击事件 | `map.addEventListener('click', fn)` | `map.on('click', fn)` | 事件参数结构不同 |
| 拖拽航点 | Marker `dragend` 事件 | 需自定义实现（pointerdown/move/up） | **需自行实现** |
| 覆盖物管理 | `map.addOverlay()` / `map.removeOverlay()` | `map.addLayer()` / `map.removeLayer()` + Source 管理 | 概念不同 |
| 定位 | `new BMapGL.Geolocation()` | 浏览器 `navigator.geolocation` | 无需 SDK 依赖 |
| POI 搜索 | `new BMapGL.LocalSearch()` | ❌ 无内置 | 需外部服务或降级 |
| 实例销毁 | `map.destroy()` | `map.remove()` | 名称不同 |

### 2.3 动画逻辑复杂度评估

`DroneSimulator.tsx` 是迁移难度最高的模块，其动画链路：

```
百度方案（当前）：
  requestAnimationFrame → setSim() → 
    labelRef.setPosition(newPoint)       // 位置更新
    labelRef.setContent(buildDroneHTML)  // 朝向更新（节流）
    trailRef.setPath(pts)                // 轨迹更新

MapLibre 方案（目标）：
  requestAnimationFrame → setSim() →
    droneMarker.setLngLat([lng, lat])    // 位置更新（Marker.setLngLat）
    droneIconEl.style.transform = ...    // 朝向更新（直接操作 DOM）
    map.getSource('trail').setData(geojson) // 轨迹更新（GeoJSON setData）
```

**结论**：动画主循环（`step` 函数、插值、航向计算）可原样复用，仅覆盖物更新 API 需重写。

---

## 3. 架构设计：地图引擎抽象层

### 3.1 设计目标

支持运行时切换百度/MapLibre，且**上层业务组件无需感知具体引擎**。

### 3.2 分层架构

```
┌─────────────────────────────────────────────────────┐
│              HomePage（业务层）                       │
│    RouteEditor / DroneSimulator / MapControls       │
├─────────────────────────────────────────────────────┤
│           地图引擎抽象层（新增）                       │
│   useMapEngine() + MapAdapter 接口                  │
│   统一暴露：addMarker / drawLine / on click / ...   │
├──────────────────┬──────────────────────────────────┤
│  BMapAdapter     │  MapLibreAdapter                  │
│  （现有逻辑封装） │  （新增实现）                      │
├──────────────────┼──────────────────────────────────┤
│  BMapContainer   │  MapLibreContainer                │
│  （百度 SDK）     │  （MapLibre SDK + tileserver）    │
└──────────────────┴──────────────────────────────────┘
```

### 3.3 MapAdapter 接口（草案）

```typescript
// src/map-engines/types.ts

/** 统一的地图引擎适配器接口 */
export interface MapAdapter {
  /** 引擎标识 */
  readonly engine: 'baidu' | 'maplibre'

  // === 视图控制 ===
  setCenter(lng: number, lat: number): void
  setZoom(zoom: number): void
  zoomIn(): void
  zoomOut(): void
  panTo(lng: number, lat: number): void

  // === 覆盖物 ===
  addMarker(id: string, lng: number, lat: number, opts?: MarkerOptions): void
  removeMarker(id: string): void
  addPolyline(id: string, points: [number, number][], opts?: LineOptions): void
  updatePolyline(id: string, points: [number, number][]): void
  removePolyline(id: string): void
  addCircle(id: string, lng: number, lat: number, radius: number): void
  removeOverlay(id: string): void

  // === 事件 ===
  onClick(handler: (lng: number, lat: number) => void): () => void
  onZoom(handler: (zoom: number) => void): () => void

  // === 交互 ===
  setDefaultCursor(cursor: string): void
  enableDoubleClickZoom(enabled: boolean): void

  // === 生命周期 ===
  destroy(): void
}

/** 统一的地图引擎实例（替代直接传递 BMapGL.Map） */
export interface MapEngineInstance {
  adapter: MapAdapter
  /** 原始地图实例（引擎特定，供高级用法使用） */
  raw: unknown
}
```

### 3.4 切换机制

```typescript
// HomePage 中通过状态控制引擎
const [engine, setEngine] = useState<'baidu' | 'maplibre'>('baidu')

// 引擎切换按钮（放在 MapToolbar 或 StatusHeader）
<button onClick={() => setEngine(e => e === 'baidu' ? 'maplibre' : 'baidu')}>
  切换至 {engine === 'baidu' ? 'MapLibre' : '百度'}
</button>

// 根据引擎渲染对应容器
{engine === 'baidu' ? (
  <BMapContainer onReady={(m) => setMapInstance({adapter: wrapBaidu(m), raw: m})} />
) : (
  <MapLibreContainer onReady={(m) => setMapInstance({adapter: wrapMapLibre(m), raw: m})} />
)}
```

> **注**：引入抽象层有一定工作量。如果时间紧张，**MVP 阶段可先不做抽象层**，直接新建一套 MapLibre 版本的组件（`MapLibreRouteEditor` 等），通过条件渲染切换。抽象层作为第二阶段重构。

---

## 4. 工作分解（WBS）

### 4.1 工作量估算

| WBS 编号 | 任务 | 类型 | 复杂度 | 预估工时 | 备注 |
|----------|------|------|--------|----------|------|
| **1.0** | **基础设施搭建** | | | **3 天** | |
| 1.1 | 安装 maplibre-gl + 类型 + CSS | 编码 | 低 | 0.5 天 | `npm i maplibre-gl` |
| 1.2 | tileserver-gl Docker 部署 + 苏州瓦片 | 运维 | 中 | 1 天 | 含下载切片数据 |
| 1.3 | 样式 JSON 配置（暗色底图 + 字体） | 配置 | 中 | 1 天 | OpenMapTiles Dark Matter |
| 1.4 | MapLibreContainer 组件（初始化+样式+定位） | 编码 | 中 | 1 天 | 参照现有 BMapContainer |
| **2.0** | **地图引擎抽象层（可选）** | | | **2 天** | |
| 2.1 | 设计 MapAdapter 接口 | 设计 | 中 | 0.5 天 | 见 3.3 节 |
| 2.2 | 实现 BaiduMapAdapter（封装现有逻辑） | 编码 | 中 | 0.5 天 | 包装现有 BMapGL 调用 |
| 2.3 | 实现 MapLibreAdapter | 编码 | 高 | 1 天 | 核心映射逻辑 |
| **3.0** | **航线编辑迁移** | | | **3 天** | |
| 3.1 | MapLibre 版 RouteEditor（点击加点） | 编码 | 中 | 0.5 天 | map.on('click') |
| 3.2 | 拖拽航点实现（pointer 事件） | 编码 | **高** | 1 天 | MapLibre 无原生拖拽 Marker |
| 3.3 | 右键删除航点 | 编码 | 低 | 0.5 天 | contextmenu 事件 |
| 3.4 | 折线渲染（光晕+主线双层） | 编码 | 中 | 1 天 | addLayer line + blur filter |
| **4.0** | **航线只读渲染迁移** | | | **1 天** | |
| 4.1 | RouteOverlay 迁移（复用 3.4 折线逻辑） | 编码 | 低 | 0.5 天 | 去掉拖拽交互 |
| 4.2 | 航点节点 HTML Marker 渲染 | 编码 | 低 | 0.5 天 | 复用 waypointIcon.ts |
| **5.0** | **无人机模拟迁移** | | | **2 天** | |
| 5.1 | 飞机 Marker 创建 + 位置动画 | 编码 | 中 | 0.5 天 | setLngLat 每帧 |
| 5.2 | 航向旋转 DOM 更新 | 编码 | 低 | 0.5 天 | 直接操作 marker element |
| 5.3 | 拖尾轨迹 GeoJSON 更新 | 编码 | 中 | 1 天 | source.setData |
| **6.0** | **辅助组件迁移** | | | **1 天** | |
| 6.1 | MapControls 缩放按钮 | 编码 | 低 | 0.5 天 | API 基本一致 |
| 6.2 | MapScale 比例尺 | 编码 | 低 | 0.5 天 | 重写计算逻辑 |
| 6.3 | PlaceSearch 降级处理 | 编码 | 低 | — | 切换 MapLibre 时隐藏 |
| **7.0** | **集成与切换** | | | **2 天** | |
| 7.1 | 引擎切换按钮 + 条件渲染 | 编码 | 低 | 0.5 天 | |
| 7.2 | HomePage 集成联调 | 编码 | 中 | 1 天 | 状态管理适配 |
| 7.3 | 离线环境验证 | 测试 | 中 | 0.5 天 | 断网测试 |
| **8.0** | **文档与交付** | | | **0.5 天** | |
| 8.1 | 更新开发文档 | 文档 | 低 | 0.5 天 | |
| | | | **合计** | **~14.5 天** | |

### 4.2 工时汇总

| 路线 | 工时 | 说明 |
|------|------|------|
| **快速 MVP**（不做抽象层，新建并行组件） | ~10 天 | 先跑通功能，代码有重复 |
| **完整方案**（含抽象层，可维护性好） | ~14.5 天 | 一次到位，后续扩展容易 |

> **建议**：时间紧先走 MVP 路线（10 天），验证可行后再用 2-3 天补抽象层重构。

---

## 5. 分阶段实施计划

### 第一阶段：POC 验证（第 1-2 天）

**目标**：证明 MapLibre + 离线瓦片能跑通基础地图

| 步骤 | 产出 | 验证标准 |
|------|------|----------|
| 安装 maplibre-gl | `package.json` 更新 | npm install 成功 |
| Docker 部署 tileserver-gl | 内网瓦片服务 `http://localhost:8080` | 浏览器能访问瓦片 |
| 下载苏州 OSM 数据并切片 | `suzhou.mbtiles` | tileserver-gl 能加载 |
| 编写 MapLibreContainer | 基础地图组件 | 能渲染地图、缩放、平移 |

**里程碑**：内网浏览器打开应用，看到 MapLibre 暗色底图

### 第二阶段：核心功能迁移（第 3-7 天）

**目标**：航线编辑和渲染在 MapLibre 上可用

| 步骤 | 产出 | 验证标准 |
|------|------|----------|
| 引擎切换按钮 | UI 组件 | 点击切换不崩溃 |
| RouteEditor 迁移 | 可点击加点、拖拽、删除 | 与百度版行为一致 |
| RouteOverlay 迁移 | 航点+折线渲染 | 视觉效果接近 |
| MapControls 迁移 | 缩放按钮可用 | zoomIn/zoomOut 生效 |

**里程碑**：在 MapLibre 引擎下能完整编辑和查看航线

### 第三阶段：高级功能（第 8-10 天）

**目标**：无人机模拟和定位可用

| 步骤 | 产出 | 验证标准 |
|------|------|----------|
| DroneSimulator 迁移 | 飞机动画+轨迹 | 流畅度 ≥ 百度版 |
| 自动定位 | 浏览器 Geolocation | 定位精度圆正确显示 |
| MapScale 迁移 | 比例尺显示 | 数值正确 |

**里程碑**：MapLibre 引擎功能与百度版对齐

### 第四阶段：优化与交付（第 11-12 天）

**目标**：离线环境验证通过，文档交付

| 步骤 | 产出 | 验证标准 |
|------|------|----------|
| 断网测试 | 测试报告 | 完全离线可用 |
| 性能基线对比 | 性能数据 | 帧率、内存无明显退化 |
| 更新开发文档 | 文档 | 覆盖部署和开发指南 |

---

## 6. 瓦片数据准备清单

### 6.1 必须项

| 项 | 说明 | 获取方式 |
|----|------|----------|
| 苏州区域矢量瓦片 | `suzhou.mbtiles` | OpenStreetMap 下载苏州 PBF → tilemaker 切片 |
| 暗色样式 JSON | Dark Matter 风格 | OpenMapTiles 官方仓库 |
| 中文字体切片 | `Noto Sans CJK` pbf | 字体切片工具生成 |

### 6.2 tileserver-gl 配置文件

```json
{
  "options": { "port": 8080 },
  "styles": {
    "dark": {
      "style": "styles/dark/style.json",
      "tilejson": { "bounds": [119.95, 30.75, 121.20, 31.86] }
    }
  },
  "data": {
    "suzhou": { "mbtiles": "data/suzhou.mbtiles" }
  }
}
```

### 6.3 Docker 一键启动

```bash
docker run -d \
  --name tileserver \
  -p 8080:8080 \
  -v ./tileserver-data:/data \
  maptiler/tileserver-gl \
  --config /data/config.json
```

---

## 7. 风险与应对

| 风险 | 等级 | 影响 | 应对措施 |
|------|------|------|----------|
| **MapLibre 无原生拖拽 Marker** | 🔴 高 | 航点拖拽功能 | 自行实现 pointerdown/move/up 事件链，参考官方 demo |
| **中文字体切片缺失** | 🟡 中 | 中文标注不显示 | 提前准备 Noto Sans CJK 字体包 |
| **矢量瓦片数据量过大** | 🟡 中 | 存储和加载性能 | 限制切片范围（仅苏州市），maxZoom=14 |
| **样式与现有 UI 风格不匹配** | 🟡 中 | 视觉一致性 | 定制暗色 Style JSON，参考现有配色 |
| **PlaceSearch 无法离线** | 🟢 低 | 搜索功能不可用 | MVP 阶段降级隐藏，后续接入内网 POI |
| **引擎切换状态丢失** | 🟡 中 | 切换后航线消失 | 航线数据存于 React state，与引擎解耦，切换时自动重建覆盖物 |
| **HTTPS 混合内容限制** | 🟢 低 | 瓦片加载失败 | tileserver-gl 配置 HTTPS 或 Nginx 反向代理统一 |

---

## 8. 验收标准

### 8.1 功能验收

- [ ] 内网环境下（断开公网）MapLibre 地图正常渲染
- [ ] 引擎切换按钮可在百度/MapLibre 间无缝切换
- [ ] MapLibre 引擎下航线编辑功能完整（加点/拖拽/删除/折线）
- [ ] MapLibre 引擎下无人机模拟动画流畅（≥30fps）
- [ ] MapLibre 引擎下缩放控制按钮生效
- [ ] 自动定位功能正常（浏览器 Geolocation）

### 8.2 性能验收

| 指标 | 百度版基线 | MapLibre 目标 |
|------|-----------|---------------|
| 首屏加载 | ~3s | ≤ 3s |
| 缩放/平移帧率 | 60fps | ≥ 45fps |
| 100 个航点渲染 | 流畅 | 流畅 |
| 无人机模拟帧率 | 60fps | ≥ 30fps |
| 内存占用 | 基线 | 不超 1.5 倍 |

### 8.3 交付物

- [ ] MapLibreContainer 组件 + 全套迁移组件
- [ ] tileserver-gl Docker 部署配置 + 数据
- [ ] 暗色样式 JSON + 中文字体包
- [ ] 引擎切换 UI
- [ ] 更新后的开发文档
- [ ] 离线环境测试报告

---

*本计划基于代码审查制定，实施过程中如遇技术阻碍，优先保证核心功能（航线编辑+底图渲染）可用。*