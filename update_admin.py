import sqlite3
import hashlib

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

DB_FILE = "attendance.db"
NEW_USERNAME = "STJOHN"
NEW_PASSWORD = "Pray#1"

conn = sqlite3.connect(DB_FILE)
cursor = conn.cursor()

# 1. Update the existing 'admin' user to the new username and password
hashed_pw = hash_password(NEW_PASSWORD)

# Check if 'STJOHN' already exists
cursor.execute("SELECT id FROM users WHERE username = ?", (NEW_USERNAME,))
existing = cursor.fetchone()

if existing:
    cursor.execute("UPDATE users SET password = ?, role = 'admin' WHERE id = ?", (hashed_pw, existing[0]))
    print(f"Updated existing user '{NEW_USERNAME}' password and ensured admin role.")
else:
    # Check if there is an old 'admin' user to rename
    cursor.execute("SELECT id FROM users WHERE username = 'admin'")
    old_admin = cursor.fetchone()
    if old_admin:
        cursor.execute("UPDATE users SET username = ?, password = ? WHERE id = ?", (NEW_USERNAME, hashed_pw, old_admin[0]))
        print(f"Renamed 'admin' user to '{NEW_USERNAME}' and updated password.")
    else:
        # If neither exists, create it
        cursor.execute("INSERT INTO users (username, password, role) VALUES (?, ?, 'admin')", (NEW_USERNAME, hashed_pw))
        print(f"Created new admin user '{NEW_USERNAME}'.")

conn.commit()
conn.close()
print(f"\n✅ Admin login is now:\n   Username: {NEW_USERNAME}\n   Password: {NEW_PASSWORD}")
