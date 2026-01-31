@echo off
title Quick Deploy Guide
color 0B

echo.
echo ============================================================
echo           CLOUD DEPLOYMENT - QUICK START
echo ============================================================
echo.
echo Your app is ready to deploy to the cloud!
echo.
echo ============================================================
echo           OPTION 1: RENDER.COM (RECOMMENDED)
echo ============================================================
echo.
echo 1. Run: PUSH_TO_GITHUB.bat
echo    - Create GitHub repo first: github.com/new
echo    - Name it: church-attendance
echo    - Copy the URL
echo.
echo 2. Go to: render.com
echo    - Sign in with GitHub
echo    - New Web Service
echo    - Select your repo
echo    - Click Deploy!
echo.
echo 3. Get your URL:
echo    - https://church-attendance-xyz.onrender.com
echo.
echo 4. Update APK:
echo    - Edit capacitor.config.json
echo    - Change "url" to your Render URL
echo    - Run: build_apk_now.bat
echo.
echo ============================================================
echo           OPTION 2: RAILWAY.APP
echo ============================================================
echo.
echo 1. Go to: railway.app
echo 2. Sign in with GitHub
echo 3. New Project from GitHub
echo 4. Select your repo
echo 5. Auto-deploys!
echo.
echo ============================================================
echo           FILES READY FOR DEPLOYMENT
echo ============================================================
echo.
echo [x] requirements.txt - Python dependencies
echo [x] render.yaml - Render configuration
echo [x] .gitignore - Git ignore rules
echo [x] README.md - Project documentation
echo [x] server.py - Production server
echo.
echo ============================================================
echo           WHAT HAPPENS NEXT?
echo ============================================================
echo.
echo After deployment, your app will be:
echo - Accessible 24/7 from anywhere
echo - No need to keep your PC on
echo - Free hosting (with limitations)
echo - Public URL for everyone
echo.
echo ============================================================
echo.
echo Press any key to see full deployment guide...
pause >nul

type DEPLOY_TO_CLOUD.md

echo.
echo ============================================================
echo.
pause
