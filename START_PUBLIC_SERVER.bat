@echo off
title Church Attendance - Public Server
color 0B

echo.
echo ============================================================
echo           CHURCH ATTENDANCE - PUBLIC SERVER
echo ============================================================
echo.
echo This will make your server accessible from anywhere!
echo.
echo Your PC must stay on and connected to internet.
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
echo           EXPOSING TO INTERNET...
echo ============================================================
echo.

REM Start localtunnel
echo Starting localtunnel on port 5000...
echo.
echo Your public URL will appear below:
echo.

npx localtunnel --port 5000

echo.
echo ============================================================
echo           SERVER STOPPED
echo ============================================================
echo.
pause
