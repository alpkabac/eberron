@echo off
chcp 65001 >nul
cd /d "%~dp0"
node sifre_kur.mjs
echo.
pause
