@echo off
chcp 65001 >nul
echo Eberron notlari yayinlaniyor...
cd /d "%~dp0"
node senkron.mjs
if errorlevel 1 goto hata
git pull -q --rebase origin v5
if errorlevel 1 goto hata
robocopy "C:\Users\Oktay\Documents\Eberron\Eberron" "content" /MIR /XD .obsidian .trash /XF Welcome.md /NFL /NDL /NJH /NJS /NP >nul
move /Y "content\00 Kampanya Ana Sayfa.md" "content\index.md" >nul
git add -A
git commit -q -m "Notlar guncellendi %date% %time%" >nul 2>&1
git push -q -u origin v5
if errorlevel 1 goto hata
echo.
echo Tamam! Site 1-2 dakika icinde guncellenecek:
echo https://alpkabac.github.io/eberron
goto son
:hata
echo.
echo HATA: GitHub ile senkron/yukleme basarisiz.
echo - Internet baglantisi var mi?
echo - Hata devam ederse Claude'a bu pencerenin ekran goruntusunu at.
:son
echo.
pause
