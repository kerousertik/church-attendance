// Offline Attendance App - IndexedDB Storage
// Works completely standalone without server

const DB_NAME = 'AttendanceDB';
const DB_VERSION = 5;
const ALL_GRADES = ['Pre K3', 'Pre K4', 'KG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

class AttendanceApp {
    constructor() {
        this.db = null;
        this.currentView = 'login';
        this.userRole = null;
        this.username = null;
        this.userClassName = 'all';
        this.assignedGrades = [];
        this.assignedSections = [];
        this.isAdmin = false;
        this.isSubAdmin = false;
        this.editingStudentId = null;
        this.editingServantId = null;
        this.attendanceData = {};
        this.servantAttendanceData = {};
        this.localNotifications = null;
        this.notificationPermissionGranted = false;
        this.lastUnreadReportCount = null;
        this.reportNotificationPollTimer = null;
        this.lastAnnouncementId = 0;
        this.announcementNotificationPollTimer = null;

        // Filter selection state
        this.filterGrades = [];
        this.filterGender = null;
        this.targetFilterView = '';

        this.init();
    }

    async init() {
        await this.initDB();

        const serverSession = await this.getServerSession();

        if (serverSession && serverSession.authenticated) {
            this.userRole = serverSession.role;
            this.username = serverSession.username;
            this.userClassName = serverSession.class_name || 'all';
            this.assignedGrades = this.parseAssignedGrades(serverSession.assigned_grades || '');
            this.assignedSections = this.parseAssignedSections(serverSession.assigned_sections || '');
            this.setRoleFlags(serverSession.role);
            localStorage.setItem('userRole', serverSession.role);
            localStorage.setItem('username', serverSession.username);
            localStorage.setItem('userClassName', this.userClassName);
            localStorage.setItem('assignedGrades', this.assignedGrades.join(','));
            localStorage.setItem('assignedSections', this.assignedSections.join(','));
            this.initApp();
        } else {
            localStorage.removeItem('userRole');
            localStorage.removeItem('username');
            localStorage.removeItem('userClassName');
            localStorage.removeItem('assignedGrades');
            localStorage.removeItem('assignedSections');
            this.showView('login');
            // Pre-fill remembered username
            const remembered = localStorage.getItem('rememberedUsername');
            if (remembered) {
                document.getElementById('login-username').value = remembered;
                document.getElementById('remember-me').checked = true;
            }
        }
        
        this.setupEventListeners();
    }

    async getServerSession() {
        try {
            const response = await fetch('/api/session');
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.warn('Could not verify server session', error);
            return null;
        }
    }

    initApp() {
        this.updateDate();
        this.updateStats();
        this.loadBirthdays();
        this.updateUIForRole();
        if (this.isRewards) {
            this.showPoints();
        } else {
            this.showHome();
        }

        // Show header and navigation
        document.getElementById('main-header').style.display = 'flex';
        document.getElementById('main-nav').style.display = 'flex';

        this.setupNativeNotifications();
        this.startReportNotificationPolling();
        this.startAnnouncementNotificationPolling();
    }

    setRoleFlags(role) {
        this.userRole = role;
        this.isAdmin = role === 'admin';
        this.isSubAdmin = role === 'sub_admin';
        this.isRewards = role === 'rewards';
    }

    parseAssignedGrades(grades) {
        const raw = Array.isArray(grades) ? grades : String(grades || '').split(',');
        return raw.map(g => this.gradeKey(g)).filter(Boolean);
    }

    gradeKey(grade) {
        const text = String(grade || '').replace('.0', '').trim();
        if (!text) return '';
        const compact = text.toLowerCase().replace(/[-_\s]/g, '');
        if (compact === 'prek3' || compact === 'pk3') return 'Pre K3';
        if (compact === 'prek4' || compact === 'pk4') return 'Pre K4';
        if (compact === 'kg' || compact === 'k' || text === '0') return 'KG';
        const n = parseInt(text, 10);
        if (Number.isFinite(n) && n >= 1 && n <= 12) return String(n);
        return text;
    }

    parseAssignedSections(sections) {
        const raw = Array.isArray(sections) ? sections : String(sections || '').split(',');
        const clean = [];
        raw.forEach(section => {
            const normalized = this.normalizeGender(section);
            if (normalized && !clean.includes(normalized)) clean.push(normalized);
        });
        return clean;
    }

    normalizeGender(gender) {
        const g = String(gender || '').trim().toLowerCase();
        if (['boy', 'boys', 'male', 'm', 'b'].includes(g)) return 'Boy';
        if (['girl', 'girls', 'female', 'f', 'g'].includes(g)) return 'Girl';
        return '';
    }

    studentIdentityKey(student) {
        const name = String(student.name || student.student_name || '').trim().toLowerCase();
        const grade = String(student.grade || '').replace('.0', '').trim().toLowerCase();
        const gender = this.normalizeGender(student.gender).toLowerCase();
        return `${name}|${grade}|${gender}`;
    }

    jsString(value) {
        return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    phoneDigits(value) {
        return String(value || '').replace(/\D/g, '');
    }

    studentWhatsAppPhone(student) {
        return this.phoneDigits(student.parent_phone || student.parentPhone || student.phone || '');
    }

    whatsappUrl(phone, message) {
        const digits = this.phoneDigits(phone);
        if (!digits) return '';
        return `https://wa.me/${digits}?text=${encodeURIComponent(message || '')}`;
    }

    openWhatsAppForStudent(student, message) {
        const phone = this.studentWhatsAppPhone(student);
        if (!phone) {
            this.showToast('No phone number for this student', 'error');
            return false;
        }
        window.open(this.whatsappUrl(phone, message), '_blank');
        return true;
    }

    canSeeAllClasses() {
        return this.isAdmin;
    }

    canSeeReports() {
        return this.isAdmin || this.isSubAdmin;
    }

    canManageStudentData() {
        return this.isAdmin || this.isSubAdmin;
    }

    canManagePoints() {
        return this.isAdmin || this.isSubAdmin || this.isRewards;
    }

    canManageUsers() {
        return this.isAdmin;
    }

    canManageSystemSettings() {
        return this.isAdmin;
    }

    isServantUser() {
        return this.userRole === 'user';
    }

    async filterStudentsForCurrentRole(students) {
        if (this.canSeeAllClasses() || !this.username) return students;

        const username = this.username.toString().trim().toLowerCase();
        const assignedClass = (this.userClassName || '').toString().trim().toLowerCase();
        const assignedGrades = new Set((this.assignedGrades || []).map(g => this.gradeKey(g)).filter(Boolean));
        const assignedSections = new Set((this.assignedSections || []).map(s => this.normalizeGender(s)).filter(Boolean));
        const sectionAllowed = student => {
            if (assignedSections.size === 0) return true;
            return assignedSections.has(this.normalizeGender(student.gender));
        };

        if ((this.isServantUser() || this.isRewards) && assignedGrades.size > 0) {
            return students.filter(student => {
                const studentGrade = this.gradeKey(student.grade);
                return assignedGrades.has(studentGrade) && sectionAllowed(student);
            });
        }

        if (this.isRewards && assignedGrades.size === 0) {
            return students.filter(sectionAllowed);
        }

        const servants = await this.getAllServants();
        const servantById = {};
        servants.forEach(servant => {
            servantById[servant.id] = servant;
        });

        return students.filter(student => {
            const directServant = (student.servant || '').toString().trim().toLowerCase();
            const directServantId = (student.servantId || '').toString().trim().toLowerCase();
            const studentClass = (student.class_name || student.className || '').toString().trim().toLowerCase();
            const studentGradeClass = this.gradeToClassName(student.grade).toLowerCase();
            const studentGrade = this.gradeKey(student.grade);
            const servantRecord = servantById[student.servantId];
            const servantName = (servantRecord?.name || '').toString().trim().toLowerCase();
            const servantEmail = (servantRecord?.email || '').toString().trim().toLowerCase();
            const servantClass = (servantRecord?.class_name || servantRecord?.className || '').toString().trim().toLowerCase();

            return (assignedGrades.has(studentGrade) && sectionAllowed(student)) ||
                (assignedClass && assignedClass !== 'all' && (
                    studentClass === assignedClass ||
                    studentGradeClass === assignedClass ||
                    servantClass === assignedClass
                ) && sectionAllowed(student));
        });
    }

    gradeToClassName(grade) {
        const normalized = String(grade || '').replace('.0', '').trim().toLowerCase();
        if (!normalized) return '';
        const compact = normalized.replace(/[-_\s]/g, '');
        if (['prek3', 'pk3'].includes(compact)) return 'Pre K3';
        if (['prek4', 'pk4'].includes(compact)) return 'Pre K4';
        if (normalized.includes('kg') || normalized === 'k') return 'KG';
        if (normalized.includes('middle')) return 'Middle School';
        if (normalized.includes('high')) return 'High School';
        const n = parseInt(normalized, 10);
        if (!Number.isNaN(n) && n >= 1 && n <= 12) return this.gradeLabel(String(n));
        return '';
    }

    classToGrades(className) {
        const normalized = String(className || '').trim().toLowerCase();
        if (normalized === 'high school') return ['9', '10', '11', '12'];
        if (normalized === 'middle school') return ['6', '7', '8'];
        if (normalized === 'pre k3' || normalized === 'prek3') return ['Pre K3'];
        if (normalized === 'pre k4' || normalized === 'prek4') return ['Pre K4'];
        if (normalized === 'kg') return ['KG'];
        const n = parseInt(normalized, 10);
        if (!Number.isNaN(n) && n >= 1 && n <= 12) return [String(n)];
        return [];
    }

    gradeLabel(grade) {
        const normalized = String(grade || '').trim();
        const compact = normalized.toLowerCase().replace(/[-_\s]/g, '');
        if (['prek3', 'pk3'].includes(compact)) return 'Pre K3';
        if (['prek4', 'pk4'].includes(compact)) return 'Pre K4';
        if (normalized.toUpperCase() === 'KG') return 'KG';
        const n = parseInt(normalized, 10);
        if (Number.isNaN(n)) return normalized;
        const suffix = (n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({1:'st',2:'nd',3:'rd'}[n % 10] || 'th');
        return `${n}${suffix} Grade`;
    }

    displayClassName(className) {
        return !className || className === 'all' ? 'All Classes' : className;
    }

    assignmentLabel() {
        const sectionLabel = this.sectionAssignmentLabel();
        if (this.isRewards) {
            const suffix = sectionLabel ? ` · ${sectionLabel}` : '';
            if (this.assignedGrades && this.assignedGrades.length > 0) {
                return `Rewards · Grades ${this.assignedGrades.join(', ')}${suffix}`;
            }
            return `Rewards · All Grades${suffix}`;
        }
        if (this.isServantUser()) {
            const suffix = sectionLabel ? ` · ${sectionLabel}` : '';
            if (this.assignedGrades && this.assignedGrades.length > 0) {
                return `Grades ${this.assignedGrades.join(', ')}${suffix}`;
            }
            if (this.userClassName && this.userClassName !== 'all') {
                return `${this.displayClassName(this.userClassName)}${suffix}`;
            }
            return 'No Grades Assigned';
        }
        return this.displayClassName(this.userClassName);
    }

    sectionAssignmentLabel() {
        if (!this.assignedSections || this.assignedSections.length === 0 || this.assignedSections.length >= 2) {
            return 'Boys & Girls';
        }
        return this.assignedSections[0] === 'Boy' ? 'Boys' : 'Girls';
    }

    getAvailableSectionsForCurrentRole() {
        if ((this.isServantUser() || this.isRewards) && this.assignedSections && this.assignedSections.length === 1) {
            return this.assignedSections;
        }
        return ['Boy', 'Girl', 'All'];
    }

    async getAvailableGradesForCurrentRole() {
        if (this.isServantUser() || this.isRewards) {
            if (this.assignedGrades.length > 0) {
                return this.assignedGrades;
            }
            if (this.isRewards) return [...ALL_GRADES];
            if (this.userClassName && this.userClassName !== 'all') {
                const legacyGrades = this.classToGrades(this.userClassName);
                if (legacyGrades.length > 0) return legacyGrades;
            }
            return [];
        }
        if (!this.canSeeAllClasses() && this.userClassName && this.userClassName !== 'all') {
            const assignedGrades = this.classToGrades(this.userClassName);
            if (assignedGrades.length > 0) return assignedGrades;
        }

        const students = await this.filterStudentsForCurrentRole(await this.getAllStudents());
        const gradeSet = new Set();
        students.forEach(student => {
            const grade = String(student.grade || '').replace('.0', '').trim();
            if (grade) gradeSet.add(grade);
        });
        const grades = [...gradeSet].sort((a, b) => {
            return this.gradeSortValue(a) - this.gradeSortValue(b);
        });

        if (grades.length > 0) return grades;

        return [...ALL_GRADES];
    }

    updateUIForRole() {
        const adminElements = document.querySelectorAll('.admin-section, #admin-actions, #servants-admin-actions');
        adminElements.forEach(el => {
            el.style.display = this.canManageStudentData() ? 'block' : 'none';
        });

        document.querySelectorAll('[data-role-admin-only]').forEach(el => {
            el.style.display = this.isAdmin ? '' : 'none';
        });
        document.querySelectorAll('[data-role-student-manager]').forEach(el => {
            el.style.display = this.canManageStudentData() ? '' : 'none';
        });

        const navVisibility = {
            'nav-home': !this.isRewards,
            'nav-attendance': !this.isRewards,
            'nav-points': true,
            'nav-eftikad': !this.isRewards,
            'nav-more': !this.isRewards
        };
        Object.entries(navVisibility).forEach(([id, visible]) => {
            const el = document.getElementById(id);
            if (el) el.style.display = visible ? '' : 'none';
        });

        // Update username display
        const classLabel = this.assignmentLabel();
        document.getElementById('display-username').textContent = `${this.username || 'User'} - ${classLabel}`;
        
        // User badge styling
        const userDisplay = document.getElementById('user-display');
        userDisplay.classList.remove('admin-role', 'sub-admin-role', 'user-role');
        userDisplay.classList.add(this.isAdmin ? 'admin-role' : (this.isSubAdmin ? 'sub-admin-role' : 'user-role'));
    }

    async login(event) {
        event.preventDefault();
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        const submitBtn = event.target.querySelector('button');
        
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username || !password) return;

        // Show loading state
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="material-icons-round">sync</span> Signing in...';

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const result = await response.json();

            if (result.success) {
                this.username = result.username;
                this.userClassName = result.class_name || 'all';
                this.assignedGrades = this.parseAssignedGrades(result.assigned_grades || '');
                this.assignedSections = this.parseAssignedSections(result.assigned_sections || '');
                this.setRoleFlags(result.role);
                
                // Save session
                localStorage.setItem('userRole', result.role);
                localStorage.setItem('username', result.username);
                localStorage.setItem('userClassName', this.userClassName);
                localStorage.setItem('assignedGrades', this.assignedGrades.join(','));
                localStorage.setItem('assignedSections', this.assignedSections.join(','));

                // Handle Remember Me
                const isRemembered = document.getElementById('remember-me').checked;
                if (isRemembered) {
                    localStorage.setItem('rememberedUsername', result.username);
                } else {
                    localStorage.removeItem('rememberedUsername');
                }

                this.showToast(`Welcome back, ${result.username}! Assigned: ${this.assignmentLabel()}`, 'success');
                
                // Reset form
                event.target.reset();
                
                // Initialize main app
                this.initApp();
            } else {
                this.showToast(result.error || 'Invalid credentials', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showToast('Server connection failed. Is the server running?', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }

    async logout() {
        if (!confirm('Are you sure you want to sign out?')) return;

        try {
            await fetch('/api/logout', { method: 'POST' });
        } catch (error) {
            console.warn('Could not clear server session', error);
        }
        
        localStorage.removeItem('userRole');
        localStorage.removeItem('username');
        localStorage.removeItem('userClassName');
        localStorage.removeItem('assignedGrades');
        localStorage.removeItem('assignedSections');
        
        this.userRole = null;
        this.username = null;
        this.userClassName = 'all';
        this.assignedGrades = [];
        this.assignedSections = [];
        this.isAdmin = false;
        this.isSubAdmin = false;
        
        // Hide header and navigation
        document.getElementById('main-header').style.display = 'none';
        document.getElementById('main-nav').style.display = 'none';
        
        this.showView('login');
        this.showToast('Signed out successfully', 'info');
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

    async saveAttendanceRecord(studentId, date, present, liturgy = null, extras = {}) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['attendance'], 'readwrite');
            const store = transaction.objectStore('attendance');
            const index = store.index('dateStudent');

            const getRequest = index.get([date, studentId]);
            getRequest.onsuccess = () => {
                const existing = getRequest.result;
                const record = {
                    ...(existing || { studentId, date, timestamp: new Date().toISOString() }),
                    present,
                    liturgy: liturgy || 0,
                    tonia:      extras.tonia      || 0,
                    confession: extras.confession || 0,
                    bible_prayer: extras.bible_prayer || 0,
                    questions:  extras.questions  || 0
                };
                if (existing) store.put(record);
                else          store.add(record);
            };
            transaction.oncomplete = () => resolve();
            transaction.onerror   = () => reject(transaction.error);
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
        const students = await this.filterStudentsForCurrentRole(await this.getAllStudents());
        const allAttendance = await this.getAllAttendance();
        const servants = await this.getAllServants();
        const servantMap = {};
        servants.forEach(s => servantMap[s.id] = s);

        const alerts = [];

        students.forEach(student => {
            // Get all attendance records for this student, sorted newest first
            const studentRecords = allAttendance
                .filter(a => a.studentId === student.id)
                .sort((a, b) => new Date(b.date.replace(/-/g, '/')) - new Date(a.date.replace(/-/g, '/')));

            // Count consecutive absences from most recent record
            let consecutiveAbsences = 0;
            let lastPresentDate = null;

            for (const record of studentRecords) {
                if (record.present === true || record.present === 'true') {
                    lastPresentDate = new Date(record.date.replace(/-/g, '/'));
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
        const students = await this.filterStudentsForCurrentRole(await this.getAllStudents());
        const todayStr = new Date().toISOString().split('T')[0];
        const visibleStudentIds = new Set(students.map(s => s.id));
        const todayAttendance = (await this.getAttendanceForDate(todayStr))
            .filter(a => visibleStudentIds.has(a.studentId));

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
        const shouldAnimateTransition = this.currentView && this.currentView !== viewId && viewId !== 'login';
        if (shouldAnimateTransition) {
            this.showPageTransitionEmblem();
        }

        document.querySelectorAll('.view').forEach(v => {
            v.classList.remove('active');
            v.style.display = 'none';
        });
        const targetView = document.getElementById(`view-${viewId}`);
        if (targetView) {
            const mainContent = document.querySelector('.main-content');
            if (mainContent && targetView.parentElement !== mainContent) {
                mainContent.appendChild(targetView);
            }
            targetView.classList.add('active');
            targetView.style.display = 'block';
        }

        // Manage Header/Nav visibility
        const isLoginView = viewId === 'login';
        document.getElementById('main-header').style.display = isLoginView ? 'none' : 'flex';
        document.getElementById('main-nav').style.display = isLoginView ? 'none' : 'flex';

        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const navMap = { home: 0, attendance: 1, students: 2, history: 3, servants: 4 };
        if (navMap[viewId] !== undefined) {
            const navItems = document.querySelectorAll('.nav-item');
            if (navItems[navMap[viewId]]) navItems[navMap[viewId]].classList.add('active');
        }

        this.currentView = viewId;
    }

    showPageTransitionEmblem() {
        const emblem = document.getElementById('page-transition-emblem');
        if (!emblem) return;

        emblem.classList.remove('active');
        void emblem.offsetWidth;
        emblem.classList.add('active');

        clearTimeout(this._transitionEmblemTimer);
        this._transitionEmblemTimer = setTimeout(() => {
            emblem.classList.remove('active');
        }, 420);
    }

    showHome() {
        if (this.isRewards) {
            this.showPoints();
            return;
        }
        this.showView('home');
        this.updateStats();
        this.loadBirthdays();
        this.loadAbsenceAlerts();
        
        // Admin-only Servant Reports tile on main dashboard
        const adminTile = document.getElementById('admin-reports-tile');
        if (adminTile) {
            if (this.canSeeReports()) {
                adminTile.style.display = 'block';
                this.updateAdminReportsBadge();
            } else {
                adminTile.style.display = 'none';
            }
        }
    }

    async updateAdminReportsBadge() {
        if (!this.canSeeReports()) return;
        try {
            const res = await fetch('/api/admin/servant-reports/unread-count');
            const data = await res.json();
            this.handleUnreadReportNotification(data.count || 0);
            const badge = document.getElementById('main-reports-badge');
            if (data.count > 0) {
                badge.textContent = data.count > 99 ? '99+' : data.count;
                badge.style.display = 'inline-flex';
            } else {
                badge.style.display = 'none';
            }
        } catch (e) {
            // Silent
        }
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

    // ==================== ADMIN REPORTS VIEWS ====================
    async showAdminReports() {
        if (!this.canSeeReports()) return;
        this.showView('admin-reports');
        this.populateMainReportGradeFilter();
        this.setDefaultMainReportRange();
        await this.loadAdminReports();
    }

    populateMainReportGradeFilter() {
        const select = document.getElementById('main-report-grade');
        if (!select || select.dataset.ready === '1') return;
        select.innerHTML = '<option value="">All Grades</option>' +
            ALL_GRADES.map(grade => `<option value="${this.gradeLabel(grade)}">${this.gradeLabel(grade)}</option>`).join('');
        select.dataset.ready = '1';
    }

    setDefaultMainReportRange() {
        const fromEl = document.getElementById('main-report-date-from');
        const toEl = document.getElementById('main-report-date-to');
        if (!fromEl || !toEl || fromEl.value || toEl.value) return;
        const today = new Date();
        const prior = new Date(today);
        prior.setMonth(prior.getMonth() - 1);
        fromEl.value = prior.toISOString().split('T')[0];
        toEl.value = today.toISOString().split('T')[0];
    }

    async loadAdminReports() {
        const dateFrom = document.getElementById('main-report-date-from').value;
        const dateTo = document.getElementById('main-report-date-to').value;
        const gradeVal = document.getElementById('main-report-grade')?.value || '';
        const typeVal = document.getElementById('main-report-type').value;
        const listEl = document.getElementById('main-reports-list');
        listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--on-surface-variant);"><span class="material-icons-round spin">sync</span></div>';

        try {
            const params = new URLSearchParams();
            if (dateFrom) params.set('from', dateFrom);
            if (dateTo) params.set('to', dateTo);
            if (typeVal) params.set('type', typeVal);
            if (gradeVal) params.set('grade', gradeVal);
            const res = await fetch(`/api/admin/servant-reports?${params.toString()}`);
            const data = await res.json();
            const reports = data.reports || [];
            const gradeSummary = data.grade_summary || [];
            
            // Generate stats
            const attendance = reports.filter(r => r.report_type === 'attendance').length;
            const eftikad = reports.filter(r => r.report_type === 'eftikad').length;
            document.getElementById('main-rstat-attendance').textContent = attendance;
            document.getElementById('main-rstat-eftikad').textContent = eftikad;
            this.renderMainReportGradeSummary(gradeSummary);

            // Render list
            if (reports.length === 0) {
                listEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--on-surface-variant);">No reports found.</div>';
            } else {
                listEl.innerHTML = reports.map(r => {
                    const isAttendance = r.report_type === 'attendance';
                    const typeIcon = isAttendance ? '📋' : '🏠';
                    const typeLabel = isAttendance ? 'Attendance' : 'Eftikad';
                    const typeColor = isAttendance ? 'var(--primary)' : 'var(--gold)';
                    const unreadDot = r.is_read === 0 
                        ? '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--danger);margin-right:8px;"></span>' 
                        : '';
                    const dateObj = new Date(r.submitted_at.replace(' ', 'T').replace(/-/g, '/'));
                    const timeStr = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

                    return `
                    <div class="student-card" style="flex-direction:column; align-items:flex-start; position:relative; ${r.is_read===0 ? 'background:rgba(91,142,240,0.08);' : ''}">
                        <button class="text-btn" onclick="app.deleteAdminReport(${r.id})" style="position:absolute; top:10px; right:10px; color:var(--danger); padding:5px;">
                            <span class="material-icons-round" style="font-size:18px;">delete</span>
                        </button>
                        <div style="display:flex; align-items:center; margin-bottom:8px;">
                            ${unreadDot}
                            <span style="font-weight:bold; font-size:1.05rem; color:var(--on-surface);">${typeLabel}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; width:100%; border-bottom:1px solid var(--outline-variant); padding-bottom:8px; margin-bottom:8px;">
                            <span style="color:${typeColor}; font-weight:700; font-size:0.85rem;">${typeIcon} Submitted by ${r.servant_username}</span>
                            <span style="color:var(--on-surface-variant); font-size:0.8rem;">${r.date}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; width:100%; font-size:0.9rem;">
                            <span>Total: <b>${r.total_count}</b></span>
                            <span style="color:var(--success);">Present/Visits: <b>${r.present_count}</b></span>
                            <span style="color:var(--danger);">Absent: <b>${r.absent_count}</b></span>
                        </div>
                        <div style="margin-top:8px; font-size:0.75rem; color:var(--on-surface-variant); width:100%; text-align:right;">
                            Submitted at ${timeStr}
                        </div>
                    </div>`;
                }).join('');
            }
            
            this.updateAdminReportsBadge();
        } catch (e) {
            listEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--danger);">Error loading reports.</div>';
        }
    }

    getLocalNotificationsPlugin() {
        return window.Capacitor?.Plugins?.LocalNotifications || null;
    }

    async setupNativeNotifications() {
        this.localNotifications = this.getLocalNotificationsPlugin();
        if (!this.localNotifications) {
            console.info('Native local notifications are not available in this environment.');
            return;
        }

        try {
            let permission = await this.localNotifications.checkPermissions();
            if (permission.display === 'prompt') {
                permission = await this.localNotifications.requestPermissions();
            }
            this.notificationPermissionGranted = permission.display === 'granted';
        } catch (error) {
            console.warn('Could not enable native notifications', error);
        }
    }

    startReportNotificationPolling() {
        if (!this.canSeeReports() || this.reportNotificationPollTimer) return;

        this.reportNotificationPollTimer = setInterval(() => {
            this.updateAdminReportsBadge();
        }, 30000);
    }

    startAnnouncementNotificationPolling() {
        if (this.announcementNotificationPollTimer) return;

        setTimeout(() => this.checkAnnouncementNotifications(), 2000);
        this.announcementNotificationPollTimer = setInterval(() => {
            this.checkAnnouncementNotifications();
        }, 30000);
    }

    async handleUnreadReportNotification(count) {
        if (!this.canSeeReports()) return;

        const previousCount = this.lastUnreadReportCount;
        this.lastUnreadReportCount = count;

        if (previousCount === null || count <= previousCount || count <= 0) return;
        if (!this.localNotifications) this.localNotifications = this.getLocalNotificationsPlugin();
        if (!this.localNotifications || !this.notificationPermissionGranted) return;

        const newCount = count - previousCount;
        try {
            await this.showNativeNotification(
                'Beloved Servants',
                newCount === 1 ? 'New servant report received.' : `${newCount} new servant reports received.`,
                { view: 'admin-reports' }
            );
        } catch (error) {
            console.warn('Could not show native notification', error);
        }
    }

    announcementStorageKey() {
        return `lastSeenAnnouncementId:${this.username || 'guest'}`;
    }

    async checkAnnouncementNotifications() {
        try {
            const res = await fetch('/api/announcements');
            if (!res.ok) return;

            const data = await res.json();
            const announcements = data.announcements || [];
            if (announcements.length === 0) return;

            const latest = announcements.reduce((top, item) => {
                const currentId = Number(item.id || 0);
                const topId = Number(top?.id || 0);
                return currentId > topId ? item : top;
            }, announcements[0]);

            const latestId = Number(latest.id || 0);
            const storedId = Number(localStorage.getItem(this.announcementStorageKey()) || '0');
            const previousId = Math.max(this.lastAnnouncementId || 0, storedId);
            this.lastAnnouncementId = latestId;

            if (latestId <= previousId) return;

            localStorage.setItem(this.announcementStorageKey(), String(latestId));
            await this.showNativeNotification(
                latest.title || 'New announcement',
                latest.body || 'Open Beloved Servants to read the announcement.',
                { view: 'announcements', announcementId: latestId }
            );
        } catch (error) {
            console.warn('Could not check announcements for notifications', error);
        }
    }

    async showNativeNotification(title, body, extra = {}) {
        if (!this.localNotifications) this.localNotifications = this.getLocalNotificationsPlugin();
        if (!this.localNotifications || !this.notificationPermissionGranted) return;

        await this.localNotifications.schedule({
            notifications: [{
                id: Date.now() % 2147483647,
                title,
                body,
                schedule: { at: new Date(Date.now() + 250) },
                sound: 'default',
                smallIcon: 'ic_stat_icon',
                extra
            }]
        });
    }

    renderMainReportGradeSummary(rows) {
        const el = document.getElementById('main-report-grade-summary');
        if (!el) return;
        if (!rows.length) {
            el.innerHTML = '<div style="padding:14px;border-radius:12px;background:var(--surface-container-high);color:var(--on-surface-variant);text-align:center;">No grade data for this range.</div>';
            return;
        }
        el.innerHTML = rows.map(row => `
            <div style="background:var(--surface-container-high);border-radius:14px;padding:12px;border:1px solid var(--outline-variant);">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
                    <div style="font-weight:800;color:var(--on-surface);">${row.grade_label || row.grade || 'Grade'}</div>
                    <div style="font-size:0.78rem;color:var(--on-surface-variant);">${row.total_students || 0} students</div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:0.78rem;">
                    <div><b>${row.present_students || 0}</b><br><span style="color:var(--success);">Present</span></div>
                    <div><b>${row.absent_students || 0}</b><br><span style="color:var(--danger);">Absent</span></div>
                    <div><b>${row.reward_points || 0}</b><br><span style="color:var(--primary);">Reward Pts</span></div>
                    <div><b>${row.rewarded_students || 0}</b><br><span style="color:var(--on-surface-variant);">Rewarded</span></div>
                    <div><b>${row.eftikad_visits || 0}</b><br><span style="color:var(--gold);">Eftikad</span></div>
                    <div><b>${row.attendance_records || 0}</b><br><span style="color:var(--on-surface-variant);">Records</span></div>
                </div>
            </div>
        `).join('');
    }

    async deleteAdminReport(id) {
        if (!confirm('Are you sure you want to delete this report?')) return;
        try {
            const res = await fetch(`/api/admin/servant-reports/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                this.showToast('Report deleted', 'success');
                this.loadAdminReports();
            } else {
                this.showToast('Failed to delete report', 'error');
            }
        } catch(e) {
            this.showToast('Error deleting report', 'error');
        }
    }

    async markAdminReportsRead() {
        try {
            await fetch('/api/admin/servant-reports/mark-read', { method: 'POST' });
            this.showToast('Marked all as read', 'success');
            this.loadAdminReports();
        } catch(e) {
            this.showToast('Error', 'error');
        }
    }

    downloadAdminReports() {
        const dateFrom = document.getElementById('main-report-date-from').value;
        const dateTo = document.getElementById('main-report-date-to').value;
        const gradeVal = document.getElementById('main-report-grade')?.value || '';
        const typeVal = document.getElementById('main-report-type').value;
        const params = new URLSearchParams();
        if (dateFrom) params.set('from', dateFrom);
        if (dateTo) params.set('to', dateTo);
        if (gradeVal) params.set('grade', gradeVal);
        if (typeVal) params.set('type', typeVal);
        window.open(`/api/admin/servant-reports/download?${params.toString()}`, '_blank');
        this.showToast('Downloading Excel...', 'info');
    }

    // =============================================================

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
        if (this.isRewards) {
            this.showPoints();
            return;
        }
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

        const availableGrades = await this.getAvailableGradesForCurrentRole();
        const gradeGrid = document.getElementById('grade-filter-grid');
        if (availableGrades.length === 0) {
            this.filterGrades = [];
            gradeGrid.innerHTML = `
                <div style="grid-column:1/-1;padding:14px;border-radius:14px;background:var(--surface-container-high);color:var(--on-surface-variant);text-align:center;font-weight:700;">
                    No grades assigned to this account.
                </div>
            `;
            document.querySelectorAll('#gender-filter-grid .filter-chip').forEach(c => c.classList.remove('active'));
            this.showView('select-filter');
            return;
        }
        gradeGrid.innerHTML = availableGrades.map(grade => `
            <button class="filter-chip" onclick="app.setFilterGrade('${grade}', this)">${this.gradeLabel(grade)}</button>
        `).join('') + `
            <button class="filter-chip" onclick="app.setFilterGrade('All', this)" style="grid-column: span 2;">All Grades</button>
        `;

        const availableSections = this.getAvailableSectionsForCurrentRole();
        const genderGrid = document.getElementById('gender-filter-grid');
        genderGrid.innerHTML = availableSections.map(section => {
            const label = section === 'All' ? 'Both Boys & Girls' : (section === 'Boy' ? 'Boys' : 'Girls');
            const span = section === 'All' ? ' style="grid-column: span 2;"' : '';
            return `<button class="filter-chip" onclick="app.setFilterGender('${section}', this)"${span}>${label}</button>`;
        }).join('');

        this.filterGrades = this.filterGrades.filter(grade => availableGrades.includes(grade));
        if (this.filterGrades.length === 0 && availableGrades.length > 0) {
            this.filterGrades = [...availableGrades];
        }

        if (!availableSections.includes(this.filterGender)) {
            this.filterGender = availableSections.includes('All') ? 'All' : availableSections[0];
        }

        // Reset chips
        document.querySelectorAll('#grade-filter-grid .filter-chip').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('#gender-filter-grid .filter-chip').forEach(c => c.classList.remove('active'));

        // Apply previous selections
        const gradeChips = document.querySelectorAll('#grade-filter-grid .filter-chip');
        const genderChips = document.querySelectorAll('#gender-filter-grid .filter-chip');

        gradeChips.forEach(c => {
            const grade = c.getAttribute('onclick').match(/'(.*?)'/)[1];
            if (this.filterGrades.includes(grade) || (grade === 'All' && this.filterGrades.length === availableGrades.length)) {
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
        const availableGrades = Array.from(gradeChips)
            .map(c => c.getAttribute('onclick').match(/'(.*?)'/)[1])
            .filter(g => g !== 'All');

        if (grade === 'All') {
            const isAllSelected = this.filterGrades.length === availableGrades.length;
            if (isAllSelected) {
                this.filterGrades = [];
                gradeChips.forEach(c => c.classList.remove('active'));
            } else {
                this.filterGrades = [...availableGrades];
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
        const allChip = Array.from(gradeChips).find(c => c.textContent.includes('All Grades'));
        if (allChip) {
            if (this.filterGrades.length === availableGrades.length) allChip.classList.add('active');
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
        let students = await this.filterStudentsForCurrentRole(await this.getAllStudents());
        const attendance = await this.getAttendanceForDate(date);

        // Apply Grade/Gender filters
        if (this.filterGrades.length > 0) {
            const selectedGrades = new Set(this.filterGrades.map(g => this.gradeKey(g)));
            students = students.filter(s => {
                return selectedGrades.has(this.gradeKey(s.grade));
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
        attendance.forEach(a => attendanceMap[a.studentId] = a);
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
            const rec      = attendanceMap[s.id] || {};
            const isPresent = rec.present === true;
            const isAbsent  = rec.present === false;
            const statusClass = isPresent ? 'is-present' : (isAbsent ? 'is-absent' : '');

            // Load saved V2 values
            const lit  = rec.liturgy      || 0;
            const ton  = rec.tonia        || 0;
            const conf = rec.confession   || 0;
            const bib  = rec.bible_prayer || 0;
            const qs   = Number(rec.questions || 0);

            this.attendanceData[s.id] = {
                present: rec.present,
                liturgy: lit, tonia: ton, confession: conf,
                bible_prayer: bib, questions: qs
            };

            const chip = (label, icon, field, val) => `
                <label style="display:flex;align-items:center;gap:5px;background:${val?'var(--primary)':'var(--surface-variant)'};
                    color:${val?'white':'var(--on-surface-variant)'};
                    padding:5px 10px;border-radius:20px;cursor:pointer;font-size:0.78rem;font-weight:600;
                    transition:all 0.2s;">
                    <input type="checkbox" style="display:none" ${val?'checked':''}
                        onchange="app.updateAttendanceField(${s.id},'${field}',this.checked?1:0)">
                    <span class="material-icons-round" style="font-size:14px;">${icon}</span>${label}
                </label>`;

            return `
                <div class="student-card ${statusClass}" id="student-${s.id}">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <div>
                            <div style="font-size:1.05rem;font-weight:700;">${s.name}</div>
                            <div style="color:var(--on-surface-variant);font-size:0.82rem;">${s.grade?'Grade '+s.grade:''}${s.gender?' · '+s.gender:''}</div>
                        </div>
                        <div id="badge-${s.id}" style="font-size:0.72rem;font-weight:800;text-transform:uppercase;padding:4px 10px;border-radius:20px;
                            ${isPresent?'background:var(--success);color:white;':(isAbsent?'background:var(--error);color:white;':'background:var(--surface-variant);color:var(--on-surface-variant);')}">
                            ${isPresent?'Present':(isAbsent?'Absent':'Not Marked')}
                        </div>
                    </div>
                    <div class="attendance-buttons">
                        <button class="att-btn present ${isPresent?'active':''}" onclick="app.markAttendance(${s.id},true)">
                            <span class="material-icons-round">check</span><span>Present</span>
                        </button>
                        <button class="att-btn absent ${isAbsent?'active':''}" onclick="app.markAttendance(${s.id},false)">
                            <span class="material-icons-round">close</span><span>Absent</span>
                        </button>
                    </div>
                    <!-- V2 Detail Fields (shown only when Present) -->
                    <div id="details-${s.id}" style="${isPresent?'':'display:none;'}margin-top:12px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
                            <div style="font-size:0.72rem;font-weight:700;color:var(--on-surface-variant);text-transform:uppercase;letter-spacing:0.5px;">Sunday Details</div>
                            <button type="button" onclick="app.selectAllSundayDetails(${s.id})"
                                style="display:inline-flex;align-items:center;gap:4px;border:none;border-radius:16px;padding:5px 9px;
                                background:rgba(91,142,240,0.16);color:var(--primary-light);font-size:0.72rem;font-weight:800;cursor:pointer;">
                                <span class="material-icons-round" style="font-size:14px;">done_all</span>Select All
                            </button>
                        </div>
                        <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:10px;">
                            ${chip('Liturgy','church','liturgy',lit)}
                            ${chip('Music / Tonia','music_note','tonia',ton)}
                            ${chip('Confession','favorite','confession',conf)}
                            ${chip('Bible Read','menu_book','bible_prayer',bib)}
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <span style="font-size:0.8rem;color:var(--on-surface-variant);font-weight:600;">Questions answered:</span>
                            <div style="display:flex;gap:4px;">
                                ${[0,1,2,3,4,5].map(n=>`<button onclick="app.updateAttendanceField(${s.id},'questions',${n})" id="q-${s.id}-${n}"
                                    style="width:28px;height:28px;border-radius:50%;border:none;font-size:0.75rem;font-weight:700;cursor:pointer;
                                    background:${qs===n?'var(--primary)':'var(--surface-variant)'};
                                    color:${qs===n?'white':'var(--on-surface-variant)'};
                                    transition:all 0.2s;">${n}</button>`).join('')}
                                <button onclick="app.promptCustomQuestions(${s.id})" id="q-${s.id}-more"
                                    title="Enter more than 5 questions"
                                    style="width:28px;height:28px;border-radius:50%;border:none;font-size:0.75rem;font-weight:800;cursor:pointer;
                                    background:${qs>5?'var(--primary)':'var(--surface-variant)'};
                                    color:${qs>5?'white':'var(--on-surface-variant)'};
                                    transition:all 0.2s;">${qs>5?qs:'+'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Show/hide the submit button
        const btn = document.getElementById('submit-batch-btn');
        if (btn) btn.style.display = students.length > 0 ? '' : 'none';
    }

    async markAttendance(studentId, present) {
        if (!this.attendanceData[studentId]) this.attendanceData[studentId] = {};
        this.attendanceData[studentId].present = present;

        const card = document.getElementById(`student-${studentId}`);
        if (card) {
            card.querySelectorAll('.att-btn').forEach(b => b.classList.remove('active'));
            card.querySelector(present ? '.present' : '.absent').classList.add('active');
            card.classList.remove('is-present', 'is-absent');
            card.classList.add(present ? 'is-present' : 'is-absent');

            const badge = document.getElementById(`badge-${studentId}`);
            if (badge) {
                badge.textContent = present ? 'Present' : 'Absent';
                badge.style.background = present ? 'var(--success)' : 'var(--error)';
                badge.style.color = 'white';
            }
            const details = document.getElementById(`details-${studentId}`);
            if (details) details.style.display = present ? '' : 'none';
        }

        const date = document.getElementById('attendance-date').value;
        const d = this.attendanceData[studentId];
        await this.saveAttendanceRecord(parseInt(studentId), date, present, d.liturgy || 0, {
            tonia: d.tonia || 0, confession: d.confession || 0,
            bible_prayer: d.bible_prayer || 0, questions: d.questions || 0
        });
        this.updateStats();
    }

    async updateAttendanceField(studentId, field, value) {
        if (!this.attendanceData[studentId]) this.attendanceData[studentId] = {};
        this.attendanceData[studentId][field] = value;

        // Refresh question buttons or chip color
        if (field === 'questions') {
            value = Math.max(0, parseInt(value, 10) || 0);
            this.attendanceData[studentId][field] = value;
            [0,1,2,3,4,5].forEach(n => {
                const btn = document.getElementById(`q-${studentId}-${n}`);
                if (btn) {
                    btn.style.background = n === value ? 'var(--primary)' : 'var(--surface-variant)';
                    btn.style.color = n === value ? 'white' : 'var(--on-surface-variant)';
                }
            });
            const moreBtn = document.getElementById(`q-${studentId}-more`);
            if (moreBtn) {
                moreBtn.textContent = value > 5 ? value : '+';
                moreBtn.style.background = value > 5 ? 'var(--primary)' : 'var(--surface-variant)';
                moreBtn.style.color = value > 5 ? 'white' : 'var(--on-surface-variant)';
            }
        } else {
            // Refresh checkbox label colour
            const lbl = document.querySelector(`#student-${studentId} input[onchange*="'${field}'"]`)?.parentElement;
            if (lbl) {
                lbl.style.background = value ? 'var(--primary)' : 'var(--surface-variant)';
                lbl.style.color = value ? 'white' : 'var(--on-surface-variant)';
            }
        }

        const date = document.getElementById('attendance-date').value;
        const d = this.attendanceData[studentId];
        if (d.present !== undefined) {
            await this.saveAttendanceRecord(parseInt(studentId), date, d.present, d.liturgy || 0, {
                tonia: d.tonia || 0, confession: d.confession || 0,
                bible_prayer: d.bible_prayer || 0, questions: d.questions || 0
            });
        }
    }

    async updateLiturgy(studentId, value) {
        await this.updateAttendanceField(studentId, 'liturgy', value);
    }

    async promptCustomQuestions(studentId) {
        const current = this.attendanceData[studentId]?.questions || 0;
        const raw = prompt('Questions answered:', current > 5 ? current : '');
        if (raw === null) return;

        const value = parseInt(raw, 10);
        if (Number.isNaN(value) || value < 0) {
            this.showToast('Enter a valid question count', 'error');
            return;
        }

        await this.updateAttendanceField(studentId, 'questions', value);
    }

    async selectAllSundayDetails(studentId) {
        if (!this.attendanceData[studentId]) this.attendanceData[studentId] = {};
        const fields = ['liturgy', 'tonia', 'confession', 'bible_prayer'];
        fields.forEach(field => {
            this.attendanceData[studentId][field] = 1;
            const input = document.querySelector(`#student-${studentId} input[onchange*="'${field}'"]`);
            if (input) {
                input.checked = true;
                const label = input.parentElement;
                label.style.background = 'var(--primary)';
                label.style.color = 'white';
            }
        });

        const date = document.getElementById('attendance-date').value;
        const d = this.attendanceData[studentId];
        if (d.present !== undefined) {
            await this.saveAttendanceRecord(parseInt(studentId), date, d.present, d.liturgy || 0, {
                tonia: d.tonia || 0, confession: d.confession || 0,
                bible_prayer: d.bible_prayer || 0, questions: d.questions || 0
            });
        }
        this.showToast('Sunday details selected', 'success');
    }

    // Submit full day's attendance to server for points calculation
    async submitBatchAttendance() {
        const date = document.getElementById('attendance-date').value;
        if (!date) { this.showToast('Pick a date first', 'error'); return; }

        const btn = document.getElementById('submit-batch-btn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-icons-round spin">sync</span> Submitting...'; }

        const attendance = await this.getAttendanceForDate(date);
        const students = await this.filterStudentsForCurrentRole(await this.getAllStudents());
        const studentById = {};
        students.forEach(student => {
            studentById[student.id] = student;
        });
        const records = attendance
            .filter(a => a.present !== undefined)
            .map(a => {
                const student = studentById[a.studentId] || {};
                return {
                    student_id:   a.studentId,
                    student_name: student.name || '',
                    grade:        student.grade || '',
                    gender:       student.gender || '',
                    servant:      student.servant || this.username || '',
                    phone:        student.phone || '',
                    parent_phone: student.parent_phone || student.parentPhone || '',
                    status:       a.present ? 'present' : 'absent',
                    liturgy:      a.liturgy      || 0,
                    tonia:        a.tonia        || 0,
                    confession:   a.confession   || 0,
                    bible_prayer: a.bible_prayer || 0,
                    questions:    a.questions    || 0
                };
            });

        if (records.length === 0) {
            this.showToast('No attendance marked yet', 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-icons-round">cloud_upload</span> Submit & Award Points'; }
            return;
        }

        try {
            const res = await fetch('/api/batch-attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, records })
            });
            const data = await res.json();
            if (data.success) {
                this.showToast(`Submitted ${data.count} records & points calculated!`, 'success');
                await this.submitAttendanceReport();
            } else {
                this.showToast(data.error || 'Submit failed', 'error');
            }
        } catch(e) {
            this.showToast('Network error — server reachable?', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-icons-round">cloud_upload</span> Submit & Award Points'; }
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
            const d = this.attendanceData[studentId] || {};
            await this.saveAttendanceRecord(studentId, date, true, d.liturgy || 0, {
                tonia: d.tonia || 0,
                confession: d.confession || 0,
                bible_prayer: d.bible_prayer || 0,
                questions: d.questions || 0
            });
            count++;
        }

        this.showToast(`Marked ${count} students as Present`, 'success');
        await this.loadAttendanceForDate();
        this.updateStats();
        await this.submitAttendanceReport();
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
        await this.submitAttendanceReport();
    }

    // ====== REPORT SUBMISSION TO SERVER ======

    async submitAttendanceReport() {
        if (!this.username) return;  // not logged in
        try {
            const date = document.getElementById('attendance-date').value;
            const allAttendance = await this.getAttendanceForDate(date);
            const present = allAttendance.filter(a => a.present === true).length;
            const absent  = allAttendance.filter(a => a.present === false).length;
            const total   = allAttendance.length;

            await fetch('/api/servant-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    servant_username: this.username,
                    report_type: 'attendance',
                    date,
                    total,
                    present,
                    absent,
                    notes: `Submitted by ${this.username}`
                })
            });
        } catch(e) {
            // Silent — don't interrupt servant workflow
        }
    }

    async submitEftikadReport(visitCount) {
        if (!this.username) return;
        try {
            const now = new Date();
            const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

            await fetch('/api/servant-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    servant_username: this.username,
                    report_type: 'eftikad',
                    date,
                    total: visitCount,
                    present: visitCount,
                    absent: 0,
                    notes: `${visitCount} student visit(s) recorded by ${this.username}`
                })
            });
        } catch(e) {
            // Silent
        }
    }


    async showAllStudents() {
        this.showSelectFilter('students');
    }

    async showAllStudentsInternal() {
        this.showView('students');
        await this.loadStudentsList();
    }

    async loadStudentsList(filter = '') {
        let students = await this.filterStudentsForCurrentRole(await this.getAllStudents());

        // Apply Grade/Gender filters
        if (this.filterGrades.length > 0) {
            const selectedGrades = new Set(this.filterGrades.map(g => this.gradeKey(g)));
            students = students.filter(s => {
                return selectedGrades.has(this.gradeKey(s.grade));
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
            if (eftikadVal) count++;
        }

        this.showToast(`Saved visit tracking for ${count} students!`, 'success');
        // Notify admin
        if (count > 0) await this.submitEftikadReport(count);
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
            const displayDate = new Date(date.replace(/-/g, '/') + ' 12:00:00').toLocaleDateString('en-US', {
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

            const dateStr = new Date(date.replace(/-/g, '/') + ' 12:00:00').toLocaleDateString('en-US', {
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
        if (!this.canManageStudentData()) {
            this.showToast('Access denied. Admin or Sub-admin only.', 'error');
            return;
        }
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
        if (!this.canManageStudentData()) {
            this.showToast('Access denied. Admin or Sub-admin only.', 'error');
            return;
        }
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
        if (!this.canManageStudentData()) {
            this.showToast('Access denied. Admin or Sub-admin only.', 'error');
            return;
        }

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

    async clearAllData() {
        if (!this.canManageSystemSettings()) {
            this.showToast('Access denied. Admin only.', 'error');
            return;
        }
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

    // ==================== NEW FEATURE METHODS ====================

    setNavActive(id) {
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        const el = document.getElementById(id);
        if (el) el.classList.add('active');
    }

    showMore() {
        if (this.isRewards) {
            this.showPoints();
            return;
        }
        this.showView('more');
        this.setNavActive('nav-more');
        const canManageStudentData = this.canManageStudentData();
        document.getElementById('more-admin-actions').style.display = canManageStudentData ? '' : 'none';
        const rTile = document.getElementById('admin-reports-tile-more');
        if (rTile) rTile.style.display = this.canSeeReports() ? '' : 'none';
        this.updateUIForRole();
    }

    // ---- POINTS ----
    async showPoints() {
        this.showView('points');
        this.setNavActive('nav-points');
        await this._populateServantFilters(['points-servant-filter']);
        await this.loadPoints();
        // Only admin/sub_admin can clear
        document.getElementById('clear-points-section').style.display = this.canManageStudentData() ? '' : 'none';
    }

    async loadPoints() {
        const servant = document.getElementById('points-servant-filter').value;
        const url = servant && servant !== 'all' ? `/api/points/all?servant=${encodeURIComponent(servant)}` : '/api/points/all';
        const res = await fetch(url);
        const data = await res.json();
        const serverStudents = this.canSeeAllClasses() ? (data.students || []) : await this.filterStudentsForCurrentRole(data.students || []);
        let students = serverStudents;
        if (!this.canSeeAllClasses()) {
            const merged = new Map();
            serverStudents.forEach(student => {
                merged.set(this.studentIdentityKey(student), { ...student, _serverPointsId: student.id });
            });
            const localStudents = await this.filterStudentsForCurrentRole(await this.getAllStudents());
            localStudents.forEach(student => {
                const key = this.studentIdentityKey(student);
                if (!merged.has(key)) {
                    merged.set(key, { ...student, points: 0, _serverPointsId: null });
                }
            });
            students = [...merged.values()].sort((a, b) => (b.points || 0) - (a.points || 0));
        }
        this._pointsRows = {};
        students.forEach(student => {
            this._pointsRows[this.studentIdentityKey(student)] = student;
        });

        const totalPts = students.reduce((s, st) => s + (st.points || 0), 0);
        document.getElementById('points-total-display').textContent = totalPts;
        document.getElementById('points-students-count').textContent = students.length;
        const average = students.length ? Math.round(totalPts / students.length) : 0;
        const topStudent = students.length ? students.reduce((top, st) => ((st.points || 0) > (top.points || 0) ? st : top), students[0]) : null;
        const averageEl = document.getElementById('points-average-display');
        const topEl = document.getElementById('points-top-student');
        if (averageEl) averageEl.textContent = average;
        if (topEl) topEl.textContent = topStudent ? `${topStudent.name} (${topStudent.points || 0})` : '--';
        this.renderPointsClassBreakdown(students);

        const container = document.getElementById('points-list');
        if (students.length === 0) {
            container.innerHTML = `<div class="empty-state"><span class="material-icons-round">star_border</span><p>No points yet</p></div>`;
            return;
        }
        container.innerHTML = students.map((s, i) => {
            const key = this.jsString(this.studentIdentityKey(s));
            return `
            <div onclick="app.showStudentPoints('${key}', '${this.jsString(s.name)}')"
                style="display:flex;align-items:center;gap:12px;background:var(--surface-container-high);border-radius:14px;padding:12px 14px;margin-bottom:8px;cursor:pointer;transition:transform 0.15s;">
                <div style="width:32px;height:32px;border-radius:50%;background:${i===0?'#FFD700':i===1?'#C0C0C0':i===2?'#CD7F32':'var(--surface-variant)'};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.85rem;color:${i<3?'#000':'var(--on-surface-variant)'};">${i+1}</div>
                <div style="flex:1;">
                    <div style="font-weight:600;font-size:0.95rem;">${s.name}</div>
                    <div style="font-size:0.75rem;color:var(--on-surface-variant);">${s.servant || ''} ${s.grade ? '· Grade '+s.grade : ''}</div>
                </div>
                <div style="font-size:1.4rem;font-weight:800;color:var(--primary);">${s.points || 0}</div>
                <span class="material-icons-round" style="font-size:16px;color:var(--on-surface-variant);">chevron_right</span>
            </div>
        `;
        }).join('');
    }

    renderPointsClassBreakdown(students) {
        const container = document.getElementById('points-class-breakdown');
        if (!container) return;

        const groups = new Map();
        students.forEach(student => {
            const className = student.class_name || this.gradeToClassName(student.grade) || student.servant || 'Unassigned';
            if (!groups.has(className)) {
                groups.set(className, { students: 0, points: 0 });
            }
            const group = groups.get(className);
            group.students += 1;
            group.points += student.points || 0;
        });

        if (groups.size === 0) {
            container.innerHTML = '<div style="padding:12px;border-radius:12px;background:var(--surface-container-high);color:var(--on-surface-variant);text-align:center;">No class points yet</div>';
            return;
        }

        container.innerHTML = [...groups.entries()]
            .sort((a, b) => b[1].points - a[1].points)
            .map(([name, group]) => `
                <div style="display:flex;align-items:center;gap:10px;background:var(--surface-container-high);border-radius:12px;padding:10px 12px;">
                    <div style="flex:1;">
                        <div style="font-weight:800;font-size:0.9rem;">${name}</div>
                        <div style="font-size:0.74rem;color:var(--on-surface-variant);">${group.students} students</div>
                    </div>
                    <div style="font-size:1.1rem;font-weight:900;color:var(--primary);">${group.points}</div>
                </div>
            `).join('');
    }

    async showStudentPoints(studentKey, name) {
        const row = this._pointsRows?.[studentKey] || {};
        const studentId = row._serverPointsId || row.id || null;
        this._currentPointsStudentId = row._serverPointsId || null;
        this._currentPointsStudentKey = studentKey;
        document.getElementById('points-detail-name').textContent = name;
        const manualControls = document.getElementById('points-manual-controls');
        if (manualControls) {
            manualControls.style.display = this.canManagePoints() ? 'flex' : 'none';
        }
        let data = { total_points: row.points || 0, history: [] };
        if (studentId && row._serverPointsId !== null) {
            const res = await fetch(`/api/points/${studentId}`);
            if (res.ok) data = await res.json();
        }
        document.getElementById('points-detail-total').textContent = data.total_points || 0;
        const hist = data.history || [];
        document.getElementById('points-detail-history').innerHTML = hist.length === 0
            ? '<p style="color:var(--on-surface-variant);text-align:center;">No history yet</p>'
            : hist.map(h => `
                <div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--surface-container-high);border-radius:8px;">
                    <span style="font-weight:700;color:${h.points_change>=0?'var(--success)':'var(--error)'};">${h.points_change>0?'+':''}${h.points_change}</span>
                    <span style="flex:1;font-size:0.8rem;">${h.reason||''}</span>
                    <span style="font-size:0.75rem;color:var(--on-surface-variant);">${h.date}</span>
                </div>`).join('');
        document.getElementById('points-detail-modal').classList.add('active');
    }

    async addManualPoints() {
        const pts = parseInt(document.getElementById('points-manual-amount').value);
        const reason = document.getElementById('points-manual-reason').value.trim() || 'Manual adjustment';
        if (isNaN(pts) || pts === 0) { this.showToast('Enter a valid number', 'error'); return; }
        const sid = this._currentPointsStudentId;
        if (!sid) return;
        const res = await fetch('/api/points/add', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({student_id: sid, points: pts, reason})
        });
        if ((await res.json()).success) {
            this.showToast(`${pts>0?'+':''}${pts} points saved!`, 'success');
            document.getElementById('points-manual-amount').value = '';
            document.getElementById('points-manual-reason').value = '';
            await this.showStudentPoints(this._currentPointsStudentKey || sid, document.getElementById('points-detail-name').textContent);
            await this.loadPoints();
        }
    }

    async clearPoints() {
        if (!this.canManageStudentData()) {
            this.showToast('Access denied. Admin or Sub-admin only.', 'error');
            return;
        }
        const servant = document.getElementById('points-servant-filter').value;
        const target = (servant && servant !== 'all') ? `class "${servant}"` : 'ALL students';
        if (!confirm(`This will reset current points for ${target}. History is preserved. Continue?`)) return;
        const res = await fetch('/api/points/clear', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({servant: servant !== 'all' ? servant : null})
        });
        const data = await res.json();
        if (data.success) {
            this.showToast(`Points cleared for ${data.cleared_count} students`, 'success');
            await this.loadPoints();
        }
    }

    // ---- EFTIKAD ----
    async showEftikad() {
        if (this.isRewards) {
            this.showPoints();
            return;
        }
        this.showView('eftikad');
        this.setNavActive('nav-eftikad');
        const today = new Date().toISOString().split('T')[0];
        const sevenAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString().split('T')[0];
        document.getElementById('eftikad-date-from').value = sevenAgo;
        document.getElementById('eftikad-date-to').value = today;
        await this.loadEftikad();
    }

    async loadEftikad() {
        const container = document.getElementById('eftikad-list');
        const alerts = await this.calculateAbsenceAlerts();
        const alertByStudentId = {};
        alerts.forEach(alert => {
            alertByStudentId[alert.student.id] = alert;
        });

        const assignedStudents = await this.filterStudentsForCurrentRole(await this.getAllStudents());
        const needEftikad = assignedStudents.map(student => {
            const alert = alertByStudentId[student.id];
            return {
                ...student,
                consecutive_absences: alert?.consecutiveAbsences || 0,
                eftikad_level: alert?.level || 'normal',
                last_seen: alert?.lastSeen || ''
            };
        }).sort((a, b) => {
            const rank = { red: 0, orange: 1, normal: 2 };
            const ar = rank[a.eftikad_level] ?? 2;
            const br = rank[b.eftikad_level] ?? 2;
            if (ar !== br) return ar - br;
            if ((b.consecutive_absences || 0) !== (a.consecutive_absences || 0)) {
                return (b.consecutive_absences || 0) - (a.consecutive_absences || 0);
            }
            return String(a.name || '').localeCompare(String(b.name || ''));
        });
        this._eftikadStudentMap = {};
        needEftikad.forEach(student => {
            this._eftikadStudentMap[student.id] = student;
        });

        if (needEftikad.length === 0) {
            container.innerHTML = `<div class="empty-state"><span class="material-icons-round">groups</span><p>No assigned students yet.</p></div>`;
            return;
        }
        container.innerHTML = needEftikad.map(s => {
            const isRed = s.eftikad_level === 'red';
            const isYellow = s.eftikad_level === 'orange';
            const accent = isRed ? 'var(--error)' : (isYellow ? 'var(--warning)' : 'var(--primary)');
            const bg = isRed ? 'var(--error-container)' : (isYellow ? 'rgba(255,202,40,0.18)' : 'rgba(91,142,240,0.14)');
            const statusText = isRed ? `${s.consecutive_absences || 0} weeks absent · Urgent` :
                (isYellow ? `${s.consecutive_absences || 0} weeks absent · Follow up` : 'Available for Eftikad');
            const icon = isRed || isYellow ? 'person_off' : 'person';
            const phone = s.parent_phone || s.parentPhone || s.phone || '';
            const waHref = this.whatsappUrl(phone, 'Hello, we are checking on you. God bless you.');
            return `
            <div onclick="app.openEftikadAction(${s.id})"
                style="display:flex;align-items:center;gap:12px;background:var(--surface-container-high);border-left:4px solid ${accent};border-radius:14px;padding:12px 14px;margin-bottom:8px;cursor:pointer;">
                <div style="width:40px;height:40px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;">
                    <span class="material-icons-round" style="color:${accent};font-size:20px;">${icon}</span>
                </div>
                <div style="flex:1;">
                    <div style="font-weight:600;">${s.name}</div>
                    <div style="font-size:0.75rem;color:${accent};font-weight:800;">${statusText}</div>
                    <div style="font-size:0.72rem;color:var(--on-surface-variant);">${s.grade ? 'Grade '+s.grade : ''}${s.gender ? ' · '+s.gender : ''}${s.last_seen ? ' · Last seen '+s.last_seen : ''}</div>
                </div>
                <div style="display:flex;gap:6px;">
                    <a href="${waHref || '#'}" target="_blank" onclick="event.stopPropagation();${waHref ? '' : "app.showToast('No phone number for this student','error');return false;"}"
                        style="padding:8px;border-radius:8px;background:#25D366;display:flex;align-items:center;color:white;text-decoration:none;">
                        <span class="material-icons-round" style="font-size:18px;">chat</span>
                    </a>
                    <a href="tel:${phone}" onclick="event.stopPropagation()"
                        style="padding:8px;border-radius:8px;background:var(--primary);display:flex;align-items:center;color:white;text-decoration:none;">
                        <span class="material-icons-round" style="font-size:18px;">call</span>
                    </a>
                </div>
            </div>
        `;
        }).join('');
    }

    openEftikadAction(studentId) {
        const student = this._eftikadStudentMap?.[studentId] || {};
        const name = student.name || 'Student';
        const phone = student.phone || '';
        const parentPhone = student.parent_phone || student.parentPhone || '';
        this._eftikadStudentId = studentId;
        this._eftikadStudent = student;
        this._eftikadPhone = parentPhone || phone || '';
        document.getElementById('eftikad-student-name').textContent = name;
        const wa_msg = encodeURIComponent('Hello, we missed you at Sunday School. We hope everything is okay. God bless you.');
        const numClean = this._eftikadPhone.replace(/\D/g, '');
        document.getElementById('eftikad-whatsapp-btn').href = `https://wa.me/${numClean}?text=${wa_msg}`;
        document.getElementById('eftikad-call-btn').href = `tel:${this._eftikadPhone}`;
        document.getElementById('eftikad-notes').value = '';
        document.getElementById('eftikad-action-modal').classList.add('active');
    }

    async saveEftikad() {
        const notes = document.getElementById('eftikad-notes').value.trim();
        const sid = this._eftikadStudentId;
        if (!sid) return;
        const res = await fetch('/api/eftikad', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
                servant_username: this.username,
                student_id: sid,
                student_name: this._eftikadStudent?.name || '',
                grade: this._eftikadStudent?.grade || '',
                gender: this._eftikadStudent?.gender || '',
                servant: this._eftikadStudent?.servant || this.username || '',
                phone: this._eftikadStudent?.phone || '',
                parent_phone: this._eftikadStudent?.parent_phone || this._eftikadStudent?.parentPhone || '',
                date: new Date().toISOString().split('T')[0],
                whatsapp_sent: 1,
                notes
            })
        });
        if ((await res.json()).success) {
            this.showToast('Eftikad record saved!', 'success');
            document.getElementById('eftikad-action-modal').classList.remove('active');
            await this.loadEftikad();
        }
    }

    // ---- BIBLE TRACKING ----
    showBible() {
        if (this.isRewards) { this.showPoints(); return; }
        this.showView('bible');
        this._populateServantFilters(['bible-servant-filter']);
        this.loadBibleTracking();
    }

    async loadBibleTracking() {
        const servant = document.getElementById('bible-servant-filter').value;
        const url = servant && servant !== 'all' ? `/api/bible/all?servant=${encodeURIComponent(servant)}` : '/api/bible/all';
        const res = await fetch(url);
        const data = await res.json();
        const students = data.students || [];
        const container = document.getElementById('bible-list');
        if (students.length === 0) {
            container.innerHTML = `<div class="empty-state"><span class="material-icons-round">menu_book</span><p>No students found</p></div>`;
            return;
        }
        // Get current week start
        const now = new Date();
        const day = now.getDay();
        const weekStart = new Date(now - day * 86400000).toISOString().split('T')[0];

        container.innerHTML = students.map(s => {
            const days = s.days_read || 0;
            const isThisWeek = s.week_start_date === weekStart;
            const displayDays = isThisWeek ? days : 0;
            const dots = Array.from({length:7}, (_, i) => `<div style="width:18px;height:18px;border-radius:50%;background:${i<displayDays?'var(--primary)':'var(--outline)'};"></div>`).join('');
            return `
                <div style="background:var(--surface-container-high);border-radius:14px;padding:12px 14px;margin-bottom:8px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                        <div>
                            <div style="font-weight:600;">${s.name}</div>
                            <div style="font-size:0.75rem;color:var(--on-surface-variant);">${s.servant||''}</div>
                        </div>
                        <div style="display:flex;align-items:center;gap:6px;">
                            <span style="font-size:0.8rem;color:var(--on-surface-variant);">${displayDays}/7 days</span>
                            ${displayDays >= 7 ? '<span style="color:#FFD700;font-size:1.2rem;">🏆</span>' : ''}
                        </div>
                    </div>
                    <div style="display:flex;gap:4px;margin-bottom:8px;">${dots}</div>
                    <div style="display:flex;gap:6px;">
                        ${[1,2,3,4,5,6,7].map(d => `<button onclick="app.setBibleDays(${s.id},'${weekStart}',${d})"
                            style="flex:1;padding:5px 0;border-radius:6px;border:none;font-size:0.7rem;font-weight:600;cursor:pointer;background:${displayDays>=d?'var(--primary)':'var(--surface-variant)'};color:${displayDays>=d?'white':'var(--on-surface-variant)'};">${d}</button>`).join('')}
                    </div>
                </div>`;
        }).join('');
    }

    async setBibleDays(studentId, weekStart, days) {
        await fetch('/api/bible', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({student_id: studentId, week_start_date: weekStart, days_read: days})
        });
        this.showToast(`${days}/7 days saved`, 'success');
        await this.loadBibleTracking();
    }

    // ---- ANNOUNCEMENTS ----
    showAnnouncements() {
        if (this.isRewards) { this.showPoints(); return; }
        this.showView('announcements');
        const waForm = document.getElementById('student-whatsapp-form');
        if (waForm) waForm.style.display = this.canManageStudentData() ? '' : 'none';
        document.getElementById('new-announcement-form').style.display = this.canManageStudentData() ? '' : 'none';
        this.loadAnnouncements();
    }

    async sendStudentWhatsAppAnnouncement() {
        if (!this.canManageStudentData()) {
            this.showToast('Admin or sub-admin only', 'error');
            return;
        }
        const message = document.getElementById('wa-student-message').value.trim();
        const scope = document.getElementById('wa-student-scope').value;
        if (!message) {
            this.showToast('Type a WhatsApp message first', 'error');
            return;
        }

        const res = await fetch('/api/students');
        const data = await res.json();
        let students = data.students || [];
        if (scope === 'boy') students = students.filter(s => this.normalizeGender(s.gender) === 'Boy');
        if (scope === 'girl') students = students.filter(s => this.normalizeGender(s.gender) === 'Girl');

        const recipients = students.filter(s => this.studentWhatsAppPhone(s));
        if (recipients.length === 0) {
            this.showToast('No selected students have phone numbers', 'error');
            return;
        }

        recipients.forEach((student, index) => {
            setTimeout(() => this.openWhatsAppForStudent(student, message), index * 350);
        });
        this.showToast(`Opening WhatsApp for ${recipients.length} students`, 'success');
    }

    async loadAnnouncements() {
        const res = await fetch('/api/announcements');
        const data = await res.json();
        const anns = data.announcements || [];
        const container = document.getElementById('announcements-list');
        const canManageAnnouncements = this.canManageStudentData();
        if (anns.length === 0) {
            container.innerHTML = `<div class="empty-state"><span class="material-icons-round">campaign</span><p>No announcements yet</p></div>`;
            return;
        }
        container.innerHTML = anns.map(a => `
            <div style="background:var(--surface-container-high);border-radius:14px;padding:14px;margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
                    <div style="font-weight:700;font-size:1rem;">${a.title}</div>
                    ${canManageAnnouncements ? `<button onclick="app.deleteAnnouncement(${a.id})" style="background:none;border:none;color:var(--error);cursor:pointer;"><span class="material-icons-round" style="font-size:18px;">delete</span></button>` : ''}
                </div>
                <div style="font-size:0.85rem;color:var(--on-surface);margin-bottom:8px;">${a.body}</div>
                ${a.attachment_path ? `<a href="${a.attachment_path}" target="_blank" style="font-size:0.8rem;color:var(--primary);display:flex;align-items:center;gap:4px;text-decoration:none;"><span class="material-icons-round" style="font-size:16px;">attach_file</span>Attachment</a>` : ''}
                <div style="font-size:0.72rem;color:var(--on-surface-variant);margin-top:6px;">${a.created_by||'System'} · ${a.created_at?.split('T')[0]||a.created_at||''}</div>
            </div>
        `).join('');
    }

    async postAnnouncement() {
        const title = document.getElementById('ann-title').value.trim();
        const body = document.getElementById('ann-body').value.trim();
        const fileInput = document.getElementById('ann-attachment');
        if (!title || !body) { this.showToast('Title and message required', 'error'); return; }
        const fd = new FormData();
        fd.append('title', title);
        fd.append('body', body);
        fd.append('created_by', this.username || 'Admin');
        if (fileInput.files[0]) fd.append('attachment', fileInput.files[0]);
        const res = await fetch('/api/announcements', {method:'POST', body:fd});
        if ((await res.json()).success) {
            this.showToast('Announcement posted!', 'success');
            document.getElementById('ann-title').value = '';
            document.getElementById('ann-body').value = '';
            fileInput.value = '';
            await this.loadAnnouncements();
        }
    }

    async deleteAnnouncement(id) {
        if (!confirm('Delete this announcement?')) return;
        await fetch(`/api/announcements/${id}`, {method:'DELETE'});
        this.showToast('Deleted', 'info');
        await this.loadAnnouncements();
    }

    // ---- BIRTHDAYS ----
    showBirthdays() {
        if (this.isRewards) { this.showPoints(); return; }
        this.showView('birthdays');
        this.loadBirthdays();
    }

    sendBirthdayWhatsApp(studentId) {
        const student = this._birthdayStudents?.[studentId];
        if (!student) return;
        const message = `Happy birthday ${student.name}! God bless you and give you a blessed year.`;
        this.openWhatsAppForStudent(student, message);
    }

    async loadBirthdays() {
        const days = document.getElementById('birthday-days-filter').value || 30;
        const res = await fetch(`/api/birthdays?days=${days}`);
        const data = await res.json();
        let birthdays = data.birthdays || [];
        if (!this.canSeeAllClasses() && this.username) {
            birthdays = await this.filterStudentsForCurrentRole(birthdays);
        }
        this._birthdayStudents = {};
        birthdays.forEach(b => { this._birthdayStudents[b.id] = b; });
        const container = document.getElementById('birthdays-list');
        if (birthdays.length === 0) {
            container.innerHTML = `<div class="empty-state"><span class="material-icons-round">cake</span><p>No upcoming birthdays</p></div>`;
            return;
        }
        container.innerHTML = birthdays.map(b => {
            const isToday = b.days_until === 0;
            return `
            <div style="display:flex;align-items:center;gap:12px;background:${isToday?'linear-gradient(135deg,rgba(91,142,240,0.2),rgba(58,107,212,0.15))':'var(--surface-container-high)'};border-radius:14px;padding:12px 14px;margin-bottom:8px;${isToday?'border:1px solid var(--primary);':''}">
                <div style="font-size:2rem;">${isToday?'🎂':'🎁'}</div>
                <div style="flex:1;">
                    <div style="font-weight:600;">${b.name}</div>
                    <div style="font-size:0.75rem;color:var(--on-surface-variant);">${b.birthday_date} · ${b.servant||''}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:800;color:var(--primary);font-size:1.1rem;">${isToday?'TODAY':'In '+b.days_until+' days'}</div>
                </div>
                <button onclick="event.stopPropagation();app.sendBirthdayWhatsApp(${b.id})"
                    title="Send birthday WhatsApp"
                    style="width:38px;height:38px;border-radius:12px;border:none;background:#25D366;color:white;display:flex;align-items:center;justify-content:center;cursor:pointer;">
                    <span class="material-icons-round" style="font-size:20px;">chat</span>
                </button>
            </div>`;
        }).join('');
    }

    // ---- CHARTS ----
    showCharts() {
        if (this.isRewards) { this.showPoints(); return; }
        this.showView('charts');
        this._populateServantFilters(['chart-servant-filter']);
        const today = new Date().toISOString().split('T')[0];
        const fromEl = document.getElementById('chart-date-from');
        const toEl = document.getElementById('chart-date-to');
        if (toEl && !toEl.value) toEl.value = today;
        if (fromEl && !fromEl.value) fromEl.value = new Date(Date.now() - 180*24*60*60*1000).toISOString().split('T')[0];
        this.loadCharts();
    }

    async loadCharts() {
        const servant = document.getElementById('chart-servant-filter').value;
        const dateFrom = document.getElementById('chart-date-from').value;
        const dateTo = document.getElementById('chart-date-to').value;
        let url = '/api/charts/attendance?';
        if (servant && servant !== 'all') url += `servant=${encodeURIComponent(servant)}&`;
        if (dateFrom) url += `from=${dateFrom}&`;
        if (dateTo) url += `to=${dateTo}`;
        const res = await fetch(url);
        const data = await res.json();
        const stats = data.stats || [];

        const container = document.getElementById('chart-stats-list');
        if (stats.length === 0) {
            if (this.attendanceChart) {
                this.attendanceChart.destroy();
                this.attendanceChart = null;
            }
            container.innerHTML = `<div class="empty-state"><span class="material-icons-round">bar_chart</span><p>No data yet</p></div>`;
            return;
        }

        // Build chart by grade
        const months = [...new Set(stats.map(s => s.month))].sort();
        const grades = [...new Set(stats.map(s => this.chartGradeKey(s)))]
            .sort((a, b) => this.gradeSortValue(a) - this.gradeSortValue(b));
        const colors = ['#5b8ef0','#f0a05b','#4caf50','#e91e63','#9c27b0','#ff5722'];
        const datasets = grades.map((grade, i) => ({
            label: this.chartGradeLabel(grade),
            data: months.map(m => {
                const row = stats.find(s => this.chartGradeKey(s) === grade && s.month === m);
                return row ? Math.round((row.present_count / row.total) * 100) : null;
            }),
            borderColor: colors[i % colors.length],
            backgroundColor: colors[i % colors.length] + '33',
            tension: 0.4, fill: true, spanGaps: true
        }));

        if (this._chart) this._chart.destroy();
        const ctx = document.getElementById('attendance-chart').getContext('2d');
        this._chart = new Chart(ctx, {
            type: 'line',
            data: { labels: months, datasets },
            options: {
                responsive: true,
                plugins: { legend: { labels: { color: '#e0e0e0' } } },
                scales: {
                    y: { min: 0, max: 100, ticks: { color: '#e0e0e0', callback: v => v+'%' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                    x: { ticks: { color: '#e0e0e0' }, grid: { color: 'rgba(255,255,255,0.1)' } }
                }
            }
        });

        container.innerHTML = stats.slice(0, 30).map(s => {
            const pct = s.total ? Math.round((s.present_count/s.total)*100) : 0;
            return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--outline);">
                <div style="flex:1;font-size:0.85rem;">${this.chartGradeLabel(this.chartGradeKey(s))} · ${s.month}</div>
                <div style="width:80px;background:var(--outline);border-radius:4px;height:6px;overflow:hidden;">
                    <div style="width:${pct}%;background:var(--primary);height:100%;border-radius:4px;"></div>
                </div>
                <div style="font-weight:700;color:var(--primary);font-size:0.9rem;width:38px;text-align:right;">${pct}%</div>
            </div>`;
        }).join('');
    }

    chartGradeKey(row) {
        return String(row.grade ?? row.class_name ?? row.servant ?? 'Unknown').replace('.0', '').trim() || 'Unknown';
    }

    chartGradeLabel(grade) {
        const key = String(grade || '').replace('.0', '').trim();
        if (!key || key === 'Unknown') return 'Unknown Grade';
        return this.gradeLabel(key);
    }

    gradeSortValue(grade) {
        const key = String(grade || '').replace('.0', '').trim().toLowerCase();
        const compact = key.replace(/[-_\s]/g, '');
        if (compact === 'prek3' || compact === 'pk3') return -3;
        if (compact === 'prek4' || compact === 'pk4') return -2;
        if (key === 'kg' || key === 'k' || key === '0') return 0;
        const n = parseInt(key, 10);
        return Number.isFinite(n) ? n : 99;
    }

    // ---- HELPER: populate grade filters ----
    async _populateServantFilters(ids) {
        const options = [...ALL_GRADES];
        ids.forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            const cur = sel.value;
            sel.innerHTML = '<option value="all">All Grades</option>' +
                options.map(grade => `<option value="${this.gradeLabel(grade)}">${this.gradeLabel(grade)}</option>`).join('');
            sel.value = cur || 'all';
            if (!this.canSeeAllClasses() && this.username) {
                if (this.assignedGrades && this.assignedGrades.length > 0) {
                    sel.innerHTML = `<option value="all">My Grades (${this.assignedGrades.map(g => this.gradeLabel(g)).join(', ')})</option>`;
                    sel.value = 'all';
                    sel.disabled = true;
                } else if (this.isRewards) {
                    sel.innerHTML = '<option value="all">All Grades</option>';
                    sel.value = 'all';
                    sel.disabled = true;
                } else {
                    sel.value = this.userClassName && this.userClassName !== 'all' ? this.userClassName : 'all';
                    sel.disabled = true;
                }
            } else {
                sel.disabled = false;
            }
        });
    }
}

// Initialize app
const app = new AttendanceApp();

// iOS WebView polish: prevent double-tap/pinch zoom so the IPA feels like an app.
let lastTouchEnd = 0;
document.addEventListener('touchend', (event) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 320) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, { passive: false });

document.addEventListener('gesturestart', (event) => {
    event.preventDefault();
}, { passive: false });
