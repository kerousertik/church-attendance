@echo off
title Church Attendance Server - 24/7
color 0A

echo.
echo ========================================================
echo         St. John the Beloved Church
echo         Attendance Management Server
echo ========================================================
echo.
echo Starting 24/7 Production Server...
echo Press Ctrl+C to stop the server
echo.

:loop
python server.py
echo.
echo [%date% %time%] Server stopped. Restarting in 5 seconds...
timeout /t 5 /nobreak
goto loop
