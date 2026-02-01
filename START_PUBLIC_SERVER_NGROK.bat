@echo off
title Church Attendance - Public Server (ngrok)
color 0B

echo.
echo ============================================================
echo           CHURCH ATTENDANCE - PUBLIC SERVER (ngrok)
echo ============================================================
echo.
echo This uses ngrok for a more stable public URL.
echo.
echo FIRST TIME SETUP:
echo 1. Download ngrok from: https://ngrok.com/download
echo 2. Extract ngrok.exe to: d:\church\
echo 3. Sign up at: https://dashboard.ngrok.com/signup
echo 4. Get your authtoken from: https://dashboard.ngrok.com/get-started/your-authtoken
echo 5. Run: ngrok.exe authtoken YOUR_TOKEN
echo.
echo ============================================================

REM Check if ngrok exists
if not exist "d:\church\ngrok.exe" (
    echo.
    echo ERROR: ngrok.exe not found!
    echo.
    echo Please download ngrok from: https://ngrok.com/download
    echo Extract ngrok.exe to: d:\church\
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo           STARTING SERVER...
echo ============================================================
echo.

REM Start the Flask server in a new window
start "Church Server" cmd /k "cd /d d:\church && python server.py"

echo Server started in new window!
echo Waiting 5 seconds for server to initialize...
timeout /t 5 /nobreak >nul

echo.
echo ============================================================
echo           EXPOSING TO INTERNET WITH NGROK...
echo ============================================================
echo.

REM Start ngrok
echo Starting ngrok on port 5000...
echo.
echo Your public URL will appear below:
echo Look for the "Forwarding" line with https://
echo.

d:\church\ngrok.exe http 5000

echo.
echo ============================================================
echo           SERVER STOPPED
echo ============================================================
echo.
pause
