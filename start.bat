@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Konic AI

where node >nul 2>nul
if errorlevel 1 (
  echo [خطأ] Node.js مش متسطّب. نزّله من https://nodejs.org ثم شغّل الملف ده تاني.
  pause
  exit /b 1
)

if not exist node_modules (
  echo أول مرة: بنسطّب المكتبات... ممكن ياخد كام دقيقة ^(لازم إنترنت^)
  call npm install
  if errorlevel 1 (
    echo [خطأ] فشل التسطيب. راجع الإنترنت وجرّب تاني.
    pause
    exit /b 1
  )
)

echo بنشغّل Konic AI... هيفتح المتصفح لوحده. متقفلش النافذة دي طول ما بتستخدم الموقع.
start "" /min cmd /c "timeout /t 6 >nul & start http://localhost:5173"
call npm run dev:all
pause
