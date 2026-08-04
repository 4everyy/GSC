<#
.SYNOPSIS
  字体切片准备脚本（生成 MapLibre 可用的 pbf 字体包）。

.DESCRIPTION
  MapLibre 矢量瓦片渲染文字标注需要 pbf 格式的字体切片（glyphs）。

  本脚本下载 openmaptiles/fonts 预编译的 pbf 字体包（已是 MapLibre 最终格式），
  无需 Docker 转换。

  字体覆盖范围（如实说明）：
    - ✅ 拉丁字母、数字、常见符号（Noto Sans）
    - ⚠️  中文（CJK）不在 openmaptiles/fonts v2.0 发布中，需另行获取（见下方说明）

  中文 CJK 字体补充方案（如需渲染中文地名标注）：
    openmaptiles/fonts 官方 release 仅含拉丁字体。要支持中文，可选：
      方案 A（推荐）：使用 versatiles-fonts 等社区预编译 CJK pbf 包，
                      参考最新离线部署指南或 https://github.com/versatiles-org/versatiles-fonts
      方案 B：本地用 font-maker / node-fontnik 从 Noto Sans CJK SC 的 .ttf 生成 pbf，
              工具：npm i -g fontnik
              命令示例：fontnik-range --font NotoSansSC-Regular.otf --min 0 --max 65535
      将生成的目录（如 "Noto Sans SC Regular"）放入 tileserver/fonts/ 即可。

  前置依赖：
    - 网络连接（首次下载字体包需要联网）
    - PowerShell 内置 Expand-Archive（无需 tar）

.NOTES
  执行：cd tileserver; .\prepare-fonts.ps1
#>

param(
    # 是否跳过下载步骤
    [switch]$SkipDownload
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$FontsDir = Join-Path $ScriptDir "fonts"
$FontSrcDir = Join-Path $ScriptDir "font-src"

# ---- 创建目录 ----
foreach ($d in @($FontsDir, $FontSrcDir)) {
    if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
    }
}

# ============================================================
# 通用下载函数：支持重定向、多镜像回退
# ============================================================
function Download-File {
    param([string]$Url, [string]$OutFile, [string]$Label)

    if (Test-Path $OutFile) {
        $sizeMB = [math]::Round((Get-Item $OutFile).Length / 1MB, 2)
        Write-Host "[SKIP] $Label already exists ($sizeMB MB)" -ForegroundColor DarkGray
        return
    }

    Write-Host "[INFO] Downloading $Label ..." -ForegroundColor Cyan
    Write-Host "       URL: $Url"

    # 镜像列表：GitHub 直链 → jsDelivr CDN → ghproxy 加速
    $Urls = @($Url)
    $JsDelivr = $Url -replace '^https://github\.com/([^/]+)/([^/]+)/releases/download/(.+)$', 'https://cdn.jsdelivr.net/gh/$1/$2@$3'
    if ($JsDelivr -ne $Url) { $Urls += $JsDelivr }
    $GhProxy = "https://ghp.ci/?url=" + $Url
    $Urls += $GhProxy

    # 临时降低错误偏好，因为 curl 进度信息写入 stderr 会触发 Stop
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $downloaded = $false
    foreach ($u in $Urls) {
        try {
            # 使用 curl.exe 下载（比 Invoke-WebRequest 更快、更可靠）
            $tmpFile = "$OutFile.tmp"
            & curl.exe -L --fail --connect-timeout 15 --max-time 300 -o "$tmpFile" "$u" 2>&1 | Out-Null
            $curlExit = $LASTEXITCODE
            if ($curlExit -eq 0 -and (Test-Path $tmpFile)) {
                Move-Item -Path $tmpFile -Destination $OutFile -Force
                $downloaded = $true
                $sizeMB = [math]::Round((Get-Item $OutFile).Length / 1MB, 2)
                Write-Host "[OK] Downloaded $Label ($sizeMB MB)" -ForegroundColor Green
                break
            }
        } catch {
            Write-Host "[WARN] Failed: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    $ErrorActionPreference = $prevEAP

    if (-not $downloaded) {
        Write-Host "[ERROR] All download mirrors failed for $Label" -ForegroundColor Red
        return $false
    }
    return $true
}

# ============================================================
# 步骤 1：下载预编译 pbf 字体包
# ============================================================
if (-not $SkipDownload) {
    Write-Host "`n========== Download Pre-compiled PBF Fonts ==========" -ForegroundColor Cyan

    # openmaptiles/fonts release v2.0 提供预编译的 pbf 包（.zip）
    # Noto Sans 包含拉丁字母、数字、常见符号
    $NotoSansZipUrl = "https://github.com/openmaptiles/fonts/releases/download/v2.0/noto-sans.zip"
    $NotoSansZipFile = Join-Path $FontSrcDir "noto-sans.zip"

    # Noto Sans + Open Sans 合集（额外样式）
    $NotoOpenSansZipUrl = "https://github.com/openmaptiles/fonts/releases/download/v2.0/noto-open-sans.zip"
    $NotoOpenSansZipFile = Join-Path $FontSrcDir "noto-open-sans.zip"

    $r1 = Download-File -Url $NotoSansZipUrl -OutFile $NotoSansZipFile -Label "Noto Sans (pbf)"
    $r2 = Download-File -Url $NotoOpenSansZipUrl -OutFile $NotoOpenSansZipFile -Label "Noto + Open Sans (pbf)"

    if ($r1 -eq $false -and $r2 -eq $false) {
        Write-Host "`n[FALLBACK] Trying alternative source: fontsource Noto Sans SC..." -ForegroundColor Yellow
        # 备选方案：使用 fontsource 的字体（需要 font-maker 转换）
        # 这里暂时继续，后续步骤会检查是否有可用文件
    }
} else {
    Write-Host "[INFO] Skipping font download." -ForegroundColor Yellow
}

# ============================================================
# 步骤 2：解压 pbf 字体包到 fonts/ 目录
# ============================================================
Write-Host "`n========== Extract PBF Fonts ==========" -ForegroundColor Cyan

# 解压所有 .zip 文件（PowerShell 内置 Expand-Archive，无需 tar）
$zipFiles = Get-ChildItem -Path $FontSrcDir -Filter "*.zip" -ErrorAction SilentlyContinue

if ($zipFiles.Count -eq 0) {
    Write-Host "[ERROR] No .zip font packages found in $FontSrcDir" -ForegroundColor Red
    Write-Host "        Run without -SkipDownload, or manually place .zip files there." -ForegroundColor Yellow
    exit 1
}

foreach ($zip in $zipFiles) {
    Write-Host "[INFO] Extracting: $($zip.Name)"
    # Expand-Archive 自动覆盖，解压到 fonts/ 目录
    try {
        Expand-Archive -Path $zip.FullName -DestinationPath $FontsDir -Force
        Write-Host "[OK] Extracted $($zip.Name)" -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Failed to extract $($zip.Name): $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# ============================================================
# 步骤 3：验证字体目录结构
# ============================================================
Write-Host "`n========== Verify Font Directories ==========" -ForegroundColor Cyan

# fonts/ 下每个子目录是一个 fontstack（如 "Noto Sans Regular"）
# 每个子目录内应包含 256-65535 范围的 .pbf 文件
$fontStacks = Get-ChildItem -Path $FontsDir -Directory -ErrorAction SilentlyContinue

if ($fontStacks.Count -eq 0) {
    Write-Host "[ERROR] No font stacks found in $FontsDir after extraction" -ForegroundColor Red
    exit 1
}

foreach ($stack in $fontStacks) {
    $pbfCount = (Get-ChildItem -Path $stack.FullName -Filter "*.pbf" -ErrorAction SilentlyContinue).Count
    Write-Host "  - $($stack.Name): $pbfCount pbf ranges"
}

Write-Host "`n========== DONE ==========" -ForegroundColor Green
Write-Host "[OK] Font glyphs ready in: $FontsDir"
Write-Host "[NEXT] Start tileserver:  docker compose up -d"
Write-Host "[INFO] style.json should reference fontstacks listed above"