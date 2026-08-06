$ErrorActionPreference = 'SilentlyContinue'
$base = Join-Path $env:APPDATA 'Code\User\History'
if (-not (Test-Path $base)) { Write-Host 'NO_VSCODE_HISTORY_DIR'; exit 0 }

$target = 'DeviceManagementPanel.css'
# 2026-08-06 09:00:00 (UTC+8) → unix ms
$cutoff = 1785978000000

$best = $null
Get-ChildItem -Path $base -Directory | ForEach-Object {
    $entriesFile = Join-Path $_.FullName 'entries.json'
    if (-not (Test-Path $entriesFile)) { return }
    try { $data = Get-Content $entriesFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return }
    if ($data.resource -notlike "*$target*") { return }

    Write-Host ("DIR {0}" -f $_.Name)
    foreach ($e in $data.entries) {
        $when = if ($e.timestamp) { [DateTimeOffset]::FromUnixTimeMilliseconds([long]$e.timestamp).LocalDateTime } else { '?' }
        Write-Host ("   {0}  {1}  src={2}" -f $when, $e.id, $e.source)
        if ($e.timestamp -and [long]$e.timestamp -lt $cutoff) {
            if (-not $best -or [long]$e.timestamp -gt [long]$best.timestamp) {
                $best = [pscustomobject]@{ timestamp = [long]$e.timestamp; dir = $_.FullName; id = $e.id; resource = $data.resource }
            }
        }
    }
}

Write-Host '----- RESULT -----'
if ($best) {
    $t = [DateTimeOffset]::FromUnixTimeMilliseconds($best.timestamp).LocalDateTime
    $path = Join-Path $best.dir $best.id
    Write-Host ("BEST_BEFORE_0900: {0}" -f $t)
    Write-Host ("PATH: {0}" -f $path)
} else {
    Write-Host 'NO_PRE_0900_VERSION'
}