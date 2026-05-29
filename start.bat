@echo off
cd /d "%~dp0"

echo.
echo === Art Media Publishing Site Quick Start ===
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js is not installed.
    echo.
    echo Please install Node.js 18+ from https://nodejs.org/
    echo.
    echo After installing Node.js, run this script again.
    pause
    exit /b 1
)

node -e "var v=process.versions.node.split('.');if(+v[0]<18||(+v[0]===18&&+v[1]<17)){console.error('Node.js '+process.version+' is too old. Requires >= 18.17.');process.exit(1)}"
if %errorlevel% neq 0 (
    pause
    exit /b 1
)

echo Node.js detected.

node setup.js
if %errorlevel% neq 0 (
    echo Setup failed.
    pause
    exit /b 1
)

echo.
echo Starting server...
echo.
node server.js
