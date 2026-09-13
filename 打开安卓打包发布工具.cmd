@echo off
setlocal EnableExtensions
set "TOOL_DIR=%~dp0tools\android-release"

if not exist "%TOOL_DIR%\package.json" (
  echo [PickOneQ] Android release tool directory was not found.
  echo [PickOneQ] Expected: "%TOOL_DIR%"
  pause
  exit /b 1
)

pushd "%TOOL_DIR%" || exit /b 1
call "%TOOL_DIR%\open-release.cmd" %*
set "RESULT=%ERRORLEVEL%"
popd
exit /b %RESULT%
