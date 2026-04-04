from flask import Flask, request, jsonify, send_file, render_template
from flask_cors import CORS
from datetime import datetime
import database as db
import os
import smtplib
from email.message import EmailMessage
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    print("python-dotenv not found. Assuming environment variables are provided by the host.")

app = Flask(__name__, static_folder='www', template_folder='www')
app.secret_key = os.environ.get('SECRET_KEY', 'church-attendance-secret-key-2024')
CORS(app)

# Email Configuration (Loaded from .env file)
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 465
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "") 
SENDER_PASSWORD = os.environ.get("SENDER_PASSWORD", "") # e.g. Gmail App Password

# Always run init_db to ensure all tables exist
db.init_db()

# Import from Excel if DB was newly created and Excel file exists
excel_path = r"c:\Users\kokon\Downloads\+Middle School Data Sheet+.xlsx"
if not os.path.exists(db.DB_FILE) or os.path.getsize(db.DB_FILE) < 1000:
    if os.path.exists(excel_path):
        db.import_from_excel(excel_path)
        print("✅ Database initialized and data imported from Excel")
    else:
        print("⚠️ Excel file not found, starting with empty database")
else:
    print("✅ Database loaded successfully")

@app.route('/')
def index():
    """Serve the main application page from the mobile www folder."""
    return send_file(os.path.join('www', 'index.html'))

@app.route('/<path:filename>')
def serve_static(filename):
    """Serve static files from the mobile www folder."""
    file_path = os.path.join('www', filename)
    if os.path.exists(file_path):
        return send_file(file_path)
    return "Not Found", 404

@app.route('/api/send-email', methods=['POST'])
def send_email():
    """Send an automated background email to selected recipients."""
    data = request.json
    subject = data.get('subject')
    message_body = data.get('message')
    recipients = data.get('recipients', []) # List of email addresses

    if not subject or not message_body or not recipients:
        return jsonify({'error': 'Missing subject, message, or recipients'}), 400
    
    if not SENDER_EMAIL or not SENDER_PASSWORD:
        return jsonify({'error': 'Email server not configured. Please set SENDER_EMAIL and SENDER_PASSWORD.'}), 500

    try:
        # Create the email
        msg = EmailMessage()
        msg.set_content(message_body)
        msg['Subject'] = subject
        msg['From'] = SENDER_EMAIL
        msg['Bcc'] = ", ".join(recipients) # Send as BCC for privacy

        # Connect to SMTP server and send
        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT) as server:
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.send_message(msg)

        return jsonify({'success': True, 'count': len(recipients)})
    except smtplib.SMTPAuthenticationError:
        return jsonify({'error': 'SMTP Authentication failed. Check your App Password.'}), 500
    except Exception as e:
        return jsonify({'error': f'Failed to send email: {str(e)}'}), 500

@app.route('/api/servants', methods=['GET'])
def get_servants():
    """Get list of all servants."""
    try:
        servants = db.get_servants()
        return jsonify({'servants': servants})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/filters', methods=['GET'])
def get_filters():
    """Get available filters (grades, genders) for a specific servant."""
    servant = request.args.get('servant')
    if not servant:
        return jsonify({'error': 'Servant parameter required'}), 400
    
    try:
        filters = db.get_filters(servant)
        return jsonify(filters)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/students', methods=['GET'])
def get_students():
    """Get students with optional filters."""
    servant = request.args.get('servant')
    grade = request.args.get('grade', type=int)
    gender = request.args.get('gender')
    
    try:
        students = db.get_students(servant, grade, gender)
        return jsonify({'students': students})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/attendance', methods=['POST'])
def save_attendance():
    """Save attendance record."""
    data = request.json
    
    student_id = data.get('student_id')
    date = data.get('date', datetime.now().strftime('%Y-%m-%d'))
    status = data.get('status')  # 'present' or 'absent'
    
    if not all([student_id, status]):
        return jsonify({'error': 'Missing required fields'}), 400
    
    try:
        db.save_attendance(student_id, date, status)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/student', methods=['POST'])
def add_student():
    """Add a new student."""
    data = request.json
    
    name = data.get('name')
    grade = data.get('grade')
    gender = data.get('gender')
    servant = data.get('servant')
    
    if not all([name, grade, gender, servant]):
        return jsonify({'error': 'Missing required fields'}), 400
    
    try:
        student_id = db.add_student(
            name, grade, gender, servant,
            phone=data.get('phone', ''),
            parent_phone=data.get('parent_phone', ''),
            dob=data.get('dob', ''),
            address=data.get('address', ''),
            comments=data.get('comments', ''),
            pictures=data.get('pictures', ''),
            last_call=data.get('last_call', '')
        )
        return jsonify({'success': True, 'student_id': student_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/student/<int:student_id>', methods=['PUT'])
def update_student(student_id):
    """Update student information."""
    data = request.json
    
    try:
        db.update_student(student_id, **data)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/student/<int:student_id>', methods=['DELETE'])
def delete_student(student_id):
    """Delete a student."""
    try:
        db.delete_student(student_id)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/history/<int:student_id>', methods=['GET'])
def get_history(student_id):
    """Get attendance history for a student."""
    try:
        history = db.get_attendance_history(student_id)
        return jsonify({'history': history})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/analytics', methods=['GET'])
def get_analytics():
    """Get analytics data for dashboard."""
    try:
        analytics = db.get_analytics()
        return jsonify(analytics)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/export', methods=['GET'])
def export_excel():
    """Export data to Excel file."""
    try:
        output_path = 'export_attendance_data.xlsx'
        db.export_to_excel(output_path)
        return send_file(output_path, as_attachment=True, download_name=f'attendance_export_{datetime.now().strftime("%Y%m%d")}.xlsx')
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/servant', methods=['POST'])
def add_servant():
    """Add a new servant."""
    data = request.json
    name = data.get('name')
    phone = data.get('phone', '')
    
    if not name:
        return jsonify({'error': 'Servant name is required'}), 400
    
    try:
        # Add servant to the servants table (or create one if needed)
        db.add_servant(name, phone)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/students-by-servant', methods=['GET'])
def get_students_by_servant():
    """Get all students assigned to a specific servant."""
    servant = request.args.get('servant')
    if not servant:
        return jsonify({'error': 'Servant parameter required'}), 400
    
    try:
        students = db.get_students_by_servant(servant)
        return jsonify({'students': students})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/student/<int:student_id>/details', methods=['GET'])
def get_student_details(student_id):
    """Get full student details including attendance history and notes."""
    try:
        details = db.get_student_details(student_id)
        if details:
            return jsonify(details)
        return jsonify({'error': 'Student not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/notes', methods=['POST'])
def add_note():
    """Add a note to a student."""
    data = request.json
    student_id = data.get('student_id')
    note_text = data.get('note_text')
    created_by = data.get('created_by', '')
    
    if not student_id or not note_text:
        return jsonify({'error': 'student_id and note_text are required'}), 400
    
    try:
        note_id = db.add_note(student_id, note_text, created_by)
        return jsonify({'success': True, 'note_id': note_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/notes/<int:student_id>', methods=['GET'])
def get_notes(student_id):
    """Get all notes for a student."""
    try:
        notes = db.get_notes(student_id)
        return jsonify({'notes': notes})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/filters-all', methods=['GET'])
def get_filters_all():
    """Get all available grades and genders (no servant filter)."""
    try:
        conn = __import__('sqlite3').connect(db.DB_FILE)
        cursor = conn.cursor()
        
        cursor.execute("SELECT DISTINCT grade FROM students WHERE grade IS NOT NULL ORDER BY grade")
        grades = [row[0] for row in cursor.fetchall()]
        
        cursor.execute("SELECT DISTINCT gender FROM students WHERE gender != '' ORDER BY gender")
        genders = [row[0] for row in cursor.fetchall()]
        
        conn.close()
        return jsonify({'grades': grades, 'genders': genders})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload-excel', methods=['POST'])
def upload_excel():
    """Upload and import a new Excel file."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        return jsonify({'error': 'Invalid file type. Please upload an Excel file.'}), 400
    
    try:
        # Save the file temporarily
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp:
            file.save(tmp.name)
            result = db.import_from_excel_upload(tmp.name)
            os.unlink(tmp.name)  # Delete temp file
        
        if result['success']:
            return jsonify({
                'success': True, 
                'message': f"Imported {result['added']} new kids, updated {result['updated']} existing kids"
            })
        else:
            return jsonify({'error': result.get('error', 'Import failed')}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/batch-attendance', methods=['POST'])
def batch_attendance():
    """Save multiple attendance records at once."""
    data = request.json
    records = data.get('records', [])
    date = data.get('date', datetime.now().strftime('%Y-%m-%d'))
    
    try:
        for record in records:
            student_id = record.get('student_id')
            status = record.get('status')
            if student_id and status:
                db.save_attendance(student_id, date, status)
        
        return jsonify({'success': True, 'count': len(records)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login():
    """Verify user credentials."""
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400
    
    try:
        user = db.check_user(username, password)
        if user:
            return jsonify({'success': True, 'role': user['role'], 'username': user['username']})
        else:
            return jsonify({'success': False, 'error': 'Invalid username or password'}), 401
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ==================== ADMIN USER MANAGEMENT ====================

@app.route('/admin')
def admin_dashboard():
    """Serve the admin dashboard page."""
    return send_file(os.path.join('www', 'admin.html'))


@app.route('/api/admin/users', methods=['GET'])
def get_users():
    """Get all users (admin only - frontend enforces auth)."""
    try:
        users = db.get_all_users()
        return jsonify({'users': users})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/users', methods=['POST'])
def create_user():
    """Create a new user."""
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')
    role = data.get('role', 'user')

    if not username or not password:
        return jsonify({'success': False, 'error': 'Username and password are required'}), 400

    try:
        result = db.add_user(username, password, role)
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
def remove_user(user_id):
    """Delete a user."""
    try:
        success = db.delete_user(user_id)
        if success:
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': 'Cannot delete user (last admin or not found)'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/users/<int:user_id>/password', methods=['PUT'])
def change_password(user_id):
    """Change a user's password."""
    data = request.json
    new_password = data.get('password', '')

    if not new_password or len(new_password) < 4:
        return jsonify({'success': False, 'error': 'Password must be at least 4 characters'}), 400

    try:
        success = db.update_user_password(user_id, new_password)
        if success:
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': 'User not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ==================== SERVANT REPORTS ====================

@app.route('/api/servant-report', methods=['POST'])
def submit_servant_report():
    """Servant submits an attendance or eftikad report to notify admin."""
    data = request.json
    servant_username = data.get('servant_username', 'Unknown')
    report_type = data.get('report_type', 'attendance')  # 'attendance' or 'eftikad'
    date = data.get('date', datetime.now().strftime('%Y-%m-%d'))
    total = data.get('total', 0)
    present = data.get('present', 0)
    absent = data.get('absent', 0)
    notes = data.get('notes', '')

    try:
        report_id = db.submit_servant_report(
            servant_username, report_type, date, total, present, absent, notes
        )
        return jsonify({'success': True, 'report_id': report_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/admin/servant-reports', methods=['GET'])
def get_servant_reports():
    """Get all servant reports, optionally filtered by date and/or type."""
    date_filter = request.args.get('date')
    type_filter = request.args.get('type')
    try:
        reports = db.get_servant_reports(date_filter, type_filter)
        return jsonify({'reports': reports})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/servant-reports/<int:report_id>', methods=['DELETE'])
def delete_servant_report(report_id):
    """Delete a servant report."""
    try:
        success = db.delete_servant_report(report_id)
        if success:
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': 'Report not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/servant-reports/mark-read', methods=['POST'])
def mark_reports_read():
    """Mark all reports as read (clears notification badge)."""
    try:
        db.mark_reports_read()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/servant-reports/unread-count', methods=['GET'])
def unread_count():
    """Get number of unread servant reports (for badge)."""
    try:
        count = db.get_unread_report_count()
        return jsonify({'count': count})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/servant-reports/download', methods=['GET'])
def download_servant_reports():
    """Download servant reports as an Excel file. Optional ?date= and ?type= filters."""
    date_filter = request.args.get('date')
    type_filter = request.args.get('type')

    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment
        import tempfile

        reports = db.get_servant_reports(date_filter, type_filter)

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Servant Reports'

        # Header row
        headers = ['#', 'Servant', 'Type', 'Date', 'Total', 'Present', 'Absent', 'Notes', 'Submitted At']
        ws.append(headers)

        # Style headers
        header_fill = PatternFill(start_color='1F2535', end_color='1F2535', fill_type='solid')
        header_font = Font(bold=True, color='5B8EF0')
        for cell in ws[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal='center')

        # Data rows
        for i, r in enumerate(reports, start=1):
            rtype = '📋 Attendance' if r.get('report_type') == 'attendance' else '🏠 Eftikad Visit'
            ws.append([
                i,
                r.get('servant_username', ''),
                rtype,
                r.get('date', ''),
                r.get('total_count', 0),
                r.get('present_count', 0),
                r.get('absent_count', 0),
                r.get('notes', ''),
                r.get('submitted_at', '')
            ])

        # Column widths
        col_widths = [5, 20, 18, 14, 8, 10, 10, 30, 22]
        for i, w in enumerate(col_widths, start=1):
            ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = w

        # Save temp
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp:
            wb.save(tmp.name)
            tmp_path = tmp.name

        date_str = date_filter or datetime.now().strftime('%Y%m%d')
        fname = f'servant_reports_{date_str}.xlsx'
        return send_file(tmp_path, as_attachment=True, download_name=fname)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("🚀 Starting Church Attendance App...")
    print("📊 Access the app at: http://localhost:5000")
    print("🔐 Admin dashboard at: http://localhost:5000/admin")
    app.run(debug=True, host='0.0.0.0', port=5000)
