# 离线地图包目录（public/maps）

本目录存放**预构建的城市 MBTiles 文件**，供前端「离线地图」面板切换城市时自动加载。

## 命名约定（关键）

文件名必须与 `src/features/offline-map/cities.json` 中城市的 `key` **完全一致**：

```
public/maps/{key}.mbtiles
```

| 城市 | key | 文件名 |
|------|-----|--------|
| 苏州 | suzhou | `public/maps/suzhou.mbtiles` |
| 北京 | beijing | `public/maps/beijing.mbtiles` |
| 上海 | shanghai | `public/maps/shanghai.mbtiles` |

> key 为城市拼音，全清单见 `src/features/offline-map/cities.json`（直辖市 + 省会 + 计划单列市 + 江苏/浙江全域，共 60+ 城市）。

## 如何生成 MBTiles（由运维离线准备）

MBTiles 无法从网络直接下载现成文件，需离线生成（详见 `docs/离线部署指南.md`、`docs/项目说明书.md`）：

1. 下载目标区域 OSM PBF 源数据（如 Geofabrik 中国 PBF，约 1.5 GB）；
2. 用 `osmium` 按城市 bbox 裁剪；
3. 用 `tilemaker` 切片为 MBTiles（每城市约 5–15 分钟）；
4. 生成后复制到本目录：`public/maps/{key}.mbtiles`。

**放几个城市就支持几个城市切换**；缺失的城市切换时前端会提示「尚未准备离线数据」。

## 严格离线说明

- 本目录文件随构建产物一同托管为**同源静态资源**（`/maps/{key}.mbtiles`）；
- 前端切换城市时仅 `fetch` 本目录同名文件，**绝不访问任何在线瓦片源**（无 Esri / OSM 在线回源）；
- 文件较大（单城市数十 MB ~ 数百 MB），**不要**提交进 git 仓库（`.gitignore` 已忽略 `*.mbtiles`）。
