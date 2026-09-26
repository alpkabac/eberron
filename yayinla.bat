@echo off
chcp 65001 >nul
echo Eberron notlari yayinlaniyor...
cd /d "%~dp0"
robocopy "C:\Users\Oktay\Documents\Eberron\Eberron" "content" /MIR /XD .obsidian .trash /XF Welcome.md /NFL /NDL /NJH /NJS /NP >nul
move /Y "content\00 Kampanya Ana Sayfa.md" "content\index.md" >nul
git add -A
git commit -q -m "Notlar guncellendi %date% %time%" >nul 2>&1
git push -q -u origin v5
if errorlevel 1 (
  echo.
  echo HATA: GitHub'a yuklenemedi.
  echo - GitHub'da "eberron" deposu olusturuldu mu?
  echo - Internet baglantisi var mi?
) else (
  echo.
  echo Tamam! Site 1-2 dakika icinde guncellenecek:
  echo https://alpkabac.github.io/eberron
)
echo.
pause
