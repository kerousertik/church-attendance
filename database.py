import sqlite3
import pandas as pd
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from werkzeug.security import check_password_hash, generate_password_hash

DB_FILE = "attendance.db"
CLASS_GRADE_MAP = {
    'High School': [9, 10, 11, 12],
    'Middle School': [6, 7, 8],
    '4th Grade': [4],
    '5th Grade': [5],
}

def class_grade_values(class_name: str) -> List[int]:
    """Return grade numbers commonly represented by a class name."""
    return CLASS_GRADE_MAP.get(class_name or '', [])

def grade_to_class_name(grade) -> str:
    """Map a student grade value to the class bucket used by the app."""
    grade_text = str(grade or '').strip()
    if grade_text.upper() in ('KG', 'K'):
        return 'KG'
    try:
        grade_num = int(float(grade_text))
    except (TypeError, ValueError):
        return ''
    if grade_num == 4:
        return '4th Grade'
    if grade_num == 5:
        return '5th Grade'
    if 6 <= grade_num <= 8:
        return 'Middle School'
    if 9 <= grade_num <= 12:
        return 'High School'
    ordinal_labels = {1: '1st Grade', 2: '2nd Grade', 3: '3rd Grade'}
    return ordinal_labels.get(grade_num, f'{grade_num}th Grade')

def normalize_grade_value(grade):
    """Keep KG as text and numeric grades as integers."""
    grade_text = str(grade or '').strip()
    if grade_text.upper() in ('KG', 'K'):
        return 'KG'
    try:
        return int(float(grade_text))
    except (TypeError, ValueError):
        return None


def normalize_gender_value(gender):
    """Normalize student/section gender values to Boy/Girl when possible."""
    text = str(gender or '').strip()
    lowered = text.lower()
    if lowered in ('boy', 'boys', 'male', 'm', 'b'):
        return 'Boy'
    if lowered in ('girl', 'girls', 'female', 'f', 'g'):
        return 'Girl'
    return text


def hash_password(password: str) -> str:
    """Hash a password using Werkzeug's salted password hasher."""
    return generate_password_hash(password)


def verify_password(stored_password: str, password: str) -> bool:
    """Verify modern hashes plus legacy SHA-256/plain-text passwords."""
    if not stored_password:
        return False
    if stored_password.startswith(('pbkdf2:', 'scrypt:')):
        return check_password_hash(stored_password, password)
    legacy_sha = hashlib.sha256(password.encode()).hexdigest()
    return stored_password == legacy_sha or stored_password == password


def normalize_assigned_grades(grades) -> str:
    """Store grade assignments as a comma-separated list."""
    if grades is None:
        return ''
    raw = grades.replace(';', ',').split(',') if isinstance(grades, str) else list(grades)
    clean = []
    for grade in raw:
        text = str(grade).replace('.0', '').strip()
        if text and text not in clean:
            clean.append(text)
    return ','.join(clean)


def normalize_assigned_sections(sections) -> str:
    """Store section assignments as Boy/Girl; empty means both for legacy users."""
    if sections is None:
        return ''
    raw = sections.replace(';', ',').split(',') if isinstance(sections, str) else list(sections)
    clean = []
    for section in raw:
        text = str(section or '').strip()
        lowered = text.lower()
        if lowered in ('all', 'both', 'boys & girls', 'boy,girl', 'girl,boy'):
            for value in ('Boy', 'Girl'):
                if value not in clean:
                    clean.append(value)
            continue
        normalized = normalize_gender_value(text)
        if normalized in ('Boy', 'Girl') and normalized not in clean:
            clean.append(normalized)
    return ','.join(clean)


def init_db():
    """Initialize the database with required tables. Always ensures tables exist."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # Students table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            grade INTEGER,
            gender TEXT,
            servant TEXT,
            phone TEXT,
            parent_phone TEXT,
            dob TEXT,
            address TEXT,
            comments TEXT,
            pictures TEXT,
            last_call TEXT
        )
    ''')

    # Attendance table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            status TEXT NOT NULL,
            UNIQUE(student_id, date),
            FOREIGN KEY (student_id) REFERENCES students(id)
        )
    ''')

    # Servants table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS servants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            phone TEXT
        )
    ''')

    # Notes table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            note_text TEXT NOT NULL,
            created_at TEXT NOT NULL,
            created_by TEXT,
            FOREIGN KEY (student_id) REFERENCES students(id)
        )
    ''')

    # Users table for authentication
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT \'user\',
            class_name TEXT DEFAULT \'all\',
            created_at TEXT NOT NULL DEFAULT (datetime(\'now\'))
        )
    ''')

    # Add created_at column to users table if it doesn't exist (migration)
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))")
    except:
        pass  # Column already exists

    try:
        cursor.execute("ALTER TABLE users ADD COLUMN class_name TEXT DEFAULT 'all'")
    except:
        pass  # Column already exists

    try:
        cursor.execute("ALTER TABLE users ADD COLUMN assigned_grades TEXT DEFAULT ''")
    except:
        pass  # Column already exists

    try:
        cursor.execute("ALTER TABLE users ADD COLUMN assigned_sections TEXT DEFAULT ''")
    except:
        pass  # Column already exists

    # Migrate students table
    try:
        cursor.execute("ALTER TABLE students ADD COLUMN points INTEGER DEFAULT 0")
        cursor.execute("ALTER TABLE students ADD COLUMN class_name TEXT")
    except:
        pass
        
    # Migrate servants table
    try:
        cursor.execute("ALTER TABLE servants ADD COLUMN class_name TEXT")
    except:
        pass

    # Migrate attendance table
    try:
        cursor.execute("ALTER TABLE attendance ADD COLUMN liturgy INTEGER DEFAULT 0")
        cursor.execute("ALTER TABLE attendance ADD COLUMN tonia INTEGER DEFAULT 0")
        cursor.execute("ALTER TABLE attendance ADD COLUMN confession INTEGER DEFAULT 0")
        cursor.execute("ALTER TABLE attendance ADD COLUMN bible_prayer INTEGER DEFAULT 0")
        cursor.execute("ALTER TABLE attendance ADD COLUMN questions INTEGER DEFAULT 0")
        cursor.execute("ALTER TABLE attendance ADD COLUMN points_earned INTEGER DEFAULT 0")
    except:
        pass

    # Points History table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS points_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            points_change INTEGER NOT NULL,
            reason TEXT,
            date TEXT NOT NULL,
            FOREIGN KEY (student_id) REFERENCES students(id)
        )
    ''')

    # Announcements table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            attachment_path TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            created_by TEXT
        )
    ''')

    # Bible tracking table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS bible_tracking (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            week_start_date TEXT NOT NULL,
            days_read INTEGER DEFAULT 0,
            FOREIGN KEY (student_id) REFERENCES students(id)
        )
    ''')

    # Seed default admin if no users exist
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        cursor.execute(
            "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
            ('STJOHN', hash_password('Pray#1'), 'admin')
        )
        cursor.execute(
            "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
            ('user', hash_password('user123'), 'user')
        )

    cursor.execute(
        "UPDATE users SET role = 'admin', class_name = 'all', assigned_grades = '', assigned_sections = '' WHERE username = 'STJOHN'"
    )
    if cursor.rowcount == 0:
        cursor.execute(
            "INSERT INTO users (username, password, role, class_name, assigned_grades, assigned_sections) VALUES (?, ?, ?, ?, ?, ?)",
            ('STJOHN', hash_password('Pray#1'), 'admin', 'all', '', '')
        )

    conn.commit()
    conn.close()

# ==================== SERVANT REPORTS ====================

def submit_servant_report(servant_username: str, report_type: str, date: str,
                           total: int, present: int, absent: int, notes: str = '') -> int:
    """Log a servant attendance or eftikad submission."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    # Ensure table exists
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS servant_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            servant_username TEXT NOT NULL,
            report_type TEXT NOT NULL DEFAULT 'attendance',
            date TEXT NOT NULL,
            total_count INTEGER DEFAULT 0,
            present_count INTEGER DEFAULT 0,
            absent_count INTEGER DEFAULT 0,
            notes TEXT DEFAULT '',
            submitted_at TEXT NOT NULL,
            is_read INTEGER NOT NULL DEFAULT 0
        )
    ''')
    submitted_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    cursor.execute('''
        INSERT INTO servant_reports
            (servant_username, report_type, date, total_count, present_count, absent_count, notes, submitted_at, is_read)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    ''', (servant_username, report_type, date, total, present, absent, notes, submitted_at))
    report_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return report_id


def get_servant_reports(date_filter: str = None, type_filter: str = None,
                        date_from: str = None, date_to: str = None) -> List[Dict]:
    """Get all servant reports, optionally filtered by exact date, date range, or type."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    # Ensure table exists
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS servant_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            servant_username TEXT NOT NULL,
            report_type TEXT NOT NULL DEFAULT 'attendance',
            date TEXT NOT NULL,
            total_count INTEGER DEFAULT 0,
            present_count INTEGER DEFAULT 0,
            absent_count INTEGER DEFAULT 0,
            notes TEXT DEFAULT '',
            submitted_at TEXT NOT NULL,
            is_read INTEGER NOT NULL DEFAULT 0
        )
    ''')
    query = "SELECT * FROM servant_reports WHERE 1=1"
    params = []
    if date_filter:
        query += " AND date = ?"
        params.append(date_filter)
    else:
        if date_from:
            query += " AND date >= ?"
            params.append(date_from)
        if date_to:
            query += " AND date <= ?"
            params.append(date_to)
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



def check_user(username: str, password: str) -> Optional[Dict]:
    """Check if user credentials are valid and upgrade legacy password hashes."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute(
        "SELECT id, username, password, role, COALESCE(class_name, 'all') as class_name, COALESCE(assigned_grades, '') as assigned_grades, COALESCE(assigned_sections, '') as assigned_sections FROM users WHERE username = ?",
        (username,)
    )
    user = cursor.fetchone()

    if not user or not verify_password(user['password'], password):
        conn.close()
        return None

    if not user['password'].startswith(('pbkdf2:', 'scrypt:')):
        cursor.execute(
            "UPDATE users SET password = ? WHERE username = ?",
            (hash_password(password), username)
        )
        conn.commit()

    result = dict(user)
    result.pop('password', None)
    conn.close()
    return result


def get_user_by_username(username: str) -> Optional[Dict]:
    """Get the current non-password user record by username."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, username, role, COALESCE(class_name, 'all') as class_name, COALESCE(assigned_grades, '') as assigned_grades, COALESCE(assigned_sections, '') as assigned_sections FROM users WHERE username = ?",
        (username,)
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_all_users() -> List[Dict]:
    """Get all users (without passwords)."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, role, COALESCE(class_name, 'all') as class_name, COALESCE(assigned_grades, '') as assigned_grades, COALESCE(assigned_sections, '') as assigned_sections, created_at FROM users ORDER BY role, username")
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return users


def add_user(username: str, password: str, role: str, class_name: str = 'all', assigned_grades=None, assigned_sections=None) -> Dict:
    """Add a new user. Returns success/error dict."""
    if role not in ('admin', 'sub_admin', 'user'):
        return {'success': False, 'error': 'Invalid role. Must be admin, sub_admin, or user.'}
    if not username or not password:
        return {'success': False, 'error': 'Username and password are required.'}
    allowed_classes = ('all', 'High School', 'Middle School', '4th Grade', '5th Grade', 'KG')
    class_name = class_name or 'all'
    assigned_grades_text = normalize_assigned_grades(assigned_grades)
    assigned_sections_text = normalize_assigned_sections(assigned_sections)
    if class_name not in allowed_classes:
        return {'success': False, 'error': 'Invalid class assignment.'}
    if role == 'user' and not assigned_grades_text:
        return {'success': False, 'error': 'User/Servant accounts must be assigned to at least one grade.'}
    if role == 'sub_admin' and class_name == 'all':
        return {'success': False, 'error': 'Sub-admin accounts must be assigned to a class.'}

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO users (username, password, role, class_name, assigned_grades, assigned_sections) VALUES (?, ?, ?, ?, ?, ?)",
            (username.strip(), hash_password(password), role, class_name, assigned_grades_text, assigned_sections_text)
        )
        conn.commit()
        user_id = cursor.lastrowid
        conn.close()
        return {'success': True, 'user_id': user_id, 'class_name': class_name, 'assigned_grades': assigned_grades_text, 'assigned_sections': assigned_sections_text}
    except sqlite3.IntegrityError:
        conn.close()
        return {'success': False, 'error': f'Username "{username}" already exists.'}
    except Exception as e:
        conn.close()
        return {'success': False, 'error': str(e)}


def delete_user(user_id: int) -> bool:
    """Delete a user by ID. Cannot delete if it's the last admin."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # Check the user being deleted
    cursor.execute("SELECT role FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False

    cursor.execute("SELECT username FROM users WHERE id = ?", (user_id,))
    user_row = cursor.fetchone()
    if user_row and str(user_row[0]).upper() == 'STJOHN':
        conn.close()
        return False

    if row[0] == 'admin':
        # Make sure there's at least one other admin
        cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'admin' AND id != ?", (user_id,))
        if cursor.fetchone()[0] == 0:
            conn.close()
            return False  # Cannot delete the last admin

    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return True


def update_user_password(user_id: int, new_password: str) -> bool:
    """Update a user's password."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET password = ? WHERE id = ?",
        (hash_password(new_password), user_id)
    )
    changed = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return changed


def update_user_class(user_id: int, class_name: str) -> bool:
    """Update a user's assigned class."""
    allowed_classes = ('all', 'High School', 'Middle School', '4th Grade', '5th Grade', 'KG')
    if class_name not in allowed_classes:
        return False

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT role FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False
    if row[0] == 'user' and class_name == 'all':
        conn.close()
        return False

    cursor.execute(
        "UPDATE users SET class_name = ? WHERE id = ?",
        (class_name, user_id)
    )
    changed = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return changed


def update_user_grades(user_id: int, assigned_grades) -> bool:
    """Update a user's assigned grade list."""
    grades_text = normalize_assigned_grades(assigned_grades)
    if not grades_text:
        return False

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT role FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False

    cursor.execute(
        "UPDATE users SET assigned_grades = ? WHERE id = ?",
        (grades_text, user_id)
    )
    changed = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return changed


def update_user_sections(user_id: int, assigned_sections) -> bool:
    """Update a user's assigned section list. Empty means both."""
    sections_text = normalize_assigned_sections(assigned_sections)

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT role FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False

    cursor.execute(
        "UPDATE users SET assigned_sections = ? WHERE id = ?",
        (sections_text, user_id)
    )
    changed = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return changed

def import_from_excel(excel_path: str):
    """Import student data from Excel file."""
    conn = sqlite3.connect(DB_FILE)
    
    # Read the "All Kids" sheet
    df = pd.read_excel(excel_path, sheet_name='All Kids')
    
    # Clean up the data
    df = df.dropna(subset=['Name'])  # Remove rows without names
    
    # Prepare data for insertion
    for _, row in df.iterrows():
        grade_value = normalize_grade_value(row.get('Grade'))
        class_name = str(row.get('Class', '')).strip() if pd.notna(row.get('Class')) else ''
        if not class_name:
            class_name = grade_to_class_name(grade_value)
        conn.execute('''
            INSERT OR IGNORE INTO students 
            (name, grade, gender, servant, phone, parent_phone, dob, address, comments, pictures, last_call, class_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            str(row.get('Name', '')),
            grade_value,
            str(row.get('Gen', '')),
            str(row.get('Servant', '')),
            str(row.get('Phone number', '')) if pd.notna(row.get('Phone number')) else '',
            str(row.get('Parent Phone', '')) if pd.notna(row.get('Parent Phone')) else '',
            str(row.get('DOB', '')) if pd.notna(row.get('DOB')) else '',
            str(row.get('Address ', '')) if pd.notna(row.get('Address ')) else '',
            str(row.get('Comments', '')) if pd.notna(row.get('Comments')) else '',
            str(row.get('Pictures', '')) if pd.notna(row.get('Pictures')) else '',
            str(row.get('Last Call/Visitation ', '')) if pd.notna(row.get('Last Call/Visitation ')) else '',
            class_name
        ))
    
    conn.commit()
    conn.close()

def get_consecutive_absences(student_id: int) -> int:
    """Calculate consecutive absences from most recent attendance records."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Get all attendance records for this student, ordered by date descending
    cursor.execute('''
        SELECT status FROM attendance 
        WHERE student_id = ? 
        ORDER BY date DESC
    ''', (student_id,))
    
    records = cursor.fetchall()
    conn.close()
    
    # Count consecutive absences from the most recent record
    consecutive = 0
    for record in records:
        if record[0] == 'absent':
            consecutive += 1
        else:
            break
    
    return consecutive

def get_alert_level(student_id: int) -> str:
    """Get alert level based on consecutive absences."""
    absences = get_consecutive_absences(student_id)
    
    if absences >= 4:
        return 'red'
    elif absences >= 2:
        return 'yellow'
    else:
        return 'none'

def get_students(servant: Optional[str] = None, grade: Optional[int] = None, gender: Optional[str] = None) -> List[Dict]:
    """Get students with optional filters."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    query = "SELECT * FROM students WHERE 1=1"
    params = []
    
    if servant:
        query += " AND (servant = ? OR class_name = ?"
        params.extend([servant, servant])
        class_grades = class_grade_values(servant)
        if class_grades:
            placeholders = ','.join(['?' for _ in class_grades])
            query += f" OR grade IN ({placeholders})"
            params.extend(class_grades)
        query += ")"
    
    if grade is not None:
        query += " AND grade = ?"
        params.append(grade)
    
    if gender:
        # Normalize gender: frontend sends M/F, DB may store Boy/Girl or M/F
        gender_variants = [gender]
        g_lower = gender.lower()
        if g_lower in ('m', 'male', 'boy', 'boys'):
            gender_variants = ['M', 'Boy', 'Boys', 'Male', 'male', 'boy']
        elif g_lower in ('f', 'female', 'girl', 'girls'):
            gender_variants = ['F', 'Girl', 'Girls', 'Female', 'female', 'girl']
        placeholders = ','.join(['?' for _ in gender_variants])
        query += f" AND gender IN ({placeholders})"
        params.extend(gender_variants)
    
    cursor.execute(query, params)
    
    students = []
    for row in cursor.fetchall():
        student = dict(row)
        # Normalize gender to M/F for frontend consistency
        g = (student.get('gender') or '').lower()
        if g in ('boy', 'boys', 'male'):
            student['gender'] = 'M'
        elif g in ('girl', 'girls', 'female'):
            student['gender'] = 'F'
        student['alert_level'] = get_alert_level(student['id'])
        student['consecutive_absences'] = get_consecutive_absences(student['id'])
        students.append(student)
    
    conn.close()
    return students

def get_servants() -> List[str]:
    """Get list of unique servants from both students and servants tables."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Get servants from students table
    cursor.execute("SELECT DISTINCT servant FROM students WHERE servant != ''")
    student_servants = set(row[0] for row in cursor.fetchall())
    
    # Get servants from servants table (may not exist)
    try:
        cursor.execute("SELECT name FROM servants")
        standalone_servants = set(row[0] for row in cursor.fetchall())
    except:
        standalone_servants = set()
    
    # Combine and sort
    all_servants = sorted(student_servants | standalone_servants)
    
    conn.close()
    return all_servants

def add_servant(name: str, phone: str = ''):
    """Add a new servant to the servants table."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Create table if it doesn't exist
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS servants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            phone TEXT
        )
    ''')
    
    cursor.execute('''
        INSERT OR IGNORE INTO servants (name, phone)
        VALUES (?, ?)
    ''', (name, phone))
    
    conn.commit()
    conn.close()

def get_filters(servant: str) -> Dict:
    """Get available grades and genders for a specific servant."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    cursor.execute("SELECT DISTINCT grade FROM students WHERE servant = ? AND grade IS NOT NULL ORDER BY grade", (servant,))
    grades = [row[0] for row in cursor.fetchall()]
    
    cursor.execute("SELECT DISTINCT gender FROM students WHERE servant = ? AND gender != '' ORDER BY gender", (servant,))
    genders = [row[0] for row in cursor.fetchall()]
    
    conn.close()
    return {'grades': grades, 'genders': genders}

def save_attendance(student_id: int, date: str, status: str):
    """Save or update attendance record."""
    conn = sqlite3.connect(DB_FILE)
    
    conn.execute('''
        INSERT OR REPLACE INTO attendance (student_id, date, status)
        VALUES (?, ?, ?)
    ''', (student_id, date, status))
    
    conn.commit()
    conn.close()

def get_attendance_history(student_id: int) -> List[Dict]:
    """Get attendance history for a student."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT date, status FROM attendance 
        WHERE student_id = ? 
        ORDER BY date DESC
        LIMIT 20
    ''', (student_id,))
    
    history = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return history

def add_student(name: str, grade: int, gender: str, servant: str, **kwargs) -> int:
    """Add a new student."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO students 
        (name, grade, gender, servant, phone, parent_phone, dob, address, comments, pictures, last_call)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        name, grade, gender, servant,
        kwargs.get('phone', ''),
        kwargs.get('parent_phone', ''),
        kwargs.get('dob', ''),
        kwargs.get('address', ''),
        kwargs.get('comments', ''),
        kwargs.get('pictures', ''),
        kwargs.get('last_call', '')
    ))
    
    student_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return student_id


def find_or_create_student_from_record(record: Dict, servant_username: str = '') -> int:
    """Resolve a visible app student to a server student row by identity."""
    name = str(record.get('student_name') or record.get('name') or '').strip()
    if not name:
        raise ValueError('student_name required')

    grade_value = normalize_grade_value(record.get('grade'))
    if grade_value is None:
        grade_value = str(record.get('grade') or '').replace('.0', '').strip()
    gender = normalize_gender_value(record.get('gender'))
    servant = str(record.get('servant') or servant_username or '').strip()
    phone = str(record.get('phone') or '').strip()
    parent_phone = str(record.get('parent_phone') or '').strip()
    class_name = grade_to_class_name(grade_value)

    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT id, grade, gender FROM students WHERE lower(name) = lower(?)", (name,))
    for row in cursor.fetchall():
        same_grade = normalize_grade_value(row['grade']) == normalize_grade_value(grade_value)
        same_gender = not gender or normalize_gender_value(row['gender']) == gender
        if same_grade and same_gender:
            conn.close()
            return row['id']

    cursor.execute('''
        INSERT INTO students
        (name, grade, gender, servant, phone, parent_phone, class_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (name, grade_value, gender, servant, phone, parent_phone, class_name))
    student_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return student_id


def update_student(student_id: int, **kwargs):
    """Update student information."""
    conn = sqlite3.connect(DB_FILE)
    
    fields = []
    values = []
    
    for key, value in kwargs.items():
        if key in ['name', 'grade', 'gender', 'servant', 'phone', 'parent_phone', 'dob', 'address', 'comments', 'pictures', 'last_call']:
            fields.append(f"{key} = ?")
            values.append(value)
    
    if fields:
        query = f"UPDATE students SET {', '.join(fields)} WHERE id = ?"
        values.append(student_id)
        conn.execute(query, values)
        conn.commit()
    
    conn.close()

def delete_student(student_id: int):
    """Delete a student and their attendance records."""
    conn = sqlite3.connect(DB_FILE)
    
    conn.execute("DELETE FROM attendance WHERE student_id = ?", (student_id,))
    conn.execute("DELETE FROM students WHERE id = ?", (student_id,))
    
    conn.commit()
    conn.close()

def get_analytics() -> Dict:
    """Get analytics data for dashboard."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Total students
    cursor.execute("SELECT COUNT(*) FROM students")
    total_students = cursor.fetchone()[0]
    
    # Get all students for alert counting
    cursor.execute("SELECT id FROM students")
    student_ids = [row[0] for row in cursor.fetchall()]
    
    yellow_alerts = 0
    red_alerts = 0
    
    for student_id in student_ids:
        alert = get_alert_level(student_id)
        if alert == 'yellow':
            yellow_alerts += 1
        elif alert == 'red':
            red_alerts += 1
    
    # Get recent attendance rate (last 4 weeks)
    four_weeks_ago = (datetime.now() - timedelta(days=28)).strftime('%Y-%m-%d')
    cursor.execute('''
        SELECT 
            SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present,
            COUNT(*) as total
        FROM attendance
        WHERE date >= ?
    ''', (four_weeks_ago,))
    
    result = cursor.fetchone()
    attendance_rate = (result[0] / result[1] * 100) if result[1] > 0 else 0
    
    conn.close()
    
    return {
        'total_students': total_students,
        'yellow_alerts': yellow_alerts,
        'red_alerts': red_alerts,
        'attendance_rate': round(attendance_rate, 1)
    }

def export_to_excel(output_path: str):
    """Export current data to Excel."""
    conn = sqlite3.connect(DB_FILE)
    
    # Get students data
    students_df = pd.read_sql_query("SELECT * FROM students", conn)
    
    # Get recent attendance data
    attendance_df = pd.read_sql_query('''
        SELECT s.name, a.date, a.status 
        FROM attendance a
        JOIN students s ON a.student_id = s.id
        ORDER BY a.date DESC, s.name
    ''', conn)
    
    conn.close()
    
    # Write to Excel with multiple sheets
    with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
        students_df.to_excel(writer, sheet_name='Students', index=False)
        attendance_df.to_excel(writer, sheet_name='Attendance Records', index=False)

def add_note(student_id: int, note_text: str, created_by: str = '') -> int:
    """Add a note to a student."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Ensure notes table exists
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            note_text TEXT NOT NULL,
            created_at TEXT NOT NULL,
            created_by TEXT,
            FOREIGN KEY (student_id) REFERENCES students(id)
        )
    ''')
    
    created_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    cursor.execute('''
        INSERT INTO notes (student_id, note_text, created_at, created_by)
        VALUES (?, ?, ?, ?)
    ''', (student_id, note_text, created_at, created_by))
    
    note_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return note_id

def get_notes(student_id: int) -> List[Dict]:
    """Get all notes for a student."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Ensure notes table exists
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            note_text TEXT NOT NULL,
            created_at TEXT NOT NULL,
            created_by TEXT,
            FOREIGN KEY (student_id) REFERENCES students(id)
        )
    ''')
    
    cursor.execute('''
        SELECT * FROM notes 
        WHERE student_id = ? 
        ORDER BY created_at DESC
    ''', (student_id,))
    
    notes = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return notes

def get_student_details(student_id: int) -> Optional[Dict]:
    """Get full student details including attendance history and notes."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Get student info
    cursor.execute("SELECT * FROM students WHERE id = ?", (student_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return None
    
    student = dict(row)
    student['alert_level'] = get_alert_level(student_id)
    student['consecutive_absences'] = get_consecutive_absences(student_id)
    
    # Get attendance history
    cursor.execute('''
        SELECT date, status FROM attendance 
        WHERE student_id = ? 
        ORDER BY date DESC
        LIMIT 20
    ''', (student_id,))
    student['attendance_history'] = [dict(r) for r in cursor.fetchall()]
    
    # Get last attendance date
    cursor.execute('''
        SELECT date, status FROM attendance 
        WHERE student_id = ? 
        ORDER BY date DESC
        LIMIT 1
    ''', (student_id,))
    last_att = cursor.fetchone()
    student['last_attendance'] = dict(last_att) if last_att else None
    
    conn.close()
    
    # Get notes
    student['notes'] = get_notes(student_id)
    
    return student

def get_students_by_servant(servant: str) -> List[Dict]:
    """Get all students assigned to a specific servant."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM students WHERE servant = ? ORDER BY name", (servant,))
    
    students = []
    for row in cursor.fetchall():
        student = dict(row)
        # Normalize gender to M/F for frontend consistency
        g = (student.get('gender') or '').lower()
        if g in ('boy', 'boys', 'male'):
            student['gender'] = 'M'
        elif g in ('girl', 'girls', 'female'):
            student['gender'] = 'F'
        student['alert_level'] = get_alert_level(student['id'])
        student['consecutive_absences'] = get_consecutive_absences(student['id'])
        students.append(student)
    
    conn.close()
    return students

def import_from_excel_upload(excel_path: str) -> Dict:
    """Import student data from an uploaded Excel file."""
    conn = sqlite3.connect(DB_FILE)
    
    try:
        # Read the "All Kids" sheet
        df = pd.read_excel(excel_path, sheet_name='All Kids')
        
        # Clean up the data
        df = df.dropna(subset=['Name'])  # Remove rows without names
        
        added = 0
        updated = 0
        
        # Prepare data for insertion
        for _, row in df.iterrows():
            name = str(row.get('Name', ''))
            
            # Check if student exists
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM students WHERE name = ?", (name,))
            existing = cursor.fetchone()
            
            if existing:
                # Update existing
                conn.execute('''
                    UPDATE students SET
                    grade = ?, gender = ?, servant = ?, phone = ?, parent_phone = ?,
                    dob = ?, address = ?, comments = ?, pictures = ?, last_call = ?
                    WHERE name = ?
                ''', (
                    int(row['Grade']) if pd.notna(row.get('Grade')) else None,
                    str(row.get('Gen', '')),
                    str(row.get('Servant', '')),
                    str(row.get('Phone number', '')) if pd.notna(row.get('Phone number')) else '',
                    str(row.get('Parent Phone', '')) if pd.notna(row.get('Parent Phone')) else '',
                    str(row.get('DOB', '')) if pd.notna(row.get('DOB')) else '',
                    str(row.get('Address ', '')) if pd.notna(row.get('Address ')) else '',
                    str(row.get('Comments', '')) if pd.notna(row.get('Comments')) else '',
                    str(row.get('Pictures', '')) if pd.notna(row.get('Pictures')) else '',
                    str(row.get('Last Call/Visitation ', '')) if pd.notna(row.get('Last Call/Visitation ')) else '',
                    name
                ))
                updated += 1
            else:
                # Insert new
                conn.execute('''
                    INSERT INTO students 
                    (name, grade, gender, servant, phone, parent_phone, dob, address, comments, pictures, last_call)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    name,
                    int(row['Grade']) if pd.notna(row.get('Grade')) else None,
                    str(row.get('Gen', '')),
                    str(row.get('Servant', '')),
                    str(row.get('Phone number', '')) if pd.notna(row.get('Phone number')) else '',
                    str(row.get('Parent Phone', '')) if pd.notna(row.get('Parent Phone')) else '',
                    str(row.get('DOB', '')) if pd.notna(row.get('DOB')) else '',
                    str(row.get('Address ', '')) if pd.notna(row.get('Address ')) else '',
                    str(row.get('Comments', '')) if pd.notna(row.get('Comments')) else '',
                    str(row.get('Pictures', '')) if pd.notna(row.get('Pictures')) else '',
                    str(row.get('Last Call/Visitation ', '')) if pd.notna(row.get('Last Call/Visitation ')) else ''
                ))
                added += 1
        
        conn.commit()
        conn.close()
        
        return {'success': True, 'added': added, 'updated': updated}
    except Exception as e:
        conn.close()
        return {'success': False, 'error': str(e)}


# ==================== POINTS ENGINE ====================

def calculate_and_award_points(student_id: int, date: str, is_present: int, liturgy: int,
                                tonia: int, confession: int, bible_prayer: int, questions: int) -> int:
    """Calculate points earned for this attendance record. Returns total points earned."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    total_points = 0
    reasons = []

    if tonia:
        total_points += 1
        reasons.append('+1 Tonia/Asharp')

    if questions and questions > 0:
        total_points += int(questions)
        reasons.append(f'+{questions} Questions')

    if confession:
        month_start = date[:7] + '-01'
        cursor.execute('''SELECT SUM(points_change) FROM points_history
            WHERE student_id=? AND reason LIKE '%Confession%' AND date >= ? AND date <= ?''',
            (student_id, month_start, date))
        already = cursor.fetchone()[0] or 0
        if already == 0:
            total_points += 10
            reasons.append('+10 Confession')

    if is_present:
        cursor.execute('''SELECT date FROM attendance
            WHERE student_id=? AND date < ? AND status='present'
            ORDER BY date DESC LIMIT 3''', (student_id, date))
        recent = cursor.fetchall()
        streak = 1 + len(recent)
        if streak >= 4:
            cutoff = recent[-1][0] if recent else date
            cursor.execute('''SELECT COUNT(*) FROM points_history
                WHERE student_id=? AND reason LIKE '%Sunday School 4-week%' AND date >= ?''', (student_id, cutoff))
            if (cursor.fetchone()[0] or 0) == 0:
                total_points += 15
                reasons.append('+15 Sunday School 4-week streak')
        elif streak == 3:
            cutoff = recent[-1][0] if recent else date
            cursor.execute('''SELECT COUNT(*) FROM points_history
                WHERE student_id=? AND reason LIKE '%Sunday School 3-week%' AND date >= ?''', (student_id, cutoff))
            if (cursor.fetchone()[0] or 0) == 0:
                total_points += 10
                reasons.append('+10 Sunday School 3-week streak')

    if liturgy:
        cursor.execute('''SELECT date FROM attendance
            WHERE student_id=? AND date < ? AND liturgy=1
            ORDER BY date DESC LIMIT 3''', (student_id, date))
        recent_l = cursor.fetchall()
        l_streak = 1 + len(recent_l)
        if l_streak >= 4:
            cutoff = recent_l[-1][0] if recent_l else date
            cursor.execute('''SELECT COUNT(*) FROM points_history
                WHERE student_id=? AND reason LIKE '%Liturgy 4-week%' AND date >= ?''', (student_id, cutoff))
            if (cursor.fetchone()[0] or 0) == 0:
                total_points += 15
                reasons.append('+15 Liturgy 4-week streak')
        elif l_streak == 3:
            cutoff = recent_l[-1][0] if recent_l else date
            cursor.execute('''SELECT COUNT(*) FROM points_history
                WHERE student_id=? AND reason LIKE '%Liturgy 3-week%' AND date >= ?''', (student_id, cutoff))
            if (cursor.fetchone()[0] or 0) == 0:
                total_points += 10
                reasons.append('+10 Liturgy 3-week streak')

    if bible_prayer:
        d = datetime.strptime(date, '%Y-%m-%d')
        week_start = (d - timedelta(days=d.weekday())).strftime('%Y-%m-%d')
        cursor.execute('SELECT days_read FROM bible_tracking WHERE student_id=? AND week_start_date=?',
                       (student_id, week_start))
        row = cursor.fetchone()
        days = (row[0] if row else 0) + 1
        if row:
            cursor.execute('UPDATE bible_tracking SET days_read=? WHERE student_id=? AND week_start_date=?',
                           (days, student_id, week_start))
        else:
            cursor.execute('INSERT INTO bible_tracking (student_id, week_start_date, days_read) VALUES (?,?,?)',
                           (student_id, week_start, days))
        if days >= 7:
            cursor.execute('''SELECT COUNT(*) FROM points_history
                WHERE student_id=? AND reason LIKE '%Bible/Prayer weekly%' AND date >= ?''',
                (student_id, week_start))
            if (cursor.fetchone()[0] or 0) == 0:
                total_points += 15
                reasons.append('+15 Bible/Prayer weekly')

    if total_points > 0:
        reason_str = ', '.join(reasons)
        cursor.execute('INSERT INTO points_history (student_id, points_change, reason, date) VALUES (?,?,?,?)',
                       (student_id, total_points, reason_str, date))
        cursor.execute('UPDATE students SET points = COALESCE(points,0) + ? WHERE id=?',
                       (total_points, student_id))

    conn.commit()
    conn.close()
    return total_points


def get_student_points(student_id: int) -> Dict:
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT points FROM students WHERE id=?', (student_id,))
    row = cursor.fetchone()
    total = row['points'] if row else 0
    cursor.execute('SELECT * FROM points_history WHERE student_id=? ORDER BY date DESC LIMIT 50', (student_id,))
    history = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {'total_points': total, 'history': history}


def get_all_students_points() -> List[Dict]:
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT id, name, servant, class_name, grade, gender, phone, parent_phone, COALESCE(points,0) as points FROM students ORDER BY points DESC')
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


def add_manual_points(student_id: int, points: int, reason: str, date: str) -> bool:
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('INSERT INTO points_history (student_id, points_change, reason, date) VALUES (?,?,?,?)',
                   (student_id, points, reason, date))
    cursor.execute('UPDATE students SET points = COALESCE(points,0) + ? WHERE id=?', (points, student_id))
    conn.commit()
    conn.close()
    return True


def clear_points_for_redemption(servant_filter: str = None) -> int:
    """Zero current points. History is KEPT. Returns number of students cleared."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    today = datetime.now().strftime('%Y-%m-%d')
    if servant_filter:
        class_grades = class_grade_values(servant_filter)
        query = 'SELECT id, points FROM students WHERE (servant=? OR class_name=?'
        params = [servant_filter, servant_filter]
        if class_grades:
            placeholders = ','.join(['?' for _ in class_grades])
            query += f' OR grade IN ({placeholders})'
            params.extend(class_grades)
        query += ') AND COALESCE(points,0) > 0'
        cursor.execute(query, params)
    else:
        cursor.execute('SELECT id, points FROM students WHERE COALESCE(points,0) > 0')
    rows = cursor.fetchall()
    count = 0
    for sid, pts in rows:
        cursor.execute('INSERT INTO points_history (student_id, points_change, reason, date) VALUES (?,?,?,?)',
                       (sid, -pts, 'Points Redeemed (Cleared)', today))
        cursor.execute('UPDATE students SET points=0 WHERE id=?', (sid,))
        count += 1
    conn.commit()
    conn.close()
    return count


# ==================== ANNOUNCEMENTS ====================

def add_announcement(title: str, body: str, created_by: str, attachment_path: str = '') -> int:
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('INSERT INTO announcements (title, body, attachment_path, created_by) VALUES (?,?,?,?)',
                   (title, body, attachment_path, created_by))
    aid = cursor.lastrowid
    conn.commit()
    conn.close()
    return aid


def get_announcements() -> List[Dict]:
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM announcements ORDER BY created_at DESC')
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


def delete_announcement(ann_id: int) -> bool:
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('DELETE FROM announcements WHERE id=?', (ann_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


# ==================== BIRTHDAYS ====================

def get_upcoming_birthdays(days_ahead: int = 30) -> List[Dict]:
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, dob, servant, class_name, grade, gender, phone, parent_phone FROM students WHERE dob IS NOT NULL AND dob != ''")
    students = cursor.fetchall()
    conn.close()
    today = datetime.now()
    result = []
    for s in students:
        dob_str = s['dob']
        if not dob_str:
            continue
        dob = None
        for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y', '%Y-%m-%d %H:%M:%S'):
            try:
                dob = datetime.strptime(str(dob_str)[:10], fmt)
                break
            except:
                continue
        if not dob:
            continue
        next_bday = dob.replace(year=today.year)
        if next_bday.date() < today.date():
            next_bday = next_bday.replace(year=today.year + 1)
        delta = (next_bday.date() - today.date()).days
        if 0 <= delta <= days_ahead:
            result.append({
                'id': s['id'], 'name': s['name'], 'dob': str(dob_str),
                'servant': s['servant'], 'class_name': s['class_name'], 'grade': s['grade'],
                'gender': s['gender'], 'phone': s['phone'], 'parent_phone': s['parent_phone'],
                'days_until': delta, 'birthday_date': next_bday.strftime('%B %d')
            })
    result.sort(key=lambda x: x['days_until'])
    return result


# ==================== EFTIKAD ====================

def submit_eftikad(servant_username: str, student_id: int, date: str,
                   whatsapp_sent: int = 0, called: int = 0, visited: int = 0, notes: str = '') -> int:
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''CREATE TABLE IF NOT EXISTS eftikad (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        servant_username TEXT NOT NULL,
        student_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        whatsapp_sent INTEGER DEFAULT 0,
        called INTEGER DEFAULT 0,
        visited INTEGER DEFAULT 0,
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL
    )''')
    created_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    cursor.execute('''INSERT INTO eftikad (servant_username, student_id, date, whatsapp_sent, called, visited, notes, created_at)
        VALUES (?,?,?,?,?,?,?,?)''', (servant_username, student_id, date, whatsapp_sent, called, visited, notes, created_at))
    eid = cursor.lastrowid
    conn.commit()
    conn.close()
    return eid


def get_eftikad(servant_filter: str = None, date_from: str = None, date_to: str = None) -> List[Dict]:
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    try:
        query = '''SELECT e.*, s.name as student_name, s.phone, s.parent_phone, s.grade, s.gender, s.class_name, s.servant
            FROM eftikad e LEFT JOIN students s ON e.student_id = s.id WHERE 1=1'''
        params = []
        if servant_filter:
            query += ' AND e.servant_username=?'
            params.append(servant_filter)
        if date_from:
            query += ' AND e.date >= ?'
            params.append(date_from)
        if date_to:
            query += ' AND e.date <= ?'
            params.append(date_to)
        query += ' ORDER BY e.created_at DESC'
        cursor.execute(query, params)
        rows = [dict(r) for r in cursor.fetchall()]
    except:
        rows = []
    conn.close()
    return rows


# ==================== BIBLE TRACKING ====================

def get_bible_tracking(student_id: int, weeks: int = 8) -> List[Dict]:
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM bible_tracking WHERE student_id=? ORDER BY week_start_date DESC LIMIT ?',
                   (student_id, weeks))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


def update_bible_tracking(student_id: int, week_start_date: str, days_read: int) -> bool:
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('SELECT id FROM bible_tracking WHERE student_id=? AND week_start_date=?',
                   (student_id, week_start_date))
    if cursor.fetchone():
        cursor.execute('UPDATE bible_tracking SET days_read=? WHERE student_id=? AND week_start_date=?',
                       (days_read, student_id, week_start_date))
    else:
        cursor.execute('INSERT INTO bible_tracking (student_id, week_start_date, days_read) VALUES (?,?,?)',
                       (student_id, week_start_date, days_read))
    conn.commit()
    conn.close()
    return True


def get_bible_tracking_all(servant_filter: str = None) -> List[Dict]:
    """Get bible tracking summary for all students (optionally filtered by servant)."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    query = '''SELECT s.id, s.name, s.servant, s.grade,
        s.class_name, COALESCE(bt.days_read, 0) as days_read, bt.week_start_date
        FROM students s LEFT JOIN bible_tracking bt
        ON s.id = bt.student_id AND bt.week_start_date = (
            SELECT MAX(week_start_date) FROM bible_tracking WHERE student_id = s.id
        ) WHERE 1=1'''
    params = []
    if servant_filter:
        query += ' AND (s.servant=? OR s.class_name=?'
        params.extend([servant_filter, servant_filter])
        class_grades = class_grade_values(servant_filter)
        if class_grades:
            placeholders = ','.join(['?' for _ in class_grades])
            query += f' OR s.grade IN ({placeholders})'
            params.extend(class_grades)
        query += ')'
    query += ' ORDER BY s.name'
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


# ==================== CHARTS ====================

def get_class_attendance_stats(servant_filter: str = None, year: str = None, grades=None, sections=None) -> List[Dict]:
    """Monthly attendance % per grade for charts."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    query = '''SELECT s.grade, strftime('%Y-%m', a.date) as month,
        COUNT(*) as total,
        SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) as present_count
        FROM attendance a JOIN students s ON a.student_id = s.id
        WHERE 1=1'''
    params = []
    if servant_filter:
        query += ' AND (s.servant=? OR s.class_name=?'
        params.extend([servant_filter, servant_filter])
        class_grades = class_grade_values(servant_filter)
        if class_grades:
            placeholders = ','.join(['?' for _ in class_grades])
            query += f' OR s.grade IN ({placeholders})'
            params.extend(class_grades)
        query += ')'
    normalized_grades = []
    if grades:
        raw_grades = grades.replace(';', ',').split(',') if isinstance(grades, str) else list(grades)
        for grade in raw_grades:
            value = normalize_grade_value(grade)
            if value is not None and value not in normalized_grades:
                normalized_grades.append(value)
    if normalized_grades:
        placeholders = ','.join(['?' for _ in normalized_grades])
        query += f' AND s.grade IN ({placeholders})'
        params.extend(normalized_grades)
    normalized_sections = normalize_assigned_sections(sections).split(',') if sections else []
    gender_variants = []
    for section in normalized_sections:
        if section == 'Boy':
            gender_variants.extend(['M', 'Boy', 'Boys', 'Male', 'male', 'boy'])
        elif section == 'Girl':
            gender_variants.extend(['F', 'Girl', 'Girls', 'Female', 'female', 'girl'])
    gender_variants = list(dict.fromkeys(gender_variants))
    if gender_variants:
        placeholders = ','.join(['?' for _ in gender_variants])
        query += f' AND s.gender IN ({placeholders})'
        params.extend(gender_variants)
    if year:
        query += " AND strftime('%Y', a.date)=?"
        params.append(year)
    query += " GROUP BY s.grade, month ORDER BY month DESC, s.grade LIMIT 120"
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows
