@echo off
setlocal
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"
set "SWOOP_VERSION="
for /f "usebackq delims=" %%V in (`powershell -NoLogo -NoProfile -Command "(ConvertFrom-Json -InputObject (Get-Content -LiteralPath 'package.json' -Raw)).version"`) do set "SWOOP_VERSION=%%V"
if defined SWOOP_VERSION (
  if exist "release\installers\%SWOOP_VERSION%\win-unpacked\Swoop-Studio.exe" (
    start "" "release\installers\%SWOOP_VERSION%\win-unpacked\Swoop-Studio.exe"
    exit /b
  )
  if exist "release\v%SWOOP_VERSION%\Swoop-Studio-win32-x64\Swoop-Studio.exe" (
    start "" "release\v%SWOOP_VERSION%\Swoop-Studio-win32-x64\Swoop-Studio.exe"
    exit /b
  )
)
echo No local build of the current Swoop Studio version was found.
echo Download and install the Windows x64 release, then use its Start menu shortcut:
echo https://github.com/psigho/swoop-studio/releases/latest
echo.
echo Developers: run npm ci, npm run build, then npm run desktop.
pause
