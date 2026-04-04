"""
Patch database.py to add servant_reports table and all related functions.
Run once then delete.
"""

INSERTION_AFTER = b'    conn.commit()\r\n    conn.close()\r\n\r\ndef check_user'

NEW_CODE = b'''
# ==================== SERVANT REPORTS ====================

def submit_servant_report(servant_username: str, report_type: str, date: str,
                           total: int, present: int, absent: int, notes: str = '') -> int:
    """Log a servant attendance or eftikad submission."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    # Ensure table exists
    cursor.execute(\'\'\'
        CREATE TABLE IF NOT EXISTS servant_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            servant_username TEXT NOT NULL,
            report_type TEXT NOT NULL DEFAULT \'attendance\',
            date TEXT NOT NULL,
            total_count INTEGER DEFAULT 0,
            present_count INTEGER DEFAULT 0,
            absent_count INTEGER DEFAULT 0,
            notes TEXT DEFAULT \'\',
            submitted_at TEXT NOT NULL,
            is_read INTEGER NOT NULL DEFAULT 0
        )
    \'\'\')
    submitted_at = datetime.now().strftime(\'%Y-%m-%d %H:%M:%S\')
    cursor.execute(\'\'\'
        INSERT INTO servant_reports
            (servant_username, report_type, date, total_count, present_count, absent_count, notes, submitted_at, is_read)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    \'\'\', (servant_username, report_type, date, total, present, absent, notes, submitted_at))
    report_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return report_id


def get_servant_reports(date_filter: str = None, type_filter: str = None) -> List[Dict]:
    """Get all servant reports, optionally filtered by date or type."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    # Ensure table exists
    cursor.execute(\'\'\'
        CREATE TABLE IF NOT EXISTS servant_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            servant_username TEXT NOT NULL,
            report_type TEXT NOT NULL DEFAULT \'attendance\',
            date TEXT NOT NULL,
            total_count INTEGER DEFAULT 0,
            present_count INTEGER DEFAULT 0,
            absent_count INTEGER DEFAULT 0,
            notes TEXT DEFAULT \'\',
            submitted_at TEXT NOT NULL,
            is_read INTEGER NOT NULL DEFAULT 0
        )
    \'\'\')
    query = "SELECT * FROM servant_reports WHERE 1=1"
    params = []
    if date_filter:
        query += " AND date = ?"
        params.append(date_filter)
    if type_filter:
        query += " AND report_type = ?"
        params.append(type_filter)
    query += " ORDER BY submitted_at DESC"
    cursor.execute(query, params)
    reports = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return reports


def delete_servant_report(report_id: int) -> bool:
    """Delete a servant report by ID."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM servant_reports WHERE id = ?", (report_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def mark_reports_read() -> None:
    """Mark all reports as read."""
    conn = sqlite3.connect(DB_FILE)
    conn.execute("UPDATE servant_reports SET is_read = 1 WHERE is_read = 0")
    conn.commit()
    conn.close()


def get_unread_report_count() -> int:
    """Get count of unread servant reports."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COUNT(*) FROM servant_reports WHERE is_read = 0")
        count = cursor.fetchone()[0]
    except:
        count = 0
    conn.close()
    return count


'''

with open('database.py', 'rb') as f:
    content = f.read()

# Find & split at right location
split_marker = b'    conn.commit()\r\n    conn.close()\r\n\r\ndef check_user'
idx = content.find(split_marker)

if idx == -1:
    # Try LF only
    split_marker = b'    conn.commit()\n    conn.close()\n\ndef check_user'
    idx = content.find(split_marker)

if idx == -1:
    print("ERROR: Could not find insertion point!")
else:
    insert_at = idx + len(b'    conn.commit()\r\n    conn.close()\r\n')
    new_content = content[:insert_at] + NEW_CODE.replace(b'\n', b'\r\n') + content[insert_at:]
    with open('database.py', 'wb') as f:
        f.write(new_content)
    print(f"SUCCESS: Patched database.py at position {insert_at}")
    print("Verifying...")
    import database as db
    print("Import OK")
