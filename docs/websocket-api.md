# WebSocket 协议对接文档（前端契约定稿版）

> **定位**：本文档由前端团队维护，是交给独立后端团队的**接口契约**。前端已按此实现并交付（见 `src/features/realtime/protocol.ts`），后端请按本文档实现服务端。
> **单一事实来源**：字段类型定义以 `src/features/realtime/protocol.ts` 为准，本文档与其同步修订；任何字段变更须经双方确认后同步修改两处。
> 更新日期：2026-09-03

## 0. 阅读指引（后端工程师请先看这里）

后端需要实现的内容概括为四件事：

1. **WS 服务端**：监听约定地址，按第 3、4 节的消息格式收发 JSON 文本帧；
2. **握手**：收到前端 `hello` 后（可选但推荐）回 `welcome`，用于确认双向链路；
3. **推送**：连接建立后主动推送全量快照（设备状态），随后按事件/频率推送遥测、目标、告警；
4. **应答**：对上行 `command` 在 **5 秒内** 回 `cmdAck`，对 `heartbeat` 保持应答或维持消息流。

前端已实现的容错（指数退避重连、断线重订阅、5s 指令超时）见第 5 节，后端无需关心，但需满足其前提（subscribe 幂等、cmdAck 必达）。

## 1. 服务器信息与接入方式

| 服务 | 地址 | 用途 |
|---|---|---|
| HTTP REST | `http://192.168.110.150:1111` | 文件上传下载、任务管理、历史数据查询等（另行文档） |
| WebSocket | `ws://192.168.110.150:8765` | 实时遥测/状态/目标/告警推送、控制指令上行 |

**前端连接地址规则**（`wsClient.resolveWsUrl()`）：

- 优先读环境变量 `VITE_WS_URL`（完整地址，如 `ws://192.168.110.150:8765`）；
- 未配置时连**同源** `/ws` 路径——开发环境由 Vite dev server 代理转发（`vite.config.ts`）：

| 前端请求 | 代理转发至 |
|---|---|
| `ws://localhost:5173/ws` | `ws://192.168.110.150:8765` |
| `http://localhost:5173/api/xxx` | `http://192.168.110.150:1111/xxx` |

后端地址变更时前端在 `.env.local` 覆盖，无需改代码：

```
VITE_WS_URL=ws://<新IP>:<新端口>          # 直连模式
VITE_WS_PROXY_TARGET=ws://<新IP>:<新端口>  # 或代理模式
VITE_API_PROXY_TARGET=http://<新IP>:<新端口>
```

## 2. 消息信封（通用约定）

所有 WS 消息均为 **JSON 文本帧**，统一信封结构：

```jsonc
// 下行（后端 → 前端）
{ "type": "telemetry", "payload": { }, "ts": 1756800000000, "seq": 1041 }

// 上行（前端 → 后端）
{ "type": "command", "payload": { }, "ts": 1756800000000, "reqId": "req-1756800000000-3" }
```

| 字段 | 方向 | 类型 | 说明 |
|---|---|---|---|
| `type` | 双向 | string | 消息类型枚举，见下文 |
| `payload` | 双向 | object | 载荷，结构由 `type` 决定 |
| `ts` | 双向 | number | Unix 毫秒时间戳 |
| `seq` | 仅下行 | number? | 可选递增序号，前端用于乱序检测/去重 |
| `reqId` | 上行必带（command）；下行 cmdAck 原样带回 | string | **字符串**（格式 `req-<毫秒时间戳>-<自增>`），前端生成，用于关联指令与回执 |

消息类型枚举：

- 下行（`ServerMessageType`）：`telemetry` / `deviceStatus` / `target` / `targetRemoved` / `alarm` / `cmdAck` / `heartbeat` / `welcome`
- 上行（`ClientMessageType`）：`hello` / `subscribe` / `unsubscribe` / `command` / `heartbeat`

**前端对非法消息的处理**：非 JSON 或结构不符（缺 `type`/`payload`/`ts` 类型错误）的消息会被**直接丢弃并打 warn 日志**，不会进入业务状态。请后端严格保证信封结构。

## 3. 下行消息定义（后端 → 前端）

### 3.1 `telemetry` — 无人机遥测（高频，建议 1~5 Hz）

| 字段 | 类型 | 说明 |
|---|---|---|
| `deviceId` | string | 设备 ID（与 deviceStatus 的 ID 一致） |
| `longitude` | number | 经度（WGS84，度） |
| `latitude` | number | 纬度（WGS84，度） |
| `altitude` | number | 相对起飞点高度（米） |
| `elevation` | number | 海拔高度（米） |
| `velocityY` | number | 地速（米/秒） |
| `yaw` | number | 偏航角（度，0~360，真北为 0 顺时针） |
| `pitch` | number | 俯仰角（度） |
| `roll` | number | 横滚角（度） |
| `battery` | number | 电池电量百分比（0~100） |
| `voltage` | number | 电压（伏特） |
| `delay` | number | 通信延迟（毫秒） |
| `gps` | string | 定位状态描述（如 `"23 颗"` / `"RTK 固定"`），前端直接展示 |
| `sampleTs` | number | 遥测采样时间（Unix 毫秒） |

```json
{ "type": "telemetry", "ts": 1756800000000, "seq": 1041,
  "payload": { "deviceId": "uav-01", "longitude": 118.796877, "latitude": 31.968769,
    "altitude": 120.5, "elevation": 45.2, "velocityY": 8.3, "yaw": 187.5,
    "pitch": -2.1, "roll": 1.4, "battery": 76, "voltage": 24.1, "delay": 45,
    "gps": "23 颗", "sampleTs": 1756799999800 } }
```

### 3.2 `deviceStatus` — 设备上下线/状态变更（事件驱动）

**连接建立时后端必须先推送一轮全量快照**（每设备一条），此后仅在状态变化时推送。

| 字段 | 类型 | 说明 |
|---|---|---|
| `deviceId` | string | 设备 ID |
| `name` | string | 设备名称（如 `"01中科晶锐"`，用于列表展示） |
| `status` | string | 枚举：`tasking`(任务中) / `standby`(待命) / `offline`(离线) / `charging`(充电) |
| `isCharging` | boolean? | 是否充电中（影响前端电量图标） |

```json
{ "type": "deviceStatus", "ts": 1756800000000, "seq": 7,
  "payload": { "deviceId": "uav-01", "name": "01中科晶锐", "status": "tasking", "isCharging": false } }
```

### 3.3 `target` — 目标情报（新增或更新，按 `targetId` 覆盖）

| 字段 | 类型 | 说明 |
|---|---|---|
| `targetId` | string | 目标唯一 ID |
| `name` | string | 目标名称（如 `"01目标车辆"`） |
| `type` | string | 枚举：`"车辆"` / `"人员"` |
| `status` | string | 状态文字（如 `"默认侦查"`） |
| `value` | string | 目标价值（高/中/低） |
| `source` | string | 发现源（首次侦测到该目标的平台） |
| `threatRadius` | number | 威胁半径（米） |
| `altitude` | number | 目标高度（米） |
| `strikeMode` | string | 打击方式（如 `"单向序贯"`） |
| `longitude` | number | 经度（WGS84，度） |
| `latitude` | number | 纬度（WGS84，度） |
| `firstSeenAt` | number | 首次发现时间（Unix 毫秒） |
| `lastUpdatedAt` | number | 最后更新时间（Unix 毫秒） |

```json
{ "type": "target", "ts": 1756800000000, "seq": 52,
  "payload": { "targetId": "tgt-0001", "name": "01目标车辆", "type": "车辆",
    "status": "默认侦查", "value": "高", "source": "02无人机", "threatRadius": 50,
    "altitude": 12, "strikeMode": "单向序贯", "longitude": 118.797001,
    "latitude": 31.969102, "firstSeenAt": 1756799000000, "lastUpdatedAt": 1756800000000 } }
```

### 3.4 `targetRemoved` — 目标移除

| 字段 | 类型 | 说明 |
|---|---|---|
| `targetId` | string | 要移除的目标 ID |

```json
{ "type": "targetRemoved", "ts": 1756800000000, "seq": 53, "payload": { "targetId": "tgt-0001" } }
```

### 3.5 `alarm` — 告警（新增/更新，按 `alarmId` 更新）

同一 `alarmId` 再次推送视为**更新**（前端原地替换，不会重复入列）。

| 字段 | 类型 | 说明 |
|---|---|---|
| `alarmId` | string | 告警唯一 ID |
| `level` | string | 枚举：`red`(红) / `orange`(橙) / `blue`(蓝)，对应顶栏三色徽标 |
| `title` | string | 告警标题（如 `"电量低"`） |
| `detail` | string | 告警详情描述 |
| `deviceId` | string? | 关联设备 ID（用于前端跳转定位） |
| `occurredAt` | number | 发生时间（Unix 毫秒） |
| `acknowledged` | boolean | 是否已确认（确认后前端置灰并计入已处理） |

```json
{ "type": "alarm", "ts": 1756800000000, "seq": 88,
  "payload": { "alarmId": "alm-0009", "level": "orange", "title": "电量低",
    "detail": "03号机电量低于 25%", "deviceId": "uav-03",
    "occurredAt": 1756800000000, "acknowledged": false } }
```

### 3.6 `cmdAck` — 指令回执（必须，5 秒内）

对每条上行 `command` 回一条，`reqId` 原样带回。**执行失败/拒绝也必须回执**，不允许静默。

| 字段 | 类型 | 说明 |
|---|---|---|
| `reqId` | string | 对应上行 command 的 reqId |
| `result` | string | 枚举：`accepted`(已受理) / `rejected`(已拒绝) / `failed`(执行失败)。`timeout` 为前端本地超时判定，后端不会下发 |
| `reason` | string? | 附加说明（拒绝原因/失败信息） |

```json
{ "type": "cmdAck", "ts": 1756800000000, "seq": 12,
  "payload": { "reqId": "req-1756800000000-3", "result": "accepted" } }
{ "type": "cmdAck", "ts": 1756800000500, "seq": 13,
  "payload": { "reqId": "req-1756800000500-4", "result": "rejected", "reason": "设备离线" } }
```

### 3.7 `heartbeat` — 心跳应答

payload 为**空对象**即可（前端只看消息是否到达，不读字段）。

```json
{ "type": "heartbeat", "ts": 1756800000000, "payload": {} }
```

### 3.8 `welcome` — 应用层握手应答（推荐，非必须）

前端连接建立后会**先发 `hello`**（见 4.1）。后端收到后推荐回一条 `welcome`。
**前端为宽容模式**：未收到 `welcome` 不影响后续 `subscribe` 与数据流，
仅记录到通信日志（`wsLog`）中，便于排障时确认后端是否实现了握手应答。

| 字段 | 类型 | 说明 |
|---|---|---|
| `server` | string? | 服务端实例标识（如主机名/进程号） |
| `protocolVersion` | string? | 服务端协议版本（前端暂不校验，仅记录） |
| `message` | string? | 附加说明 |

```json
{ "type": "welcome", "ts": 1756800000000, "seq": 1,
  "payload": { "server": "gcs-backend-01", "protocolVersion": "1.0", "message": "ok" } }
```

## 4. 上行消息定义（前端 → 后端）

### 4.1 `hello` — 应用层握手（连接建立后前端发送的第一条消息）

连接建立（含页面刷新、断线重连）后，前端会按 **hello → subscribe** 的顺序发送：
先发 `hello` 声明客户端身份，再发 `subscribe` 订阅数据。**后端收到 `hello` 无需立即响应**，
推荐回 `welcome`（见 3.8）；忽略也不影响功能。

| 字段 | 类型 | 说明 |
|---|---|---|
| `client` | string | 客户端标识（默认 `"gsc-web"`，多地面站部署可用环境变量区分） |
| `sessionId` | string | 页面会话 ID（格式 `sess-<毫秒时间戳>-<随机>`，每次刷新重新生成） |

```json
{ "type": "hello", "ts": 1756800000000,
  "payload": { "client": "gsc-web", "sessionId": "sess-1756800000000-ab12cd" } }
```

### 4.2 `subscribe` / `unsubscribe` — 订阅控制

连接建立后前端**自动发送** `subscribe`（空数组 = 订阅全部设备）；重连成功后也会重发，**后端必须幂等**。

| 字段 | 类型 | 说明 |
|---|---|---|
| `payload.deviceIds` | string[] | 设备 ID 列表；**空数组 = 订阅全部** |

```json
{ "type": "subscribe", "ts": 1756800000000, "payload": { "deviceIds": [] } }
{ "type": "unsubscribe", "ts": 1756800000000, "payload": { "deviceIds": ["uav-02"] } }
```

### 4.3 `command` — 控制指令（等待 cmdAck）

| 字段 | 类型 | 说明 |
|---|---|---|
| `payload.command` | string | 指令类型，枚举见下表 |
| `payload.deviceIds` | string[] | 目标设备列表 |
| `payload.params` | object? | 指令参数，结构由 command 决定（如航点数组/盘旋半径） |

指令枚举（与前端底部按钮条/功能面板一一对应）：

| command | 含义 | | command | 含义 |
|---|---|---|---|---|
| `rtl` | 一键返航 | | `orbitMission` | 盘旋任务下发 |
| `forceLand` | 一键迫降 | | `formationMission` | 编队任务下发 |
| `emergencyStop` | 急停 | | `areaLanding` | 区域降落 |
| `takeoff` | 起飞 | | `rallyPoint` | 集结点 |
| `land` | 降落 | | `confirm` | 滑窗确认（任务确认） |
| `waypointMission` | 航点任务下发 | | `cancel` | 取消当前任务 |
| `routeMission` | 航线任务下发 | | | |

```json
{ "type": "command", "ts": 1756800000000, "reqId": "req-1756800000000-3",
  "payload": { "command": "rtl", "deviceIds": ["uav-01", "uav-02"] } }
{ "type": "command", "ts": 1756800000500, "reqId": "req-1756800000500-4",
  "payload": { "command": "waypointMission", "deviceIds": ["uav-01"],
    "params": { "waypoints": [{ "longitude": 118.797, "latitude": 31.969, "altitude": 100 }] } } }
```

> `params` 的详细结构按指令逐个联调时补充约定；补充后同步写入 `protocol.ts` 注释与本文档。

### 4.4 `heartbeat` — 客户端心跳（每 10s）

```json
{ "type": "heartbeat", "ts": 1756800000000, "payload": {} }
```

## 5. 连接管理约定（前端已实现，后端需满足前提）

| 机制 | 前端行为 | 对后端的要求 |
|---|---|---|
| 重连 | 指数退避 1s 起封顶 30s，±20% 抖动；网络恢复/页面回前台立即重连 | 服务端可承受重连风暴；连接是无状态的（鉴权如需请放握手阶段） |
| 心跳 | 每 10s 发 `heartbeat`；30s 无任何下行即判假死并重连 | **保持消息流或应答 heartbeat**，避免静默 30s 以上 |
| 重订阅 | 重连成功后自动重发 `subscribe` | subscribe/unsubscribe **幂等** |
| 全量恢复 | 重连后依赖后端重新推送 | **每次连接建立时推送全量 `deviceStatus` 快照**（当前目标/告警如需恢复也请一并推送） |
| 指令超时 | 发送 `command` 后 5s 未收到 `cmdAck` 即判失败（本地记为 `timeout`） | 每条 command **必回** cmdAck，异常路径回 `rejected`/`failed` + reason |

## 6. 前端工程结构（联调排障参考）

| 文件 | 职责 |
|---|---|
| `src/features/realtime/protocol.ts` | **协议类型契约（单一事实来源）** + 消息构造器 + 运行时校验 |
| `src/features/realtime/wsClient.ts` | WS 客户端单例：状态机/指数退避重连/心跳/防死连接/消息分发/应用层握手 |
| `src/features/realtime/realtimeStore.ts` | Zustand store：下行消息归约为全局状态；指令发送与回执跟踪（5s 超时/断线批量失败） |
| `src/features/realtime/useRealtimeConnection.ts` | React Hook，挂载于 App 根组件，全站唯一连接 |
| `src/features/realtime/wsLog.ts` | **持久化通信日志**：全部收发帧与连接事件留存（刷新不丢），支持控制台查看与导出 |
| `vite.config.ts` | `/ws`、`/api` 开发代理 |
| `.env.example` | 环境变量模板 |

前端日志约定：浏览器控制台 `[ws]` 前缀为连接层日志，`[realtime]` 前缀为业务层日志，
`[ws-log]` 前缀为留存日志镜像（telemetry/heartbeat 高频帧默认静默），联调时可直接过滤。

### 通信日志留存（刷新不丢失）

浏览器 Network 面板刷新即清空，Console 默认不保留历史。为此前端内置了应用层日志留存
（`src/features/realtime/wsLog.ts`）：

- **记录范围**：全部上行/下行消息信封（type/payload 摘要/reqId/seq）+ 连接生命周期事件
  （connecting/open/close/reconnect/dropped/send-failed）；
- **留存方式**：内存环形缓冲（1000 条）+ `localStorage` 持久化（300 条），**页面刷新后自动恢复**；
- **控制台调试**（DevTools Console 直接执行）：

| 命令 | 作用 |
|---|---|
| `__wsLog.list()` | 查看已留存日志（最新在末尾） |
| `__wsLog.export()` | 导出为 JSON 文件（可发给后端对日志） |
| `__wsLog.clear()` | 清空留存日志 |
| `__wsLog.setVerbose(true)` | 控制台打印全部帧（含遥测/心跳高频帧） |

## 7. 联调检查清单

- [ ] 后端 WS 服务监听 `192.168.110.150:8765` 可达（telnet/curl 握手通过）
- [ ] 前端 `npm run dev` 后控制台出现 `[ws] 连接成功`，无握手错误
- [ ] 连接建立后收到全量 `deviceStatus` 快照（每设备一条）
- [ ] 遥测按 1~5Hz 稳定推送，地图/面板实时更新
- [ ] `heartbeat` 请求有应答或消息流不断（无 30s 假死重连）
- [ ] `command` 下发后 5s 内收到同 `reqId` 的 `cmdAck`
- [ ] 断开后端服务 → 前端进入重连 → 恢复服务 → 前端自动重连并重新收到快照
- [ ] 同一 `alarmId` 重复推送时前端告警列表不出现重复项

## 8. 变更记录

| 日期 | 变更 | 说明 |
|---|---|---|
| 2026-09-03 | 新增握手与日志留存 | 新增应用层握手：前端连接后先发 `hello`（4.1），后端推荐回 `welcome`（3.8，宽容模式非必须）；新增 `wsLog.ts` 通信日志持久化留存（刷新不丢，`__wsLog` 控制台可查/导出） |
| 2026-09-03 | 契约定稿 | 文档与 `protocol.ts` 逐字段对齐：reqId 改为字符串；telemetry/deviceStatus/target/alarm/cmdAck/subscribe/command 字段全部按前端实现修订；补充 JSON 示例与后端实现前提 |
| 2026-09-02 | 初版 | 按早期草稿编写（字段与现实现不一致，已废弃） |
