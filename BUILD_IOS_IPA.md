# Build iOS IPA (No Mac Required)

This guide explains how to build a real iOS IPA from this project using GitHub Actions.

## Step 1: Push to GitHub

```batch
cd d:\church
git add .
git commit -m "Add iOS build"
git push
```

## Step 2: Build IPA on GitHub

1. Go to your GitHub repository
2. Click **Actions** tab
3. Click **Build iOS IPA** workflow
4. Click **Run workflow** button
5. Wait ~10 minutes for build to complete

## Step 3: Download IPA

1. Click on the completed workflow run
2. Scroll down to **Artifacts**
3. Download **Attendance-iOS.zip**
4. Extract to get **Attendance.ipa**

---

## Step 4: Install on iPhone

Since you don't have Apple Developer ($99), use **sideloading**:

### Option A: AltStore (Recommended)

1. Download AltStore: https://altstore.io
2. Install AltStore on your PC
3. Connect iPhone via USB
4. Use AltStore to install Attendance.ipa

### Option B: Sideloadly (Alternative)

1. Download Sideloadly: https://sideloadly.io
2. Connect iPhone to PC
3. Drag Attendance.ipa into Sideloadly
4. Sign in with your Apple ID
5. Click Start

---

## ⚠️ Important Limitations

| Limitation | Details |
|------------|---------|
| **7-Day Expiry** | App expires every 7 days (free Apple ID) |
| **Re-install Required** | Must re-sideload after expiry |
| **Trust Certificate** | Go to Settings → General → Device Management → Trust |

---

## Alternative: Paid Apple Developer ($99/year)

With paid account you get:
- 1-year signing (no expiry)
- TestFlight distribution (share with 10,000 testers)
- App Store submission
