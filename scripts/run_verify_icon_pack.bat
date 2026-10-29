@echo off
setlocal
cd /d "%~dp0.."
set LOG=desktop\release\_verify_icon_pack.log
echo === %date% %time% === > "%LOG%"
python scripts\lib\verify_desktop_icon_and_pack.py --pack --no-bump >> "%LOG%" 2>&1
echo exit=%ERRORLEVEL% >> "%LOG%"
