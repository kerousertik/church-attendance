# Render Deployment - Step by Step

## ✅ Your Code is on GitHub
Repository: https://github.com/kerousertik/church-attendance

## 🚀 Deploy to Render.com

### Step 1: Go to Render
Visit: https://dashboard.render.com

### Step 2: Sign In
- Click **"Get Started"** or **"Sign In"**
- Choose **"Sign in with GitHub"**
- Authorize Render to access your GitHub

### Step 3: Create New Web Service
1. Click **"New +"** button (top right)
2. Select **"Web Service"**

### Step 4: Connect Your Repository
1. You'll see a list of your GitHub repositories
2. Find: **kerousertik/church-attendance**
3. Click **"Connect"** button next to it

### Step 5: Configure Your Service

Fill in these settings:

**Name:** `church-attendance` (or any name you prefer)

**Environment:** `Python 3`

**Region:** Choose closest to you (e.g., Oregon USA)

**Branch:** `main`

**Build Command:**
```
pip install -r requirements.txt
```

**Start Command:**
```
python server.py
```

**Plan:** Select **"Free"**

### Step 6: Deploy!
1. Click **"Create Web Service"** button at the bottom
2. Render will start building your app
3. Watch the logs - it takes 2-5 minutes

### Step 7: Get Your URL
Once deployed, you'll see your URL at the top:
```
https://church-attendance-XXXXX.onrender.com
```

Copy this URL - you'll need it for the APK!

---

## 📱 Update APK with Your Real URL

Once you have your Render URL:

1. **Edit** `d:\church\capacitor.config.json`
2. **Replace** the URL with your actual Render URL
3. **Run** `d:\church\build_apk_now.bat`
4. **Distribute** the new APK!

---

## ⚠️ Important Notes

- **First deployment takes 3-5 minutes**
- **Free tier sleeps after 15 min of inactivity**
- **Cold start takes 30-60 seconds to wake up**
- **Database resets on sleep** (consider upgrading to PostgreSQL)

---

## 🔗 Quick Links

- **Render Dashboard:** https://dashboard.render.com
- **Your GitHub Repo:** https://github.com/kerousertik/church-attendance
- **Render Docs:** https://render.com/docs

---

## Need Help?

If you get stuck:
1. Check Render logs for errors
2. Verify `requirements.txt` has all dependencies
3. Ensure `server.py` uses PORT environment variable
4. Check that all files are on GitHub
