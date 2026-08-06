param([int]$Port = 5173)
$ErrorActionPreference = 'Stop'

Write-Host "Starting Vite dev server in background..."
$vite = Start-Process -FilePath npm -ArgumentList 'run','dev' `
    -WorkingDirectory $PSScriptRoot\.. -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput vite-verify.log -RedirectStandardError vite-verify-err.log

try {
    # Wait for Vite to be ready (poll up to ~30s)
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        try {
            $r = Invoke-WebRequest -UseBasicParsing "http://localhost:$Port/" -TimeoutSec 2
            if ($r.StatusCode -eq 200) { $ready = $true; break }
        } catch { <# not ready yet #> }
    }
    if (-not $ready) { Write-Host "Vite did not become ready in 30s"; exit 2 }
    Write-Host "Vite ready. Testing proxy endpoints..."

    # 1) Style JSON via proxy
    try {
        $s = Invoke-WebRequest -UseBasicParsing "http://localhost:$Port/tiles/styles/dark/style.json" -TimeoutSec 5
        Write-Host ("PROXY style.json -> HTTP {0}" -f $s.StatusCode)
    } catch {
        Write-Host ("PROXY style.json FAILED: {0}" -f $_.Exception.Message)
    }

    # 2) Health via proxy
    try {
        $h = Invoke-WebRequest -UseBasicParsing "http://localhost:$Port/tiles/health" -TimeoutSec 5
        Write-Host ("PROXY health     -> HTTP {0}" -f $h.StatusCode)
    } catch {
        Write-Host ("PROXY health     FAILED: {0}" -f $_.Exception.Message)
    }
}
finally {
    Write-Host "Stopping Vite (pid $($vite.Id))..."
    if ($vite -and -not $vite.HasExited) {
        Stop-Process -Id $vite.Id -Force -ErrorAction SilentlyContinue
    }
}
