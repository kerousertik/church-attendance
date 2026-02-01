@echo off
title Deploy to Render.com
color 0B

echo.
echo ============================================================
echo           CODE PUSHED TO GITHUB SUCCESSFULLY!
echo ============================================================
echo.
echo Repository: https://github.com/kerousertik/church-attendance
echo.
echo ============================================================
echo           NEXT: DEPLOY TO RENDER.COM
echo ============================================================
echo.
echo Follow these steps:
echo.
echo 1. Go to: https://render.com
echo.
echo 2. Click "Get Started for Free"
echo    - Sign in with GitHub
echo.
echo 3. Click "New +" (top right)
echo    - Select "Web Service"
echo.
echo 4. Connect Repository:
echo    - Find: kerousertik/church-attendance
echo    - Click "Connect"
echo.
echo 5. Configure Service:
echo    Name: church-attendance
echo    Environment: Python 3
echo    Build Command: pip install -r requirements.txt
echo    Start Command: python server.py
echo    Plan: Free
echo.
echo 6. Click "Create Web Service"
echo.
echo 7. Wait for deployment (2-5 minutes)
echo.
echo 8. Copy your URL:
echo    Example: https://church-attendance-xyz.onrender.com
echo.
echo ============================================================
echo           AFTER DEPLOYMENT
echo ============================================================
echo.
echo 1. Test your URL in browser
echo.
echo 2. Update capacitor.config.json:
echo    Change "url" to your Render URL
echo.
echo 3. Rebuild APK:
echo    Run: build_apk_now.bat
echo.
echo 4. Distribute new APK to users!
echo.
echo ============================================================
echo.
echo Opening Render.com in your browser...
echo.
timeout /t 3
start https://render.com
echo.
echo Opening your GitHub repo...
timeout /t 2
start https://github.com/kerousertik/church-attendance
echo.
echo ============================================================
echo.
pause
