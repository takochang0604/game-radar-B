@echo off
chcp 65001 >nul

:: ===== 設定 PATH，確保 node/npm 在排程環境下也能找到 =====
set "PATH=C:\Program Files\nodejs;%PATH%"

:: ===== 設定工作目錄 =====
set "WORKDIR=c:\Users\takochang\OneDrive - International Games System\桌面\Antigravity 專案\遊戲產品競爭力分析"
cd /d "%WORKDIR%"

:: ===== Log 檔案 =====
set "LOGFILE=%WORKDIR%\data\daily-run.log"

:: ===== 產生日期字串 =====
for /f "tokens=1-3 delims=/" %%a in ("%date:~0,10%") do (
    set Y=%%a
    set M=%%b
    set D=%%c
)
set LOGDATE=%Y%-%M%-%D%

echo ===== GameRadar Daily Run: %date% %time% ===== >> "%LOGFILE%" 2>&1

echo [0/4] Git pull (sync from other computer)...
echo [0/4] %date% %time% Git pull... >> "%LOGFILE%" 2>&1
git pull origin main --no-rebase >> "%LOGFILE%" 2>&1
if errorlevel 1 (
    echo [WARN] Git pull had issues, continuing with local data... >> "%LOGFILE%" 2>&1
)

echo [1/4] Fetching rankings...
echo [1/4] %date% %time% Fetching rankings... >> "%LOGFILE%" 2>&1
call npm run fetch >> "%LOGFILE%" 2>&1
if errorlevel 1 (
    echo ERROR: fetch failed >> "%LOGFILE%" 2>&1
    goto :end
)
echo [1/4] fetch OK >> "%LOGFILE%" 2>&1

echo [2/4] Detecting darkhorse...
echo [2/4] %date% %time% Detecting darkhorse... >> "%LOGFILE%" 2>&1
call npm run analyze >> "%LOGFILE%" 2>&1
if errorlevel 1 (
    echo ERROR: analyze failed >> "%LOGFILE%" 2>&1
    goto :end
)
echo [2/4] analyze OK >> "%LOGFILE%" 2>&1

echo [3/4] Uploading to Firebase...
echo [3/4] %date% %time% Uploading to Firebase... >> "%LOGFILE%" 2>&1
call npm run upload >> "%LOGFILE%" 2>&1
if errorlevel 1 (
    echo ERROR: upload failed >> "%LOGFILE%" 2>&1
    goto :end
)
echo [3/4] upload OK >> "%LOGFILE%" 2>&1

echo [4/4] Syncing to Git...
echo [4/4] %date% %time% Syncing to Git... >> "%LOGFILE%" 2>&1
git add data/ app.js scripts/ config.js firebase-data.js index.html index.css .gitignore >> "%LOGFILE%" 2>&1
git commit -m "data: auto-sync %LOGDATE%" --no-verify >> "%LOGFILE%" 2>&1
if errorlevel 1 (
    echo [WARN] Git commit skipped (no changes or error) >> "%LOGFILE%" 2>&1
) else (
    git push origin main >> "%LOGFILE%" 2>&1
    if errorlevel 1 (
        echo [WARN] Git push failed, will retry next run >> "%LOGFILE%" 2>&1
    ) else (
        echo [OK] Git sync done >> "%LOGFILE%" 2>&1
    )
)

echo ===== ALL DONE: %date% %time% ===== >> "%LOGFILE%" 2>&1

:end
