<#
.SYNOPSIS
  多城市 OSM 矢量瓦片数据准备脚本（按 cities.json 批量生成 mbtiles）。

.DESCRIPTION
  本脚本完成以下流程：
    1. 下载（或复用）中国区域 OpenStreetMap PBF 数据（~1.5GB）；
    2. 读取 src/features/offline-map/cities.json，按 -Cities 指定的城市 key
       在 WSL 中用 osmium-tool 裁剪各市 bbox（strategy=smart 保持引用完整性）；
    3. 在 WSL 中用 tilemaker（OpenMapTiles schema）为每个城市生成 {key}.mbtiles；
    4. 合并进 tileserver/config.json 的 data 段，并把 dark 样式源指向 -Primary
       城市（保证下载该城市瓦片后可离线查看其矢量底图）。

  前端 DownloadTab 会探测 /data.json，仅显示已注册（已准备数据）的城市，
  因此只有在此脚本准备过的城市才会出现在下载下拉框并可成功下载。

.NOTES
  执行：在 PowerShell 中 cd tileserver 后运行。
  默认仅准备苏州（向后兼容旧用法）：
    .\prepare-data.ps1 -SkipDownload
  多城市示例：
    .\prepare-data.ps1 -Cities suzhou,beijing,shanghai
    .\prepare-data.ps1 -Cities nanjing -Primary nanjing -MaxZoom 16
  可用城市 key 见 src/features/offline-map/cities.json。
  WSL 依赖：osmium-tool、tilemaker（安装见 docs/离线部署指南.md）。
#>

param(
    # 要准备的城市 key 列表（对应 cities.json 的 key 字段）；默认 @('suzhou')
    [string[]]$Cities = @(),
    # 主视图城市 key：dark 样式源指向该城市的 mbtiles（默认取 $Cities 第一项）
    [string]$Primary = "",
    # 最大缩放级别（影响文件大小与处理时间，14 约为城市级细节，推荐）
    [int]$MaxZoom = 14,
    # 是否跳过下载步骤（已有 PBF 文件时设为 $true）
    [switch]$SkipDownload,
    # 是否在 WSL 中安装缺失依赖（默认仅检测并提示）
    [switch]$InstallDeps
)

$ErrorActionPreference = "Stop"

# ---- 路径常量 ----
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataDir = Join-Path $ScriptDir "data"
$RepoRoot = Split-Path -Parent $ScriptDir
$CitiesJsonPath = Join-Path $RepoRoot "src\features\offline-map\cities.json"
$TilemakerConfig = Join-Path $ScriptDir "tilemaker-config.json"
$TilemakerProcess = Join-Path $ScriptDir "process.lua"

if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
    Write-Host "[INFO] Created data directory: $DataDir" -ForegroundColor Green
}

# ============================================================
# 解析 cities.json，校验 -Cities / -Primary
# ============================================================
if (-not (Test-Path $CitiesJsonPath)) {
    Write-Host "[ERROR] 城市数据库不存在：$CitiesJsonPath" -ForegroundColor Red
    exit 1
}
$AllCities = Get-Content $CitiesJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json

if ($Cities.Count -eq 0) { $Cities = @('suzhou') }
$Selected = @()
foreach ($k in $Cities) {
    $hit = $AllCities | Where-Object { $_.key -eq $k }
    if (-not $hit) {
        Write-Host "[ERROR] 未知城市 key：$k" -ForegroundColor Red
        Write-Host "[HINT] 可用 key：$($AllCities.key -join ', ')" -ForegroundColor Yellow
        exit 1
    }
    $Selected += $hit
}
if ([string]::IsNullOrWhiteSpace($Primary)) { $Primary = $Selected[0].key }
if (-not ($Selected.key -contains $Primary)) {
    Write-Host "[ERROR] -Primary '$Primary' 不在 -Cities 列表内" -ForegroundColor Red
    exit 1
}
Write-Host "[INFO] 准备城市：$($Selected.key -join ', ')  |  主视图：$Primary  |  MaxZoom=$MaxZoom" -ForegroundColor Cyan

# ============================================================
# 前置检查：WSL 与依赖工具
# ============================================================
function Test-WSL {
    try { $null = & wsl.exe --status 2>&1; return $LASTEXITCODE -eq 0 }
    catch { return $false }
}
function Test-WSLTool {
    param([string]$Tool)
    return [string](& wsl.exe bash -lc "command -v $Tool 2>/dev/null" 2>&1) -ne ""
}

Write-Host "`n========== Pre-check: WSL and tools ==========" -ForegroundColor Cyan
if (-not (Test-WSL)) {
    Write-Host "[ERROR] WSL 未安装或未运行。请先 wsl --install -d Ubuntu" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] WSL detected" -ForegroundColor Green

$missing = @()
foreach ($tool in @("osmium", "tilemaker")) {
    if (Test-WSLTool $tool) {
        $ver = & wsl.exe bash -lc "$tool --version 2>&1 | head -1" 2>&1
        Write-Host "[OK] $tool available: $ver" -ForegroundColor Green
    } else {
        Write-Host "[WARN] $tool not found in WSL" -ForegroundColor Yellow
        $missing += $tool
    }
}
if ($missing.Count -gt 0) {
    if ($InstallDeps) {
        Write-Host "[INFO] Installing missing dependencies in WSL..." -ForegroundColor Cyan
        & wsl.exe bash -lc "sudo apt update && sudo apt install -y osmium-tool tilemaker" 2>&1 | Out-Host
    } else {
        Write-Host "[ERROR] 缺少 WSL 工具：$($missing -join ', ')" -ForegroundColor Red
        Write-Host "[HINT] 重运行加 -InstallDeps，或手动 sudo apt install -y osmium-tool tilemaker" -ForegroundColor Yellow
        Write-Host "       (tilemaker apt 版本可能较旧，推荐源码编译，见 docs/离线部署指南.md)" -ForegroundColor Yellow
        exit 1
    }
}

# ============================================================
# 通用下载函数
# ============================================================
function Download-File {
    param([string]$Url, [string]$OutFile, [string]$Label)

    if (Test-Path $OutFile) {
        $sizeMB = [math]::Round((Get-Item $OutFile).Length / 1MB, 2)
        Write-Host "[SKIP] $Label already exists ($sizeMB MB)" -ForegroundColor DarkGray
        return $true
    }

    Write-Host "[INFO] Downloading $Label ..." -ForegroundColor Cyan
    Write-Host "       URL: $Url"

    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $tmpFile = "$OutFile.tmp"
    & curl.exe -L --fail --connect-timeout 15 --max-time 1200 -o "$tmpFile" "$Url" 2>&1 | Out-Null
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $prevEAP
    if ($exitCode -eq 0 -and (Test-Path $tmpFile)) {
        Move-Item -Path $tmpFile -Destination $OutFile -Force
        $sizeMB = [math]::Round((Get-Item $OutFile).Length / 1MB, 2)
        Write-Host "[OK] Downloaded $Label ($sizeMB MB)" -ForegroundColor Green
        return $true
    }

    if (Test-Path $tmpFile) { Remove-Item $tmpFile -Force }
    Write-Host "[ERROR] Download failed: $Label" -ForegroundColor Red
    return $false
}

# ============================================================
# 步骤 1：下载中国 PBF 数据
# ============================================================
$ChinaPbfFile = Join-Path $DataDir "china-latest.osm.pbf"

if (-not $SkipDownload) {
    Write-Host "`n========== Step 1: Download China OSM PBF ==========" -ForegroundColor Cyan

    $ChinaPbfMirrors = @(
        "https://download.geofabrik.de/asia/china-latest.osm.pbf",
        "https://download.geofabrik.de/asia/china-190101.osm.pbf"
    )

    $downloaded = $false
    if (-not (Test-Path $ChinaPbfFile)) {
        foreach ($url in $ChinaPbfMirrors) {
            $downloaded = Download-File -Url $url -OutFile $ChinaPbfFile -Label "China PBF"
            if ($downloaded) { break }
        }
    } else {
        $sizeMB = [math]::Round((Get-Item $ChinaPbfFile).Length / 1MB, 2)
        Write-Host "[SKIP] China PBF already exists ($sizeMB MB)" -ForegroundColor DarkGray
        $downloaded = $true
    }

    if (-not $downloaded) {
        Write-Host "[ERROR] All download mirrors failed." -ForegroundColor Red
        Write-Host "[HINT] 手动下载 china-latest.osm.pbf 到 $ChinaPbfFile 后加 -SkipDownload 重试" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "[INFO] Skipping download, using existing China PBF" -ForegroundColor Yellow
}

if (-not (Test-Path $ChinaPbfFile)) {
    Write-Host "[ERROR] PBF file not found: $ChinaPbfFile (Run without -SkipDownload first.)" -ForegroundColor Red
    exit 1
}

# ============================================================
# 步骤 2 & 3：osmium 裁剪 + tilemaker 生成（按城市循环）
# ============================================================
# 原生转换 Windows 路径 -> WSL 路径（避免 wslpath 经 bash 时反斜杠被转义吃掉的坑）
$drive = $ScriptDir.Substring(0,1).ToLower()
$pathRest = ($ScriptDir.Substring(2) -replace '\\','/')
$WslScriptDir = "/mnt/$drive$pathRest"
$WslChinaPbf = "$WslScriptDir/data/china-latest.osm.pbf"
$WslConfig = "$WslScriptDir/tilemaker-config.json"
$WslProcess = "$WslScriptDir/process.lua"

foreach ($city in $Selected) {
    $key = $city.key
    $cityPbf = Join-Path $DataDir "$key-osmium.osm.pbf"
    $cityMbtiles = Join-Path $DataDir "$key.mbtiles"
    # osmium --bbox 格式：minlon,minlat,maxlon,maxlat = west,south,east,north
    $bbox = "$($city.bbox.west),$($city.bbox.south),$($city.bbox.east),$($city.bbox.north)"
    $wslCityPbf = "$WslScriptDir/data/$key-osmium.osm.pbf"
    $wslCityMbtiles = "$WslScriptDir/data/$key.mbtiles"
    $wslCityStore = "$WslScriptDir/data/$key.store"

    Write-Host "`n========== City: $($city.name) ($key) bbox=$bbox ==========" -ForegroundColor Cyan

    # --- Step 2: osmium 裁剪 ---
    if (Test-Path $cityPbf) {
        $sizeMB = [math]::Round((Get-Item $cityPbf).Length / 1MB, 2)
        Write-Host "[SKIP] $key-osmium.osm.pbf already exists ($sizeMB MB)" -ForegroundColor DarkGray
    } else {
        Write-Host "[INFO] osmium extract ($($city.name))..."
        $osmiumCmd = "osmium extract --bbox $bbox --strategy smart `"$WslChinaPbf`" -o `"$wslCityPbf`""
        Write-Host "[INFO] WSL> $osmiumCmd"
        $prevEAP = $ErrorActionPreference; $ErrorActionPreference = "Continue"
        & wsl.exe bash -lc $osmiumCmd 2>&1 | Out-Host
        $ex = $LASTEXITCODE; $ErrorActionPreference = $prevEAP
        if ($ex -ne 0 -or -not (Test-Path $cityPbf)) {
            Write-Host "[ERROR] osmium extract failed for $key" -ForegroundColor Red
            exit 1
        }
        $sizeMB = [math]::Round((Get-Item $cityPbf).Length / 1MB, 2)
        Write-Host "[OK] $key-osmium.osm.pbf extracted ($sizeMB MB)" -ForegroundColor Green
    }

    # --- Step 3: tilemaker 生成 mbtiles ---
    if (Test-Path $cityMbtiles) {
        $sizeMB = [math]::Round((Get-Item $cityMbtiles).Length / 1MB, 2)
        Write-Host "[SKIP] $key.mbtiles already exists ($sizeMB MB)" -ForegroundColor DarkGray
    } else {
        $tmArgs = @(
            "--input `"$wslCityPbf`"",
            "--output `"$wslCityMbtiles`"",
            "--store `"$wslCityStore`"",
            "--process `"$WslProcess`"",
            "--config `"$WslConfig`""
        )
        $tilemakerCmd = "tilemaker $($tmArgs -join ' ')"
        Write-Host "[INFO] WSL> $tilemakerCmd"
        Write-Host "[INFO] tilemaker 生成 $key 瓦片（可能需 5-15 分钟）..."
        $prevEAP = $ErrorActionPreference; $ErrorActionPreference = "Continue"
        & wsl.exe bash -lc $tilemakerCmd 2>&1 | Out-Host
        $ex = $LASTEXITCODE; $ErrorActionPreference = $prevEAP
        if ($ex -ne 0 -or -not (Test-Path $cityMbtiles)) {
            Write-Host "[ERROR] tilemaker failed for $key" -ForegroundColor Red
            exit 1
        }
        $sizeMB = [math]::Round((Get-Item $cityMbtiles).Length / 1MB, 2)
        Write-Host "[OK] $key.mbtiles generated ($sizeMB MB)" -ForegroundColor Green
    }

    # 清理 tilemaker 临时 store
    if (Test-Path $wslCityStore) {
        $prevEAP = $ErrorActionPreference; $ErrorActionPreference = "Continue"
        & wsl.exe bash -lc "rm -rf `"$wslCityStore`"" 2>&1 | Out-Null
        $ErrorActionPreference = $prevEAP
    }
}

# ============================================================
# 步骤 4：更新 config.json（合并 data 段）+ dark 样式源指向 Primary
# ============================================================
Write-Host "`n========== Step 4: Update config.json + dark style ==========" -ForegroundColor Cyan

# 4.1 所选城市并集 bbox
$minLon = 180.0; $minLat = 90.0; $maxLon = -180.0; $maxLat = -90.0
foreach ($c in $Selected) {
    if ($c.bbox.west  -lt $minLon) { $minLon = $c.bbox.west }
    if ($c.bbox.south -lt $minLat) { $minLat = $c.bbox.south }
    if ($c.bbox.east  -gt $maxLon) { $maxLon = $c.bbox.east }
    if ($c.bbox.north -gt $maxLat) { $maxLat = $c.bbox.north }
}
$boundsStr = "$minLon, $minLat, $maxLon, $maxLat"

# 4.2 合并 config.json：保留已有 data 条目 + 新增所选城市；更新 styles bounds
$cfgPath = Join-Path $ScriptDir "config.json"
$cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json

$dataHash = @{}
if ($cfg.data) {
    foreach ($p in $cfg.data.PSObject.Properties) {
        $dataHash[$p.Name] = @{ mbtiles = $p.Value.mbtiles }
    }
}
foreach ($c in $Selected) {
    $dataHash[$c.key] = @{ mbtiles = "$($c.key).mbtiles" }
}

$stylesHash = @{}
if ($cfg.styles) {
    foreach ($p in $cfg.styles.PSObject.Properties) {
        $tjType = if ($p.Value.tilejson -and $p.Value.tilejson.type) { $p.Value.tilejson.type } else { "overlay" }
        $stylesHash[$p.Name] = @{
            style = $p.Value.style
            tilejson = @{ type = $tjType; bounds = @($minLon, $minLat, $maxLon, $maxLat) }
        }
    }
}

$newCfg = @{ options = $cfg.options; styles = $stylesHash; data = $dataHash }
$json = $newCfg | ConvertTo-Json -Depth 10
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($cfgPath, $json, $utf8)
Write-Host "[OK] config.json 更新：data 段含 $($dataHash.Keys.Count) 个源 [$($dataHash.Keys -join ', ')]；bounds=[$boundsStr]" -ForegroundColor Green

# 4.3 dark 样式源指向 Primary（仅替换 mbtiles url 与 source maxzoom，保留 source 标签与图层引用）
$darkStyle = Join-Path $ScriptDir "styles\dark\style.json"
if (Test-Path $darkStyle) {
    $raw = Get-Content $darkStyle -Raw -Encoding UTF8
    $newUrl = "mbtiles://$Primary.mbtiles"
    # url：唯一一处 mbtiles url
    $raw = [regex]::Replace($raw, '"url"\s*:\s*"mbtiles://[^"]+\.mbtiles"', "`"url`": `"$newUrl`"")
    # maxzoom：仅替换首个匹配（source 块在 layers 之前，首个即 source 的 maxzoom）
    $mz = [regex]::Match($raw, '"maxzoom"\s*:\s*\d+')
    if ($mz.Success) {
        $raw = $raw.Substring(0, $mz.Index) + "`"maxzoom`": $MaxZoom" + $raw.Substring($mz.Index + $mz.Length)
    }
    [System.IO.File]::WriteAllText($darkStyle, $raw, $utf8)
    Write-Host "[OK] styles/dark/style.json 矢量源 url → $newUrl；source maxzoom → $MaxZoom" -ForegroundColor Green
} else {
    Write-Host "[WARN] styles/dark/style.json 不存在，跳过样式更新" -ForegroundColor Yellow
}

Write-Host "`n========== DONE ==========" -ForegroundColor Green
Write-Host "[NEXT] 启动/重启 tileserver：  docker compose restart   （或 docker compose up -d）"
Write-Host "[NEXT] 校验已注册数据源：      curl http://localhost:8081/data.json"
Write-Host "[NEXT] 前端下载页：会在下拉框显示上述已准备的城市，灰显未准备的城市。"
Write-Host "[NOTE] dark 样式当前渲染主视图城市 = $Primary；下载其他已准备城市的瓦片仍会缓存，"
Write-Host "       但要离线查看其他城市需重运行本脚本并指定新的 -Primary。"
