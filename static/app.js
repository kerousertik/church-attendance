// App State
const app = {
    currentView: 'home',
    selectedServant: null,
    selectedGrades: [],
    selectedGenders: [],
    students: [],
    allStudents: [],
    alertStudents: [],
    attendanceRecords: {},
    currentDate: new Date().toISOString().split('T')[0],
    alertFilter: 'all',
    isAdminMode: false,
    currentKid: null,
    servantKids: [],
    allServantKids: [],

    init() {
        this.loadAnalytics();
        this.showView('home');
        document.getElementById('current-date').textContent = this.formatDate(this.currentDate);
    },

    // Toast Notifications
    toast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = message;
        container.appendChild(toast);

        // Haptic feedback for Android
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }

        setTimeout(() => toast.remove(), 3000);
    },

    // Admin Mode Toggle
    toggleAdminMode() {
        this.isAdminMode = !this.isAdminMode;
        const chip = document.getElementById('admin-chip');
        const adminSection = document.getElementById('admin-actions');

        if (this.isAdminMode) {
            chip.classList.add('active');
            adminSection.style.display = 'block';
            this.toast('🔓 Admin mode enabled', 'success');
        } else {
            chip.classList.remove('active');
            adminSection.style.display = 'none';
            this.toast('🔒 Admin mode disabled', 'info');
        }
    },

    // View Management
    showView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const view = document.getElementById(`view-${viewId}`);
        if (view) {
            view.classList.add('active');
            this.currentView = viewId;
        }

        // Update bottom nav
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const navMap = { home: 0, servant: 1, filters: 1, list: 1, kids: 2, 'servant-kids': 2, 'kid-actions': 2, alerts: 3 };
        const navItems = document.querySelectorAll('.nav-item');
        if (navMap[viewId] !== undefined && navItems[navMap[viewId]]) {
            navItems[navMap[viewId]].classList.add('active');
        }
    },

    showHome() {
        this.showView('home');
        this.loadAnalytics();
    },

    // Analytics
    async loadAnalytics() {
        try {
            const response = await fetch('/api/analytics');
            const data = await response.json();

            document.getElementById('total-students').textContent = data.total_students || 0;
            document.getElementById('yellow-alerts').textContent = data.yellow_alerts || 0;
            document.getElementById('red-alerts').textContent = data.red_alerts || 0;
        } catch (e) {
            console.error('Error loading analytics', e);
        }
    },

    // Servants
    async showServants() {
        if (this.isAdminMode) {
            this.selectedServant = 'ADMIN';
            this.selectedGrades = [];
            this.selectedGenders = [];
            this.showFiltersAdmin();
            return;
        }

        this.showView('servant');
        const response = await fetch('/api/servants');
        const data = await response.json();

        const container = document.getElementById('servant-list');
        container.innerHTML = data.servants.map(servant => `
            <div class="list-card" onclick="app.selectServant('${this.escapeHtml(servant)}')">
                <div class="card-avatar">${servant.charAt(0)}</div>
                <div class="card-content">
                    <div class="card-title">${this.escapeHtml(servant)}</div>
                    <div class="card-subtitle">Tap to select</div>
                </div>
                <span class="material-icons-round" style="color: var(--on-surface-variant)">chevron_right</span>
            </div>
        `).join('');

        const datalist = document.getElementById('servant-list-data');
        if (datalist) {
            datalist.innerHTML = data.servants.map(s => `<option value="${this.escapeHtml(s)}">`).join('');
        }
    },

    selectServant(servant) {
        this.selectedServant = servant;
        this.selectedGrades = [];
        this.selectedGenders = [];
        this.showFilters();
    },

    // Filters
    async showFilters() {
        this.showView('filters');

        const response = await fetch(`/api/filters?servant=${encodeURIComponent(this.selectedServant)}`);
        const data = await response.json();

        const gradeContainer = document.getElementById('grade-buttons');
        gradeContainer.innerHTML = data.grades.map(grade => `
            <button class="chip ${this.selectedGrades.includes(grade) ? 'active' : ''}" 
                    onclick="app.toggleGrade(${grade})">
                Grade ${grade}
            </button>
        `).join('');

        const genders = [
            { value: 'M', label: 'Boys' },
            { value: 'F', label: 'Girls' }
        ];
        const genderContainer = document.getElementById('gender-buttons');
        genderContainer.innerHTML = genders.map(g => `
            <button class="chip ${this.selectedGenders.includes(g.value) ? 'active' : ''}" 
                    onclick="app.toggleGender('${g.value}')">
                ${g.label}
            </button>
        `).join('');

        this.updateLoadButton();
    },

    async showFiltersAdmin() {
        this.showView('filters');

        const grades = [6, 7, 8];
        const gradeContainer = document.getElementById('grade-buttons');
        gradeContainer.innerHTML = grades.map(grade => `
            <button class="chip ${this.selectedGrades.includes(grade) ? 'active' : ''}" 
                    onclick="app.toggleGradeAdmin(${grade})">
                Grade ${grade}
            </button>
        `).join('');

        const genders = [
            { value: 'M', label: 'Boys' },
            { value: 'F', label: 'Girls' }
        ];
        const genderContainer = document.getElementById('gender-buttons');
        genderContainer.innerHTML = genders.map(g => `
            <button class="chip ${this.selectedGenders.includes(g.value) ? 'active' : ''}" 
                    onclick="app.toggleGenderAdmin('${g.value}')">
                ${g.label}
            </button>
        `).join('');

        this.updateLoadButtonAdmin();
    },

    toggleGrade(grade) {
        const idx = this.selectedGrades.indexOf(grade);
        if (idx > -1) this.selectedGrades.splice(idx, 1);
        else this.selectedGrades.push(grade);
        this.showFilters();
    },

    toggleGender(gender) {
        const idx = this.selectedGenders.indexOf(gender);
        if (idx > -1) this.selectedGenders.splice(idx, 1);
        else this.selectedGenders.push(gender);
        this.showFilters();
    },

    toggleGradeAdmin(grade) {
        const idx = this.selectedGrades.indexOf(grade);
        if (idx > -1) this.selectedGrades.splice(idx, 1);
        else this.selectedGrades.push(grade);
        this.showFiltersAdmin();
    },

    toggleGenderAdmin(gender) {
        const idx = this.selectedGenders.indexOf(gender);
        if (idx > -1) this.selectedGenders.splice(idx, 1);
        else this.selectedGenders.push(gender);
        this.showFiltersAdmin();
    },

    updateLoadButton() {
        const btn = document.getElementById('load-students-btn');
        const hasFilters = this.selectedGrades.length > 0 && this.selectedGenders.length > 0;
        btn.disabled = !hasFilters;
        btn.onclick = () => this.loadStudents();

        if (hasFilters) {
            const gradeText = this.selectedGrades.sort().join(', ');
            const genderText = this.selectedGenders.map(g => g === 'M' ? 'Boys' : 'Girls').join(' & ');
            btn.innerHTML = `<span class="material-icons-round">check</span><span>Grade ${gradeText} ${genderText}</span>`;
        } else {
            btn.innerHTML = `<span class="material-icons-round">check</span><span>Select grades and genders</span>`;
        }
    },

    updateLoadButtonAdmin() {
        const btn = document.getElementById('load-students-btn');
        const hasFilters = this.selectedGrades.length > 0 && this.selectedGenders.length > 0;
        btn.disabled = !hasFilters;
        btn.onclick = () => this.loadStudentsAdmin();

        if (hasFilters) {
            const gradeText = this.selectedGrades.sort().join(', ');
            const genderText = this.selectedGenders.map(g => g === 'M' ? 'Boys' : 'Girls').join(' & ');
            btn.innerHTML = `<span class="material-icons-round">check</span><span>Grade ${gradeText} ${genderText}</span>`;
        } else {
            btn.innerHTML = `<span class="material-icons-round">check</span><span>Select grades and genders</span>`;
        }
    },

    // Load Students
    async loadStudents() {
        let allStudents = [];

        for (const grade of this.selectedGrades) {
            for (const gender of this.selectedGenders) {
                const params = new URLSearchParams({
                    servant: this.selectedServant,
                    grade: grade,
                    gender: gender
                });

                const response = await fetch(`/api/students?${params}`);
                const data = await response.json();
                allStudents = allStudents.concat(data.students);
            }
        }

        const seen = new Set();
        this.students = allStudents.filter(s => {
            if (seen.has(s.id)) return false;
            seen.add(s.id);
            return true;
        });

        const gradeText = this.selectedGrades.sort().map(g => `G${g}`).join(', ');
        const genderText = this.selectedGenders.map(g => g === 'M' ? 'Boys' : 'Girls').join(' & ');
        document.getElementById('filter-summary').textContent = `${gradeText} - ${genderText}`;

        this.showView('list');
        this.renderStudents();
    },

    async loadStudentsAdmin() {
        let allStudents = [];

        for (const grade of this.selectedGrades) {
            for (const gender of this.selectedGenders) {
                const params = new URLSearchParams({ grade, gender });
                const response = await fetch(`/api/students?${params}`);
                const data = await response.json();
                allStudents = allStudents.concat(data.students);
            }
        }

        const seen = new Set();
        this.students = allStudents.filter(s => {
            if (seen.has(s.id)) return false;
            seen.add(s.id);
            return true;
        });

        const gradeText = this.selectedGrades.sort().map(g => `G${g}`).join(', ');
        const genderText = this.selectedGenders.map(g => g === 'M' ? 'Boys' : 'Girls').join(' & ');
        document.getElementById('filter-summary').textContent = `${gradeText} - ${genderText} (Admin)`;

        this.showView('list');
        this.renderStudents();
    },

    // Render Students
    renderStudents() {
        const container = document.getElementById('student-list');

        if (this.students.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-round">group_off</span>
                    <h3>No students found</h3>
                    <p>Try different filters</p>
                </div>`;
            return;
        }

        container.innerHTML = this.students.map(s => {
            const status = this.attendanceRecords[s.id] || '';
            return `
                <div class="student-card">
                    <div class="student-header">
                        <div class="student-avatar">${s.gender === 'M' ? '👦' : '👧'}</div>
                        <div class="student-info">
                            <div class="student-name">${this.escapeHtml(s.name)}</div>
                            <div class="student-meta">Grade ${s.grade}</div>
                        </div>
                        ${s.alert_level !== 'none' ? `
                            <span class="card-badge ${s.alert_level === 'red' ? 'danger' : 'warning'}">
                                ${s.consecutive_absences} absent
                            </span>
                        ` : ''}
                    </div>
                    <div class="attendance-btns">
                        <button class="att-btn ${status === 'present' ? 'present' : ''}" 
                                onclick="app.markAttendance(${s.id}, 'present')">
                            <span class="material-icons-round">check</span> Present
                        </button>
                        <button class="att-btn ${status === 'absent' ? 'absent' : ''}" 
                                onclick="app.markAttendance(${s.id}, 'absent')">
                            <span class="material-icons-round">close</span> Absent
                        </button>
                    </div>
                    ${s.parent_phone ? `
                        <div class="student-actions">
                            <button class="action-icon-btn" onclick="app.callParent('${s.parent_phone}')" title="Call">
                                <span class="material-icons-round">phone</span>
                            </button>
                            <button class="action-icon-btn" onclick="app.smsParent('${s.parent_phone}')" title="SMS">
                                <span class="material-icons-round">sms</span>
                            </button>
                            <button class="action-icon-btn" onclick="app.showHistory(${s.id}, '${this.escapeHtml(s.name)}')" title="History">
                                <span class="material-icons-round">history</span>
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        this.updateSaveButton();
    },

    markAttendance(studentId, status) {
        if (this.attendanceRecords[studentId] === status) {
            delete this.attendanceRecords[studentId];
        } else {
            this.attendanceRecords[studentId] = status;
        }
        this.renderStudents();

        // Haptic
        if (navigator.vibrate) navigator.vibrate(30);
    },

    markAllPresent() {
        this.students.forEach(s => this.attendanceRecords[s.id] = 'present');
        this.renderStudents();
        this.toast('✅ All marked present', 'success');
    },

    markAllAbsent() {
        this.students.forEach(s => this.attendanceRecords[s.id] = 'absent');
        this.renderStudents();
        this.toast('❌ All marked absent', 'info');
    },

    updateSaveButton() {
        const count = Object.keys(this.attendanceRecords).length;
        const fab = document.getElementById('save-fab');
        const badge = document.getElementById('marked-count');

        if (count > 0) {
            fab.style.display = 'flex';
            badge.textContent = count;
        } else {
            fab.style.display = 'none';
        }
    },

    async saveAllAttendance() {
        const records = Object.entries(this.attendanceRecords).map(([studentId, status]) => ({
            student_id: parseInt(studentId),
            status: status
        }));

        if (records.length === 0) {
            this.toast('Please mark attendance first', 'error');
            return;
        }

        const response = await fetch('/api/batch-attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ records, date: this.currentDate })
        });

        if (response.ok) {
            this.toast(`✅ Saved ${records.length} records`, 'success');
            this.attendanceRecords = {};
            this.loadStudents();
        } else {
            this.toast('❌ Error saving', 'error');
        }
    },

    // Alerts
    async showAlertStudents() {
        this.showView('alerts');

        const response = await fetch('/api/students');
        const data = await response.json();

        this.alertStudents = data.students.filter(s => s.alert_level !== 'none');
        this.filterAlerts('all');
    },

    filterAlerts(filter) {
        this.alertFilter = filter;

        document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
        event?.target?.classList.add('active');

        let filtered = this.alertStudents;
        if (filter === 'red') filtered = this.alertStudents.filter(s => s.alert_level === 'red');
        else if (filter === 'yellow') filtered = this.alertStudents.filter(s => s.alert_level === 'yellow');

        const container = document.getElementById('alert-list');

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-round">check_circle</span>
                    <h3>No alerts</h3>
                    <p>All students are doing great!</p>
                </div>`;
            return;
        }

        container.innerHTML = filtered.map(s => `
            <div class="list-card" onclick="app.showAlertDetails(${s.id})">
                <div class="card-avatar" style="background: ${s.alert_level === 'red' ? 'rgba(242,184,181,0.2)' : 'rgba(255,183,77,0.2)'}; color: ${s.alert_level === 'red' ? 'var(--error)' : 'var(--warning)'}">
                    ${s.consecutive_absences}
                </div>
                <div class="card-content">
                    <div class="card-title">${this.escapeHtml(s.name)}</div>
                    <div class="card-subtitle">Grade ${s.grade} • ${s.consecutive_absences} consecutive absences</div>
                </div>
                <span class="card-badge ${s.alert_level === 'red' ? 'danger' : 'warning'}">
                    ${s.alert_level === 'red' ? 'Critical' : 'Warning'}
                </span>
            </div>
        `).join('');
    },

    async showAlertDetails(studentId) {
        const student = this.alertStudents.find(s => s.id === studentId);
        if (!student) return;

        this.currentKid = student;
        this.showKidDetails();
    },

    // All Kids Flow
    async showAllKids() {
        this.showView('kids');

        const response = await fetch('/api/servants');
        const data = await response.json();

        const container = document.getElementById('kids-servant-list');
        container.innerHTML = data.servants.map(servant => `
            <div class="list-card" onclick="app.selectServantForKids('${this.escapeHtml(servant)}')">
                <div class="card-avatar">${servant.charAt(0)}</div>
                <div class="card-content">
                    <div class="card-title">${this.escapeHtml(servant)}</div>
                    <div class="card-subtitle">View assigned kids</div>
                </div>
                <span class="material-icons-round" style="color: var(--on-surface-variant)">chevron_right</span>
            </div>
        `).join('');
    },

    async selectServantForKids(servant) {
        this.selectedServant = servant;
        this.showView('servant-kids');

        document.getElementById('servant-kids-title').textContent = `${servant}'s Kids`;

        const response = await fetch(`/api/students-by-servant?servant=${encodeURIComponent(servant)}`);
        const data = await response.json();

        this.servantKids = data.students;
        this.allServantKids = data.students;
        this.renderServantKids(data.students);
    },

    renderServantKids(kids) {
        const container = document.getElementById('servant-kids-list');

        if (kids.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-round">group_off</span>
                    <h3>No kids found</h3>
                    <p>This servant has no assigned kids</p>
                </div>`;
            return;
        }

        container.innerHTML = kids.map(kid => `
            <div class="list-card" onclick="app.selectKid(${kid.id})">
                <div class="card-avatar">${kid.gender === 'M' ? '👦' : '👧'}</div>
                <div class="card-content">
                    <div class="card-title">${this.escapeHtml(kid.name)}</div>
                    <div class="card-subtitle">Grade ${kid.grade}</div>
                </div>
                ${kid.alert_level !== 'none' ? `
                    <span class="card-badge ${kid.alert_level === 'red' ? 'danger' : 'warning'}">
                        ${kid.consecutive_absences}
                    </span>
                ` : ''}
            </div>
        `).join('');
    },

    searchServantKids(query) {
        if (!query) {
            this.renderServantKids(this.allServantKids);
            return;
        }
        const filtered = this.allServantKids.filter(k =>
            k.name.toLowerCase().includes(query.toLowerCase())
        );
        this.renderServantKids(filtered);
    },

    selectKid(kidId) {
        const kid = this.servantKids.find(k => k.id === kidId) || this.allServantKids.find(k => k.id === kidId);
        if (!kid) return;

        this.currentKid = kid;
        this.showView('kid-actions');
        document.getElementById('kid-action-title').textContent = `${kid.gender === 'M' ? '👦' : '👧'} ${kid.name}`;
    },

    backToServantKids() {
        this.selectServantForKids(this.selectedServant);
    },

    // Kid Details
    async showKidDetails() {
        if (!this.currentKid) return;

        const response = await fetch(`/api/student/${this.currentKid.id}/details`);
        const kid = await response.json();

        document.getElementById('kid-details-title').textContent = kid.name;

        const content = document.getElementById('kid-details-content');
        content.innerHTML = `
            <div class="detail-sections">
                <div class="detail-section">
                    <h4><span class="material-icons-round">person</span> Basic Info</h4>
                    <div class="detail-item"><span class="detail-label">Grade</span><span class="detail-value">${kid.grade}</span></div>
                    <div class="detail-item"><span class="detail-label">Gender</span><span class="detail-value">${kid.gender === 'M' ? 'Boy' : 'Girl'}</span></div>
                    <div class="detail-item"><span class="detail-label">Servant</span><span class="detail-value">${this.escapeHtml(kid.servant || '')}</span></div>
                    ${kid.dob ? `<div class="detail-item"><span class="detail-label">Birthday</span><span class="detail-value">${kid.dob}</span></div>` : ''}
                </div>

                <div class="detail-section">
                    <h4><span class="material-icons-round">phone</span> Contact</h4>
                    ${kid.phone ? `<div class="detail-item"><span class="detail-label">Phone</span><span class="detail-value"><a href="tel:${kid.phone}">${kid.phone}</a></span></div>` : ''}
                    ${kid.parent_phone ? `<div class="detail-item"><span class="detail-label">Parent</span><span class="detail-value"><a href="tel:${kid.parent_phone}">${kid.parent_phone}</a></span></div>` : ''}
                    ${kid.address ? `<div class="detail-item"><span class="detail-label">Address</span><span class="detail-value">${this.escapeHtml(kid.address)}</span></div>` : ''}
                    ${!kid.phone && !kid.parent_phone ? '<div class="detail-item"><span class="detail-label">No contact info</span></div>' : ''}
                </div>

                <div class="detail-section">
                    <h4><span class="material-icons-round">event_available</span> Attendance</h4>
                    <div class="detail-item"><span class="detail-label">Consecutive Absences</span><span class="detail-value">${kid.consecutive_absences || 0}</span></div>
                    ${kid.alert_level !== 'none' ? `
                        <div class="detail-item"><span class="detail-label">Status</span><span class="card-badge ${kid.alert_level === 'red' ? 'danger' : 'warning'}">${kid.alert_level === 'red' ? 'Critical' : 'Warning'}</span></div>
                    ` : ''}
                    ${kid.attendance_history && kid.attendance_history.length > 0 ?
                kid.attendance_history.slice(0, 5).map(h => `
                            <div class="detail-item">
                                <span class="detail-label">${this.formatDate(h.date)}</span>
                                <span class="detail-value">${h.status === 'present' ? '✅' : '❌'}</span>
                            </div>
                        `).join('') : '<div class="detail-item"><span class="detail-label">No history</span></div>'}
                </div>

                <div class="detail-section">
                    <h4><span class="material-icons-round">notes</span> Notes</h4>
                    ${kid.notes && kid.notes.length > 0 ?
                kid.notes.map(n => `
                            <div class="note-item">
                                <div class="note-text">${this.escapeHtml(n.note_text)}</div>
                                <div class="note-meta">${n.created_by ? n.created_by + ' • ' : ''}${this.formatDate(n.created_at)}</div>
                            </div>
                        `).join('') : '<p style="color: var(--on-surface-variant)">No notes yet</p>'}
                </div>
            </div>
        `;

        this.openSheet('kid-details-sheet');
    },

    closeKidDetailsModal() {
        this.closeSheet('kid-details-sheet');
    },

    // Add Note
    showAddNote() {
        if (!this.currentKid) return;
        document.getElementById('note-kid-name').textContent = this.currentKid.name;
        document.getElementById('add-note-form').reset();
        this.openSheet('add-note-sheet');
    },

    closeAddNoteModal() {
        this.closeSheet('add-note-sheet');
    },

    async submitNote(event) {
        event.preventDefault();

        const noteText = document.getElementById('note-text').value.trim();
        const createdBy = document.getElementById('note-created-by').value.trim();

        if (!noteText) {
            this.toast('Please enter a note', 'error');
            return;
        }

        const response = await fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_id: this.currentKid.id,
                note_text: noteText,
                created_by: createdBy
            })
        });

        if (response.ok) {
            this.toast('✅ Note saved!', 'success');
            this.closeAddNoteModal();
        } else {
            this.toast('❌ Error saving note', 'error');
        }
    },

    // Student Management
    showAddStudent() {
        document.getElementById('student-modal-title').textContent = 'Add Student';
        document.getElementById('student-form').reset();
        document.getElementById('student-form').removeAttribute('data-id');
        this.openSheet('student-sheet');
    },

    closeStudentModal() {
        this.closeSheet('student-sheet');
    },

    async submitStudent(event) {
        event.preventDefault();

        const studentData = {
            name: document.getElementById('student-name').value.trim(),
            servant: document.getElementById('student-servant').value.trim(),
            grade: parseInt(document.getElementById('student-grade').value),
            gender: document.getElementById('student-gender').value,
            phone: document.getElementById('student-phone').value.trim(),
            parent_phone: document.getElementById('student-parent-phone').value.trim(),
            dob: document.getElementById('student-dob').value,
            address: document.getElementById('student-address').value.trim(),
            comments: document.getElementById('student-comments').value.trim()
        };

        const response = await fetch('/api/student', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(studentData)
        });

        if (response.ok) {
            this.toast('✅ Student saved!', 'success');
            this.closeStudentModal();
            this.loadAnalytics();
        } else {
            this.toast('❌ Error saving student', 'error');
        }
    },

    // Servant Management
    showAddServant() {
        document.getElementById('servant-form').reset();
        this.openSheet('servant-sheet');
    },

    closeServantModal() {
        this.closeSheet('servant-sheet');
    },

    async submitServant(event) {
        event.preventDefault();

        const name = document.getElementById('new-servant-name').value.trim();
        const phone = document.getElementById('new-servant-phone').value.trim();

        if (!name) {
            this.toast('Please enter a name', 'error');
            return;
        }

        const response = await fetch('/api/servant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone })
        });

        if (response.ok) {
            this.toast('✅ Servant added!', 'success');
            this.closeServantModal();
        } else {
            this.toast('❌ Error adding servant', 'error');
        }
    },

    // Excel
    exportExcel() {
        window.location.href = '/api/export';
        this.toast('📥 Downloading...', 'success');
    },

    triggerUploadExcel() {
        document.getElementById('excel-upload').click();
    },

    async uploadExcel(event) {
        const file = event.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        this.toast('📤 Uploading...', 'info');

        try {
            const response = await fetch('/api/upload-excel', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            if (response.ok) {
                this.toast(`✅ ${data.message}`, 'success');
                this.loadAnalytics();
            } else {
                this.toast(`❌ ${data.error}`, 'error');
            }
        } catch (error) {
            this.toast('❌ Error uploading', 'error');
        }

        event.target.value = '';
    },

    // History
    async showHistory(studentId, studentName) {
        const response = await fetch(`/api/student/${studentId}/history`);
        const data = await response.json();

        // Use kid details sheet for history
        document.getElementById('kid-details-title').textContent = `${studentName}'s History`;
        document.getElementById('kid-details-content').innerHTML = data.history.length > 0 ?
            data.history.map(h => `
                <div class="detail-item">
                    <span class="detail-label">${this.formatDate(h.date)}</span>
                    <span class="detail-value">${h.status === 'present' ? '✅ Present' : '❌ Absent'}</span>
                </div>
            `).join('') : '<p style="color: var(--on-surface-variant); text-align: center;">No history</p>';

        this.openSheet('kid-details-sheet');
    },

    // Contact
    callParent(phone) {
        if (phone) window.location.href = `tel:${phone}`;
    },

    smsParent(phone) {
        if (phone) window.location.href = `sms:${phone}`;
    },

    // Bottom Sheet Management
    openSheet(sheetId) {
        document.getElementById('modal-overlay').classList.add('active');
        document.getElementById(sheetId).classList.add('active');
    },

    closeSheet(sheetId) {
        document.getElementById('modal-overlay').classList.remove('active');
        document.getElementById(sheetId).classList.remove('active');
    },

    closeAllModals() {
        document.getElementById('modal-overlay').classList.remove('active');
        document.querySelectorAll('.bottom-sheet').forEach(s => s.classList.remove('active'));
    },

    // Utilities
    formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => app.init());
