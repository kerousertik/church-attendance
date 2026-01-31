import sqlite3
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Optional

DB_FILE = "attendance.db"

def init_db():
    """Initialize the database with required tables."""
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
            FOREIGN KEY (student_id) REFERENCES students(id),
            UNIQUE(student_id, date)
        )
    ''')
    
    # Servants table (for standalone servants not yet assigned to students)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS servants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            phone TEXT
        )
    ''')
    
    # Notes table (for kid notes)
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
    
    conn.commit()
    conn.close()

def import_from_excel(excel_path: str):
    """Import student data from Excel file."""
    conn = sqlite3.connect(DB_FILE)
    
    # Read the "All Kids" sheet
    df = pd.read_excel(excel_path, sheet_name='All Kids')
    
    # Clean up the data
    df = df.dropna(subset=['Name'])  # Remove rows without names
    
    # Prepare data for insertion
    for _, row in df.iterrows():
        conn.execute('''
            INSERT OR IGNORE INTO students 
            (name, grade, gender, servant, phone, parent_phone, dob, address, comments, pictures, last_call)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            str(row.get('Name', '')),
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
        query += " AND servant = ?"
        params.append(servant)
    
    if grade is not None:
        query += " AND grade = ?"
        params.append(grade)
    
    if gender:
        query += " AND gender = ?"
        params.append(gender)
    
    cursor.execute(query, params)
    
    students = []
    for row in cursor.fetchall():
        student = dict(row)
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

