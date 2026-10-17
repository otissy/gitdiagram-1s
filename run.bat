@echo off
title Vision IDE
echo ========================================================
echo   Vision IDE - The Visual-First Desktop Code Editor
echo ========================================================
echo.

node -v >nul 2>&1
if %errorlevel% neq 0 (
  echo Error: Node.js is not installed or not in PATH.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
)

echo Launching Vision IDE...
call npm start
