// Offline Attendance App - IndexedDB Storage
// Works completely standalone without server

const DB_NAME = 'AttendanceDB';
const DB_VERSION = 5;

class AttendanceApp {
    constructor() {
        this.db = null;
        this.currentView = 'home';
        this.isAdmin = false;
        this.editingStudentId = null;
        this.editingServantId = null;
        this.attendanceData = {};
        this.servantAttendanceData = {};

        // Filter selection state
        this.filterGrades = [];
        this.filterGender = null;
        this.targetFilterView = '';

        this.init();
    }

    async init() {
        await this.initDB();
        this.updateDate();
        this.updateStats();
        this.loadBirthdays();
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

                // Attendance store
                if (!db.objectStoreNames.contains('attendance')) {
                    const attendanceStore = db.createObjectStore('attendance', { keyPath: 'id', autoIncrement: true });
                    attendanceStore.createIndex('date', 'date', { unique: false });
                    attendanceStore.createIndex('studentId', 'studentId', { unique: false });
                    attendanceStore.createIndex('dateStudent', ['date', 'studentId'], { unique: true });
                }

                // Servants store v4
                if (!db.objectStoreNames.contains('servants')) {
                    const servantsStore = db.createObjectStore('servants', { keyPath: 'id', autoIncrement: true });
                    servantsStore.createIndex('name', 'name', { unique: false });
                }

                // Servant Eftikad store v4
                if (!db.objectStoreNames.contains('servant_eftikad')) {
                    const servantEftikadStore = db.createObjectStore('servant_eftikad', { keyPath: 'id', autoIncrement: true });
                    servantEftikadStore.createIndex('date', 'date', { unique: false });
                    servantEftikadStore.createIndex('servantId', 'servantId', { unique: false });
                    servantEftikadStore.createIndex('dateServant', ['date', 'servantId'], { unique: true });
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

    async saveAttendanceRecord(studentId, date, present, liturgy = null) {
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
                    existing.liturgy = liturgy;
                    store.put(existing);
                } else {
                    store.add({
                        studentId,
                        date,
                        present,
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
        });
    }

    async getStudentById(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['students'], 'readonly');
            const store = transaction.objectStore('students');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // --- Servants DB Methods ---

    async getAllServants() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['servants'], 'readonly');
            const store = transaction.objectStore('servants');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async addServant(servant) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['servants'], 'readwrite');
            const store = transaction.objectStore('servants');
            const request = store.add(servant);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateServant(servant) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['servants'], 'readwrite');
            const store = transaction.objectStore('servants');
            const request = store.put(servant);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async deleteServant(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['servants', 'servant_eftikad'], 'readwrite');
            transaction.objectStore('servants').delete(id);
            // Also delete eftikad records for servant
            const eftikadStore = transaction.objectStore('servant_eftikad');
            const index = eftikadStore.index('servantId');
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

    async getServantEftikadForDate(date) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['servant_eftikad'], 'readonly');
            const store = transaction.objectStore('servant_eftikad');
            const index = store.index('date');
            const request = index.getAll(date);
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async saveServantEftikadRecord(servantId, date, eftikadFinished) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['servant_eftikad'], 'readwrite');
            const store = transaction.objectStore('servant_eftikad');
            const index = store.index('dateServant');

            // Check if record exists
            const getRequest = index.get([date, servantId]);
            getRequest.onsuccess = () => {
                const existing = getRequest.result;
                if (existing) {
                    existing.eftikad = eftikadFinished;
                    store.put(existing);
                } else {
                    store.add({
                        servantId,
                        date,
                        eftikad: eftikadFinished,
                        timestamp: new Date().toISOString()
                    });
                }
            };
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async getAllServantEftikad() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['servant_eftikad'], 'readonly');
            const store = transaction.objectStore('servant_eftikad');
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

    async calculateAbsenceAlerts() {
        const students = await this.getAllStudents();
        const allAttendance = await this.getAllAttendance();
        const servants = await this.getAllServants();
        const servantMap = {};
        servants.forEach(s => servantMap[s.id] = s);

        const alerts = [];

        students.forEach(student => {
            // Get all attendance records for this student, sorted newest first
            const studentRecords = allAttendance
                .filter(a => a.studentId === student.id)
                .sort((a, b) => new Date(b.date) - new Date(a.date));

            // Count consecutive absences from most recent record
            let consecutiveAbsences = 0;
            let lastPresentDate = null;

            for (const record of studentRecords) {
                if (record.present === true || record.present === 'true') {
                    lastPresentDate = new Date(record.date);
                    break;
                } else {
                    consecutiveAbsences++;
                }
            }

            // Only alert if there are actual attendance records showing absences
            if (studentRecords.length === 0) return; // No records = no alert

            let level = null;
            if (consecutiveAbsences >= 4) { // 4+ consecutive absences = red
                level = 'red';
            } else if (consecutiveAbsences >= 2) { // 2-3 consecutive absences = orange
                level = 'orange';
            }

            if (level) {
                const lastSeenStr = lastPresentDate
                    ? lastPresentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Never attended';
                alerts.push({
                    student: student,
                    servant: servantMap[student.servantId],
                    consecutiveAbsences: consecutiveAbsences,
                    daysAbsent: consecutiveAbsences, // kept for backward compat in templates
                    level: level,
                    lastSeen: lastSeenStr
                });
            }
        });

        return alerts.sort((a, b) => b.consecutiveAbsences - a.consecutiveAbsences);
    }

    async updateStats() {
        const students = await this.getAllStudents();
        const todayStr = new Date().toISOString().split('T')[0];
        const todayAttendance = await this.getAttendanceForDate(todayStr);

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
        const navMap = { home: 0, attendance: 1, students: 2, history: 3, servants: 4 };
        if (navMap[viewId] !== undefined) {
            document.querySelectorAll('.nav-item')[navMap[viewId]].classList.add('active');
        }

        this.currentView = viewId;
    }

    showHome() {
        this.showView('home');
        this.updateStats();
        this.loadBirthdays();
        this.loadAbsenceAlerts();
    }

    async loadBirthdays() {
        const students = await this.getAllStudents();
        const today = new Date();
        const todayMonth = today.getMonth() + 1;
        const todayDate = today.getDate();

        const upcomingBirthdays = [];

        students.forEach(s => {
            if (!s.birthday) return;

            const parts = s.birthday.split('-');
            const bMonth = parseInt(parts[1], 10);
            const bDay = parseInt(parts[2], 10);

            let nextBday = new Date(today.getFullYear(), bMonth - 1, bDay);
            // If birthday passed this year (and not today), it's next year
            if (nextBday < today && (bMonth !== todayMonth || bDay !== todayDate)) {
                nextBday = new Date(today.getFullYear() + 1, bMonth - 1, bDay);
            }

            // Diff in ms, convert to days
            const diffTime = nextBday - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // Show if within 14 days
            if (diffDays >= 0 && diffDays <= 14) {
                upcomingBirthdays.push({
                    student: s,
                    days: diffDays,
                    isToday: diffDays === 0 || (bMonth === todayMonth && bDay === todayDate)
                });
            }
        });

        upcomingBirthdays.sort((a, b) => a.days - b.days);

        const section = document.getElementById('birthday-section');
        const list = document.getElementById('birthday-list');

        if (upcomingBirthdays.length === 0) {
            section.style.display = 'block';
            list.innerHTML = `<div style="padding: 10px; color: var(--on-surface-variant); font-size: 0.9rem;">No upcoming birthdays in the next 14 days.</div>`;
            return;
        }

        section.style.display = 'block';
        list.innerHTML = upcomingBirthdays.map(b => {
            const subtitle = b.isToday ? '🎉 Today!' : `In ${b.days} day${b.days > 1 ? 's' : ''}`;
            let bdateStr = '';
            if (b.student.birthday) {
                const parts = b.student.birthday.split('-');
                bdateStr = `${parts[1]}/${parts[2]}`;
            }
            return `
                <div class="student-card">
                    <div class="student-info">
                        <span class="student-name">${b.student.name} <span style="color: var(--on-surface-variant); font-size: 0.8rem; font-weight: normal; margin-left: 6px;">(${bdateStr})</span></span>
                        <span class="student-details" style="color: ${b.isToday ? 'var(--primary)' : 'inherit'}; font-weight: ${b.isToday ? 'bold' : 'normal'}">${subtitle}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    async showAbsenceAlerts() {
        this.showView('absence-alerts');
        await this.loadAbsenceAlerts(true);
    }

    async loadAbsenceAlerts(isFullView = false) {
        const alerts = await this.calculateAbsenceAlerts();
        const section = document.getElementById('absence-alerts-section');
        const list = isFullView ? document.getElementById('full-absence-alerts-list') : document.getElementById('absence-alerts-list');

        if (alerts.length === 0) {
            if (!isFullView) {
                section.style.display = 'block';
                list.innerHTML = `<div style="padding: 10px; color: var(--success); font-size: 0.9rem;"><span class="material-icons-round" style="font-size: 16px; vertical-align: middle; margin-right: 4px;">celebration</span>No students have been absent for 2+ weeks!</div>`;
            } else {
                list.innerHTML = `
                    <div class="empty-state">
                        <span class="material-icons-round celebration">celebration</span>
                        <p>All students are attending regularly!</p>
                    </div>
                `;
            }
            return;
        }

        if (!isFullView) section.style.display = 'block';

        // Show only top 3 on home, all on full view
        const displayAlerts = isFullView ? alerts : alerts.slice(0, 3);

        list.innerHTML = displayAlerts.map((a, index) => {
            const color = a.level === 'red' ? 'var(--danger)' : 'var(--warning)';
            const icon = a.level === 'red' ? 'home' : 'call';
            const text = a.level === 'red' ? 'Visit' : 'Call';
            const daysStr = `${a.consecutiveAbsences} Week${a.consecutiveAbsences > 1 ? 's' : ''} Absent`;
            const servantName = a.servant ? a.servant.name : 'No Servant';
            const delay = index * 0.05;

            return `
                <div class="student-card" style="border-left: 4px solid ${color}; animation-delay: ${delay}s;" onclick="app.editStudent(${a.student.id})">
                    <div class="student-info">
                        <span class="student-name">
                            ${a.student.name} 
                            <span style="background: ${color}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; margin-left: 8px; display: inline-flex; align-items: center; gap: 4px;">
                                <span class="material-icons-round" style="font-size: 10px;">${icon}</span>${text}
                            </span>
                        </span>
                        <span class="student-details" style="color: var(--on-surface-variant);">
                            ${daysStr} • ${a.lastSeen}
                        </span>
                        <span class="student-details" style="color: var(--primary); font-size: 0.8rem; margin-top: 4px;">
                            <span class="material-icons-round" style="font-size: 12px; vertical-align: middle;">volunteer_activism</span> ${servantName}
                        </span>
                    </div>
                    <span class="material-icons-round" style="color: var(--on-surface-variant);">chevron_right</span>
                </div>
            `;
        }).join('');
    }

    async showTakeAttendance() {
        this.showSelectFilter('attendance');
    }

    async showTakeAttendanceInternal() {
        this.showView('attendance');
        await this.loadAttendanceForDate();
    }

    async showSelectFilter(targetView) {
        this.targetFilterView = targetView;
        document.getElementById('filter-view-title').textContent =
            targetView === 'attendance' ? 'Attendance Section' : 'Student Section';

        // Reset chips
        document.querySelectorAll('#grade-filter-grid .filter-chip').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('#gender-filter-grid .filter-chip').forEach(c => c.classList.remove('active'));

        // Apply previous selections
        const gradeChips = document.querySelectorAll('#grade-filter-grid .filter-chip');
        const genderChips = document.querySelectorAll('#gender-filter-grid .filter-chip');

        gradeChips.forEach(c => {
            const grade = c.getAttribute('onclick').match(/'(.*?)'/)[1];
            if (this.filterGrades.includes(grade) || (grade === 'All' && this.filterGrades.length === 3)) {
                c.classList.add('active');
            }
        });

        genderChips.forEach(c => {
            const gender = c.getAttribute('onclick').match(/'(.*?)'/)[1];
            if (this.filterGender === gender) {
                c.classList.add('active');
            }
        });

        this.showView('select-filter');
    }

    setFilterGrade(grade, el) {
        const gradeChips = document.querySelectorAll('#grade-filter-grid .filter-chip');

        if (grade === 'All') {
            const isAllSelected = this.filterGrades.length === 3;
            if (isAllSelected) {
                this.filterGrades = [];
                gradeChips.forEach(c => c.classList.remove('active'));
            } else {
                this.filterGrades = ['6', '7', '8'];
                gradeChips.forEach(c => c.classList.add('active'));
            }
            return;
        }

        if (this.filterGrades.includes(grade)) {
            this.filterGrades = this.filterGrades.filter(g => g !== grade);
            el.classList.remove('active');
        } else {
            this.filterGrades.push(grade);
            el.classList.add('active');
        }

        // Update "Both Grades" chip active state
        const allChip = Array.from(gradeChips).find(c => c.textContent.includes('Both'));
        if (allChip) {
            if (this.filterGrades.length === 3) allChip.classList.add('active');
            else allChip.classList.remove('active');
        }
    }

    setFilterGender(gender, el) {
        document.querySelectorAll('#gender-filter-grid .filter-chip').forEach(c => c.classList.remove('active'));
        el.classList.add('active');
        this.filterGender = gender;
    }

    applyFilters() {
        if (this.filterGrades.length === 0) {
            this.showToast('Please select at least one grade!', 'error');
            return;
        }
        if (!this.filterGender) {
            this.showToast('Please select a section (Boys, Girls, or Both)!', 'error');
            return;
        }

        if (this.targetFilterView === 'attendance') {
            this.showTakeAttendanceInternal();
        } else if (this.targetFilterView === 'students') {
            this.showAllStudentsInternal();
        }
    }

    async loadAttendanceForDate() {
        const date = document.getElementById('attendance-date').value;
        let students = await this.getAllStudents();
        const attendance = await this.getAttendanceForDate(date);

        // Apply Grade/Gender filters
        if (this.filterGrades.length > 0) {
            students = students.filter(s => {
                const grade = String(s.grade || '').replace('.0', '');
                return this.filterGrades.includes(grade);
            });
        }
        if (this.filterGender && this.filterGender !== 'All') {
            students = students.filter(s => {
                const g = (s.gender || '').toLowerCase().trim();
                if (this.filterGender === 'Boy') return g === 'boy' || g === 'male' || g === 'm' || g === 'boys';
                if (this.filterGender === 'Girl') return g === 'girl' || g === 'female' || g === 'f' || g === 'girls';
                return true;
            });
        }

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
            const isPresent = attendanceMap[s.id] === true;
            const isAbsent = attendanceMap[s.id] === false;
            const statusClass = isPresent ? 'is-present' : (isAbsent ? 'is-absent' : '');

            const record = attendance.find(a => a.studentId === s.id);
            const liturgy = record?.liturgy || null;

            this.attendanceData[s.id] = {
                present: attendanceMap[s.id],
                liturgy: liturgy
            };

            return `
                <div class="student-card ${statusClass}" id="student-${s.id}">
                    <div class="student-info-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <div>
                            <div class="student-name" style="font-size: 1.1rem; font-weight: 700;">${s.name}</div>
                            <div class="student-grade" style="color: var(--on-surface-variant); font-size: 0.85rem;">
                                ${s.grade ? `Grade ${s.grade}` : ''} ${s.gender ? `• ${s.gender}` : ''}
                            </div>
                        </div>
                        <div class="attendance-status-badge" style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; padding: 4px 10px; border-radius: 20px; ${isPresent ? 'background: var(--success); color: white;' : (isAbsent ? 'background: var(--error); color: white;' : 'background: var(--surface-variant); color: var(--on-surface-variant);')}">
                            ${isPresent ? 'Present' : (isAbsent ? 'Absent' : 'Not Marked')}
                        </div>
                    </div>
                    <div class="attendance-buttons">
                        <button class="att-btn present ${isPresent ? 'active' : ''}" 
                                onclick="app.markAttendance(${s.id}, true)">
                            <span class="material-icons-round">check</span>
                            <span>Present</span>
                        </button>
                        <button class="att-btn absent ${isAbsent ? 'active' : ''}" 
                                onclick="app.markAttendance(${s.id}, false)">
                            <span class="material-icons-round">close</span>
                            <span>Absent</span>
                        </button>
                    </div>
                    <div class="attendance-details" id="details-${s.id}" style="${isPresent === true ? '' : 'display:none; margin-top: 10px;'}">
                        <div class="liturgy-options" style="display: flex; gap: 15px;">
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
                            <label class="radio-label">
                                <input type="radio" name="liturgy-${s.id}" value="both" 
                                       ${liturgy === 'both' ? 'checked' : ''}
                                       onchange="app.updateLiturgy(${s.id}, 'both')">
                                <span>Both</span>
                            </label>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async markAttendance(studentId, present) {
        if (!this.attendanceData[studentId]) {
            this.attendanceData[studentId] = {};
        }
        this.attendanceData[studentId].present = present;

        const card = document.getElementById(`student-${studentId}`);
        if (card) {
            card.querySelectorAll('.att-btn').forEach(b => b.classList.remove('active'));
            card.querySelector(present ? '.present' : '.absent').classList.add('active');

            // Update visual state
            card.classList.remove('is-present', 'is-absent');
            card.classList.add(present ? 'is-present' : 'is-absent');

            const badge = card.querySelector('.attendance-status-badge');
            if (badge) {
                badge.textContent = present ? 'Present' : 'Absent';
                badge.style.background = present ? 'var(--success)' : 'var(--error)';
                badge.style.color = 'white';
            }

            // Show/hide details based on presence
            const details = document.getElementById(`details-${studentId}`);
            if (details) {
                details.style.display = present ? '' : 'none';
            }
        }

        // Auto-save to DB
        const date = document.getElementById('attendance-date').value;
        await this.saveAttendanceRecord(
            parseInt(studentId),
            date,
            present,
            this.attendanceData[studentId].liturgy || null
        );
        this.updateStats();
    }

    async updateLiturgy(studentId, value) {
        if (!this.attendanceData[studentId]) {
            this.attendanceData[studentId] = {};
        }
        this.attendanceData[studentId].liturgy = value;

        // Auto-save to DB
        const date = document.getElementById('attendance-date').value;
        const present = this.attendanceData[studentId].present;
        if (present !== undefined) {
            await this.saveAttendanceRecord(
                parseInt(studentId),
                date,
                present,
                value
            );
        }
    }

    async markAllPresent() {
        const date = document.getElementById('attendance-date').value;
        // Only mark students CURRENTLY VISIBLE (filtered)
        const container = document.getElementById('attendance-list');
        const visibleStudentCards = container.querySelectorAll('.student-card');

        let count = 0;
        for (const card of visibleStudentCards) {
            const studentId = parseInt(card.id.replace('student-', ''));
            await this.saveAttendanceRecord(studentId, date, true, this.attendanceData[studentId]?.liturgy || null);
            count++;
        }

        this.showToast(`Marked ${count} students as Present`, 'success');
        await this.loadAttendanceForDate();
        this.updateStats();
    }

    async markAllAbsent() {
        if (!confirm('Mark all VISIBLE students as Absent for today?')) return;
        const date = document.getElementById('attendance-date').value;
        const container = document.getElementById('attendance-list');
        const visibleStudentCards = container.querySelectorAll('.student-card');

        let count = 0;
        for (const card of visibleStudentCards) {
            const studentId = parseInt(card.id.replace('student-', ''));
            await this.saveAttendanceRecord(studentId, date, false, null);
            count++;
        }

        this.showToast(`Marked ${count} students as Absent`, 'warning');
        await this.loadAttendanceForDate();
        this.updateStats();
    }


    async showAllStudents() {
        this.showSelectFilter('students');
    }

    async showAllStudentsInternal() {
        this.showView('students');
        await this.loadStudentsList();
    }

    async loadStudentsList(filter = '') {
        let students = await this.getAllStudents();

        // Apply Grade/Gender filters
        if (this.filterGrades.length > 0) {
            students = students.filter(s => {
                const grade = String(s.grade || '').replace('.0', '');
                return this.filterGrades.includes(grade);
            });
        }
        if (this.filterGender && this.filterGender !== 'All') {
            students = students.filter(s => {
                const g = (s.gender || '').toLowerCase().trim();
                if (this.filterGender === 'Boy') return g === 'boy' || g === 'male' || g === 'm' || g === 'boys';
                if (this.filterGender === 'Girl') return g === 'girl' || g === 'female' || g === 'f' || g === 'girls';
                return true;
            });
        }

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

        const alerts = await this.calculateAbsenceAlerts();
        const alertMap = {};
        alerts.forEach(a => alertMap[a.student.id] = a);

        container.innerHTML = students.map(s => {
            const alert = alertMap[s.id];
            let badgeHtml = '';
            if (alert) {
                const color = alert.level === 'red' ? 'var(--danger)' : 'var(--warning)';
                const icon = alert.level === 'red' ? 'home' : 'call';
                const text = alert.level === 'red' ? 'Visit' : 'Call';
                badgeHtml = `<span style="background: ${color}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; margin-left: 8px; display: inline-flex; align-items: center; gap: 4px;"><span class="material-icons-round" style="font-size: 10px;">${icon}</span>${text}</span>`;
            }

            return `
            <div class="student-card" onclick="app.editStudent(${s.id})">
                <div class="student-info">
                    <span class="student-name">${s.name} ${badgeHtml}</span>
                    <span class="student-details">${s.grade ? `Grade ${s.grade}` : ''} ${s.address ? `• ${s.address}` : ''} ${s.phone ? `• ${s.phone}` : ''}</span>
                </div>
                <span class="material-icons-round">chevron_right</span>
            </div>
            `;
        }).join('');
    }

    searchStudents(query) {
        this.loadStudentsList(query);
    }

    // ==================== SERVANTS UI ====================

    async showServants() {
        this.showView('servants');
        await this.loadServantsList();

        // Fix timezone offset for today's date checking
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const today = `${year}-${month}-${day}`;
        document.getElementById('servants-admin-actions').style.display = this.isAdmin ? 'block' : 'none';

        await this.loadServantEftikadForDate(today);
    }

    async loadServantsList(filter = '') {
        let servants = await this.getAllServants();
        let students = await this.getAllStudents();
        const alerts = await this.calculateAbsenceAlerts();

        // Map alerts to students
        const alertMap = {};
        alerts.forEach(a => alertMap[a.student.id] = a);

        if (filter) {
            servants = servants.filter(s =>
                s.name.toLowerCase().includes(filter.toLowerCase())
            );
        }

        const container = document.getElementById('servants-list');

        if (servants.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-round">volunteer_activism</span>
                    <p>${filter ? 'No matching servants' : 'No servants added yet'}</p>
                </div>
            `;
            return;
        }

        // Load ALL eftikad history to find most recent visit per student
        const allEftikad = await this.getAllServantEftikad();
        // Build a map: studentId -> most recent visit record
        const eftikadMap = {};
        allEftikad.forEach(a => {
            const studentId = a.servantId; // servantId column actually stores studentId
            const val = a.eftikad;
            const wasVisited = val === true || (typeof val === 'object' && val?.checked);
            if (!wasVisited) return; // skip unchecked records
            // Keep the most recent visit
            if (!eftikadMap[studentId] || a.date > eftikadMap[studentId].date) {
                eftikadMap[studentId] = {
                    checked: true,
                    date: a.date,
                    displayDate: new Date(a.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                };
            }
        });

        container.innerHTML = servants.map(servant => {
            const assignedStudents = students.filter(st => st.servantId == servant.id);

            const redAlerts = assignedStudents.filter(st => alertMap[st.id]?.level === 'red');
            const orangeAlerts = assignedStudents.filter(st => alertMap[st.id]?.level === 'orange');
            const regularStudents = assignedStudents.filter(st => !alertMap[st.id]);

            const renderStudentGroup = (title, studentsArr, level) => {
                if (studentsArr.length === 0) return '';
                const color = level === 'red' ? 'var(--danger)' : level === 'orange' ? 'var(--warning)' : 'var(--primary)';
                const icon = level === 'red' ? 'error' : level === 'orange' ? 'warning' : 'check_circle';

                return `
                    <div style="margin-top: 15px;">
                        <div style="display: flex; align-items: center; gap: 6px; font-size: 0.8rem; font-weight: bold; color: ${color}; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid ${color}44; padding-bottom: 4px; margin-bottom: 8px;">
                            <span class="material-icons-round" style="font-size: 14px;">${icon}</span>
                            ${title} (${studentsArr.length})
                        </div>
                        ${studentsArr.map(st => {
                    const alert = alertMap[st.id];
                    let badgeHtml = '';
                    if (alert) {
                        const badgeText = alert.level === 'red' ? 'VISIT' : 'CALL';
                        badgeHtml = `<span style="background: ${color}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.65rem; font-weight: bold; margin-left: 8px;">${badgeText}</span>`;
                    }
                    const eftikadRecord = eftikadMap[st.id];
                    const hasChecked = eftikadRecord?.checked || false;
                    const existingVisitDate = eftikadRecord?.displayDate || (hasChecked ? 'Previously' : '—');

                    return `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--outline-variant);">
                                <div style="flex: 1;">
                                    <div style="font-weight: 600; color: var(--on-surface); font-size: 0.95rem;">${st.name} ${badgeHtml}</div>
                                    <div style="display: flex; gap: 10px; margin-top: 2px;">
                                        ${st.grade ? `<span style="font-size: 0.75rem; color: var(--on-surface-variant);">Grade ${st.grade}</span>` : ''}
                                        ${alert ? `<span style="font-size: 0.75rem; color: ${color}; font-weight: 500;">${alert.consecutiveAbsences} week${alert.consecutiveAbsences > 1 ? 's' : ''} absent</span>` : ''}
                                    </div>
                                    ${st.address ? `<div style="font-size: 0.75rem; color: var(--on-surface-variant); margin-top: 2px;">${st.address}</div>` : ''}
                                    <div id="visit-date-${st.id}" style="font-size: 0.72rem; color: ${hasChecked ? 'var(--success)' : 'transparent'}; margin-top: 3px; font-weight: 500;">${hasChecked ? `Last visited: ${existingVisitDate}` : '—'}</div>
                                </div>
                                <label class="checkbox-label" style="margin: 0; transform: scale(0.9);">
                                    <input type="checkbox" ${hasChecked ? 'checked' : ''} 
                                           onchange="app.markServantEftikad(${st.id}, this.checked)">
                                    <span style="font-size: 0.8rem;">Visited</span>
                                </label>
                            </div>
                            `;
                }).join('')}
                    </div>
                `;
            };

            let studentsHtml = '';
            if (assignedStudents.length === 0) {
                studentsHtml = `<div style="padding: 10px; color: var(--on-surface-variant); font-size: 0.9rem;">No students assigned.</div>`;
            } else {
                studentsHtml = `
                    ${renderStudentGroup('🚨 Visit Required (4+ Weeks)', redAlerts, 'red')}
                    ${renderStudentGroup('⚠️ Call Required (2+ Weeks)', orangeAlerts, 'orange')}
                    ${renderStudentGroup('✅ Regular Attendance', regularStudents, 'regular')}
                `;
            }

            return `
            <div class="student-card" style="display: flex; flex-direction: column; cursor: default; margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; border-bottom: 2px solid var(--outline); padding-bottom: 10px; margin-bottom: 5px;">
                    <div class="student-info">
                        <span class="student-name" style="font-size: 1.1rem; color: var(--primary);">
                            <span class="material-icons-round" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">volunteer_activism</span>
                            ${servant.name} 
                            ${this.isAdmin ? `<span class="material-icons-round" style="font-size: 16px; margin-left: 8px; cursor: pointer; color: var(--primary);" onclick="app.editServant(${servant.id})">edit</span>` : ''}
                        </span>
                        <span class="student-details">${servant.phone ? `${servant.phone}` : ''}</span>
                    </div>
                </div>
                <div class="assigned-students-list" style="width: 100%;">
                    ${studentsHtml}
                </div>
            </div>`;
        }).join('');
    }

    searchServants(query) {
        this.loadServantsList(query);
    }

    async loadServantEftikadForDate(date) {
        const eftikad = await this.getServantEftikadForDate(date);
        this.servantAttendanceData = {};
        eftikad.forEach(a => {
            this.servantAttendanceData[a.servantId] = a.eftikad;
        });
    }

    async markServantEftikad(studentId, checked) {
        // Fix for timezone bug: get local date string YYYY-MM-DD instead of UTC ISO string
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const today = `${year}-${month}-${day}`;

        const displayDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        // Update the in-memory state
        this.servantAttendanceData[studentId] = checked ? { checked: true, date: displayDate } : false;

        // Update the visit-date label next to the checkbox immediately
        const label = document.getElementById(`visit-date-${studentId}`);
        if (label) {
            label.textContent = checked ? `Last visited: ${displayDate}` : '';
            label.style.color = checked ? 'var(--success)' : 'transparent';
        }

        // Auto-save to IndexedDB immediately so history is always preserved
        await this.saveServantEftikadRecord(parseInt(studentId), today, checked);
        if (checked) {
            this.showToast(`✓ Marked as visited on ${displayDate}`, 'success');
        }
    }

    async saveServantEftikad() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const date = `${year}-${month}-${day}`;
        let count = 0;

        for (const [studentId, val] of Object.entries(this.servantAttendanceData)) {
            const eftikadVal = (typeof val === 'object') ? val.checked : val;
            await this.saveServantEftikadRecord(
                parseInt(studentId),
                date,
                eftikadVal
            );
            count++;
        }

        this.showToast(`Saved visit tracking for ${count} students!`, 'success');
    }

    async showServantHistory() {
        const modal = document.getElementById('servant-history-modal');
        const list = document.getElementById('servant-history-list');
        const allEftikad = await this.getAllServantEftikad();
        const students = await this.getAllStudents();
        const studentMap = {};
        students.forEach(s => studentMap[s.id] = s);

        if (allEftikad.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-round">history</span>
                    <p>No visit records found.</p>
                </div>
            `;
            modal.classList.add('active');
            return;
        }

        // Group by Date
        const byDate = {};
        allEftikad.forEach(a => {
            const wasVisited = a.eftikad === true || (typeof a.eftikad === 'object' && a.eftikad?.checked);
            if (!wasVisited) return;

            if (!byDate[a.date]) byDate[a.date] = [];
            byDate[a.date].push(a);
        });

        const dates = Object.keys(byDate).sort().reverse();
        if (dates.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-round">history</span>
                    <p>No successful visits recorded yet.</p>
                </div>
            `;
            modal.classList.add('active');
            return;
        }

        list.innerHTML = dates.map(date => {
            const records = byDate[date];
            const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
            });

            return `
                <div class="student-card" style="padding: 16px;">
                    <div style="font-weight: bold; color: var(--primary-light); font-size: 1.05rem; margin-bottom: 12px; border-bottom: 1px solid var(--outline-variant); padding-bottom: 8px;">
                        ${displayDate}
                    </div>
                    <ul style="margin: 0; padding-left: 10px; list-style: none;">
                        ${records.map(r => {
                const name = studentMap[r.servantId]?.name || 'Unknown Student';
                return `<li style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: var(--on-surface);">
                                        <span class="material-icons-round" style="color: var(--success); font-size: 18px;">check_circle</span>
                                        ${name}
                                    </li>`;
            }).join('')}
                    </ul>
                </div>
            `;
        }).join('');

        modal.classList.add('active');
        document.getElementById('servant-history-sheet').classList.add('active');
    }

    showAddServant(fromView = 'servants') {
        this.editingServantId = null;
        this._addServantFromView = fromView;
        document.getElementById('add-servant-title').textContent = 'Add Servant';
        document.getElementById('servant-form').reset();

        // Remove existing delete button if there is one
        const oldDel = document.getElementById('servant-delete-btn');
        if (oldDel) oldDel.remove();

        this.showView('add-servant');
    }

    async editServant(id) {
        const servants = await this.getAllServants();
        const servant = servants.find(s => s.id === id);
        if (!servant) return;

        this.editingServantId = id;
        document.getElementById('add-servant-title').textContent = 'Edit Servant';
        document.getElementById('servant-name').value = servant.name;
        document.getElementById('servant-phone').value = servant.phone || '';
        document.getElementById('servant-email').value = servant.email || '';

        // Add delete button
        let delBtn = document.getElementById('servant-delete-btn');
        if (!delBtn) {
            delBtn = document.createElement('button');
            delBtn.id = 'servant-delete-btn';
            delBtn.type = 'button';
            delBtn.className = 'submit-btn danger';
            delBtn.style.marginTop = '10px';
            delBtn.innerHTML = '<span class="material-icons-round">delete</span>Delete Servant';
            delBtn.onclick = () => this.deleteCurrentServant();
            document.getElementById('servant-form').appendChild(delBtn);
        }

        this.showView('add-servant');
    }

    async saveServant(event) {
        event.preventDefault();

        const servantData = {
            name: document.getElementById('servant-name').value.trim(),
            phone: document.getElementById('servant-phone').value.trim(),
            email: document.getElementById('servant-email').value.trim()
        };

        if (this.editingServantId) {
            servantData.id = this.editingServantId;
            await this.updateServant(servantData);
            this.showToast('Servant updated!', 'success');
        } else {
            await this.addServant(servantData);
            this.showToast('Servant added!', 'success');
        }

        // Navigate back to the view that opened this screen
        if (this._addServantFromView === 'home') {
            this.showHome();
        } else {
            this.showServants();
        }
    }

    async deleteCurrentServant() {
        if (!this.editingServantId) return;

        if (confirm('Are you sure you want to delete this servant? This will also remove their Eftikad history.')) {
            await this.deleteServant(this.editingServantId);
            this.showToast('Servant deleted', 'info');
            this.showServants();
        }
    }

    // ==========================================

    async showHistory() {
        this.showView('history');

        let attendance = await this.getAllAttendance();
        const students = await this.getAllStudents();
        const studentMap = {};
        students.forEach(s => studentMap[s.id] = s);

        // Populate year filter if empty
        const yearFilter = document.getElementById('history-year-filter');
        if (yearFilter.options.length <= 1) {
            const years = new Set(attendance.map(a => a.date.split('-')[0]));
            if (years.size > 0) {
                const sortedYears = Array.from(years).sort().reverse();
                sortedYears.forEach(y => {
                    const opt = document.createElement('option');
                    opt.value = y;
                    opt.textContent = y;
                    yearFilter.appendChild(opt);
                });
            } else {
                const currentYear = new Date().getFullYear().toString();
                const opt = document.createElement('option');
                opt.value = currentYear;
                opt.textContent = currentYear;
                yearFilter.appendChild(opt);
            }
        }

        const selectedYear = yearFilter.value;
        const selectedGrade = document.getElementById('history-grade-filter').value;

        // Filter attendance
        if (selectedYear) {
            attendance = attendance.filter(a => a.date.startsWith(selectedYear));
        }
        if (selectedGrade) {
            attendance = attendance.filter(a => {
                const student = studentMap[a.studentId];
                return student && String(student.grade || '').replace('.0', '') === selectedGrade;
            });
        }

        // Group by date
        const byDate = {};

        // Group attendance
        attendance.forEach(a => {
            if (!byDate[a.date]) byDate[a.date] = { attendance: [], visits: [] };
            byDate[a.date].attendance.push(a);
        });

        // Fetch and group visits
        const allEftikad = await this.getAllServantEftikad();
        allEftikad.forEach(a => {
            const wasVisited = a.eftikad === true || (typeof a.eftikad === 'object' && a.eftikad?.checked);
            if (!wasVisited) return;

            if (!byDate[a.date]) byDate[a.date] = { attendance: [], visits: [] };
            byDate[a.date].visits.push(a);
        });

        // If filtering by grade, cleanly filter out dates that end up empty
        if (selectedGrade) {
            for (const date in byDate) {
                byDate[date].visits = byDate[date].visits.filter(v => {
                    const student = studentMap[v.servantId];
                    return student && String(student.grade || '').replace('.0', '') === selectedGrade;
                });
                if (byDate[date].attendance.length === 0 && byDate[date].visits.length === 0) {
                    delete byDate[date];
                }
            }
        }

        const container = document.getElementById('history-list');
        const dates = Object.keys(byDate).sort().reverse();

        if (dates.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-round">history</span>
                    <p>No records match the filters</p>
                </div>
            `;
            return;
        }

        container.innerHTML = dates.map(date => {
            const dayData = byDate[date];
            const presentRecords = dayData.attendance.filter(r => r.present);
            const absentRecords = dayData.attendance.filter(r => !r.present);
            const visitRecords = dayData.visits;

            const presentNames = presentRecords.map(r => {
                const name = studentMap[r.studentId]?.name || 'Unknown';
                const details = r.liturgy === 'full' ? ' (Liturgy)' : r.liturgy === 'sunday_school' ? ' (Sunday School)' : r.liturgy === 'both' ? ' (Both)' : '';
                return `<li>${name}${details}</li>`;
            }).join('');

            const absentNames = absentRecords.map(r => {
                const name = studentMap[r.studentId]?.name || 'Unknown';
                return `<li>${name}</li>`;
            }).join('');

            const visitNames = visitRecords.map(r => {
                const name = studentMap[r.servantId]?.name || 'Unknown';
                return `<li>${name}</li>`;
            }).join('');

            const dateStr = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
            });

            return `
                <div class="history-card" style="flex-direction: column; align-items: flex-start; gap: 10px;">
                    <div class="history-date" style="width: 100%; border-bottom: 1px solid var(--outline); padding-bottom: 8px; margin-bottom: 8px;">
                        ${dateStr}
                    </div>
                    <div class="history-details" style="width: 100%; display: flex; flex-direction: column; gap: 15px;">
                        <div class="present-list">
                            <div style="color: var(--success); font-weight: 600; margin-bottom: 4px;">✓ Present (${presentRecords.length})</div>
                            <ul style="margin: 0; padding-left: 20px; font-size: 0.9rem; color: var(--on-surface);">
                                ${presentNames || '<li>None</li>'}
                            </ul>
                        </div>
                        <div class="absent-list">
                            <div style="color: var(--danger); font-weight: 600; margin-bottom: 4px;">✗ Absent (${absentRecords.length})</div>
                            <ul style="margin: 0; padding-left: 20px; font-size: 0.9rem; color: var(--on-surface);">
                                ${absentNames || '<li>None</li>'}
                            </ul>
                        </div>
                        ${visitRecords.length > 0 ? `
                        <div class="visit-list">
                            <div style="color: var(--primary-light); font-weight: 600; margin-bottom: 4px;">✓ Servants Visited (${visitRecords.length})</div>
                            <ul style="margin: 0; padding-left: 20px; font-size: 0.9rem; color: var(--on-surface);">
                                ${visitNames}
                            </ul>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    async exportHistoryData() {
        let attendance = await this.getAllAttendance();
        let allEftikad = await this.getAllServantEftikad();
        const students = await this.getAllStudents();
        const studentMap = {};
        students.forEach(s => studentMap[s.id] = s);

        const selectedYear = document.getElementById('history-year-filter').value;
        const selectedGrade = document.getElementById('history-grade-filter').value;

        console.log(`Starting export. Pre-filter Attendance: ${attendance.length}, Pre-filter Visits: ${allEftikad.length}`);
        // Filter attendance
        if (selectedYear) {
            attendance = attendance.filter(a => a.date && a.date.startsWith(selectedYear));
            allEftikad = allEftikad.filter(a => a.date && a.date.startsWith(selectedYear));
        }
        if (selectedGrade) {
            attendance = attendance.filter(a => {
                const student = studentMap[a.studentId];
                return student && String(student.grade || '').replace('.0', '') === String(selectedGrade).replace('.0', '');
            });
            allEftikad = allEftikad.filter(a => {
                const student = studentMap[a.servantId];
                return student && String(student.grade || '').replace('.0', '') === String(selectedGrade).replace('.0', '');
            });
        }

        // Filter eftikad for only ones that were visited
        allEftikad = allEftikad.filter(a => a.eftikad === true || (typeof a.eftikad === 'object' && a.eftikad?.checked));

        console.log(`Post-filter Attendance: ${attendance.length}, Post-filter Visits: ${allEftikad.length}`);

        if (attendance.length === 0 && allEftikad.length === 0) {
            this.showToast('No data to export for these filters', 'warning');
            return;
        }

        // Prepare Attendance data for Excel
        const excelData = attendance.map(a => {
            const student = studentMap[a.studentId] || {};
            return {
                'Date': a.date,
                'Student Name': student.name || 'Unknown',
                'Grade': student.grade || '',
                'Present': a.present ? 'Yes' : 'No',
                'Liturgy': a.liturgy === 'full' ? 'Full Liturgy' : a.liturgy === 'sunday_school' ? 'Sunday School Only' : 'N/A',
                'Email': student.email || '',
                'Birthday': student.birthday || '',
                'Phone': student.phone || ''
            };
        });

        const servants = await this.getAllServants();
        const servantMap = {};
        servants.forEach(s => servantMap[s.id] = s);

        // Prepare Visit data for Excel
        const visitExcelData = allEftikad.map(a => {
            const student = studentMap[a.servantId] || {}; // a.servantId stores the student's ID
            const servant = servantMap[student.assignedServantId || student.servantId] || {};
            return {
                'Visit Date': a.date,
                'Student Visited': student.name || 'Unknown',
                'Grade': student.grade || '',
                'Servant Name': servant.name || student.assignedServantName || 'Unknown Servant',
                'Phone': student.phone || '',
                'Address': student.address || ''
            };
        });

        // Create workbook
        const wb = XLSX.utils.book_new();

        if (excelData.length > 0) {
            const ws = XLSX.utils.json_to_sheet(excelData);
            // Set column widths
            ws['!cols'] = [
                { wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 10 },
                { wch: 20 }, { wch: 25 }, { wch: 12 }, { wch: 15 }
            ];
            XLSX.utils.book_append_sheet(wb, ws, 'Attendance Report');
        } else {
            // Just drop an empty sheet if there is no attendance but there are visits
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Message: 'No attendance records found.' }]), 'Attendance Report');
        }

        if (visitExcelData.length > 0) {
            const visitWs = XLSX.utils.json_to_sheet(visitExcelData);
            // Set column widths
            visitWs['!cols'] = [
                { wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 20 },
                { wch: 15 }, { wch: 30 }
            ];
            XLSX.utils.book_append_sheet(wb, visitWs, 'Servant Visits');
        } else {
            // Also append an empty sheet to make it obvious why the visit tab might be blank
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Message: 'No servant visits found for this period.' }]), 'Servant Visits');
        }

        let title = 'History-Export';
        if (selectedGrade) title += `-Grade${selectedGrade}`;
        if (selectedYear) title += `-${selectedYear}`;

        const filename = `${title}.xlsx`;
        XLSX.writeFile(wb, filename);

        this.showToast('Filtered report exported!', 'success');
    }

    async showAddStudent() {
        this.editingStudentId = null;
        document.getElementById('add-student-title').textContent = 'Add Student';
        document.getElementById('student-form').reset();
        await this.populateServantDropdown();
        this.showView('add-student');
    }

    async populateServantDropdown(selectedId = '') {
        const servants = await this.getAllServants();
        const select = document.getElementById('student-servant');
        select.innerHTML = '<option value="">None</option>' + servants.map(s => `
            <option value="${s.id}" ${s.id == selectedId ? 'selected' : ''}>${s.name}</option>
        `).join('');
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
        document.getElementById('student-birthday').value = student.birthday || '';
        document.getElementById('student-address').value = student.address || '';
        document.getElementById('student-gender').value = student.gender || '';
        document.getElementById('student-notes').value = student.notes || '';

        await this.populateServantDropdown(student.servantId);
        this.showView('add-student');
    }

    async saveStudent(event) {
        event.preventDefault();

        const student = {
            name: document.getElementById('student-name').value.trim(),
            grade: document.getElementById('student-grade').value,
            phone: document.getElementById('student-phone').value.trim(),
            email: document.getElementById('student-email').value.trim(),
            birthday: document.getElementById('student-birthday').value,
            address: document.getElementById('student-address').value.trim(),
            gender: document.getElementById('student-gender').value,
            servantId: document.getElementById('student-servant').value ? parseInt(document.getElementById('student-servant').value) : null,
            notes: document.getElementById('student-notes').value.trim(),
        };

        const studentData = { ...student };

        if (!student.name) {
            this.showToast('Please enter a name', 'error');
            return;
        }

        if (this.editingStudentId) {
            const existing = await this.getStudentById(this.editingStudentId);
            studentData.id = this.editingStudentId;
            studentData.joinDate = existing?.joinDate || new Date().toISOString().split('T')[0];
            await this.updateStudent(studentData);
            this.showToast('Student updated!', 'success');
        } else {
            studentData.joinDate = new Date().toISOString().split('T')[0];
            await this.addStudent(studentData);
            this.showToast('Student added successfully!', 'success');

            // Surprise: Celebration animation on the save button
            const btn = document.querySelector('#view-add-student .submit-btn');
            if (btn) {
                btn.classList.add('celebrate');
                setTimeout(() => btn.classList.remove('celebrate'), 600);
            }
        }

        this.showHome();
    }

    toggleAdminMode() {
        if (!this.isAdmin) {
            const pin = prompt("Enter Admin PIN:");
            if (pin !== "2121") {
                this.showToast("Incorrect Admin PIN", "error");
                return;
            }
        }

        this.isAdmin = !this.isAdmin;
        document.getElementById('admin-chip').classList.toggle('active', this.isAdmin);
        document.getElementById('admin-actions').style.display = this.isAdmin ? 'block' : 'none';

        // Change icon to show lock state
        const adminIcon = document.getElementById('admin-icon');
        if (adminIcon) {
            adminIcon.textContent = this.isAdmin ? 'lock_open' : 'lock';
        }

        const servantAdmin = document.getElementById('servants-admin-actions');
        if (servantAdmin) servantAdmin.style.display = this.isAdmin ? 'block' : 'none';

        if (this.isAdmin) {
            this.showToast("Admin mode unlocked 🔓", "success");
            if (this.currentView === "servants") this.loadServantsList(); // Reload to show edit buttons
            if (this.currentView === "students") this.loadStudentsList();
        } else {
            this.showToast("Admin mode locked 🔒", "info");
            if (this.currentView === "servants") this.loadServantsList(); // Reload to hide edit buttons
            if (this.currentView === "students") this.loadStudentsList();
        }
    }

    async clearAllData() {
        if (!confirm('Are you sure you want to delete ALL data? This cannot be undone!')) {
            return;
        }

        const transaction = this.db.transaction(['students', 'attendance', 'servants', 'servant_eftikad'], 'readwrite');
        transaction.objectStore('students').clear();
        transaction.objectStore('attendance').clear();
        transaction.objectStore('servants').clear();
        transaction.objectStore('servant_eftikad').clear();

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
                'Gender/Section': student.gender || '',
                'Present': a.present ? 'Yes' : 'No',
                'Liturgy': a.liturgy === 'full' ? 'Full Liturgy' : a.liturgy === 'sunday_school' ? 'Sunday School Only' : a.liturgy === 'both' ? 'Both' : 'N/A',
                'Email': student.email || '',
                'Birthday': student.birthday || '',
                'Phone': student.phone || '',
                'Address': student.address || ''
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
            { wch: 20 }, // Liturgy
            { wch: 25 }, // Email
            { wch: 12 }, // Birthday
            { wch: 15 }, // Phone
            { wch: 30 }  // Address
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
            .map(s => s.email);

        if (emails.length === 0) {
            this.showToast('No students with email addresses found', 'error');
            return;
        }

        // Send via backend API
        try {
            this.showToast('Sending announcement...', 'info');
            const response = await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subject: subject,
                    message: message,
                    recipients: emails
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.showToast(`Announcement sent securely to ${data.count} students!`, 'success');
                this.closeAnnouncement();
            } else {
                throw new Error(data.error || 'Failed to send email');
            }
        } catch (error) {
            console.error('Email error:', error);
            this.showToast(`Error: ${error.message}`, 'error');
        }
    }

    async emailServantsAlerts() {
        if (!confirm('This will send custom reminder emails to all servants regarding their absent students. Proceed?')) {
            return;
        }

        const alerts = await this.calculateAbsenceAlerts();

        // Group by servant
        const servantsAlerts = {};
        let missingEmailsCount = 0;

        alerts.forEach(alert => {
            if (!alert.servant) return; // Student has no servant assigned
            if (!alert.servant.email) {
                missingEmailsCount++;
                return;
            }

            if (!servantsAlerts[alert.servant.email]) {
                servantsAlerts[alert.servant.email] = {
                    servantName: alert.servant.name,
                    students: []
                };
            }
            servantsAlerts[alert.servant.email].students.push(alert);
        });

        const servantEmails = Object.keys(servantsAlerts);
        if (servantEmails.length === 0) {
            this.showToast('No alerts to send, or no servants have email addresses configured.', 'warning');
            return;
        }

        this.showToast(`Sending customized emails to ${servantEmails.length} servants...`, 'info');

        let successCount = 0;
        let failCount = 0;

        for (const email of servantEmails) {
            const data = servantsAlerts[email];

            let message = `Hello ${data.servantName},\n\n`;
            message += `The following students assigned to you have been missing from St. John classes and require your attention:\n\n`;

            data.students.forEach(a => {
                const action = a.level === 'red' ? 'VISIT STUDENT' : 'CALL STUDENT';
                const daysStr = `${a.consecutiveAbsences} consecutive week${a.consecutiveAbsences > 1 ? 's' : ''}`;
                message += `- ${a.student.name} (Absent: ${daysStr})\n  ACTION REQUIRED: ${action}\n  Last Seen: ${a.lastSeen}\n\n`;
            });

            message += `Please reach out to them as soon as possible to check on them.\n\nGod Bless,\nSt. John Attendance System`;

            try {
                const response = await fetch('/api/send-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        subject: 'Action Required: Absent Students Follow-up',
                        message: message,
                        recipients: [email]
                    })
                });

                if (response.ok) {
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (error) {
                console.error('Failed to send to', email, error);
                failCount++;
            }
        }

        let toastMsg = `Successfully sent emails to ${successCount} servants.`;
        if (failCount > 0) toastMsg += ` (${failCount} failed).`;
        if (missingEmailsCount > 0) toastMsg += ` (Ignored ${missingEmailsCount} missing emails).`;

        this.showToast(toastMsg, successCount > 0 ? 'success' : 'warning');
    }

    // ==================== IMPORT ====================

    async importStudents(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            const existingStudents = await this.getAllStudents();
            let duplicateMap = {};
            existingStudents.forEach(s => duplicateMap[s.name.toLowerCase()] = s);

            const existingServants = await this.getAllServants();
            let servantMap = {};
            existingServants.forEach(s => servantMap[s.name.toLowerCase()] = { id: s.id, name: s.name });

            let imported = 0;
            let updated = 0;
            let skipped = 0;

            const todayStr = new Date().toISOString().split('T')[0];

            // Interactive Mode choice
            const mode = confirm("Import Options:\n\nOK: Update Existing (add new students, keep old ones)\nCancel: Clear and Upload (DELETE all current data first)")
                ? 'update' : 'clear';

            if (mode === 'clear') {
                const confirmed = confirm("⚠️ FATAL ACTION: This will permanently DELETE all current students and attendance history. Are you absolutely sure?");
                if (!confirmed) return;

                // Clear DB stores
                await new Promise((resolve, reject) => {
                    const transaction = this.db.transaction(['students', 'attendance', 'servant_eftikad'], 'readwrite');
                    transaction.objectStore('students').clear();
                    transaction.objectStore('attendance').clear();
                    transaction.objectStore('servant_eftikad').clear();
                    transaction.oncomplete = () => resolve();
                    transaction.onerror = () => reject(transaction.error);
                });

                // Refresh local maps after clear
                duplicateMap = {};
                servantMap = {};
                const freshServants = await this.getAllServants();
                freshServants.forEach(s => servantMap[s.name.toLowerCase()] = { id: s.id, name: s.name });
            }

            for (const row of jsonData) {
                // Find column keys robustly (case-insensitive and partial match)
                const getVal = (keywords) => {
                    const key = Object.keys(row).find(k => keywords.some(kw => k.toLowerCase().includes(kw)));
                    return key ? row[key] : '';
                };

                const rawName = getVal(['name', 'student']);
                const name = rawName !== undefined && rawName !== null ? String(rawName) : '';

                if (!name || !name.trim()) {
                    skipped++;
                    continue;
                }

                const cleanName = name.trim();
                const existing = duplicateMap[cleanName.toLowerCase()];

                // Process Servant
                const rawServantName = getVal(['servant', 'teacher', 'leader', 'guide']);
                let assignedServantId = null;
                if (rawServantName) {
                    const sNameClean = String(rawServantName).trim();
                    if (sNameClean) {
                        const sLower = sNameClean.toLowerCase();
                        if (servantMap[sLower]) {
                            assignedServantId = servantMap[sLower].id;
                        } else {
                            // Add new servant automatically
                            const newServantId = await this.addServant({ name: sNameClean, phone: '', email: '' });
                            assignedServantId = newServantId;
                            servantMap[sLower] = { id: newServantId, name: sNameClean };
                        }
                    }
                }

                // Normalize grade: Excel may store 6 as 6.0
                let rawGrade = String(getVal(['grade', 'class', 'level'])).trim();
                if (rawGrade.endsWith('.0')) rawGrade = rawGrade.slice(0, -2);
                if (rawGrade === 'undefined' || rawGrade === 'null') rawGrade = '';

                // Normalize gender
                let rawGender = String(getVal(['gender', 'sex', 'section', 'gen'])).trim().toLowerCase();
                if (['boy', 'male', 'm', 'boys'].includes(rawGender)) rawGender = 'Boy';
                else if (['girl', 'female', 'f', 'girls'].includes(rawGender)) rawGender = 'Girl';
                else rawGender = String(getVal(['gender', 'sex', 'section', 'gen'])).trim() || '';

                const studentData = {
                    name: cleanName,
                    grade: rawGrade,
                    phone: String(getVal(['phone', 'mobile', 'cell', 'tel', 'phone number'])),
                    email: String(getVal(['email', 'e-mail'])),
                    birthday: String(getVal(['birthday', 'dob', 'birth'])),
                    address: String(getVal(['address', 'location', 'house', 'street', 'city'])),
                    gender: rawGender,
                    notes: String(getVal(['note', 'comment', 'remark', 'info'])),
                    servantId: assignedServantId || null,
                    joinDate: existing ? (existing.joinDate || todayStr) : todayStr
                };

                if (existing) {
                    studentData.id = existing.id;
                    await this.updateStudent(studentData);
                    updated++;
                } else {
                    const newId = await this.addStudent(studentData);
                    // Add new student to the map so we catch duplicates in the same file
                    duplicateMap[cleanName.toLowerCase()] = { id: newId, name: cleanName, ...studentData };
                    imported++;
                }
            }

            this.showToast(`Import completed: ${imported} added, ${updated} updated! (${skipped} skipped)`, 'success');
            this.updateStats();

            // Reset file input
            event.target.value = '';
        } catch (error) {
            console.error('Import error:', error);
            this.showToast('Import error: ' + (error.message || 'Check format'), 'error');
        }
    }

    downloadTemplate() {
        // Create sample template
        const template = [
            { Name: 'John Doe', Grade: '6', Phone: '555-1234', Email: 'john@example.com', Birthday: '2010-05-15', Servant: 'Peter', Notes: 'Sample student' },
            { Name: 'Jane Smith', Grade: '7', Phone: '555-5678', Email: 'jane@example.com', Birthday: '', Servant: 'Mary', Notes: '' }
        ];

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(template);

        // Set column widths
        ws['!cols'] = [
            { wch: 20 }, // Name
            { wch: 8 },  // Grade
            { wch: 15 }, // Phone
            { wch: 25 }, // Email
            { wch: 12 }, // Birthday
            { wch: 30 }  // Notes
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Students');
        XLSX.writeFile(wb, 'student-import-template.xlsx');

        this.showToast('Template downloaded!', 'success');
    }
}

// Initialize app
const app = new AttendanceApp();
