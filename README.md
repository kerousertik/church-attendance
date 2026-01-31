# Church Attendance App

A professional church attendance tracking application with a native Material Design Android app.

## Features

- ✅ Take attendance by servant, grade, and gender
- ✅ Track consecutive absences with alert system
- ✅ Add notes for students
- ✅ View attendance history
- ✅ Export to Excel
- ✅ Native Android app with Material Design
- ✅ Dark glassmorphism UI
- ✅ Admin mode for management

## Tech Stack

- **Backend:** Flask, SQLite, Pandas
- **Frontend:** HTML, CSS, JavaScript, Material Icons
- **Android:** Capacitor, WebView
- **Server:** Waitress (production)

## Quick Start

### Local Development

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Run the server:
   ```bash
   python server.py
   ```

3. Open browser: `http://localhost:5000`

### Cloud Deployment

See [DEPLOY_TO_CLOUD.md](DEPLOY_TO_CLOUD.md) for detailed instructions.

**Quick deploy to Render.com:**
1. Push to GitHub using `PUSH_TO_GITHUB.bat`
2. Connect to Render.com
3. Deploy automatically!

## Android APK

The Android APK is built using Capacitor and includes:
- Native Material Design UI
- Bottom navigation
- Bottom sheets for modals
- Haptic feedback
- Splash screen with cross logo

**Build APK:**
```cmd
build_apk_now.bat
```

## Project Structure

```
church/
├── app.py                  # Flask application
├── database.py             # Database operations
├── server.py               # Production server
├── requirements.txt        # Python dependencies
├── templates/
│   └── index.html         # Native UI
├── static/
│   ├── style.css          # Material Design styles
│   ├── app.js             # Frontend logic
│   └── app-icon.png       # App icon
└── android/               # Capacitor Android project
```

## License

Private - Church Use Only

## Support

For issues or questions, contact the development team.
