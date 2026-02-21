from flask import Flask, request, jsonify, send_file, render_template
from flask_cors import CORS
from datetime import datetime
import database as db
import os

app = Flask(__name__, static_folder='www', template_folder='www')
CORS(app)

# Initialize database on startup
if not os.path.exists(db.DB_FILE):
    db.init_db()
    # Import from Excel if file exists
    excel_path = r"c:\Users\kokon\Downloads\+Middle School Data Sheet+.xlsx"
    if os.path.exists(excel_path):
        db.import_from_excel(excel_path)
        print("✅ Database initialized and data imported from Excel")
    else:
        print("⚠️ Excel file not found, starting with empty database")

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

if __name__ == '__main__':
    print("🚀 Starting Church Attendance App...")
    print("📊 Access the app at: http://localhost:5000")
    app.run(debug=True, host='0.0.0.0', port=5000)
