@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [PickOneQ] npm.cmd was not found. Install Node.js 22 or later.
  pause
  exit /b 1
)

echo [PickOneQ] Building web assets...
call npm.cmd run build
if errorlevel 1 (
  echo [PickOneQ] Web build failed.
  pause
  exit /b 1
)

echo [PickOneQ] Building standalone Android APK...
call npm.cmd run android:apk
if errorlevel 1 (
  echo [PickOneQ] Android build failed. Review the error above.
  pause
  exit /b 1
)

echo.
echo [PickOneQ] APK: "%~dp0releases\pickoneq-local-debug.apk"
pause
exit /b 0