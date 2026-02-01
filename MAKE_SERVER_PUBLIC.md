# Make Your PC Server Public - Using ngrok

## 🌐 Expose Your Local Server to the Internet

This will give you a public URL while your server runs on your PC.

---

## Option 1: ngrok (RECOMMENDED - Free & Easy)

### Step 1: Download ngrok

1. Go to: https://ngrok.com/download
2. Download for Windows
3. Extract `ngrok.exe` to `d:\church\`

### Step 2: Sign Up (Free)

1. Go to: https://dashboard.ngrok.com/signup
2. Sign up (free account)
3. Copy your authtoken from: https://dashboard.ngrok.com/get-started/your-authtoken

### Step 3: Authenticate

Open PowerShell in `d:\church` and run:
```powershell
.\ngrok.exe authtoken YOUR_AUTH_TOKEN
```

### Step 4: Start Your Server

Run your server:
```cmd
START_SERVER.bat
```

### Step 5: Start ngrok

In a new PowerShell window:
```powershell
cd d:\church
.\ngrok.exe http 5000
```

### Step 6: Get Your Public URL

ngrok will show you a URL like:
```
https://abc123.ngrok-free.app
```

**This is your public URL!** Anyone can access it.

---

## Option 2: localtunnel (Simpler, No Signup)

### Step 1: Install

```powershell
npm install -g localtunnel
```

### Step 2: Start Your Server

```cmd
START_SERVER.bat
```

### Step 3: Expose to Internet

```powershell
lt --port 5000
```

You'll get a URL like:
```
https://random-name-123.loca.lt
```

---

## 📱 Update Your APK

Once you have your public URL:

1. Edit `d:\church\capacitor.config.json`:
   ```json
   {
     "server": {
       "url": "https://abc123.ngrok-free.app",
       "cleartext": false
     }
   }
   ```

2. Rebuild APK:
   ```cmd
   build_apk_now.bat
   ```

---

## ⚠️ Important Notes

### ngrok Free Tier
- ✅ HTTPS included
- ✅ Stable URL (changes on restart)
- ✅ No bandwidth limits
- ⚠️ URL changes when you restart ngrok
- ⚠️ 40 connections/minute limit

### localtunnel Free Tier
- ✅ Completely free
- ✅ No signup needed
- ⚠️ URL changes every time
- ⚠️ Less stable than ngrok

### Your PC Must Stay On
- 🖥️ Your PC must be running 24/7
- 🖥️ Server must be running
- 🖥️ ngrok/localtunnel must be running
- 🖥️ Internet connection must be stable

---

## 🔧 Automation Script

I'll create a script that starts both server and ngrok automatically!
