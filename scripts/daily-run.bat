@echo off
chcp 65001 >nul
echo ===== GameRadar Daily Run: %date% %time% =====

cd /d "c:\Users\takochang\OneDrive - International Games System\桌面\Antigravity 專案\遊戲產品競爭力分析"

echo [1/3] Fetching rankings...
call npm run fetch
if errorlevel 1 (
    echo ERROR: fetch failed
    goto :end
)

echo [2/3] Detecting darkhorse...
call npm run analyze
if errorlevel 1 (
    echo ERROR: analyze failed
    goto :end
)

echo [3/3] Uploading to Firebase...
call npm run upload
if errorlevel 1 (
    echo ERROR: upload failed
    goto :end
)

echo ===== DONE: %date% %time% =====

:end
