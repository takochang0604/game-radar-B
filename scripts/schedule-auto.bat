@echo off
chcp 65001 >nul
setlocal

echo ====================================
echo  Game Rank Auto Update (Scheduled)
echo ====================================
echo %date% %time%

cd /d "%~dp0.."
echo Working dir: %CD%

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] node not found in PATH
    echo %date% %time% FAIL [pipeline] - node not found >> "%~dp0..\data\schedule.log"
    goto :eof
)

if not exist "node_modules" (
    echo.
    echo [ERROR] node_modules not found
    echo %date% %time% FAIL [pipeline] - node_modules missing >> "%~dp0..\data\schedule.log"
    goto :eof
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
    echo [ERROR] Fetch failed
    echo %date% %time% FAIL [pipeline] - fetch >> "%~dp0..\data\schedule.log"
    goto :eof
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
    echo [ERROR] Upload failed
    echo %date% %time% FAIL [pipeline] - upload >> "%~dp0..\data\schedule.log"
    goto :eof
)
echo.
echo [5/5] Syncing to Git...
git add data/ .gitignore
git commit -m "data: auto-sync %date:~0,10%" --no-verify 2>nul
if errorlevel 1 (
    echo [WARN] Git commit skipped (no changes or error)
) else (
    git push origin main 2>nul
    if errorlevel 1 (
        echo [WARN] Git push failed, will retry next run
    ) else (
        echo [OK] Git sync done
    )
)

echo.
echo ====================================
echo  [OK] All done! %date% %time%
echo ====================================
echo %date% %time% OK [pipeline] >> "%~dp0..\data\schedule.log"
