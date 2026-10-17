@echo off
title GitDiagram 1s
echo ========================================================
echo   GitDiagram 1s - Local GitHub1s & GitDiagram Desktop
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

echo Launching GitDiagram 1s...
call npm start
