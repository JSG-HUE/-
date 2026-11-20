@echo off
setlocal
cd /d "%~dp0"
title China 1927-1949 - Camera Server
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
echo.
echo Server stopped. Press any key to close.
pause >nul
