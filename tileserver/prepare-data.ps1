<#
.SYNOPSIS
  苏州区域 OSM 矢量瓦片数据准备脚本（生成 suzhou.mbtiles）。

.DESCRIPTION
  本脚本完成以下流程：
    1. 下载（或复用）中国区域 OpenStreetMap PBF 数据；
    2. 在 WSL 中使用 osmium-tool 按多边形裁剪苏州区域，保持引用完整性；
    3. 在 WSL 中使用 tilemaker（OpenMapTiles schema）生成矢量瓦片 mbtiles；
    4. 输出到 tileserver/data/suzhou.mbtiles。

  为什么使用 WSL：
    - Windows 原生 tilemaker.exe（v3.0.0）在处理 china-latest.osm.pbf 时会崩溃；
    - WSL Ubuntu 中的 tilemaker 3.1.0 + osmium-tool 运行稳定；
    - osmium extract --strategy smart 能保持跨引用对象（如道路关系）的完整性。

  前置依赖：
    - Windows：WSL2 + Ubuntu（建议 20.04/22.04），已安装 curl/PowerShell；
    - WSL 内：tilemaker、osmium-tool（可通过 apt 或源码安装，见离线部署指南）；
    - 网络：首次下载 PBF 数据需要联网（约 1.5 GB），后续离线可复用。

.NOTES
  执行策略：在 PowerShell 中运行
    cd tileserver
    .\prepare-data.ps1

  常用参数：
    .\prepare-data.ps1 -SkipDownload        # 已有 china PBF 时跳过下载
    .\prepare-data.ps1 -MaxZoom 14          # 设置最大缩放级别（默认 14）

  WSL 依赖安装（一次性）：
    # 在 WSL Ubuntu 中执行：
    sudo apt update
    sudo apt install -y osmium-tool liblua5.3-dev zlib1g-dev libsqlite3-dev \
                       shapelib libshp-dev libboost-all-dev
    # tilemaker 需源码编译（apt 版本过旧）：
    git clone https://github.com/systemed/tilemaker.git ~/tilemaker
    cd ~/tilemaker && make && sudo make install
#>

param(
    # 输出的 mbtiles 文件名，默认 suzhou.mbtiles
    [string]$OutputName = "suzhou.mbtiles",

    # 最大缩放级别（影响文件大小与处理时间，14 约为城市级细节，推荐）
    [int]$MaxZoom = 14,

    # 是否跳过下载步骤（已有 PBF 文件时设为 $true）
    [switch]$SkipDownload,

    # 是否跳过裁剪步骤（已有 suzhou-osmium.osm.pbf 时设为 $true）
    [switch]$SkipExtract,

    # 是否在 WSL 中安装缺失依赖（默认仅检测并提示）
    [switch]$InstallDeps
)

$ErrorActionPreference = "Stop"

# ---- 路径常量 ----
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataDir = Join-Path $ScriptDir "data"
$OutputPath = Join-Path $DataDir $OutputName

# 苏州区域边界框：[minlon, minlat, maxlon, maxlat]
$SuzhouBbox = "119.95,30.75,121.20,31.86"

# tilemaker 配置（OpenMapTiles 标准 schema）
$TilemakerConfig = Join-Path $ScriptDir "tilemaker-config.json"
$TilemakerProcess = Join-Path $ScriptDir "process.lua"

# ---- 创建数据目录 ----
if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
    Write-Host "[INFO] Created data directory: $DataDir" -ForegroundColor Green
}

# ============================================================
# 前置检查：WSL 与依赖工具
# ============================================================
function Test-WSL {
    try {
        $null = & wsl.exe --status 2>&1
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Test-WSLTool {
    param([string]$Tool)
    $result = & wsl.exe bash -lc "command -v $Tool 2>/dev/null" 2>&1
    return [string]$result -ne ""
}

Write-Host "`n========== Pre-check: WSL and tools ==========" -ForegroundColor Cyan

if (-not (Test-WSL)) {
    Write-Host "[ERROR] WSL is not installed or not running." -ForegroundColor Red
    Write-Host "        Install WSL2 + Ubuntu first:" -ForegroundColor Yellow
    Write-Host "        wsl --install -d Ubuntu" -ForegroundColor Yellow
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
        & wsl.exe bash -lc "sudo apt update && sudo apt install -y osmium-tool" 2>&1 | Out-Host
        if ($missing -contains "tilemaker") {
            Write-Host "[INFO] tilemaker needs source build in WSL. See docs/离线部署指南.md" -ForegroundColor Yellow
            Write-Host "       Quick path (if apt version suffices, may be older):" -ForegroundColor DarkYellow
            Write-Host "         sudo apt install -y tilemaker" -ForegroundColor DarkYellow
        }
    } else {
        Write-Host "[ERROR] Missing tools in WSL: $($missing -join ', ')" -ForegroundColor Red
        Write-Host "[HINT] Re-run with -InstallDeps, or install manually:" -ForegroundColor Yellow
        Write-Host "       sudo apt install -y osmium-tool tilemaker" -ForegroundColor Yellow
        Write-Host "       (tilemaker apt 版本可能较旧，推荐源码编译，见离线部署指南)" -ForegroundColor Yellow
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
        Write-Host "[HINT] Manually download china-latest.osm.pbf to:" -ForegroundColor Yellow
        Write-Host "       $ChinaPbfFile" -ForegroundColor Yellow
        Write-Host "       Then re-run with -SkipDownload" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "[INFO] Skipping download, using existing China PBF" -ForegroundColor Yellow
}

if (-not (Test-Path $ChinaPbfFile)) {
    Write-Host "[ERROR] PBF file not found: $ChinaPbfFile" -ForegroundColor Red
    Write-Host "        Run without -SkipDownload first."
    exit 1
}

# ============================================================
# 步骤 2：osmium 裁剪苏州区域（保持引用完整性）
# ============================================================
$SuzhouPbfFile = Join-Path $DataDir "suzhou-osmium.osm.pbf"

if (-not $SkipExtract) {
    Write-Host "`n========== Step 2: Extract Suzhou with osmium ==========" -ForegroundColor Cyan

    if (Test-Path $SuzhouPbfFile) {
        $sizeMB = [math]::Round((Get-Item $SuzhouPbfFile).Length / 1MB, 2)
        Write-Host "[SKIP] Suzhou PBF already exists ($sizeMB MB)" -ForegroundColor DarkGray
    } else {
        Write-Host "[INFO] Running osmium extract (bbox=$SuzhouBbox, strategy=smart)..."
        Write-Host "       This keeps referential integrity (e.g. road relations)..."

        # 将 Windows 路径转换为 WSL 路径
        $WslScriptDir = & wsl.exe wslpath -u $ScriptDir 2>&1
        $WslChinaPbf = "$WslScriptDir/data/china-latest.osm.pbf"
        $WslSuzhouPbf = "$WslScriptDir/data/suzhou-osmium.osm.pbf"

        $osmiumCmd = "osmium extract --bbox $SuzhouBbox --strategy smart `"$WslChinaPbf`" -o `"$WslSuzhouPbf`""
        Write-Host "[INFO] WSL> $osmiumCmd"

        $prevEAP = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        & wsl.exe bash -lc $osmiumCmd 2>&1 | Out-Host
        $osmiumExit = $LASTEXITCODE
        $ErrorActionPreference = $prevEAP

        if ($osmiumExit -ne 0 -or -not (Test-Path $SuzhouPbfFile)) {
            Write-Host "[ERROR] osmium extract failed." -ForegroundColor Red
            exit 1
        }

        $sizeMB = [math]::Round((Get-Item $SuzhouPbfFile).Length / 1MB, 2)
        Write-Host "[OK] Suzhou PBF extracted: $SuzhouPbfFile ($sizeMB MB)" -ForegroundColor Green
    }
} else {
    Write-Host "[INFO] Skipping extract, using existing Suzhou PBF" -ForegroundColor Yellow
}

if (-not (Test-Path $SuzhouPbfFile)) {
    Write-Host "[ERROR] Suzhou PBF not found: $SuzhouPbfFile" -ForegroundColor Red
    Write-Host "        Run without -SkipExtract first."
    exit 1
}

# ============================================================
# 步骤 3：tilemaker 生成 mbtiles
# ============================================================
Write-Host "`n========== Step 3: Generate Vector Tiles (mbtiles) ==========" -ForegroundColor Cyan

# 将 Windows 路径转换为 WSL 路径
$WslScriptDir = & wsl.exe wslpath -u $ScriptDir 2>&1
$WslSuzhouPbf = "$WslScriptDir/data/suzhou-osmium.osm.pbf"
$WslOutput = "$WslScriptDir/data/$OutputName"
$WslConfig = "$WslScriptDir/tilemaker-config.json"
$WslProcess = "$WslScriptDir/process.lua"

$tilemakerArgs = @(
    "--input `"$WslSuzhouPbf`"",
    "--output `"$WslOutput`"",
    "--process `"$WslProcess`"",
    "--config `"$WslConfig`"",
    "--verbose"
)
$tilemakerCmd = "tilemaker $($tilemakerArgs -join ' ')"
Write-Host "[INFO] WSL> $tilemakerCmd"
Write-Host "[INFO] This may take 5-15 minutes (Suzhou region only)..."

$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& wsl.exe bash -lc $tilemakerCmd 2>&1 | Out-Host
$tilemakerExit = $LASTEXITCODE
$ErrorActionPreference = $prevEAP

if ($tilemakerExit -ne 0) {
    Write-Host "[ERROR] tilemaker failed. Check WSL dependencies and config." -ForegroundColor Red
    exit 1
}

# 验证输出文件
if (Test-Path $OutputPath) {
    $sizeMB = [math]::Round((Get-Item $OutputPath).Length / 1MB, 2)
    Write-Host "[OK] Vector tiles generated: $OutputPath ($sizeMB MB)" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Output file not found: $OutputPath" -ForegroundColor Red
    exit 1
}

Write-Host "`n========== DONE ==========" -ForegroundColor Green
Write-Host "[NEXT] Start tileserver:  docker compose up -d"
Write-Host "[NEXT] Verify server:     curl http://localhost:8081/data/suzhou.json"
Write-Host "[NEXT] View map style:   http://localhost:8081/styles/dark/"