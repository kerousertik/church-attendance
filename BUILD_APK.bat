@echo off
title Church Attendance - APK Builder
color 0B

echo.
echo ============================================================
echo           ATTENDANCE APP - APK BUILD GUIDE
echo ============================================================
echo.
echo Your app files are ready! The UI looks like a native app now.
echo.
echo ============================================================
echo       OPTION 1: Use PWABuilder (EASIEST - 2 MINUTES)
echo ============================================================
echo.
echo 1. Make sure your server is running (START_SERVER.bat)
echo 2. Use ngrok or a public URL for your server
echo 3. Go to: https://www.pwabuilder.com/
echo 4. Enter your URL and click Start
echo 5. Download the Android APK
echo.
echo ============================================================
echo       OPTION 2: Use Gonative.io (FREE)
echo ============================================================
echo.
echo 1. Go to: https://gonative.io/
echo 2. Enter your server URL (e.g., http://YOUR_IP:5000)
echo 3. Upload app-icon.png as the app icon
echo 4. Click "Build Now"
echo 5. Download your APK!
echo.
echo ============================================================
echo       OPTION 3: Install Android Studio
echo ============================================================
echo.
echo 1. Download Android Studio: https://developer.android.com/studio
echo 2. Install and set up Android SDK
echo 3. Open the project: d:\church\android
echo 4. Build ^> Build APK(s) ^> Build APK
echo.
echo ============================================================
echo.
echo Your app icon is at: d:\church\static\app-icon.png
echo The Android project is at: d:\church\android
echo.
pause
