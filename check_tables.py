import sqlite3
conn = sqlite3.connect('attendance.db')
c = conn.cursor()
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [row[0] for row in c.fetchall()]
print("Tables:", tables)
if 'users' in tables:
    c.execute("SELECT * FROM users")
    print("Users:", c.fetchall())
else:
    print("NO users table found - this is the login bug!")
conn.close()
