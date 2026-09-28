# 离线地图包目录（public/maps）

本目录存放**预构建的城市 MBTiles 文件**，前端通过 **HTTP Range 按需直读**渲染（不整包下载、不导入 IndexedDB）。

## 现行接入方式

- 数据源固定为 `public/maps/suzhou.mbtiles`（苏州卫星影像，GB 级）；
- 前端 `gcs-pkg://` 协议按 `z/x/y` 对文件内 SQLite B-tree 做范围请求（每张瓦片 2~3 个 4KB Range），即时渲染；
- 服务端（dev：vite 中间件；生产：nginx 静态）需支持并放行 HTTP Range（206）。

## 更换数据

直接替换同名文件 `public/maps/{key}.mbtiles` 即可，前端无需重新导入；刷新页面自动生效。
