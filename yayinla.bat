@echo off
chcp 65001 >nul
echo Eberron notlari yayinlaniyor...
cd /d "%~dp0"
robocopy "C:\Users\Oktay\Documents\Eberron\Eberron" "content" /MIR /XD .obsidian .trash /XF Welcome.md /NFL /NDL /NJH /NJS /NP >nul
move /Y "content\00 Kampanya Ana Sayfa.md" "content\index.md" >nul
git add -A
git commit -q -m "Notlar guncellendi %date% %time%"
if errorlevel 1 (
  echo Degisiklik yok, zaten guncel.
) else (
  git push -q
  if errorlevel 1 (
    echo HATA: GitHub'a yuklenemedi. Internet baglantisini kontrol edin.
  ) else (
    echo Tamam! Site 1-2 dakika icinde guncellenecek:
    echo https://alpkabac.github.io/eberron
  )
)
echo.
pause
