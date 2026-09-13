@echo off
setlocal EnableExtensions
pushd "%~dp0" || exit /b 1

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [PickOneQ] npm.cmd was not found. Install Node.js 22 or later.
  pause
  popd
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo [PickOneQ] Installing Android release tool dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo [PickOneQ] Dependency installation failed.
    pause
    popd
    exit /b 1
  )
)

call npm.cmd run open -- %*
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" pause
popd
exit /b %RESULT%
