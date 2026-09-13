from flask import Flask, request, jsonify, session, send_from_directory
import sqlite3, hashlib, os, secrets
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(BASE, 'grades.db')
app = Flask(__name__, static_folder='static', static_url_path='/static')
app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(32))
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'


def db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def hash_code(code: str) -> str:
    return hashlib.sha256(code.strip().upper().encode()).hexdigest()


def init_db():
    conn = db()
    conn.executescript('''
    CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        code_hash TEXT NOT NULL UNIQUE,
        code_display TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS grades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        subject TEXT NOT NULL,
        grade REAL NOT NULL,
        max_grade REAL NOT NULL,
        percentage REAL NOT NULL,
        recorded_at TEXT NOT NULL,
        FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        subject TEXT,
        note TEXT NOT NULL,
        period TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    );
    ''')
    # A safe local demo account makes the prototype immediately testable.
    if conn.execute('SELECT 1 FROM students LIMIT 1').fetchone() is None:
        now = datetime.now(timezone.utc).isoformat()
        conn.execute('INSERT INTO students(name, code_hash, code_display, created_at) VALUES(?,?,?,?)',
                     ('Demo Student', hash_code('DEMO-2026'), 'DEMO-2026', now))
        sid = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        samples = [
            ('Math', 82, 100, 82), ('Physics', 68, 100, 68), ('Chemistry', 74, 100, 74),
            ('English', 88, 100, 88), ('Arabic', 91, 100, 91)
        ]
        for subject, grade, maximum, pct in samples:
            conn.execute('INSERT INTO grades(student_id,subject,grade,max_grade,percentage,recorded_at) VALUES(?,?,?,?,?,?)',
                         (sid, subject, grade, maximum, pct, now))
    conn.commit(); conn.close()


def get_student_by_session():
    sid = session.get('student_id')
    if not sid:
        return None
    conn = db(); row = conn.execute('SELECT * FROM students WHERE id=?', (sid,)).fetchone(); conn.close()
    return row


def student_payload(student):
    conn = db()
    grades = conn.execute('SELECT * FROM grades WHERE student_id=? ORDER BY recorded_at ASC, id ASC', (student['id'],)).fetchall()
    notes = conn.execute('SELECT * FROM notes WHERE student_id=? ORDER BY created_at DESC, id DESC', (student['id'],)).fetchall()
    conn.close()
    return {
        'id': student['id'], 'name': student['name'], 'code': student['code_display'],
        'grades': [dict(x) for x in grades], 'notes': [dict(x) for x in notes]
    }

@app.get('/')
def index():
    return send_from_directory(BASE, 'index.html')

@app.get('/api/me')
def me():
    student = get_student_by_session()
    return jsonify({'authenticated': bool(student), 'student': student_payload(student) if student else None})

@app.post('/api/auth')
def auth():
    data = request.get_json(force=True)
    code = (data.get('code') or '').strip()
    if not code:
        return jsonify({'error': 'Student code is required.'}), 400
    conn = db(); student = conn.execute('SELECT * FROM students WHERE code_hash=?', (hash_code(code),)).fetchone(); conn.close()
    if not student:
        return jsonify({'error': 'Invalid student code.'}), 401
    session['student_id'] = student['id']
    return jsonify(student_payload(student))

@app.post('/api/logout')
def logout():
    session.clear(); return jsonify({'ok': True})

@app.post('/api/students')
def create_student():
    data = request.get_json(force=True)
    name = (data.get('name') or '').strip()
    code = (data.get('code') or '').strip()
    if len(name) < 2 or len(code) < 4:
        return jsonify({'error': 'Enter a student name and a code of at least 4 characters.'}), 400
    conn = db()
    try:
        now = datetime.now(timezone.utc).isoformat()
        conn.execute('INSERT INTO students(name, code_hash, code_display, created_at) VALUES(?,?,?,?)',
                     (name, hash_code(code), code.upper(), now))
        sid = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.commit()
        student = conn.execute('SELECT * FROM students WHERE id=?', (sid,)).fetchone()
    except sqlite3.IntegrityError:
        conn.close(); return jsonify({'error': 'That student code is already in use.'}), 409
    conn.close(); session['student_id'] = student['id']
    return jsonify(student_payload(student)), 201

@app.post('/api/grades')
def add_grade():
    student = get_student_by_session()
    if not student: return jsonify({'error': 'Authenticate first.'}), 401
    data = request.get_json(force=True)
    subject = (data.get('subject') or '').strip()
    try:
        grade = float(data.get('grade'))
        maximum = float(data.get('max_grade'))
    except (TypeError, ValueError):
        return jsonify({'error': 'Grade and maximum must be numbers.'}), 400
    if not subject or maximum <= 0 or grade < 0 or grade > maximum:
        return jsonify({'error': 'Check the subject and grade range.'}), 400
    pct = round((grade / maximum) * 100, 2)
    now = datetime.now(timezone.utc).isoformat()
    conn = db(); conn.execute('INSERT INTO grades(student_id,subject,grade,max_grade,percentage,recorded_at) VALUES(?,?,?,?,?,?)',
                               (student['id'], subject, grade, maximum, pct, now)); conn.commit(); conn.close()
    return jsonify({'ok': True, 'percentage': pct})

@app.post('/api/notes')
def add_note():
    student = get_student_by_session()
    if not student: return jsonify({'error': 'Authenticate first.'}), 401
    data = request.get_json(force=True)
    note = (data.get('note') or '').strip()
    subject = (data.get('subject') or '').strip() or None
    period = (data.get('period') or '').strip() or None
    if not note: return jsonify({'error': 'Write a note first.'}), 400
    now = datetime.now(timezone.utc).isoformat()
    conn = db(); conn.execute('INSERT INTO notes(student_id,subject,note,period,created_at) VALUES(?,?,?,?,?)',
                               (student['id'], subject, note, period, now)); conn.commit(); conn.close()
    return jsonify({'ok': True})

@app.get('/api/data')
def data():
    student = get_student_by_session()
    if not student: return jsonify({'error': 'Authenticate first.'}), 401
    return jsonify(student_payload(student))

if __name__ == '__main__':
    init_db()
    app.run(host='127.0.0.1', port=5000, debug=True)
