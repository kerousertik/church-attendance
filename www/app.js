// Offline Attendance App - IndexedDB Storage
// Works completely standalone without server

const DB_NAME = 'AttendanceDB';
const DB_VERSION = 2;

class AttendanceApp {
    constructor() {
        this.db = null;
        this.currentView = 'home';
        this.isAdmin = false;
        this.editingStudentId = null;
        this.attendanceData = {};
        this.init();
    }

    async init() {
        await this.initDB();
        this.updateDate();
        this.updateStats();
        this.setupEventListeners();
    }

    // ==================== DATABASE ====================

    initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;

                // Students store
                if (!db.objectStoreNames.contains('students')) {
                    const studentsStore = db.createObjectStore('students', { keyPath: 'id', autoIncrement: true });
                    studentsStore.createIndex('name', 'name', { unique: false });
                }
                // Note: email field added in v2, no migration needed (just add to new records)

                // Attendance store
                if (!db.objectStoreNames.contains('attendance')) {
                    const attendanceStore = db.createObjectStore('attendance', { keyPath: 'id', autoIncrement: true });
                    attendanceStore.createIndex('date', 'date', { unique: false });
                    attendanceStore.createIndex('studentId', 'studentId', { unique: false });
                    attendanceStore.createIndex('dateStudent', ['date', 'studentId'], { unique: true });
                }
                // Note: eftikad and liturgy fields added in v2, no migration needed
            };
        });
    }

    async getAllStudents() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['students'], 'readonly');
            const store = transaction.objectStore('students');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async addStudent(student) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['students'], 'readwrite');
            const store = transaction.objectStore('students');
            const request = store.add(student);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateStudent(student) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['students'], 'readwrite');
            const store = transaction.objectStore('students');
            const request = store.put(student);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async deleteStudent(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['students', 'attendance'], 'readwrite');
            transaction.objectStore('students').delete(id);
            // Also delete attendance records
            const attendanceStore = transaction.objectStore('attendance');
            const index = attendanceStore.index('studentId');
            const request = index.openCursor(IDBKeyRange.only(id));
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async getAttendanceForDate(date) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['attendance'], 'readonly');
            const store = transaction.objectStore('attendance');
            const index = store.index('date');
            const request = index.getAll(date);
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async saveAttendanceRecord(studentId, date, present, eftikad = false, liturgy = null) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['attendance'], 'readwrite');
            const store = transaction.objectStore('attendance');
            const index = store.index('dateStudent');

            // Check if record exists
            const getRequest = index.get([date, studentId]);
            getRequest.onsuccess = () => {
                const existing = getRequest.result;
                if (existing) {
                    existing.present = present;
                    existing.eftikad = eftikad;
                    existing.liturgy = liturgy;
                    store.put(existing);
                } else {
                    store.add({
                        studentId,
                        date,
                        present,
                        eftikad,
                        liturgy,
                        timestamp: new Date().toISOString()
                    });
                }
            };
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async getAllAttendance() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['attendance'], 'readonly');
            const store = transaction.objectStore('attendance');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    // ==================== UI ====================

    updateDate() {
        const now = new Date();
        const options = { weekday: 'long', month: 'long', day: 'numeric' };
        document.getElementById('current-date').textContent = now.toLocaleDateString('en-US', options);
        document.getElementById('attendance-date').value = now.toISOString().split('T')[0];
    }

    async updateStats() {
        const students = await this.getAllStudents();
        const today = new Date().toISOString().split('T')[0];
        const todayAttendance = await this.getAttendanceForDate(today);

        const present = todayAttendance.filter(a => a.present).length;
        const absent = todayAttendance.filter(a => !a.present).length;

        document.getElementById('total-students').textContent = students.length;
        document.getElementById('today-present').textContent = present;
        document.getElementById('today-absent').textContent = absent;
    }

    setupEventListeners() {
        // Add any global event listeners here
    }

    showView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${viewId}`).classList.add('active');

        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const navMap = { home: 0, attendance: 1, students: 2, history: 3 };
        if (navMap[viewId] !== undefined) {
            document.querySelectorAll('.nav-item')[navMap[viewId]].classList.add('active');
        }

        this.currentView = viewId;
    }

    showHome() {
        this.showView('home');
        this.updateStats();
    }

    async showTakeAttendance() {
        this.showView('attendance');
        await this.loadAttendanceForDate();
    }

    async loadAttendanceForDate() {
        const date = document.getElementById('attendance-date').value;
        const students = await this.getAllStudents();
        const attendance = await this.getAttendanceForDate(date);

        const attendanceMap = {};
        attendance.forEach(a => attendanceMap[a.studentId] = a.present);
        this.attendanceData = {};

        const container = document.getElementById('attendance-list');

        if (students.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-round">person_add</span>
                    <p>No students yet. Add students first!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = students.map(s => {
            const isPresent = attendanceMap[s.id];
            const record = attendance.find(a => a.studentId === s.id);
            const eftikad = record?.eftikad || false;
            const liturgy = record?.liturgy || null;

            this.attendanceData[s.id] = {
                present: isPresent,
                eftikad: eftikad,
                liturgy: liturgy
            };

            return `
                <div class="student-card" id="student-${s.id}">
                    <div class="student-info">
                        <span class="student-name">${s.name}</span>
                        <span class="student-grade">${s.grade ? `Grade ${s.grade}` : ''}</span>
                    </div>
                    <div class="attendance-buttons">
                        <button class="att-btn present ${isPresent === true ? 'active' : ''}" 
                                onclick="app.markAttendance(${s.id}, true)">
                            <span class="material-icons-round">check</span>
                        </button>
                        <button class="att-btn absent ${isPresent === false ? 'active' : ''}" 
                                onclick="app.markAttendance(${s.id}, false)">
                            <span class="material-icons-round">close</span>
                        </button>
                    </div>
                    <div class="attendance-details" id="details-${s.id}" style="${isPresent === true ? '' : 'display:none;'}">
                        <label class="checkbox-label">
                            <input type="checkbox" id="eftikad-${s.id}" ${eftikad ? 'checked' : ''} 
                                   onchange="app.updateEftikad(${s.id}, this.checked)">
                            <span>Did Eftikad (Communion)</span>
                        </label>
                        <div class="liturgy-options">
                            <label class="radio-label">
                                <input type="radio" name="liturgy-${s.id}" value="full" 
                                       ${liturgy === 'full' ? 'checked' : ''}
                                       onchange="app.updateLiturgy(${s.id}, 'full')">
                                <span>Attended Liturgy</span>
                            </label>
                            <label class="radio-label">
                                <input type="radio" name="liturgy-${s.id}" value="sunday_school" 
                                       ${liturgy === 'sunday_school' ? 'checked' : ''}
                                       onchange="app.updateLiturgy(${s.id}, 'sunday_school')">
                                <span>Sunday School Only</span>
                            </label>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    markAttendance(studentId, present) {
        if (!this.attendanceData[studentId]) {
            this.attendanceData[studentId] = {};
        }
        this.attendanceData[studentId].present = present;

        const card = document.getElementById(`student-${studentId}`);
        card.querySelectorAll('.att-btn').forEach(b => b.classList.remove('active'));
        card.querySelector(present ? '.present' : '.absent').classList.add('active');

        // Show/hide details based on presence
        const details = document.getElementById(`details-${studentId}`);
        if (details) {
            details.style.display = present ? '' : 'none';
        }
    }

    updateEftikad(studentId, checked) {
        if (!this.attendanceData[studentId]) {
            this.attendanceData[studentId] = {};
        }
        this.attendanceData[studentId].eftikad = checked;
    }

    updateLiturgy(studentId, value) {
        if (!this.attendanceData[studentId]) {
            this.attendanceData[studentId] = {};
        }
        this.attendanceData[studentId].liturgy = value;
    }

    async saveAttendance() {
        const date = document.getElementById('attendance-date').value;
        let count = 0;

        for (const [studentId, data] of Object.entries(this.attendanceData)) {
            if (data && data.present !== undefined) {
                await this.saveAttendanceRecord(
                    parseInt(studentId),
                    date,
                    data.present,
                    data.eftikad || false,
                    data.liturgy || null
                );
                count++;
            }
        }

        this.showToast(`Saved ${count} attendance records!`, 'success');
        this.updateStats();
    }

    async showAllStudents() {
        this.showView('students');
        await this.loadStudentsList();
    }

    async loadStudentsList(filter = '') {
        let students = await this.getAllStudents();

        if (filter) {
            students = students.filter(s =>
                s.name.toLowerCase().includes(filter.toLowerCase())
            );
        }

        const container = document.getElementById('students-list');

        if (students.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-round">groups</span>
                    <p>${filter ? 'No matching students' : 'No students added yet'}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = students.map(s => `
            <div class="student-card" onclick="app.editStudent(${s.id})">
                <div class="student-info">
                    <span class="student-name">${s.name}</span>
                    <span class="student-details">${s.grade ? `Grade ${s.grade}` : ''} ${s.phone ? `• ${s.phone}` : ''}</span>
                </div>
                <span class="material-icons-round">chevron_right</span>
            </div>
        `).join('');
    }

    searchStudents(query) {
        this.loadStudentsList(query);
    }

    async showHistory() {
        this.showView('history');

        const attendance = await this.getAllAttendance();
        const students = await this.getAllStudents();
        const studentMap = {};
        students.forEach(s => studentMap[s.id] = s);

        // Group by date
        const byDate = {};
        attendance.forEach(a => {
            if (!byDate[a.date]) byDate[a.date] = [];
            byDate[a.date].push(a);
        });

        const container = document.getElementById('history-list');
        const dates = Object.keys(byDate).sort().reverse();

        if (dates.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-round">history</span>
                    <p>No attendance records yet</p>
                </div>
            `;
            return;
        }

        container.innerHTML = dates.map(date => {
            const records = byDate[date];
            const present = records.filter(r => r.present).length;
            const absent = records.filter(r => !r.present).length;
            const dateStr = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric'
            });

            return `
                <div class="history-card">
                    <div class="history-date">${dateStr}</div>
                    <div class="history-stats">
                        <span class="present-count">✓ ${present}</span>
                        <span class="absent-count">✗ ${absent}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    showAddStudent() {
        this.editingStudentId = null;
        document.getElementById('add-student-title').textContent = 'Add Student';
        document.getElementById('student-form').reset();
        this.showView('add-student');
    }

    async editStudent(id) {
        const students = await this.getAllStudents();
        const student = students.find(s => s.id === id);
        if (!student) return;

        this.editingStudentId = id;
        document.getElementById('add-student-title').textContent = 'Edit Student';
        document.getElementById('student-name').value = student.name || '';
        document.getElementById('student-grade').value = student.grade || '';
        document.getElementById('student-phone').value = student.phone || '';
        document.getElementById('student-email').value = student.email || '';
        document.getElementById('student-notes').value = student.notes || '';
        this.showView('add-student');
    }

    async saveStudent(event) {
        event.preventDefault();

        const student = {
            name: document.getElementById('student-name').value.trim(),
            grade: document.getElementById('student-grade').value,
            phone: document.getElementById('student-phone').value.trim(),
            email: document.getElementById('student-email').value.trim(),
            notes: document.getElementById('student-notes').value.trim(),
        };

        if (!student.name) {
            this.showToast('Please enter a name', 'error');
            return;
        }

        if (this.editingStudentId) {
            student.id = this.editingStudentId;
            await this.updateStudent(student);
            this.showToast('Student updated!', 'success');
        } else {
            await this.addStudent(student);
            this.showToast('Student added!', 'success');
        }

        this.showHome();
    }

    toggleAdminMode() {
        this.isAdmin = !this.isAdmin;
        document.getElementById('admin-chip').classList.toggle('active', this.isAdmin);
        document.getElementById('admin-actions').style.display = this.isAdmin ? 'block' : 'none';
    }

    async clearAllData() {
        if (!confirm('Are you sure you want to delete ALL data? This cannot be undone!')) {
            return;
        }

        const transaction = this.db.transaction(['students', 'attendance'], 'readwrite');
        transaction.objectStore('students').clear();
        transaction.objectStore('attendance').clear();

        transaction.oncomplete = () => {
            this.showToast('All data cleared', 'success');
            this.updateStats();
        };
    }

    async exportData() {
        const students = await this.getAllStudents();
        const attendance = await this.getAllAttendance();

        // Create student map
        const studentMap = {};
        students.forEach(s => studentMap[s.id] = s);

        // Prepare data for Excel
        const excelData = attendance.map(a => {
            const student = studentMap[a.studentId] || {};
            return {
                'Date': a.date,
                'Student Name': student.name || 'Unknown',
                'Grade': student.grade || '',
                'Present': a.present ? 'Yes' : 'No',
                'Did Eftikad': a.eftikad ? 'Yes' : 'No',
                'Liturgy': a.liturgy === 'full' ? 'Full Liturgy' : a.liturgy === 'sunday_school' ? 'Sunday School Only' : 'N/A',
                'Email': student.email || '',
                'Phone': student.phone || ''
            };
        });

        // Create workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);

        // Set column widths
        ws['!cols'] = [
            { wch: 12 }, // Date
            { wch: 20 }, // Name
            { wch: 8 },  // Grade
            { wch: 10 }, // Present
            { wch: 12 }, // Eftikad
            { wch: 20 }, // Liturgy
            { wch: 25 }, // Email
            { wch: 15 }  // Phone
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

        // Generate filename with date
        const filename = `attendance-report-${new Date().toISOString().split('T')[0]}.xlsx`;

        // Download
        XLSX.writeFile(wb, filename);

        this.showToast('Excel report exported!', 'success');
    }

    showTodayAttendance() {
        document.getElementById('attendance-date').value = new Date().toISOString().split('T')[0];
        this.showTakeAttendance();
    }

    showTodayAbsent() {
        this.showTodayAttendance();
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="material-icons-round">${type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'}</span>
            <span>${message}</span>
        `;
        container.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ==================== ANNOUNCEMENTS ====================

    showAnnouncement() {
        document.getElementById('announcement-modal').style.display = 'flex';
    }

    closeAnnouncement() {
        document.getElementById('announcement-modal').style.display = 'none';
        document.getElementById('announcement-subject').value = '';
        document.getElementById('announcement-message').value = '';
    }

    async sendAnnouncement() {
        const recipients = document.getElementById('announcement-recipients').value;
        const subject = document.getElementById('announcement-subject').value.trim();
        const message = document.getElementById('announcement-message').value.trim();

        if (!subject || !message) {
            this.showToast('Please enter subject and message', 'error');
            return;
        }

        const students = await this.getAllStudents();
        let filtered = students;

        // Filter by grade if needed
        if (recipients.startsWith('grade-')) {
            const grade = recipients.split('-')[1];
            filtered = students.filter(s => s.grade === grade);
        }

        // Get emails
        const emails = filtered
            .filter(s => s.email)
            .map(s => s.email)
            .join(',');

        if (!emails) {
            this.showToast('No students with email addresses found', 'error');
            return;
        }

        // Create mailto link
        const mailtoLink = `mailto:${emails}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;

        // Open email client
        window.location.href = mailtoLink;

        this.closeAnnouncement();
        this.showToast(`Opening email client for ${filtered.length} students`, 'success');
    }
}

// Initialize app
const app = new AttendanceApp();
