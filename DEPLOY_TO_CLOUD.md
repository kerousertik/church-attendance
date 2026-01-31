# Church Attendance App - Cloud Deployment

## 🌐 Deploy to Render.com (FREE)

Your app will be accessible 24/7 at a public URL like: `https://church-attendance-xyz.onrender.com`

---

## 📋 Prerequisites

- GitHub account (free)
- Render.com account (free, no credit card needed)

---

## 🚀 Deployment Steps

### Step 1: Create GitHub Repository

1. Go to [github.com](https://github.com) and sign in
2. Click **"New repository"**
3. Name it: `church-attendance`
4. Make it **Private** (recommended)
5. Click **"Create repository"**

### Step 2: Push Code to GitHub

Open PowerShell in `d:\church` and run:

```powershell
# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Church Attendance App"

# Add GitHub remote (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/church-attendance.git

# Push to GitHub
git branch -M main
git push -u origin main
```

> **Note:** You'll be asked for GitHub username and password. Use a [Personal Access Token](https://github.com/settings/tokens) as the password.

### Step 3: Deploy to Render

1. Go to [render.com](https://render.com) and sign up (use GitHub to sign in)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub account
4. Select the `church-attendance` repository
5. Configure:
   - **Name:** `church-attendance`
   - **Environment:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python server.py`
   - **Plan:** `Free`
6. Click **"Create Web Service"**

### Step 4: Wait for Deployment

- Render will build and deploy your app (takes 2-5 minutes)
- You'll get a URL like: `https://church-attendance-xyz.onrender.com`
- The app will be live 24/7!

### Step 5: Update APK with New URL

1. Edit `d:\church\capacitor.config.json`:
   ```json
   {
     "appId": "com.stjohn.attendance",
     "appName": "Attendance",
     "webDir": "static",
     "server": {
       "url": "https://church-attendance-xyz.onrender.com",
       "cleartext": false
     }
   }
   ```

2. Rebuild APK:
   ```cmd
   d:\church\build_apk_now.bat
   ```

3. Distribute the new APK to users!

---

## 🎯 Alternative: Quick Deploy (No Git)

If you don't want to use Git, use **Railway.app**:

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Click **"New Project"** → **"Deploy from GitHub repo"**
4. Upload your code as a ZIP file
5. Railway will auto-detect and deploy!

---

## ⚠️ Important Notes

### Database Persistence

> [!WARNING]
> Free tier hosting may reset the database on restart. For production, consider:
> - Using PostgreSQL (free on Render)
> - Backing up the database regularly

### Free Tier Limitations

**Render.com Free Tier:**
- ✅ 750 hours/month (enough for 24/7)
- ⚠️ Sleeps after 15 min of inactivity
- ⚠️ Cold start takes 30-60 seconds

**To prevent sleep:**
- Use [UptimeRobot](https://uptimerobot.com) to ping your URL every 5 minutes (free)

---

## 🔧 Troubleshooting

### "Module not found" error
- Check `requirements.txt` has all dependencies
- Rebuild on Render dashboard

### Database not working
- Render's free tier has ephemeral storage
- Upgrade to PostgreSQL or use persistent disk

### App not loading
- Check Render logs in dashboard
- Verify `server.py` is using `PORT` environment variable

---

## 📱 Testing Your Deployment

1. Visit your Render URL in a browser
2. You should see the attendance app
3. Test all features (login, attendance, etc.)
4. Install the new APK on Android device
5. Verify it connects to the cloud server

---

## 🎉 You're Done!

Your app is now:
- ✅ Accessible 24/7
- ✅ Available from anywhere
- ✅ No need to keep your PC on
- ✅ Free hosting!

**Your public URL:** `https://church-attendance-xyz.onrender.com`

Share this URL or the APK with your church members!
