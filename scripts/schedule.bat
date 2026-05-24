@echo off
chcp 65001 >nul
setlocal

echo ====================================
echo  Game Rank Auto Update
echo ====================================
echo %date% %time%

cd /d "%~dp0.."
echo Working dir: %CD%

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] node not found in PATH
    echo Please install Node.js first
    echo.
    goto :fail
)

if not exist "node_modules" (
    echo.
    echo [ERROR] node_modules not found
    echo Please run: npm install
    echo.
    goto :fail
)

echo.
echo [0/5] Git pull (sync data from other computer)...
git pull origin main --no-rebase 2>nul
if errorlevel 1 (
    echo [WARN] Git pull had issues, continuing with local data...
)

echo.
echo [1/5] Fetching rankings...
call npm run fetch
if errorlevel 1 (
    echo.
    echo [ERROR] Fetch failed
    goto :fail
)

echo.
echo [2/5] Detecting darkhorses...
call npm run analyze
if errorlevel 1 (
    echo [WARN] Darkhorse detection had issues, continuing...
)

echo.
echo [3/5] Deep analysis...
call npm run deep-analyze
if errorlevel 1 (
    echo [WARN] Deep analysis had issues, continuing...
)

echo.
echo [4/5] Uploading to Firebase...
call npm run upload
if errorlevel 1 (
    echo.
    echo [ERROR] Upload failed
    goto :fail
)

echo.
echo [5/5] Git push (sync data to remote)...
git add data/
git commit -m "data: auto-update %date%"
git push origin main --force-with-lease 2>nul
if errorlevel 1 (
    echo [WARN] Git push failed, data saved locally only
)

echo.
echo ====================================
echo  [OK] All done! %date% %time%
echo ====================================
echo %date% %time% OK >> "%~dp0..\data\schedule.log"
goto :eof

:fail
echo.
echo ====================================
echo  [FAIL] %date% %time%
echo ====================================
echo %date% %time% FAIL >> "%~dp0..\data\schedule.log"
goto :eof
