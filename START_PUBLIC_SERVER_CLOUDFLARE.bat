@echo off
title Church Attendance - Public Server (Cloudflare)
color 0B

echo.
echo ============================================================
echo       CHURCH ATTENDANCE - PUBLIC SERVER (Cloudflare)
echo ============================================================
echo.
echo This creates a FREE, STABLE public URL - no signup needed!
echo Your iPhone can access the app from anywhere.
echo.
echo ============================================================

REM Check if cloudflared exists
if not exist "d:\church\cloudflared.exe" (
    echo.
    echo Downloading Cloudflare Tunnel...
    echo.
    curl -L -o "d:\church\cloudflared.exe" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    if errorlevel 1 (
        echo.
        echo ERROR: Failed to download cloudflared!
        echo Please download manually from:
        echo https://github.com/cloudflare/cloudflared/releases
        echo.
        pause
        exit /b 1
    )
    echo Download complete!
)

echo.
echo ============================================================
echo              STARTING SERVER...
echo ============================================================
echo.

REM Start Flask server in background
start "Church Server" cmd /k "cd /d d:\church && python server.py"

echo Server starting in new window...
echo Waiting 3 seconds for server to initialize...
timeout /t 3 /nobreak >nul

echo.
echo ============================================================
echo         CREATING PUBLIC URL WITH CLOUDFLARE...
echo ============================================================
echo.
echo Your public URL will appear below.
echo Look for the line with "https://...trycloudflare.com"
echo.
echo ============================================================
echo.
echo COPY THE URL BELOW AND OPEN IT ON YOUR IPHONE SAFARI:
echo.

d:\church\cloudflared.exe tunnel --url http://localhost:5000

echo.
echo ============================================================
echo              SERVER STOPPED
echo ============================================================
echo.
pause
