@echo off
title Church Attendance - Public Server (SSH)
color 0B

echo.
echo ============================================================
echo           PUBLIC SERVER - STARTED
echo ============================================================
echo.
echo 1. Starting Production Server...
start "Church Server" cmd /k "cd /d d:\church && python server.py"
timeout /t 5 /nobreak >nul

echo.
echo 2. Establishing Public Tunnel...
echo.
echo ------------------------------------------------------------
echo YOUR PUBLIC URL IS:
echo https://75fda161ed2b5b.lhr.life
echo ------------------------------------------------------------
echo.
echo KEEP THIS WINDOW OPEN!
echo.
echo If you close this, the app will stop working.
echo.

REM Use the generated key for persistent URL
ssh -i d:\church\id_ed25519 -o StrictHostKeyChecking=no -R 80:localhost:5000 localhost.run

pause
