@echo off
chcp 65001 >nul

:: ===== 設定 PATH，確保 node/npm 在排程環境下也能找到 =====
set "PATH=C:\Program Files\nodejs;%PATH%"

:: ===== 設定工作目錄 =====
set "WORKDIR=c:\Users\takochang\OneDrive - International Games System\桌面\Antigravity 專案\遊戲產品競爭力分析"
cd /d "%WORKDIR%"

:: ===== Log 檔案 =====
set "LOGFILE=%WORKDIR%\data\daily-run.log"

echo ===== GameRadar Daily Run: %date% %time% ===== >> "%LOGFILE%" 2>&1

echo [1/3] Fetching rankings...
echo [1/3] %date% %time% Fetching rankings... >> "%LOGFILE%" 2>&1
call npm run fetch >> "%LOGFILE%" 2>&1
if errorlevel 1 (
    echo ERROR: fetch failed >> "%LOGFILE%" 2>&1
    goto :end
)
echo [1/3] fetch OK >> "%LOGFILE%" 2>&1

echo [2/3] Detecting darkhorse...
echo [2/3] %date% %time% Detecting darkhorse... >> "%LOGFILE%" 2>&1
call npm run analyze >> "%LOGFILE%" 2>&1
if errorlevel 1 (
    echo ERROR: analyze failed >> "%LOGFILE%" 2>&1
    goto :end
)
echo [2/3] analyze OK >> "%LOGFILE%" 2>&1

echo [3/3] Uploading to Firebase...
echo [3/3] %date% %time% Uploading to Firebase... >> "%LOGFILE%" 2>&1
call npm run upload >> "%LOGFILE%" 2>&1
if errorlevel 1 (
    echo ERROR: upload failed >> "%LOGFILE%" 2>&1
    goto :end
)
echo [3/3] upload OK >> "%LOGFILE%" 2>&1

echo ===== ALL DONE: %date% %time% ===== >> "%LOGFILE%" 2>&1

:end
