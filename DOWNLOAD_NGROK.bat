@echo off
title Download ngrok
color 0B

echo.
echo ============================================================
echo           DOWNLOADING NGROK
echo ============================================================
echo.
echo Downloading ngrok for Windows...
echo.

REM Download ngrok using PowerShell
powershell -Command "& {Invoke-WebRequest -Uri 'https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip' -OutFile 'd:\church\ngrok.zip'}"

if %errorlevel% equ 0 (
    echo.
    echo Download complete! Extracting...
    echo.
    
    REM Extract ngrok
    powershell -Command "& {Expand-Archive -Path 'd:\church\ngrok.zip' -DestinationPath 'd:\church\' -Force}"
    
    REM Delete zip file
    del "d:\church\ngrok.zip"
    
    echo.
    echo ============================================================
    echo           NGROK INSTALLED!
    echo ============================================================
    echo.
    echo ngrok.exe is now in: d:\church\
    echo.
    echo Next steps:
    echo 1. Go to: https://dashboard.ngrok.com/signup
    echo 2. Sign up (free)
    echo 3. Copy your authtoken from: https://dashboard.ngrok.com/get-started/your-authtoken
    echo 4. Run this command:
    echo    d:\church\ngrok.exe config add-authtoken YOUR_AUTH_TOKEN
    echo.
    echo Opening ngrok signup page...
    timeout /t 3
    start https://dashboard.ngrok.com/signup
    echo.
) else (
    echo.
    echo ============================================================
    echo           DOWNLOAD FAILED
    echo ============================================================
    echo.
    echo Please download manually from: https://ngrok.com/download
    echo Extract ngrok.exe to: d:\church\
    echo.
)

pause
