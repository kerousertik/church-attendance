@echo off
title Deploy to GitHub
color 0B

echo.
echo ============================================================
echo           DEPLOY TO GITHUB
echo ============================================================
echo.
echo This will push your code to GitHub for cloud deployment.
echo.
echo IMPORTANT: You need a GitHub account and repository first!
echo.
echo Steps:
echo 1. Go to github.com and create a new repository
echo 2. Name it: church-attendance
echo 3. Copy the repository URL
echo.
pause

echo.
echo ============================================================
echo           INITIALIZING GIT
echo ============================================================
echo.

REM Initialize git if not already done
if not exist ".git" (
    git init
    echo Git initialized!
) else (
    echo Git already initialized.
)

echo.
echo ============================================================
echo           ADDING FILES
echo ============================================================
echo.

REM Add all files
git add .
echo Files added to staging.

echo.
echo ============================================================
echo           COMMITTING
echo ============================================================
echo.

REM Commit
git commit -m "Church Attendance App - Ready for deployment"
echo Changes committed!

echo.
echo ============================================================
echo           ADDING REMOTE
echo ============================================================
echo.
echo Enter your GitHub repository URL:
echo Example: https://github.com/YOUR_USERNAME/church-attendance.git
echo.
set /p REPO_URL="Repository URL: "

REM Check if remote already exists
git remote | findstr "origin" >nul
if %errorlevel% equ 0 (
    echo Remote 'origin' already exists. Updating...
    git remote set-url origin %REPO_URL%
) else (
    git remote add origin %REPO_URL%
)

echo Remote added: %REPO_URL%

echo.
echo ============================================================
echo           PUSHING TO GITHUB
echo ============================================================
echo.

REM Set main branch and push
git branch -M main
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ============================================================
    echo           SUCCESS!
    echo ============================================================
    echo.
    echo Your code is now on GitHub!
    echo.
    echo Next steps:
    echo 1. Go to render.com
    echo 2. Sign in with GitHub
    echo 3. Create new Web Service
    echo 4. Select your repository
    echo 5. Deploy!
    echo.
) else (
    echo.
    echo ============================================================
    echo           ERROR
    echo ============================================================
    echo.
    echo Push failed. Common issues:
    echo - Wrong repository URL
    echo - Need to authenticate (use Personal Access Token)
    echo - Repository doesn't exist
    echo.
    echo Get a Personal Access Token at:
    echo https://github.com/settings/tokens
    echo.
)

pause
