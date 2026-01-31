@echo off
title Building APK...
color 0B

echo.
echo ============================================================
echo           BUILDING ATTENDANCE APK
echo ============================================================
echo.

set JAVA_HOME=d:\jdk-17.0.13+11
set ANDROID_HOME=d:\android-sdk
set ANDROID_SDK_ROOT=d:\android-sdk
set PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%PATH%

echo Java: %JAVA_HOME%
echo Android SDK: %ANDROID_HOME%
echo.
echo Starting build...
echo.

cd /d d:\church\android
call gradlew.bat assembleDebug --no-daemon

if exist "app\build\outputs\apk\debug\app-debug.apk" (
    echo.
    echo ============================================================
    echo           SUCCESS! APK BUILT!
    echo ============================================================
    echo.
    echo APK Location: d:\church\android\app\build\outputs\apk\debug\app-debug.apk
    echo.
    copy "app\build\outputs\apk\debug\app-debug.apk" "d:\church\Attendance.apk"
    echo Copied to: d:\church\Attendance.apk
    echo.
) else (
    echo.
    echo ============================================================
    echo           BUILD FAILED
    echo ============================================================
    echo.
)

pause
