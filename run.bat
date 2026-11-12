@echo off
cd /d "%~dp0"
title Yasser Sebti — Portfolio Dev Server

echo ========================================================
echo   Launching Yasser Sebti Portfolio (Vite + Tailwind v4)
echo ========================================================
echo.

if not exist "node_modules\" (
    echo [INFO] First time run: Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b %errorlevel%
    )
)

echo [INFO] Starting dev server on local + network share and opening your browser...
call npm run dev -- --host --open

pause

