@echo off
chcp 65001 >nul
setlocal

:: ====================================
::  Game Rank Auto Update (Scheduled)
:: ====================================

:: 設定工作目錄
cd /d "%~dp0.."

:: 建立 logs 資料夾
if not exist "data\logs" mkdir "data\logs"

:: 產生日誌檔名（YYYY-MM-DD 格式）
for /f "tokens=1-3 delims=/" %%a in ("%date:~0,10%") do (
    set Y=%%a
    set M=%%b
    set D=%%c
)
set LOGDATE=%Y%-%M%-%D%
set LOGFILE=data\logs\schedule_%LOGDATE%.log

echo ==================================== >> "%LOGFILE%"
echo  Game Rank Auto Update (Scheduled) >> "%LOGFILE%"
echo  Started: %date% %time% >> "%LOGFILE%"
echo ==================================== >> "%LOGFILE%"
echo Working dir: %CD% >> "%LOGFILE%"

:: 檢查 Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] node not found in PATH >> "%LOGFILE%"
    echo %date% %time% FAIL [pipeline] - node not found >> "data\schedule.log"
    goto :eof
)

:: 檢查 node_modules
if not exist "node_modules" (
    echo [ERROR] node_modules not found >> "%LOGFILE%"
    echo %date% %time% FAIL [pipeline] - node_modules missing >> "data\schedule.log"
    goto :eof
)

echo. >> "%LOGFILE%"
echo [0/5] Git pull (sync data from other computer)... >> "%LOGFILE%"
git pull origin main --no-rebase >> "%LOGFILE%" 2>&1
if errorlevel 1 (
    echo [WARN] Git pull had issues, continuing with local data... >> "%LOGFILE%"
)

echo. >> "%LOGFILE%"
echo [1/5] Fetching rankings... >> "%LOGFILE%"
call npm run fetch >> "%LOGFILE%" 2>&1
if errorlevel 1 (
    echo [ERROR] Fetch failed >> "%LOGFILE%"
    echo %date% %time% FAIL [pipeline] - fetch >> "data\schedule.log"
    goto :eof
)

echo. >> "%LOGFILE%"
echo [2/5] Detecting darkhorses... >> "%LOGFILE%"
call npm run analyze >> "%LOGFILE%" 2>&1
if errorlevel 1 (
    echo [WARN] Darkhorse detection had issues, continuing... >> "%LOGFILE%"
)

echo. >> "%LOGFILE%"
echo [3/5] Deep analysis... >> "%LOGFILE%"
call npm run deep-analyze >> "%LOGFILE%" 2>&1
if errorlevel 1 (
    echo [WARN] Deep analysis had issues, continuing... >> "%LOGFILE%"
)

echo. >> "%LOGFILE%"
echo [4/5] Uploading to Firebase... >> "%LOGFILE%"
call npm run upload >> "%LOGFILE%" 2>&1
if errorlevel 1 (
    echo [ERROR] Upload failed >> "%LOGFILE%"
    echo %date% %time% FAIL [pipeline] - upload >> "data\schedule.log"
    goto :eof
)

echo. >> "%LOGFILE%"
echo [5/5] Syncing to Git... >> "%LOGFILE%"
git add data/ app.js scripts/ config.js firebase-data.js index.html index.css .gitignore >> "%LOGFILE%" 2>&1
git commit -m "data: auto-sync %LOGDATE%" --no-verify >> "%LOGFILE%" 2>&1
if errorlevel 1 (
    echo [WARN] Git commit skipped (no changes or error) >> "%LOGFILE%"
) else (
    git push origin main >> "%LOGFILE%" 2>&1
    if errorlevel 1 (
        echo [WARN] Git push failed, will retry next run >> "%LOGFILE%"
    ) else (
        echo [OK] Git sync done >> "%LOGFILE%"
    )
)

echo. >> "%LOGFILE%"
echo ==================================== >> "%LOGFILE%"
echo  [OK] All done! %date% %time% >> "%LOGFILE%"
echo ==================================== >> "%LOGFILE%"
echo %date% %time% OK [pipeline] >> "data\schedule.log"
