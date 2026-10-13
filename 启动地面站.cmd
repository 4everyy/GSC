@echo off
REM ==================================================
REM  GSC Ground Control Station - desktop launcher
REM  NOTE: keep this file pure ASCII. Batch files with
REM  UTF-8/GBK Chinese text break cmd.exe parsing when
REM  the console codepage differs (fragments of echo
REM  lines get executed as commands, see launcher bug).
REM
REM  Flow (production mode - page shows in seconds):
REM   1. first-run npm install when deps are missing
REM   2. npm run build ONLY when dist is missing or
REM      older than sources (src/public/vendor/config)
REM   3. Electron launched DETACHED serving the built
REM      dist via "vite preview" (GSC_SERVE=preview)
REM   4. THIS console STAYS VISIBLE (silent, no progress
REM      spam - periodic echo + QuickEdit selection used
REM      to freeze the wait loop) and CLOSES ITSELF the
REM      moment the page is shown: it polls
REM      desktop\.launcher-ready written by Electron.
REM        OK        -> console closes right away
REM        ERROR:... -> reason printed + pause
REM      electron exit / timeout -> last launcher.log
REM      lines printed + pause
REM  Logs: desktop\launcher.log
REM ==================================================
setlocal
cd /d "%~dp0"
REM prevent inherited ELECTRON_RUN_AS_NODE from turning
REM the Electron binary into a plain Node runtime
set ELECTRON_RUN_AS_NODE=
title GSC Launcher

set "ELECTRON_EXE=%~dp0node_modules\electron\dist\electron.exe"
set "APP_ROOT=%~dp0"
set "READY_MARKER=%~dp0desktop\.launcher-ready"
set "PID_FILE=%TEMP%\gsc_launcher.pid"
set "FRESH_FILE=%TEMP%\gsc_dist_fresh.txt"
set /a WAITED=0
set "WAIT_LIMIT=150"

if not exist "node_modules\vite\bin\vite.js" (
  echo [GSC] First run: installing dependencies, npm install ...
  call npm install
  if errorlevel 1 (
    echo [GSC] npm install failed. Check network and retry.
    pause
    exit /b 1
  )
)

if not exist "%ELECTRON_EXE%" (
  echo [GSC] First run: Electron missing, running npm install ...
  call npm install
  if errorlevel 1 (
    echo [GSC] npm install failed. Check network and retry.
    pause
    exit /b 1
  )
)

REM ---- rebuild only when dist is missing or older than sources ----
REM Newest timestamp of src/public/vendor + root configs is compared with
REM dist\index.html (UTC on both sides). desktop\*.cjs is NOT watched:
REM the Electron main process loads it straight from source, no build step.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$o='dist\index.html'; if (-not (Test-Path -LiteralPath $o)) { 'stale' } else { $built=(Get-Item -LiteralPath $o).LastWriteTimeUtc; $srcs=@(Get-ChildItem 'src','public','vendor' -Recurse -File -ErrorAction SilentlyContinue)+@(Get-Item 'index.html','vite.config.ts','.env.local','.env' -ErrorAction SilentlyContinue); $newest=$srcs | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1 -ExpandProperty LastWriteTimeUtc; if ($null -ne $newest -and $newest -gt $built) { 'stale' } else { 'fresh' } }" > "%FRESH_FILE%"
set /p FRESH=<"%FRESH_FILE%"
del /q "%FRESH_FILE%" 2>nul
if "%FRESH%"=="stale" (
  echo [GSC] Sources changed since last build. Building production bundle ...
  call npm run build
  if errorlevel 1 (
    echo [GSC] Build FAILED. See errors above, fix and double-click again.
    pause
    exit /b 1
  )
)

if exist "%READY_MARKER%" del /q "%READY_MARKER%"

echo [GSC] Starting ground station (production build, vite preview) ...
REM Dedicated operator port (5178): never collides with a developer's
REM "npm run dev" on 5173, so the shell never silently reuses a foreign
REM dev server (stale code + its console window looks like a stuck launcher).
set "GSC_PORT=5178"
set "GSC_SERVE=preview"
REM Launch Electron detached (-WindowStyle Hidden keeps its console off),
REM -PassThru stores the PID so the wait loop can detect early crashes.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$q=[char]34; $p=Start-Process -FilePath $env:ELECTRON_EXE -ArgumentList ($q + $env:APP_ROOT + '.' + $q) -WorkingDirectory $env:APP_ROOT -WindowStyle Hidden -PassThru; Set-Content -LiteralPath $env:PID_FILE -Value $p.Id"
set /p EPID=<"%PID_FILE%"
del /q "%PID_FILE%" 2>nul

REM This console stays VISIBLE during the wait but writes NOTHING:
REM the old QuickEdit freeze was caused by periodic echo lines being
REM blocked by a text selection, stalling the loop. Silence = immune.
:wait_loop
if exist "%READY_MARKER%" goto ready_check
REM Electron died before writing the marker -> surface the logs
tasklist /FI "PID eq %EPID%" 2>nul | find /I "electron.exe" >nul
if errorlevel 1 goto died
set /a WAITED+=1
if %WAITED% geq %WAIT_LIMIT% goto wait_timeout
ping -n 2 127.0.0.1 >nul
goto wait_loop

:ready_check
set /p READYLINE=<"%READY_MARKER%"
del /q "%READY_MARKER%" 2>nul
if /I "%READYLINE%"=="OK" (
  REM Page is up: close this console right now (exit destroys the window
  REM whether it was visible or not). No delay here - direct close.
  endlocal
  exit /b 0
)
echo [GSC] Startup FAILED: %READYLINE%
goto fail_tail

:died
echo [GSC] Electron exited before the page was shown. Last log lines:
goto fail_tail

:wait_timeout
echo [GSC] Timeout (%WAIT_LIMIT%s) waiting for the page. Last log lines:
goto fail_tail

:fail_tail
if exist "%READY_MARKER%" del /q "%READY_MARKER%" 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -LiteralPath (Join-Path $env:APP_ROOT 'desktop\launcher.log') -Tail 15"
echo.
echo [GSC] Full log: desktop\launcher.log
pause
exit /b 1
