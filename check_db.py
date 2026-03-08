import sqlite3
conn = sqlite3.connect('attendance.db')
c = conn.cursor()
c.execute('SELECT COUNT(*) FROM students')
print('Students:', c.fetchone()[0])
c.execute("SELECT DISTINCT servant FROM students WHERE servant != '' LIMIT 5")
print('Servants:', [r[0] for r in c.fetchall()])
c.execute('SELECT grade, gender, COUNT(*) FROM students GROUP BY grade, gender')
print('Grade/Gender breakdown:')
for row in c.fetchall():
    print(' ', row)
conn.close()
