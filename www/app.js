// Offline Attendance App - IndexedDB Storage
// Works completely standalone without server

const DB_NAME = 'AttendanceDB';
const DB_VERSION = 1;

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

                // Students store
                if (!db.objectStoreNames.contains('students')) {
                    const studentsStore = db.createObjectStore('students', { keyPath: 'id', autoIncrement: true });
                    studentsStore.createIndex('name', 'name', { unique: false });
                }

                // Attendance store
                if (!db.objectStoreNames.contains('attendance')) {
                    const attendanceStore = db.createObjectStore('attendance', { keyPath: 'id', autoIncrement: true });
                    attendanceStore.createIndex('date', 'date', { unique: false });
                    attendanceStore.createIndex('studentId', 'studentId', { unique: false });
                    attendanceStore.createIndex('dateStudent', ['date', 'studentId'], { unique: true });
                }
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

    async saveAttendanceRecord(studentId, date, present) {
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
                    store.put(existing);
                } else {
                    store.add({ studentId, date, present, timestamp: new Date().toISOString() });
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
            this.attendanceData[s.id] = isPresent;
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
                </div>
            `;
        }).join('');
    }

    markAttendance(studentId, present) {
        this.attendanceData[studentId] = present;

        const card = document.getElementById(`student-${studentId}`);
        card.querySelectorAll('.att-btn').forEach(b => b.classList.remove('active'));
        card.querySelector(present ? '.present' : '.absent').classList.add('active');
    }

    async saveAttendance() {
        const date = document.getElementById('attendance-date').value;
        let count = 0;

        for (const [studentId, present] of Object.entries(this.attendanceData)) {
            if (present !== undefined) {
                await this.saveAttendanceRecord(parseInt(studentId), date, present);
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
        document.getElementById('student-notes').value = student.notes || '';
        this.showView('add-student');
    }

    async saveStudent(event) {
        event.preventDefault();

        const student = {
            name: document.getElementById('student-name').value.trim(),
            grade: document.getElementById('student-grade').value,
            phone: document.getElementById('student-phone').value.trim(),
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

        const data = { students, attendance, exportedAt: new Date().toISOString() };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();

        URL.revokeObjectURL(url);
        this.showToast('Data exported!', 'success');
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
}

// Initialize app
const app = new AttendanceApp();
