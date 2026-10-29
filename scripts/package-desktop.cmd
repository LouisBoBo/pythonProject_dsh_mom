@echo off
setlocal
cd /d "%~dp0.."
where python >nul 2>nul
if %ERRORLEVEL%==0 (
  python "scripts\lib\package_desktop.py" %*
  exit /b %ERRORLEVEL%
)
where py >nul 2>nul
if %ERRORLEVEL%==0 (
  py -3 "scripts\lib\package_desktop.py" %*
  exit /b %ERRORLEVEL%
)
echo [package-desktop] 找不到 Python 3.10+。请安装并勾选 Add python.exe to PATH。
exit /b 1
