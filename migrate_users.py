"""
One-time migration: creates the users table and seeds default users in the existing DB.
"""
import sys
sys.path.insert(0, '.')
import database as db

print("Running database migrations...")
db.init_db()
print("✅ All tables ensured.")

users = db.get_all_users()
print(f"\nCurrent users in database ({len(users)}):")
for u in users:
    print(f"  id={u['id']}  username={u['username']}  role={u['role']}")

print("\n✅ Migration complete!")
print("Default credentials:")
print("  Admin:  username=admin    password=admin123")
print("  User:   username=user     password=user123")
