@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if defined PORT (set "APP_PORT=%PORT%") else (set "APP_PORT=4311")
set "APP_URL=http://127.0.0.1:%APP_PORT%"
title PickOneQ

where node.exe >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install Node.js 22 or newer first.
  echo https://nodejs.org/
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Reinstall Node.js and add npm to PATH.
  pause
  exit /b 1
)

for /f "delims=" %%V in ('node.exe -p "process.versions.node.split('.')[0]"') do set "NODE_MAJOR=%%V"
if %NODE_MAJOR% LSS 22 (
  echo [ERROR] Node.js 22 or newer is required. Current major version: %NODE_MAJOR%
  echo https://nodejs.org/
  pause
  exit /b 1
)

powershell.exe -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri '%APP_URL%/api/bootstrap' -TimeoutSec 2; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>nul
if not errorlevel 1 (
  echo PickOneQ is already running. Opening the browser...
  start "" "%APP_URL%"
  exit /b 0
)

if not exist "node_modules\react\package.json" (
  echo First launch: installing dependencies...
  call npm.cmd install --cache ".local\npm-cache"
  if errorlevel 1 (
    echo [ERROR] Dependency installation failed. Check the network and retry.
    pause
    exit /b 1
  )
)

echo Building PickOneQ...
call npm.cmd run build
if errorlevel 1 (
  echo [ERROR] The build failed. Review the output above.
  pause
  exit /b 1
)

echo.
echo PickOneQ will open at: %APP_URL%
echo Keep this window open while using the app. Closing it stops the server.
echo.

if not defined PICKONEQ_NO_BROWSER start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process '%APP_URL%'"
call npm.cmd start
set "APP_EXIT_CODE=%ERRORLEVEL%"

if not "%APP_EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] PickOneQ stopped unexpectedly. Review the output above.
  pause
)

exit /b %APP_EXIT_CODE%
