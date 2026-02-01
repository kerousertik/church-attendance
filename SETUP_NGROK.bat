@echo off
title Setup ngrok - Step by Step
color 0B

echo.
echo ============================================================
echo           NGROK SETUP - NO PASSWORD NEEDED!
echo ============================================================
echo.
echo ngrok.exe is already downloaded to: d:\church\
echo.
echo ============================================================
echo           STEP 1: GET YOUR AUTHTOKEN
echo ============================================================
echo.
echo 1. Opening ngrok signup page...
echo.
timeout /t 2
start https://dashboard.ngrok.com/signup
echo.
echo 2. Sign up for FREE (use Google/GitHub for quick signup)
echo.
echo 3. After signup, you'll see your authtoken
echo    OR go to: https://dashboard.ngrok.com/get-started/your-authtoken
echo.
echo 4. Copy the authtoken (looks like: 2abc123def456...)
echo.
echo ============================================================
echo           STEP 2: CONFIGURE NGROK
echo ============================================================
echo.
set /p AUTHTOKEN="Paste your authtoken here: "

if "%AUTHTOKEN%"=="" (
    echo.
    echo ERROR: No authtoken provided!
    echo Please run this script again and paste your authtoken.
    pause
    exit /b 1
)

echo.
echo Configuring ngrok...
d:\church\ngrok.exe config add-authtoken %AUTHTOKEN%

if %errorlevel% equ 0 (
    echo.
    echo ============================================================
    echo           SUCCESS! NGROK IS READY!
    echo ============================================================
    echo.
    echo You're all set! Now you can:
    echo.
    echo 1. Run: d:\church\START_PUBLIC_SERVER_NGROK.bat
    echo.
    echo 2. Copy the public URL (https://xyz.ngrok-free.app)
    echo.
    echo 3. Update capacitor.config.json with that URL
    echo.
    echo 4. Rebuild APK: d:\church\build_apk_now.bat
    echo.
    echo NO PASSWORD REQUIRED for visitors!
    echo.
) else (
    echo.
    echo ============================================================
    echo           ERROR
    echo ============================================================
    echo.
    echo Failed to configure ngrok.
    echo Please check your authtoken and try again.
    echo.
)

pause
