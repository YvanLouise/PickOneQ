@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

if not exist "node_modules\vite\bin\vite.js" (
  echo [拾一问] 首次运行，正在安装打包工具依赖...
  call npm.cmd install
  if errorlevel 1 (
    echo [拾一问] 依赖安装失败。
    pause
    exit /b 1
  )
)

call npm.cmd run open
if errorlevel 1 pause
