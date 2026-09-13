@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0tools\android-release"
call open-release.cmd
